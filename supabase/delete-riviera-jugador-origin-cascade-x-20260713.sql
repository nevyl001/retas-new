-- ═══════════════════════════════════════════════════════════════════════════════
-- PROPUESTA — delete_riviera_jugador (Opción X: borrado completo origen + clones)
-- Fecha: 2026-07-13
-- ESTADO: PARA APROBACIÓN. NO EJECUTAR hasta OK explícito del dueño.
--
-- Qué hace:
--   • Solo el club ORIGEN (fila riviera_jugadores.organizador_id = auth.uid())
--     puede borrar global.
--   • Corrige el RAISE que trataba membresía/cedido mal y bloqueaba al origen.
--   • Propaga: borra clones cedidos + organizer_player_access + carrera del
--     jugador (participaciones/ledger/stats/rating/ROMC scoped a sus IDs).
--   • NO toca: tournaments, pairs, matches, games, players, grupos, compañeros.
--   • Duelos 2v2: conserva la fila del encuentro; solo NULL la FK al jugador.
--
-- Rollback de CÓDIGO: re-aplicar supabase/delete-riviera-jugador.sql (versión
-- anterior). Datos: restaurar desde tablas jugador_delete_backup_*_<ts>.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- (a) MAPEO DE TABLAS
-- ─────────────────────────────────────────────────────────────────────────────
-- EXCLUSIVAS DEL JUGADOR → BORRAR (scoped a IDs origen+clones / official_key)
--   riviera_jugadores                         filas origen + clones
--   organizer_player_access                   grants donde jugador_id|local = set
--   jugador_participaciones                   carrera del jugador
--   riviera_official_points_ledger            ledger del jugador / key
--   riviera_official_player_totals            totales del official_player_key
--   riviera_official_player_profile_link      links del set / key
--   riviera_official_player_identity          identity del key (si sin links)
--   jugador_stats                             stats scoped
--   rating_historial                          rating scoped
--   jugador_participacion_exclusiones         scope_jugador_id / official_key
--   riviera_player_sharing_request            solicitudes del set (RESTRICT)
--   riviera_jugador_import_blocklist          INSERT (no reimport), no “histórico”
--   liga_inscripciones                        del legacy_liga_jugador_id (si hay)
--
-- COMPARTIDAS / EVENTO → NO BORRAR (solo desreferenciar si hace falta)
--   tournaments, pairs, matches, games        reta / americano (usan `players`)
--   players                                   pool legado; deja el event intacto
--   duelos_2v2                                UPDATE … SET pareja_*_id = NULL
--                                             (conserva nombres/marcador)
--   liga_jugadores                            soft `estado='inactivo'` (no DELETE)
--   ligas / liga_jornadas / torneo_express    eventos intactos
--   Cualquier participación de OTRO jugador   intacta
--
-- NOTA: el Riviera ID / official_player_key no se “reutiliza”; se elimina la
-- identidad. Las tablas de evento no lo usaban como FK fuerte.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- (c) SELECT DE VERIFICACIÓN PREVIA (solo lectura)
-- Sustituye el UUID del origen O usa el filtro por nombre.
-- ═══════════════════════════════════════════════════════════════════════════════

