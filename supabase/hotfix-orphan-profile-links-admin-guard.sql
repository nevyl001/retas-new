-- Hotfix: riviera_repair_orphan_profile_links_high() no tenía ninguna
-- verificación de autorización, a diferencia de todas las demás funciones
-- admin_* del mismo módulo. Es SECURITY DEFINER y estaba otorgada a anon,
-- permitiendo que cualquier llamador sin sesión insertara vínculos de
-- identidad oficial (riviera_official_player_profile_link) entre
-- organizadores. Se agrega el mismo guard is_master_admin() que ya usan
-- admin_link_official_player_profile, admin_unlink_official_player_profile,
-- etc. Resto del cuerpo sin cambios.

CREATE OR REPLACE FUNCTION public.riviera_repair_orphan_profile_links_high()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_detected integer := 0;
  v_repaired integer := 0;
  v_review integer := 0;
  v_low integer := 0;
  v_row record;
  v_link_id uuid;
  v_repaired_names text[] := '{}';
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede ejecutar la reparación de vínculos huérfanos';
  END IF;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.riviera_repair_orphan_profile_links_high() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.riviera_repair_orphan_profile_links_high() TO authenticated;
