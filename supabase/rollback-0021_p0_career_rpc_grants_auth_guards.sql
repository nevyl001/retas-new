-- =============================================================================
-- ROLLBACK de migrations/0021_p0_career_rpc_grants_auth_guards.sql
-- Restaura:
--   try_write = RANK-001 (sin guard auth) — estado prod pre-P0 confirmado
--   ensure = career-profile-link-integrity HEAD (gate NULL-org antiguo)
--   GRANTs pre-P0 (audit/resolution a anon+authenticated)
-- NO ejecutar salvo fallo post-P0. Reabre superficie anon en try_write/audit.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ensure_official_profile_link_for_participacion(
  p_jugador_id uuid,
  p_organizador_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row record;
  v_link_id uuid;
BEGIN
  IF p_jugador_id IS NULL THEN
    RETURN jsonb_build_object(
      'linked', false, 'confidence', 'LOW', 'reason', 'missing_jugador_id',
      'action_sugerida', 'INSUFFICIENT_EVIDENCE'
    );
  END IF;

  SELECT * INTO v_row
  FROM public._riviera_profile_link_resolution(p_jugador_id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'linked', false, 'confidence', 'LOW', 'reason', 'jugador_no_encontrado',
      'action_sugerida', 'INSUFFICIENT_EVIDENCE', 'jugador_id', p_jugador_id
    );
  END IF;

  IF v_row.has_profile_link THEN
    RETURN jsonb_build_object(
      'linked', true, 'already_linked', true, 'confidence', 'OK',
      'reason', v_row.reason, 'action_sugerida', 'NONE',
      'official_player_key', v_row.existing_official_player_key,
      'riviera_id', v_row.existing_riviera_id, 'jugador_id', p_jugador_id
    );
  END IF;

  IF v_row.confidence IS DISTINCT FROM 'HIGH'
     OR v_row.candidate_official_player_key IS NULL THEN
    RETURN jsonb_build_object(
      'linked', false, 'confidence', v_row.confidence,
      'reason', v_row.reason, 'action_sugerida', v_row.action_sugerida,
      'jugador_id', p_jugador_id, 'jugador_nombre', v_row.jugador_nombre,
      'candidate_count', v_row.candidate_count,
      'candidate_riviera_id', v_row.candidate_riviera_id,
      'candidate_official_player_key', v_row.candidate_official_player_key,
      'grant_to_canonical', v_row.grant_to_canonical,
      'grant_to_identity', v_row.grant_to_identity,
      'same_legacy', v_row.same_legacy,
      'host_club_overlap', v_row.host_club_overlap,
      'cross_club_profile', v_row.cross_club_profile
    );
  END IF;

  IF v_actor IS NOT NULL AND p_organizador_id IS NOT NULL AND NOT public.is_master_admin() THEN
    IF v_actor IS DISTINCT FROM p_organizador_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.riviera_jugadores rj
        WHERE rj.id = p_jugador_id AND rj.organizador_id = p_organizador_id
      ) THEN
        RETURN jsonb_build_object(
          'linked', false, 'confidence', 'LOW', 'reason', 'permission_denied',
          'action_sugerida', 'INSUFFICIENT_EVIDENCE', 'jugador_id', p_jugador_id
        );
      END IF;
    END IF;
  END IF;

  INSERT INTO public.riviera_official_player_profile_link (
    official_player_key, riviera_jugador_id, organizer_id, link_source, created_by
  ) VALUES (
    v_row.candidate_official_player_key, p_jugador_id,
    v_row.jugador_organizador_id, 'manual_admin', v_actor
  )
  ON CONFLICT (riviera_jugador_id) DO NOTHING
  RETURNING id INTO v_link_id;

  RETURN jsonb_build_object(
    'linked', v_link_id IS NOT NULL OR v_row.has_profile_link,
    'link_created', v_link_id IS NOT NULL, 'confidence', 'HIGH',
    'reason', v_row.reason, 'action_sugerida', 'LINK_TO_OFFICIAL',
    'official_player_key', v_row.candidate_official_player_key,
    'riviera_id', v_row.candidate_riviera_id, 'jugador_id', p_jugador_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.try_write_riviera_official_ledger(p_participacion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p record;
  v_organizador_id uuid;
  v_key uuid;
  v_points integer;
  v_subtipo text;
  v_club_name text;
  v_ledger_id uuid;
  v_prev_points integer;
  v_delta integer;
  v_valid_types text[] := ARRAY[
    'reta',
    'torneo_express',
    'liga',
    'americano',
    'duelo_2v2'
  ];
BEGIN
  IF p_participacion_id IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'null_participacion_id');
  END IF;

  SELECT
    jp.id,
    jp.jugador_id,
    jp.tipo_evento,
    jp.evento_id,
    jp.evento_nombre,
    jp.puntos_obtenidos,
    jp.metadata,
    jp.created_at
  INTO v_p
  FROM public.jugador_participaciones jp
  WHERE jp.id = p_participacion_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'participacion_not_found');
  END IF;

  v_subtipo := v_p.metadata->>'subtipo';
  IF v_subtipo = 'ajuste_manual' THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'ajuste_manual');
  END IF;

  IF NOT (v_p.tipo_evento::text = ANY (v_valid_types)) THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'invalid_event_type',
      'tipo_evento', v_p.tipo_evento
    );
  END IF;

  v_points := GREATEST(0, COALESCE(v_p.puntos_obtenidos, 0));
  IF v_points <= 0 THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'no_positive_points');
  END IF;

  -- Club real donde se jugó el evento (no el de origen del perfil).
  BEGIN
    v_organizador_id := NULLIF(trim(v_p.metadata->>'organizador_id'), '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_organizador_id := NULL;
  END;

  IF v_organizador_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'missing_local_organizador_id'
    );
  END IF;

  IF NOT public._is_official_ranking_emitter(v_organizador_id) THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'organizer_not_authorized');
  END IF;

  v_key := public._resolve_official_player_key(v_p.jugador_id);
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'no_official_identity');
  END IF;

  SELECT coalesce(u.name, u.email, 'Club')
  INTO v_club_name
  FROM public.users u
  WHERE u.id = v_organizador_id;

  -- ── Reconciliación (nuevo, RANK-001) ──
  -- Antes: ON CONFLICT (participacion_id) DO NOTHING -- una corrección de
  -- puntos posterior se descartaba en silencio. Ahora: si ya existe una fila
  -- para esta participación y los puntos cambiaron, se actualiza el ledger
  -- Y se ajustan los totales por el delta (no por un re-sumado ciego --
  -- points_total es una suma agregada simple, sin problema de encadenamiento
  -- secuencial como el rating).
  SELECT points INTO v_prev_points
  FROM public.riviera_official_points_ledger
  WHERE participacion_id = p_participacion_id;

  IF v_prev_points IS NOT NULL AND v_prev_points = v_points THEN
    RETURN jsonb_build_object(
      'status', 'already_exists',
      'participacion_id', p_participacion_id
    );
  END IF;

  INSERT INTO public.riviera_official_points_ledger (
    official_player_key,
    source_organizer_id,
    source_local_jugador_id,
    participacion_id,
    event_type,
    event_id,
    event_name,
    points,
    source_club_name,
    created_at
  ) VALUES (
    v_key,
    v_organizador_id,
    v_p.jugador_id,
    p_participacion_id,
    v_p.tipo_evento,
    v_p.evento_id,
    v_p.evento_nombre,
    v_points,
    v_club_name,
    COALESCE(v_p.created_at, now())
  )
  ON CONFLICT (participacion_id) DO UPDATE SET
    points = EXCLUDED.points,
    event_name = EXCLUDED.event_name,
    source_club_name = EXCLUDED.source_club_name
  RETURNING id INTO v_ledger_id;

  v_delta := v_points - COALESCE(v_prev_points, 0);

  INSERT INTO public.riviera_official_player_totals (
    official_player_key,
    points_total,
    last_activity_at
  ) VALUES (
    v_key,
    v_delta,
    now()
  )
  ON CONFLICT (official_player_key) DO UPDATE
  SET
    points_total = riviera_official_player_totals.points_total + v_delta,
    last_activity_at = EXCLUDED.last_activity_at,
    updated_at = now();

  RETURN jsonb_build_object(
    'status', CASE WHEN v_prev_points IS NULL THEN 'inserted' ELSE 'updated' END,
    'ledger_id', v_ledger_id,
    'official_player_key', v_key,
    'points', v_points,
    'previous_points', v_prev_points,
    'participacion_id', p_participacion_id
  );
