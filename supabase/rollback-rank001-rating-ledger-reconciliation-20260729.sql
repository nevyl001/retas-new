-- =============================================================================
-- ROLLBACK -- restaura aplicar_rating_partido() y
-- try_write_riviera_official_ledger() a su definición ORIGINAL (sin
-- reconciliación de resultado corregido), exactamente como estaban antes de
-- fix-rank001-rating-ledger-reconciliation-20260729.sql.
-- NO EJECUTAR salvo que el fix ya se haya aplicado y se decida revertir.
-- =============================================================================

BEGIN;

-- =============================================================================

CREATE OR REPLACE FUNCTION public.aplicar_rating_partido(p_j1 uuid, p_j2 uuid, p_j3 uuid, p_j4 uuid, p_ganador text, p_modo_juego text, p_partido_ref text DEFAULT NULL::text, p_descripcion text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ids uuid[] := ARRAY[p_j1, p_j2, p_j3, p_j4];
  v_org uuid;
  r record;
  ra numeric;
  rb numeric;
  ea numeric;
  eb numeric;
  sa numeric;
  sb numeric;
  k numeric;
  delta_a numeric;
  delta_b numeric;
  antes numeric;
  despues numeric;
  partidos int;
  fiab numeric;
  d numeric := 0.4;
BEGIN
  -- ── Fase 1: autorización (nuevo) ──
  PERFORM public._assert_rating_rpc_authenticated();

  IF EXISTS (SELECT 1 FROM unnest(ids) u(id) WHERE id IS NULL) THEN
    RAISE EXCEPTION 'Los cuatro jugador_id son obligatorios';
  END IF;

  FOR v_org IN
    SELECT DISTINCT organizador_id
    FROM public.riviera_jugadores
    WHERE id = ANY(ids)
  LOOP
    PERFORM public._assert_rating_rpc_organizador_caller(v_org);
  END LOOP;

  -- ── Cuerpo original: cálculo de rating, sin cambios de lógica ──
  IF p_ganador IS NULL OR p_ganador NOT IN ('a', 'b') THEN
    RAISE EXCEPTION 'p_ganador debe ser ''a'' o ''b''';
  END IF;

  IF p_partido_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM rating_historial
    WHERE partido_ref = p_partido_ref
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(AVG(CASE WHEN id IN (p_j1, p_j2) THEN rating END), 3.0),
    COALESCE(AVG(CASE WHEN id IN (p_j3, p_j4) THEN rating END), 3.0)
  INTO ra, rb
  FROM riviera_jugadores
  WHERE id = ANY(ids);

  ea := 1.0 / (1.0 + power(10.0, (rb - ra) / d));
  eb := 1.0 - ea;

  IF p_ganador = 'a' THEN
    sa := 1.0;
    sb := 0.0;
  ELSE
    sa := 0.0;
    sb := 1.0;
  END IF;

  k := 0.10;

  delta_a := k * (sa - ea);
  delta_b := k * (sb - eb);

  FOR r IN
    SELECT id,
      COALESCE(rating, 3.0) AS rating,
      COALESCE(rating_partidos, 0) AS rating_partidos,
      COALESCE(rating_fiabilidad, 0.2) AS rating_fiabilidad
    FROM riviera_jugadores
    WHERE id = ANY(ids)
  LOOP
    antes := r.rating;
    IF r.id IN (p_j1, p_j2) THEN
      despues := GREATEST(1.0, LEAST(7.0, antes + delta_a));
    ELSE
      despues := GREATEST(1.0, LEAST(7.0, antes + delta_b));
    END IF;

    partidos := r.rating_partidos + 1;
    fiab := LEAST(1.0, 0.2 + partidos * 0.04);

    UPDATE riviera_jugadores
    SET
      rating = ROUND(despues::numeric, 2),
      rating_partidos = partidos,
      rating_fiabilidad = ROUND(fiab::numeric, 2),
      updated_at = now()
    WHERE id = r.id;

    INSERT INTO rating_historial (
      jugador_id, fecha, rating_antes, rating_despues, delta,
      modo_juego, descripcion, partido_ref
    ) VALUES (
      r.id,
      now(),
      ROUND(antes::numeric, 2),
      ROUND(despues::numeric, 2),
      ROUND((despues - antes)::numeric, 2),
      p_modo_juego,
      p_descripcion,
      p_partido_ref
    )
    ON CONFLICT (jugador_id, partido_ref) WHERE partido_ref IS NOT NULL DO NOTHING;
  END LOOP;
END;
$function$;

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
  ON CONFLICT (participacion_id) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_exists',
      'participacion_id', p_participacion_id
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
    'participacion_id', p_participacion_id
  );
END;
$function$;

COMMIT;
