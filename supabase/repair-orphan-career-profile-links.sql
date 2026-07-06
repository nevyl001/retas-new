-- Reparación idempotente: enlazar perfiles huérfanos HIGH al official_player_key correcto.
--
-- PREREQUISITO OBLIGATORIO (ejecutar antes, en este orden):
--   1) supabase/career-profile-link-integrity.sql
--
-- Este script NO redefine scoring, _riviera_profile_link_resolution ni
-- _riviera_orphan_profile_audit. Usa la fuente canónica desplegada en paso 1.
--
-- SOLO crea filas en riviera_official_player_profile_link para confidence = HIGH
-- (evidencia fuerte: grant | same_legacy | host_club_overlap).
-- cross_club_profile u orphan_org_in_official_clubs solos → REVIEW (no auto-link).
--
-- NO mueve/borra participaciones, jugadores, puntos, rating, metadata ni Riviera ID.
--
-- Flujo seguro:
--   1) career-profile-link-integrity.sql
--   2) diagnose-orphan-career-profiles.sql  (revisar HIGH / REVIEW)
--   3) Este script
--   4) diagnose de nuevo (0 HIGH pendientes; REVIEW documentados)
--   5) manual-link-review-cases.sql solo tras confirmación visual

-- ── Batch HIGH (idempotente) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.riviera_repair_orphan_profile_links_high()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_detected integer := 0;
  v_repaired integer := 0;
  v_review integer := 0;
  v_low integer := 0;
  v_row record;
  v_link_id uuid;
  v_repaired_names text[] := '{}';
BEGIN
  IF to_regprocedure('public._riviera_orphan_profile_audit()') IS NULL THEN
    RAISE EXCEPTION
      'Falta _riviera_orphan_profile_audit — ejecutar career-profile-link-integrity.sql primero';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE confidence = 'REVIEW'),
    COUNT(*) FILTER (WHERE confidence = 'LOW')
  INTO v_detected, v_review, v_low
  FROM public._riviera_orphan_profile_audit();

  FOR v_row IN
    SELECT *
    FROM public._riviera_orphan_profile_audit()
    WHERE confidence = 'HIGH'
      AND candidate_official_player_key IS NOT NULL
      AND action_sugerida = 'LINK_TO_OFFICIAL'
  LOOP
    INSERT INTO public.riviera_official_player_profile_link (
      official_player_key,
      riviera_jugador_id,
      organizer_id,
      link_source,
      created_by
    )
    VALUES (
      v_row.candidate_official_player_key,
      v_row.orphan_jugador_id,
      v_row.orphan_organizador_id,
      'manual_admin',
      auth.uid()
    )
    ON CONFLICT (riviera_jugador_id) DO NOTHING
    RETURNING id INTO v_link_id;

    IF v_link_id IS NOT NULL THEN
      v_repaired := v_repaired + 1;
      v_repaired_names := array_append(
        v_repaired_names,
        v_row.orphan_nombre || ' → ' || COALESCE(v_row.candidate_riviera_id, '?')
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'detected_orphans', v_detected,
    'repaired', v_repaired,
    'left_review', v_review,
    'left_low', v_low,
    'repaired_players', v_repaired_names
  );
END;
$$;

COMMENT ON FUNCTION public.riviera_repair_orphan_profile_links_high() IS
  'Crea profile_link para huérfanos HIGH (scoring estricto de career-profile-link-integrity). Idempotente.';

GRANT EXECUTE ON FUNCTION public.riviera_repair_orphan_profile_links_high() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- EJECUCIÓN
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_result jsonb;
  v_jid uuid;
BEGIN
  v_result := public.riviera_repair_orphan_profile_links_high();

  RAISE NOTICE 'orphan-profile-repair: %', v_result;

  FOR v_jid IN
    SELECT DISTINCT pl.riviera_jugador_id
    FROM public.riviera_official_player_profile_link pl
    WHERE pl.link_source = 'manual_admin'
      AND pl.created_at > now() - interval '5 minutes'
  LOOP
    BEGIN
      PERFORM public.refresh_jugador_stats(v_jid);
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'refresh_jugador_stats no disponible';
        EXIT;
      WHEN OTHERS THEN
        RAISE NOTICE 'refresh_jugador_stats %: %', v_jid, SQLERRM;
    END;
  END LOOP;
END $$;

-- Validación post-repair
SELECT
  confidence,
  COUNT(*) AS perfiles,
  COALESCE(SUM(total_puntos), 0) AS puntos
FROM public._riviera_orphan_profile_audit()
GROUP BY confidence
ORDER BY 1;

-- Casos REVIEW históricos esperados (no deben auto-linkearse)
SELECT
  orphan_nombre,
  candidate_riviera_id,
  total_puntos,
  host_clubs,
  confidence,
  reason,
  in_career_rpc
FROM public._riviera_orphan_profile_audit()
WHERE orphan_nombre IN ('Daniel N', 'Sebastian')
ORDER BY orphan_nombre;

NOTIFY pgrst, 'reload schema';