END;
$function$;

-- refresh: solo reponer GRANT authenticated (cuerpo no cambió en P0)
REVOKE ALL ON FUNCTION public.refresh_jugador_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_jugador_stats(uuid) TO authenticated;

-- Pre-P0 grants (reaplicables)
REVOKE ALL ON FUNCTION public._riviera_profile_link_resolution(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._riviera_orphan_profile_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._riviera_profile_link_resolution(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public._riviera_orphan_profile_audit() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.try_write_riviera_official_ledger(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_write_riviera_official_ledger(uuid) TO authenticated;
-- Nota: si prod pre-P0 tenía EXECUTE vía default PUBLIC residual, este rollback
-- NO lo recrea a propósito en PUBLIC; sí restaura el cuerpo sin auth guard.
-- Si necesitas reproducir exactamente el bug anon, descomenta:
-- GRANT EXECUTE ON FUNCTION public.try_write_riviera_official_ledger(uuid) TO anon;

REVOKE ALL ON FUNCTION public.ensure_official_profile_link_for_participacion(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_official_profile_link_for_participacion(uuid, uuid) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public._riviera_orphan_profile_audit() TO service_role;
    GRANT EXECUTE ON FUNCTION public._riviera_profile_link_resolution(uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.try_write_riviera_official_ledger(uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.refresh_jugador_stats(uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.ensure_official_profile_link_for_participacion(uuid, uuid) TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