/*
WITH params AS (
  SELECT
    NULL::uuid AS source_id,  -- o: 'uuid-del-origen'::uuid
    ARRAY[lower('TestplaCT2'), lower('TestplayerCT1')]::text[] AS names
),
origen AS (
  SELECT rj.*
  FROM public.riviera_jugadores rj
  CROSS JOIN params p
  WHERE (p.source_id IS NOT NULL AND rj.id = p.source_id)
     OR (p.source_id IS NULL AND lower(trim(rj.nombre)) = ANY (p.names))
),
ids AS (
  -- source
  SELECT o.id AS jugador_id, 'origen'::text AS rol, o.organizador_id
  FROM origen o
  UNION
  -- clones vía OPA
  SELECT opa.local_jugador_id, 'clon_cedido', opa.grantee_organizer_id
  FROM origen o
  JOIN public.organizer_player_access opa ON opa.jugador_id = o.id
  WHERE opa.local_jugador_id IS NOT NULL
  UNION
  -- otros links del mismo official key
  SELECT pl.riviera_jugador_id, 'link_mismo_key', rj.organizador_id
  FROM origen o
  JOIN public.riviera_official_player_profile_link pl0
    ON pl0.riviera_jugador_id = o.id
  JOIN public.riviera_official_player_profile_link pl
    ON pl.official_player_key = pl0.official_player_key
  JOIN public.riviera_jugadores rj ON rj.id = pl.riviera_jugador_id
)
SELECT
  i.jugador_id,
  i.rol,
  i.organizador_id,
  rj.nombre,
  (SELECT COUNT(*) FROM public.jugador_participaciones jp WHERE jp.jugador_id = i.jugador_id) AS participaciones,
  (SELECT COUNT(*) FROM public.organizer_player_access opa
     WHERE opa.jugador_id = i.jugador_id OR opa.local_jugador_id = i.jugador_id) AS opa_rows,
  EXISTS (
    SELECT 1 FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = i.organizador_id
      AND opa.local_jugador_id = i.jugador_id
      AND opa.is_active
      AND (
        opa.access_type = 'granted_by_admin'
        OR opa.jugador_id IS DISTINCT FROM i.jugador_id
      )
  ) AS serian_bloqueados_como_cedido,
  EXISTS (
    SELECT 1 FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = i.organizador_id
      AND opa.local_jugador_id = i.jugador_id
      AND opa.is_active
      AND opa.access_type = 'owner'
      AND opa.jugador_id = i.jugador_id
  ) AS tienen_opa_owner_misma_fila
FROM ids i
JOIN public.riviera_jugadores rj ON rj.id = i.jugador_id
ORDER BY i.rol, rj.nombre;

-- Baseline eventos (NO deben cambiar tras el delete):
SELECT
  (SELECT COUNT(*) FROM public.tournaments) AS tournaments,
  (SELECT COUNT(*) FROM public.pairs) AS pairs,
  (SELECT COUNT(*) FROM public.matches) AS matches,
  (SELECT COUNT(*) FROM public.gameses) AS games;
*/


