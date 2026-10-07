-- Endurece los backups FUTUROS de delete_riviera_jugador.
--
-- Causa: _purge_riviera_jugador_scoped (la unica funcion que crea las tablas
-- public.jugador_delete_backup_*) las crea con CREATE TABLE ... AS, que nacen
-- sin RLS y con los grants por defecto del esquema public. 0052 solo protegio
-- las tablas que ya existian.
--
-- Cambio (unicamente dos adiciones sobre el cuerpo desplegado en produccion):
--   1) DECLARE: v_bk text;
--   2) Justo despues de crear/llenar los 4 backups y antes de la logica de
--      identidad/ledger: ENABLE ROW LEVEL SECURITY + REVOKE ALL FROM
--      PUBLIC, anon, authenticated sobre cada backup creado en esta llamada.
--
-- Se conserva sin cambios: firma, retorno jsonb, LANGUAGE plpgsql,
-- SECURITY DEFINER, SET search_path TO 'public', owner postgres y toda la
-- logica de borrado. CREATE OR REPLACE mantiene los grants de la funcion
-- (postgres, service_role). No toca delete_riviera_jugador ni auxiliares.
--
-- El owner (postgres) y service_role conservan acceso a los backups; RLS sin
-- FORCE no se aplica al owner, asi que los INSERT de esta funcion siguen
-- funcionando.
--
-- Rollback: re-aplicar la definicion previa de la funcion (sin el bloque
-- FOREACH ni v_bk). 0052 sigue cubriendo las tablas ya existentes.

CREATE OR REPLACE FUNCTION public._purge_riviera_jugador_scoped(p_jugador_id uuid, p_organizador_id uuid, p_backup_suffix text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_official_key uuid;
  v_part_id uuid;
  v_liga_jugador_id uuid;
  v_deleted_participaciones integer := 0;
  v_bt text;
  v_ident_key uuid;
  v_alt_canonical uuid;
  v_bk text;
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

  -- Endurecimiento de backups (0053): RLS + sin acceso para la API publica.
  FOREACH v_bk IN ARRAY ARRAY[
    'jugador_delete_backup_riviera_jugadores_' || v_bt,
    'jugador_delete_backup_participaciones_'   || v_bt,
    'jugador_delete_backup_ledger_'            || v_bt,
    'jugador_delete_backup_opa_'               || v_bt
  ]
  LOOP
    IF to_regclass(format('public.%I', v_bk)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
        v_bk
      );

      EXECUTE format(
        'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        v_bk
      );
    END IF;
  END LOOP;

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
$function$;
