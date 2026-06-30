-- Hotfix ROMC 2.2: jugador_participaciones.tipo_evento es enum jugador_tipo_evento, no text.
-- Ejecutar en Supabase SQL Editor y luego repetir retry_official_ledger_for_organizer.

CREATE OR REPLACE FUNCTION public.try_write_riviera_official_ledger(p_participacion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p record;
  v_organizador_id uuid;
  v_canonical_jugador_id uuid;
  v_key uuid;
  v_points integer;
  v_subtipo text;
  v_club_name text;
  v_ledger_id uuid;
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
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'participacion_not_found',
      'participacion_id', p_participacion_id
    );
  END IF;

  v_subtipo := v_p.metadata->>'subtipo';
  IF v_subtipo = 'ajuste_manual' THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'ajuste_manual',
      'participacion_id', p_participacion_id,
      'jugador_id', v_p.jugador_id
    );
  END IF;

  IF NOT (v_p.tipo_evento::text = ANY (v_valid_types)) THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'invalid_event_type',
      'participacion_id', p_participacion_id,
      'tipo_evento', v_p.tipo_evento::text,
      'jugador_id', v_p.jugador_id
    );
  END IF;

  v_points := GREATEST(0, COALESCE(v_p.puntos_obtenidos, 0));
  IF v_points <= 0 THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'no_positive_points',
      'participacion_id', p_participacion_id,
      'jugador_id', v_p.jugador_id,
      'puntos_obtenidos', v_p.puntos_obtenidos
    );
  END IF;

  SELECT rj.organizador_id
  INTO v_organizador_id
  FROM public.riviera_jugadores rj
  WHERE rj.id = v_p.jugador_id;

  IF v_organizador_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'jugador_not_found',
      'participacion_id', p_participacion_id,
      'jugador_id', v_p.jugador_id
    );
  END IF;

  IF NOT public._is_official_ranking_emitter(v_organizador_id) THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'organizer_not_authorized',
      'participacion_id', p_participacion_id,
      'organizador_id', v_organizador_id,
      'jugador_id', v_p.jugador_id
    );
  END IF;

  v_canonical_jugador_id := public._resolve_canonical_jugador_for_official(v_p.jugador_id);
  v_key := public._ensure_official_identity_for_participation_jugador(v_p.jugador_id);

  IF v_key IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'no_official_identity',
      'participacion_id', p_participacion_id,
      'organizador_id', v_organizador_id,
      'jugador_id', v_p.jugador_id,
      'canonical_jugador_id', v_canonical_jugador_id
    );
  END IF;

  SELECT coalesce(u.name, u.email, 'Club')
  INTO v_club_name
  FROM public.users u
  WHERE u.id = v_organizador_id;

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
    v_p.tipo_evento::text,
    v_p.evento_id,
    v_p.evento_nombre,
    v_points,
    v_club_name,
    COALESCE(v_p.created_at, now())
  )
  ON CONFLICT (participacion_id) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_exists',
      'participacion_id', p_participacion_id,
      'official_player_key', v_key,
      'organizador_id', v_organizador_id,
      'jugador_id', v_p.jugador_id,
      'canonical_jugador_id', v_canonical_jugador_id
    );
  END IF;

  INSERT INTO public.riviera_official_player_totals (
    official_player_key,
    points_total,
    last_activity_at
  ) VALUES (
    v_key,
    v_points,
    now()
  )
  ON CONFLICT (official_player_key) DO UPDATE
  SET
    points_total = riviera_official_player_totals.points_total + EXCLUDED.points_total,
    last_activity_at = EXCLUDED.last_activity_at,
    updated_at = now();

  RETURN jsonb_build_object(
    'status', 'inserted',
    'ledger_id', v_ledger_id,
    'official_player_key', v_key,
    'points', v_points,
    'participacion_id', p_participacion_id,
    'organizador_id', v_organizador_id,
    'jugador_id', v_p.jugador_id,
    'canonical_jugador_id', v_canonical_jugador_id,
    'evento_id', v_p.evento_id,
    'tipo_evento', v_p.tipo_evento::text,
    'subtipo', v_subtipo
  );
END;
$$;