-- ═══════════════════════════════════════════════════════════════════════════════
-- (b) SQL COMPLETO — helpers + CREATE OR REPLACE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._safe_resolve_official_player_key(p_jugador_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key uuid;
BEGIN
  IF p_jugador_id IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    IF to_regprocedure('public.resolve_official_player_key_for_jugador(uuid)') IS NOT NULL THEN
      v_key := public.resolve_official_player_key_for_jugador(p_jugador_id);
      RETURN v_key;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    IF to_regprocedure('public._resolve_official_player_key(uuid)') IS NOT NULL THEN
      RETURN public._resolve_official_player_key(p_jugador_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._safe_resolve_official_player_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._safe_resolve_official_player_key(uuid) FROM anon, authenticated;


CREATE OR REPLACE FUNCTION public._reverse_ledger_for_participacion_safe(p_participacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_participacion_id IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    PERFORM public.reverse_riviera_official_ledger_for_participacion(p_participacion_id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
    WHEN OTHERS THEN
      -- Mejor fallar el delete completo que dejar ledger inconsistente.
      RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public._reverse_ledger_for_participacion_safe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._reverse_ledger_for_participacion_safe(uuid) FROM anon, authenticated;


CREATE OR REPLACE FUNCTION public._insert_jugador_import_blocklist_internal(
  p_organizador_id uuid,
  p_nombre text,
  p_legacy_player_id uuid DEFAULT NULL,
  p_legacy_liga_jugador_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- NUNCA llamar register_riviera_jugador_import_blocklist desde aquí:
  -- esa RPC exige auth.uid() = p_organizador_id. Al purgar clones cedidos
  -- p_organizador_id es el club anfitrión ≠ auth.uid() del origen →
  -- RAISE EXCEPTION 'Sin permiso' (corto) y aborta todo el delete.
  -- Insert directo (SECURITY DEFINER) = mismo efecto, sin ese gate.

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
  WHEN undefined_table THEN
    NULL;
  WHEN undefined_column THEN
    NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._insert_jugador_import_blocklist_internal(uuid, text, uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public._insert_jugador_import_blocklist_internal(uuid, text, uuid, uuid)
  FROM anon, authenticated;


-- Purga un perfil local (origen o clon) + carrera scoped. NO toca eventos compartidos.
CREATE OR REPLACE FUNCTION public._purge_riviera_jugador_scoped(
  p_jugador_id uuid,
  p_organizador_id uuid,
  p_backup_suffix text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_official_key uuid;
  v_part_id uuid;
  v_liga_jugador_id uuid;
  v_deleted_participaciones integer := 0;
  v_bt text;
  v_ident_key uuid;
  v_alt_canonical uuid;
BEGIN
  IF p_jugador_id IS NULL OR p_organizador_id IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'missing_params');
  END IF;

  SELECT rj.id, rj.nombre, rj.legacy_player_id, rj.legacy_liga_jugador_id, rj.organizador_id
  INTO v_row
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_jugador_id
    AND rj.organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'jugador_not_found',
      'jugador_id', p_jugador_id
    );
  END IF;

  v_bt := COALESCE(NULLIF(trim(p_backup_suffix), ''), to_char(now() AT TIME ZONE 'utc', 'YYYYMMDD_HH24MISS'));

  -- ── Backup scoped (tablas permanentes; no TEMP: deben sobrevivir la sesión) ──
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I AS
       SELECT * FROM public.riviera_jugadores WHERE false',
    'jugador_delete_backup_riviera_jugadores_' || v_bt
  );
  EXECUTE format(
    'INSERT INTO public.%I SELECT * FROM public.riviera_jugadores WHERE id = $1',
    'jugador_delete_backup_riviera_jugadores_' || v_bt
  ) USING p_jugador_id;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I AS
       SELECT * FROM public.jugador_participaciones WHERE false',
    'jugador_delete_backup_participaciones_' || v_bt
  );
  EXECUTE format(
    'INSERT INTO public.%I SELECT * FROM public.jugador_participaciones WHERE jugador_id = $1',
    'jugador_delete_backup_participaciones_' || v_bt
  ) USING p_jugador_id;

  IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I AS
         SELECT * FROM public.riviera_official_points_ledger WHERE false',
      'jugador_delete_backup_ledger_' || v_bt
    );
    EXECUTE format(
      'INSERT INTO public.%I
         SELECT * FROM public.riviera_official_points_ledger
         WHERE source_local_jugador_id = $1
            OR participacion_id IN (
                 SELECT id FROM public.jugador_participaciones WHERE jugador_id = $1
               )',
      'jugador_delete_backup_ledger_' || v_bt
    ) USING p_jugador_id;
  END IF;

  IF to_regclass('public.organizer_player_access') IS NOT NULL THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I AS
         SELECT * FROM public.organizer_player_access WHERE false',
      'jugador_delete_backup_opa_' || v_bt
    );
    EXECUTE format(
      'INSERT INTO public.%I
         SELECT opa.*
         FROM public.organizer_player_access opa
         WHERE (opa.jugador_id = $1 OR opa.local_jugador_id = $1)
           AND NOT EXISTS (
             SELECT 1 FROM public.%I b WHERE b.id = opa.id
           )',
      'jugador_delete_backup_opa_' || v_bt,
      'jugador_delete_backup_opa_' || v_bt
    ) USING p_jugador_id;
  END IF;

  v_official_key := public._safe_resolve_official_player_key(p_jugador_id);

  -- 1) Ledger antes de participaciones (FK RESTRICT)
  FOR v_part_id IN
    SELECT jp.id FROM public.jugador_participaciones jp WHERE jp.jugador_id = p_jugador_id
  LOOP
    PERFORM public._reverse_ledger_for_participacion_safe(v_part_id);
  END LOOP;

  DELETE FROM public.jugador_participaciones WHERE jugador_id = p_jugador_id;
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
    DELETE FROM public.rating_historial WHERE jugador_id = p_jugador_id;
  END IF;

  DELETE FROM public.jugador_stats WHERE jugador_id = p_jugador_id;

  -- Sharing requests (RESTRICT en registration_jugador_id)
  IF to_regclass('public.riviera_player_sharing_request') IS NOT NULL THEN
    DELETE FROM public.riviera_player_sharing_request
    WHERE riviera_jugador_id = p_jugador_id
       OR registration_jugador_id = p_jugador_id;
  END IF;

  -- ROMC: soltar identity.canonical ANTES de borrar el perfil (si no, FK 409).
  IF to_regclass('public.riviera_official_player_identity') IS NOT NULL THEN
    FOR v_ident_key IN
      SELECT i.official_player_key
      FROM public.riviera_official_player_identity i
      WHERE i.canonical_riviera_jugador_id = p_jugador_id
    LOOP
      v_alt_canonical := NULL;
      IF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
        SELECT l.riviera_jugador_id INTO v_alt_canonical
        FROM public.riviera_official_player_profile_link l
        WHERE l.official_player_key = v_ident_key
          AND l.riviera_jugador_id IS DISTINCT FROM p_jugador_id
        ORDER BY l.created_at
        LIMIT 1;
      END IF;
      IF v_alt_canonical IS NOT NULL THEN
        UPDATE public.riviera_official_player_identity
        SET canonical_riviera_jugador_id = v_alt_canonical
        WHERE official_player_key = v_ident_key;
      ELSE
        IF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
          DELETE FROM public.riviera_official_player_profile_link
          WHERE official_player_key = v_ident_key;
        END IF;
        IF to_regclass('public.riviera_official_player_totals') IS NOT NULL THEN
          DELETE FROM public.riviera_official_player_totals
          WHERE official_player_key = v_ident_key;
        END IF;
        IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
          DELETE FROM public.riviera_official_points_ledger
          WHERE official_player_key = v_ident_key;
        END IF;
        DELETE FROM public.riviera_official_player_identity
        WHERE official_player_key = v_ident_key;
      END IF;
    END LOOP;
  END IF;

  IF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
    DELETE FROM public.riviera_official_player_profile_link
    WHERE riviera_jugador_id = p_jugador_id;
  END IF;

  -- Duelos: conservar encuentro; solo null FK (nombres históricos quedan)
  IF to_regclass('public.duelos_2v2') IS NOT NULL THEN
    UPDATE public.duelos_2v2
    SET
      pareja_a_j1_id = CASE WHEN pareja_a_j1_id = p_jugador_id THEN NULL ELSE pareja_a_j1_id END,
      pareja_a_j2_id = CASE WHEN pareja_a_j2_id = p_jugador_id THEN NULL ELSE pareja_a_j2_id END,
      pareja_b_j1_id = CASE WHEN pareja_b_j1_id = p_jugador_id THEN NULL ELSE pareja_b_j1_id END,
      pareja_b_j2_id = CASE WHEN pareja_b_j2_id = p_jugador_id THEN NULL ELSE pareja_b_j2_id END,
      updated_at = now()
    WHERE pareja_a_j1_id = p_jugador_id
       OR pareja_a_j2_id = p_jugador_id
       OR pareja_b_j1_id = p_jugador_id
       OR pareja_b_j2_id = p_jugador_id;
  END IF;

  v_liga_jugador_id := NULLIF(trim(v_row.legacy_liga_jugador_id::text), '')::uuid;
  IF v_liga_jugador_id IS NOT NULL THEN
    IF to_regclass('public.liga_inscripciones') IS NOT NULL THEN
      DELETE FROM public.liga_inscripciones WHERE jugador_id = v_liga_jugador_id;
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

  -- OPA residual scoped a este id
  IF to_regclass('public.organizer_player_access') IS NOT NULL THEN
    DELETE FROM public.organizer_player_access
    WHERE jugador_id = p_jugador_id
       OR local_jugador_id = p_jugador_id;
  END IF;

  -- Nunca touch players / pairs / matches / tournaments
  DELETE FROM public.riviera_jugadores
  WHERE id = p_jugador_id
    AND organizador_id = p_organizador_id;

  RETURN jsonb_build_object(
    'status', 'purged',
    'jugador_id', p_jugador_id,
    'organizador_id', p_organizador_id,
    'participaciones_deleted', v_deleted_participaciones,
    'backup_suffix', v_bt,
    'official_player_key', v_official_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public._purge_riviera_jugador_scoped(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._purge_riviera_jugador_scoped(uuid, uuid, text) FROM anon, authenticated;


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
  v_backup_suffix text;
  v_grant record;
  v_purge jsonb;
  v_details jsonb := '[]'::jsonb;
  v_locals_purged integer := 0;
  v_locals_skipped integer := 0;
  v_origin_purge jsonb;
  v_actor uuid;
BEGIN
  IF p_organizador_id IS NULL OR p_jugador_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos';
  END IF;

  -- Identidad JWT del request (requiere _request_auth_uid del auth-uid-fix).
  BEGIN
    v_actor := public._request_auth_uid();
  EXCEPTION
    WHEN undefined_function THEN
      v_actor := auth.uid();
  END;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'Sin sesión autenticada (auth.uid/JWT null). Reintenta tras iniciar sesión.';
  END IF;

  IF v_actor IS DISTINCT FROM p_organizador_id THEN
    RAISE EXCEPTION
      'Sin permiso para eliminar este jugador (auth=% organizador=%)',
      v_actor, p_organizador_id;
  END IF;

  SELECT
    rj.id,
    rj.nombre,
    rj.legacy_player_id,
    rj.legacy_liga_jugador_id,
    rj.organizador_id
  INTO v_row
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_jugador_id
    AND rj.organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado o sin permiso para eliminarlo';
  END IF;

  -- ── FIX RAISE: solo bloquea si ESTE club es receptor de un CLON cedido ──
  -- access_type='owner' o jugador_id = local (source) → PERMITIR (es origen).
  -- granted_by_admin O local ≠ source → BLOQUEAR (usar Quitar de mi club).
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

  v_backup_suffix := to_char(now() AT TIME ZONE 'utc', 'YYYYMMDD_HH24MISS');
  -- Postgres ident ≤ 63 chars: el prefijo + suffix caben.
  v_official_key := public._safe_resolve_official_player_key(p_jugador_id);

  RAISE NOTICE
    'delete_riviera_jugador: backup_suffix=% origin=% org=% key=%',
    v_backup_suffix, p_jugador_id, p_organizador_id, v_official_key;

  -- 1) Primero clones cedidos (OPA donde este id es el SOURCE)
  IF to_regclass('public.organizer_player_access') IS NOT NULL THEN
    FOR v_grant IN
      SELECT
        opa.id AS access_id,
        opa.local_jugador_id,
        opa.grantee_organizer_id,
        opa.is_active
      FROM public.organizer_player_access opa
      WHERE opa.jugador_id = p_jugador_id
        AND opa.local_jugador_id IS NOT NULL
        AND opa.local_jugador_id IS DISTINCT FROM p_jugador_id
      ORDER BY opa.grantee_organizer_id
    LOOP
      v_purge := public._purge_riviera_jugador_scoped(
        v_grant.local_jugador_id,
        v_grant.grantee_organizer_id,
        v_backup_suffix
      );
      IF coalesce(v_purge->>'status', '') = 'purged' THEN
        v_locals_purged := v_locals_purged + 1;
      ELSE
        v_locals_skipped := v_locals_skipped + 1;
      END IF;
      v_details := v_details || jsonb_build_array(v_purge);

      DELETE FROM public.organizer_player_access WHERE id = v_grant.access_id;
    END LOOP;

    -- Grants sin clon / residuales hacia este source
    DELETE FROM public.organizer_player_access
    WHERE jugador_id = p_jugador_id
       OR local_jugador_id = p_jugador_id;
  END IF;

  -- 2) Otros perfiles enlazados al mismo official_player_key (misma identidad)
  IF v_official_key IS NOT NULL
     AND to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
    FOR v_grant IN
      SELECT pl.riviera_jugador_id AS local_jugador_id, rj.organizador_id AS grantee_organizer_id
      FROM public.riviera_official_player_profile_link pl
      JOIN public.riviera_jugadores rj ON rj.id = pl.riviera_jugador_id
      WHERE pl.official_player_key = v_official_key
        AND pl.riviera_jugador_id IS DISTINCT FROM p_jugador_id
    LOOP
      v_purge := public._purge_riviera_jugador_scoped(
        v_grant.local_jugador_id,
        v_grant.grantee_organizer_id,
        v_backup_suffix
      );
      IF coalesce(v_purge->>'status', '') = 'purged' THEN
        v_locals_purged := v_locals_purged + 1;
      ELSE
        v_locals_skipped := v_locals_skipped + 1;
      END IF;
      v_details := v_details || jsonb_build_array(v_purge);
    END LOOP;
  END IF;

  -- 3) Purgar origen
  v_origin_purge := public._purge_riviera_jugador_scoped(
    p_jugador_id,
    p_organizador_id,
    v_backup_suffix
  );

  IF coalesce(v_origin_purge->>'status', '') IS DISTINCT FROM 'purged' THEN
    RAISE EXCEPTION 'No se pudo purgar el origen: %', v_origin_purge;
  END IF;

  -- 4) Limpiar identity/totals/ledger restantes del key si ya no hay links
  IF v_official_key IS NOT NULL THEN
    IF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.riviera_official_player_profile_link l
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
  END IF;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'jugador_id', p_jugador_id,
    'organizador_id', p_organizador_id,
    'official_player_key', v_official_key,
    'backup_suffix', v_backup_suffix,
    'locals_purged', v_locals_purged,
    'locals_skipped', v_locals_skipped,
    'origin', v_origin_purge,
    'details', v_details
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_riviera_jugador(uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.delete_riviera_jugador(uuid, uuid) IS
  'Borrado global Opción X: solo club origen. Propaga a clones cedidos y carrera '
  'scoped al jugador. No toca tournaments/pairs/matches/gameses/players. '
  'Duelos: null FK, conserva fila. Backup permanente jugador_delete_backup_*_<ts>.';

NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════════════
-- (d) PLAN DE BACKUP / ROLLBACK
-- ─────────────────────────────────────────────────────────────────────────────
-- ANTES (humano):
--   1. Correr VERIFY (sección c) y guardar baseline de tournaments/pairs/matches.
--   2. Opcional: dump Supabase completo.
--
-- DURANTE (automático en el RPC):
--   Crea/append tablas permanentes:
--     jugador_delete_backup_riviera_jugadores_<ts>
--     jugador_delete_backup_participaciones_<ts>
--     jugador_delete_backup_ledger_<ts>
--     jugador_delete_backup_opa_<ts>
--   El jsonb de retorno incluye backup_suffix.
--
-- DESPUÉS (smoke):
--   • SELECT count(*) tournaments/pairs/matches = baseline
--   • origen + clones: 0 filas en riviera_jugadores
--   • compañeros: mismas participaciones que antes
--
-- ROLLBACK MANUAL (si algo salió mal — ejemplo riviera_jugadores):
--   INSERT INTO public.riviera_jugadores
--   SELECT * FROM public.jugador_delete_backup_riviera_jugadores_<ts>
--   ON CONFLICT (id) DO NOTHING;
--   (repetir para participaciones / ledger / opa en orden FK: jugadores →
--    participaciones → ledger → opa). Relinks ROMC pueden requerir script aparte.
--
-- ROLLBACK DE CÓDIGO:
--   Re-aplicar supabase/delete-riviera-jugador.sql (versión previa sin cascade).
-- ═══════════════════════════════════════════════════════════════════════════════
