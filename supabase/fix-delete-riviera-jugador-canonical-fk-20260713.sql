-- FIX 409 FK: riviera_official_player_ident_canonical_riviera_jugador_id_fkey
-- Causa: se DELETE riviera_jugadores mientras identity.canonical aún apunta al id.
-- (cascade-x limpiaba identity DESPUÉS del purge; el simple a veces
--  perdía official_key con SELECT INTO sin fila de profile_link.)
--
-- Este script reemplaza SOLO delete_riviera_jugador (versión simple robusta):
--   1) auth.uid() = p_organizador_id
--   2) no borra locals cedidos (mensaje largo)
--   3) desengancha/reasigna/borra identity ANTES del DELETE al jugador
--   4) blocklist con INSERT directo (evita RAISE corto 'Sin permiso' de register_*)
--
-- NO ejecuta borrados de datos. Aplícalo en SQL Editor y reintenta borrar 1 jugador.

CREATE OR REPLACE FUNCTION public._insert_jugador_import_blocklist_internal(
  p_organizador_id uuid,
  p_nombre text,
  p_legacy_player_id uuid DEFAULT NULL,
  p_legacy_liga_jugador_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_organizador_id IS NULL
     OR to_regclass('public.riviera_jugador_import_blocklist') IS NULL THEN
    RETURN;
  END IF;

  IF to_regprocedure('public._riviera_jugador_nombre_key(text)') IS NOT NULL THEN
    v_key := public._riviera_jugador_nombre_key(p_nombre);
  ELSE
    v_key := lower(trim(COALESCE(p_nombre, '')));
  END IF;
  IF v_key IS NULL OR v_key = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.riviera_jugador_import_blocklist (
    organizador_id, nombre, nombre_key, legacy_player_id, legacy_liga_jugador_id
  )
  VALUES (
    p_organizador_id, trim(p_nombre), v_key, p_legacy_player_id, p_legacy_liga_jugador_id
  )
  ON CONFLICT (organizador_id, nombre_key) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      legacy_player_id = coalesce(
        EXCLUDED.legacy_player_id,
        riviera_jugador_import_blocklist.legacy_player_id
      ),
      legacy_liga_jugador_id = coalesce(
        EXCLUDED.legacy_liga_jugador_id,
        riviera_jugador_import_blocklist.legacy_liga_jugador_id
      ),
      deleted_at = now();
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._insert_jugador_import_blocklist_internal(uuid, text, uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public._insert_jugador_import_blocklist_internal(uuid, text, uuid, uuid)
  FROM anon, authenticated;


CREATE OR REPLACE FUNCTION public.delete_riviera_jugador(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_official_key uuid;
  v_link_key uuid;
  v_part_id uuid;
  v_new_canonical uuid;
  v_liga_jugador_id uuid;
  v_deleted_participaciones integer := 0;
  v_ident record;
BEGIN
  IF p_organizador_id IS NULL OR p_jugador_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_organizador_id THEN
    RAISE EXCEPTION 'Sin permiso para eliminar este jugador';
  END IF;

  SELECT rj.id, rj.nombre, rj.legacy_player_id, rj.legacy_liga_jugador_id
  INTO v_row
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_jugador_id
    AND rj.organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado o sin permiso para eliminarlo';
  END IF;

  -- Solo bloquea si ESTE club es receptor de un CLON (no el origen).
  IF EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = p_organizador_id
      AND opa.local_jugador_id = p_jugador_id
      AND opa.is_active = true
      AND (
        opa.access_type = 'granted_by_admin'
        OR opa.jugador_id IS DISTINCT FROM p_jugador_id
      )
  ) THEN
    RAISE EXCEPTION
      'No eres el club de origen; usa «Quitar de mi club»';
  END IF;

  BEGIN
    v_official_key := public.resolve_official_player_key_for_jugador(p_jugador_id);
  EXCEPTION
    WHEN undefined_function THEN
      v_official_key := NULL;
  END;

  -- Key desde profile_link SIN pisar v_official_key si no hay fila.
  IF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
    SELECT l.official_player_key
    INTO v_link_key
    FROM public.riviera_official_player_profile_link l
    WHERE l.riviera_jugador_id = p_jugador_id
    LIMIT 1;
    IF v_link_key IS NOT NULL THEN
      v_official_key := COALESCE(v_official_key, v_link_key);
    END IF;
  END IF;

  -- También por identity.canonical (aunque no haya profile_link).
  IF v_official_key IS NULL
     AND to_regclass('public.riviera_official_player_identity') IS NOT NULL THEN
    SELECT i.official_player_key
    INTO v_official_key
    FROM public.riviera_official_player_identity i
    WHERE i.canonical_riviera_jugador_id = p_jugador_id
    LIMIT 1;
  END IF;

  FOR v_part_id IN
    SELECT jp.id
    FROM public.jugador_participaciones jp
    WHERE jp.jugador_id = p_jugador_id
  LOOP
    BEGIN
      PERFORM public.reverse_riviera_official_ledger_for_participacion(v_part_id);
    EXCEPTION
      WHEN undefined_function THEN
        NULL;
    END;
  END LOOP;

  DELETE FROM public.jugador_participaciones
  WHERE jugador_id = p_jugador_id;
  GET DIAGNOSTICS v_deleted_participaciones = ROW_COUNT;

  IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
    DELETE FROM public.riviera_official_points_ledger
    WHERE source_local_jugador_id = p_jugador_id;
  END IF;

  IF to_regclass('public.jugador_participacion_exclusiones') IS NOT NULL THEN
    DELETE FROM public.jugador_participacion_exclusiones
    WHERE scope_jugador_id = p_jugador_id
       OR (v_official_key IS NOT NULL AND official_player_key = v_official_key);
  END IF;

  IF to_regclass('public.rating_historial') IS NOT NULL THEN
    DELETE FROM public.rating_historial
    WHERE jugador_id = p_jugador_id;
  END IF;

  DELETE FROM public.jugador_stats
  WHERE jugador_id = p_jugador_id;

  IF to_regclass('public.riviera_player_sharing_request') IS NOT NULL THEN
    DELETE FROM public.riviera_player_sharing_request
    WHERE riviera_jugador_id = p_jugador_id
       OR registration_jugador_id = p_jugador_id;
  END IF;

  -- ── CRÍTICO: soltar FK canonical ANTES de borrar riviera_jugadores ──
  IF to_regclass('public.riviera_official_player_identity') IS NOT NULL THEN
    FOR v_ident IN
      SELECT i.official_player_key
      FROM public.riviera_official_player_identity i
      WHERE i.canonical_riviera_jugador_id = p_jugador_id
    LOOP
      v_new_canonical := NULL;
      IF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
        SELECT l.riviera_jugador_id
        INTO v_new_canonical
        FROM public.riviera_official_player_profile_link l
        WHERE l.official_player_key = v_ident.official_player_key
          AND l.riviera_jugador_id IS DISTINCT FROM p_jugador_id
        ORDER BY l.created_at
        LIMIT 1;
      END IF;

      IF v_new_canonical IS NOT NULL THEN
        UPDATE public.riviera_official_player_identity
        SET canonical_riviera_jugador_id = v_new_canonical
        WHERE official_player_key = v_ident.official_player_key;
      ELSE
        IF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
          DELETE FROM public.riviera_official_player_profile_link
          WHERE official_player_key = v_ident.official_player_key;
        END IF;
        IF to_regclass('public.riviera_official_player_totals') IS NOT NULL THEN
          DELETE FROM public.riviera_official_player_totals
          WHERE official_player_key = v_ident.official_player_key;
        END IF;
        IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
          DELETE FROM public.riviera_official_points_ledger
          WHERE official_player_key = v_ident.official_player_key;
        END IF;
        DELETE FROM public.riviera_official_player_identity
        WHERE official_player_key = v_ident.official_player_key;
      END IF;
    END LOOP;
  END IF;

  IF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
    DELETE FROM public.riviera_official_player_profile_link
    WHERE riviera_jugador_id = p_jugador_id;
  END IF;

  -- Si reasignamos canonical y ya no quedan links del key resuelto, limpiar.
  IF v_official_key IS NOT NULL
     AND to_regclass('public.riviera_official_player_profile_link') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.riviera_official_player_profile_link l
       WHERE l.official_player_key = v_official_key
     ) THEN
    IF to_regclass('public.riviera_official_player_totals') IS NOT NULL THEN
      DELETE FROM public.riviera_official_player_totals
      WHERE official_player_key = v_official_key;
    END IF;
    IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
      DELETE FROM public.riviera_official_points_ledger
      WHERE official_player_key = v_official_key;
    END IF;
    IF to_regclass('public.riviera_official_player_identity') IS NOT NULL THEN
      DELETE FROM public.riviera_official_player_identity
      WHERE official_player_key = v_official_key;
    END IF;
  END IF;

  IF to_regclass('public.duelos_2v2') IS NOT NULL THEN
    UPDATE public.duelos_2v2
    SET
      pareja_a_j1_id = CASE WHEN pareja_a_j1_id = p_jugador_id THEN NULL ELSE pareja_a_j1_id END,
      pareja_a_j2_id = CASE WHEN pareja_a_j2_id = p_jugador_id THEN NULL ELSE pareja_a_j2_id END,
      pareja_b_j1_id = CASE WHEN pareja_b_j1_id = p_jugador_id THEN NULL ELSE pareja_b_j1_id END,
      pareja_b_j2_id = CASE WHEN pareja_b_j2_id = p_jugador_id THEN NULL ELSE pareja_b_j2_id END,
      updated_at = now()
    WHERE organizador_id = p_organizador_id
      AND (
        pareja_a_j1_id = p_jugador_id
        OR pareja_a_j2_id = p_jugador_id
        OR pareja_b_j1_id = p_jugador_id
        OR pareja_b_j2_id = p_jugador_id
      );
  END IF;

  v_liga_jugador_id := NULLIF(trim(v_row.legacy_liga_jugador_id::text), '')::uuid;

  IF v_liga_jugador_id IS NOT NULL THEN
    IF to_regclass('public.liga_inscripciones') IS NOT NULL THEN
      DELETE FROM public.liga_inscripciones
      WHERE jugador_id = v_liga_jugador_id;
    END IF;
    IF to_regclass('public.liga_jugadores') IS NOT NULL THEN
      UPDATE public.liga_jugadores
      SET estado = 'inactivo'
      WHERE id = v_liga_jugador_id
        AND organizador_id = p_organizador_id;
    END IF;
  END IF;

  PERFORM public._insert_jugador_import_blocklist_internal(
    p_organizador_id,
    v_row.nombre,
    v_row.legacy_player_id,
    v_liga_jugador_id
  );

  IF to_regclass('public.organizer_player_access') IS NOT NULL THEN
    DELETE FROM public.organizer_player_access
    WHERE jugador_id = p_jugador_id
       OR local_jugador_id = p_jugador_id;
  END IF;

  DELETE FROM public.riviera_jugadores
  WHERE id = p_jugador_id
    AND organizador_id = p_organizador_id;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'jugador_id', p_jugador_id,
    'participaciones_deleted', v_deleted_participaciones,
    'official_player_key', v_official_key
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_riviera_jugador(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_riviera_jugador(uuid, uuid) FROM anon;

COMMENT ON FUNCTION public.delete_riviera_jugador(uuid, uuid) IS
  'Elimina jugador del organizador autenticado. Suelta identity.canonical '
  'antes del DELETE. Blocklist sin pasar por register_* (evita Sin permiso corto).';

NOTIFY pgrst, 'reload schema';
