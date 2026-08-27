-- Reparación: fusionar historial de un jugador duplicado en el perfil canónico.
-- Caso inicial: RIV-00000289 → RIV-00000128 (registro duplicado).
--
-- Qué hace (transaccional):
--   1) Mueve jugador_participaciones sin conflicto de clave única
--   2) Mueve rating_historial sin conflicto (jugador_id, partido_ref)
--   3) Reasigna riviera_official_points_ledger al official_player_key del target
--   4) Recalcula riviera_official_player_totals afectados
--   5) Elimina identidad/link/stats del source y borra riviera_jugadores source
--
-- Ejecutar en SQL Editor (service role) o:
--   supabase db query --linked -f supabase/sql/repair-merge-riviera-jugador-history.sql
--
-- Rollback: restaurar desde backup manual si se creó antes de ejecutar.

CREATE OR REPLACE FUNCTION public.admin_merge_riviera_jugador_history(
  p_source_riviera_id text,
  p_target_riviera_id text,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_jugador_id uuid;
  v_target_jugador_id uuid;
  v_source_key uuid;
  v_target_key uuid;
  v_key uuid;
  v_source_org uuid;
  v_target_org uuid;
  v_source_nombre text;
  v_moved_parts integer := 0;
  v_skipped_parts integer := 0;
  v_moved_rating integer := 0;
  v_skipped_rating integer := 0;
  v_moved_ledger integer := 0;
  v_part record;
  v_rating record;
BEGIN
  IF p_source_riviera_id IS NULL OR p_target_riviera_id IS NULL THEN
    RAISE EXCEPTION 'riviera_id source/target requeridos';
  END IF;

  IF p_source_riviera_id = p_target_riviera_id THEN
    RAISE EXCEPTION 'source y target no pueden ser el mismo riviera_id';
  END IF;

  SELECT rj.id, rj.organizador_id, rj.nombre, i.official_player_key
  INTO v_source_jugador_id, v_source_org, v_source_nombre, v_source_key
  FROM public.riviera_official_player_profile_link pl
  INNER JOIN public.riviera_jugadores rj ON rj.id = pl.riviera_jugador_id
  INNER JOIN public.riviera_official_player_identity i
    ON i.official_player_key = pl.official_player_key
  WHERE i.riviera_id = p_source_riviera_id
  LIMIT 1;

  IF v_source_jugador_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró jugador source para %', p_source_riviera_id;
  END IF;

  SELECT rj.id, rj.organizador_id, i.official_player_key
  INTO v_target_jugador_id, v_target_org, v_target_key
  FROM public.riviera_official_player_profile_link pl
  INNER JOIN public.riviera_jugadores rj ON rj.id = pl.riviera_jugador_id
  INNER JOIN public.riviera_official_player_identity i
    ON i.official_player_key = pl.official_player_key
  WHERE i.riviera_id = p_target_riviera_id
  LIMIT 1;

  IF v_target_jugador_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró jugador target para %', p_target_riviera_id;
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'source_riviera_id', p_source_riviera_id,
      'target_riviera_id', p_target_riviera_id,
      'source_jugador_id', v_source_jugador_id,
      'target_jugador_id', v_target_jugador_id,
      'source_org', v_source_org,
      'target_org', v_target_org,
      'source_nombre', v_source_nombre,
      'participaciones_source', (
        SELECT count(*) FROM public.jugador_participaciones jp
        WHERE jp.jugador_id = v_source_jugador_id
      ),
      'rating_source', (
        SELECT count(*) FROM public.rating_historial rh
        WHERE rh.jugador_id = v_source_jugador_id
      ),
      'ledger_source', (
        SELECT count(*) FROM public.riviera_official_points_ledger l
        WHERE l.source_local_jugador_id = v_source_jugador_id
      )
    );
  END IF;

  -- Participaciones
  FOR v_part IN
    SELECT jp.*
    FROM public.jugador_participaciones jp
    WHERE jp.jugador_id = v_source_jugador_id
    ORDER BY jp.fecha, jp.id
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.jugador_participaciones tgt
      WHERE tgt.jugador_id = v_target_jugador_id
        AND tgt.tipo_evento = v_part.tipo_evento
        AND tgt.evento_id = v_part.evento_id
        AND tgt.resultado = v_part.resultado
    ) THEN
      v_skipped_parts := v_skipped_parts + 1;
      CONTINUE;
    END IF;

    UPDATE public.jugador_participaciones
    SET jugador_id = v_target_jugador_id
    WHERE id = v_part.id;
    v_moved_parts := v_moved_parts + 1;
  END LOOP;

  -- Rating
  IF to_regclass('public.rating_historial') IS NOT NULL THEN
    FOR v_rating IN
      SELECT rh.*
      FROM public.rating_historial rh
      WHERE rh.jugador_id = v_source_jugador_id
      ORDER BY rh.fecha, rh.id
    LOOP
      IF v_rating.partido_ref IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.rating_historial tgt
        WHERE tgt.jugador_id = v_target_jugador_id
          AND tgt.partido_ref = v_rating.partido_ref
      ) THEN
        v_skipped_rating := v_skipped_rating + 1;
        DELETE FROM public.rating_historial WHERE id = v_rating.id;
        CONTINUE;
      END IF;

      UPDATE public.rating_historial
      SET jugador_id = v_target_jugador_id
      WHERE id = v_rating.id;
      v_moved_rating := v_moved_rating + 1;
    END LOOP;
  END IF;

  -- Ledger oficial → identidad canónica target
  IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL
     AND v_target_key IS NOT NULL THEN
    UPDATE public.riviera_official_points_ledger l
    SET official_player_key = v_target_key,
        source_local_jugador_id = v_target_jugador_id
    WHERE l.source_local_jugador_id = v_source_jugador_id;
    GET DIAGNOSTICS v_moved_ledger = ROW_COUNT;
  END IF;

  -- Totales oficiales recalculados desde ledger
  IF to_regclass('public.riviera_official_player_totals') IS NOT NULL THEN
    FOR v_key IN
      SELECT DISTINCT k.official_player_key
      FROM (
        VALUES (v_source_key), (v_target_key)
      ) AS k(official_player_key)
      WHERE k.official_player_key IS NOT NULL
    LOOP
      UPDATE public.riviera_official_player_totals t
      SET points_total = COALESCE((
            SELECT SUM(l.points)::integer
            FROM public.riviera_official_points_ledger l
            WHERE l.official_player_key = v_key
              AND l.counts_for_official_ranking = true
          ), 0),
          last_activity_at = (
            SELECT MAX(l.created_at)
            FROM public.riviera_official_points_ledger l
            WHERE l.official_player_key = v_key
          ),
          updated_at = now()
      WHERE t.official_player_key = v_key;
    END LOOP;
  END IF;

  -- Desenganchar identidad source antes de borrar jugador
  IF v_source_key IS NOT NULL THEN
    DELETE FROM public.riviera_official_player_profile_link
    WHERE riviera_jugador_id = v_source_jugador_id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.riviera_official_player_profile_link pl
      WHERE pl.official_player_key = v_source_key
    ) THEN
      DELETE FROM public.riviera_official_player_totals
      WHERE official_player_key = v_source_key;

      DELETE FROM public.riviera_official_player_identity
      WHERE official_player_key = v_source_key;
    END IF;
  END IF;

  DELETE FROM public.jugador_stats
  WHERE jugador_id = v_source_jugador_id;

  -- Soltar FK canonical si la identidad source sigue viva con otro perfil local
  IF to_regclass('public.riviera_official_player_identity') IS NOT NULL THEN
    UPDATE public.riviera_official_player_identity i
    SET canonical_riviera_jugador_id = (
      SELECT pl.riviera_jugador_id
      FROM public.riviera_official_player_profile_link pl
      WHERE pl.official_player_key = i.official_player_key
        AND pl.riviera_jugador_id IS DISTINCT FROM v_source_jugador_id
      ORDER BY pl.created_at
      LIMIT 1
    )
    WHERE i.canonical_riviera_jugador_id = v_source_jugador_id
      AND EXISTS (
        SELECT 1
        FROM public.riviera_official_player_profile_link pl
        WHERE pl.official_player_key = i.official_player_key
          AND pl.riviera_jugador_id IS DISTINCT FROM v_source_jugador_id
      );
  END IF;

  IF to_regclass('public.riviera_jugador_import_blocklist') IS NOT NULL
     AND v_source_org IS NOT NULL THEN
    BEGIN
      PERFORM public.register_riviera_jugador_import_blocklist(
        v_source_org,
        v_source_nombre,
        NULL,
        NULL
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  -- Reasignar inscripciones abiertas y duelos (FK RESTRICT / histórico)
  IF to_regclass('public.tournament_open_registration_entries') IS NOT NULL THEN
    UPDATE public.tournament_open_registration_entries e
    SET
      riviera_jugador_id = v_target_jugador_id,
      riviera_id = p_target_riviera_id,
      official_player_key = v_target_key,
      updated_at = now()
    WHERE e.riviera_jugador_id = v_source_jugador_id;
  END IF;

  IF to_regclass('public.duelos_2v2') IS NOT NULL THEN
    UPDATE public.duelos_2v2
    SET
      pareja_a_j1_id = CASE WHEN pareja_a_j1_id = v_source_jugador_id THEN v_target_jugador_id ELSE pareja_a_j1_id END,
      pareja_a_j2_id = CASE WHEN pareja_a_j2_id = v_source_jugador_id THEN v_target_jugador_id ELSE pareja_a_j2_id END,
      pareja_b_j1_id = CASE WHEN pareja_b_j1_id = v_source_jugador_id THEN v_target_jugador_id ELSE pareja_b_j1_id END,
      pareja_b_j2_id = CASE WHEN pareja_b_j2_id = v_source_jugador_id THEN v_target_jugador_id ELSE pareja_b_j2_id END,
      updated_at = now()
    WHERE pareja_a_j1_id = v_source_jugador_id
       OR pareja_a_j2_id = v_source_jugador_id
       OR pareja_b_j1_id = v_source_jugador_id
       OR pareja_b_j2_id = v_source_jugador_id;
  END IF;

  DELETE FROM public.riviera_jugadores
  WHERE id = v_source_jugador_id;

  BEGIN
    PERFORM public.refresh_jugador_stats(v_target_jugador_id);
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'dry_run', false,
    'status', 'merged',
    'source_riviera_id', p_source_riviera_id,
    'target_riviera_id', p_target_riviera_id,
    'source_jugador_id', v_source_jugador_id,
    'target_jugador_id', v_target_jugador_id,
    'moved_participaciones', v_moved_parts,
    'skipped_participaciones', v_skipped_parts,
    'moved_rating', v_moved_rating,
    'skipped_rating', v_skipped_rating,
    'moved_ledger_rows', v_moved_ledger
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_merge_riviera_jugador_history(text, text, boolean)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.admin_merge_riviera_jugador_history(text, text, boolean) IS
  'Fusiona historial (participaciones/rating/ledger) de un riviera_id duplicado hacia el canónico. p_dry_run=true solo preview.';

-- Caso RIV-00000003 → RIV-00000312 (Padelito; source tiene 2 perfiles locales → 2 pasos)
-- SELECT public.admin_merge_riviera_jugador_history('RIV-00000003', 'RIV-00000312', true) AS preview;
-- SELECT public.admin_merge_riviera_jugador_history('RIV-00000003', 'RIV-00000312', false) AS pass1;
-- SELECT public.admin_merge_riviera_jugador_history('RIV-00000003', 'RIV-00000312', false) AS pass2;
