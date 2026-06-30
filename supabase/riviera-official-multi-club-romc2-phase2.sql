-- ROMC Phase 2.2: puente de identidad automático + ledger diagnóstico.
-- Ejecutar en Supabase SQL Editor DESPUÉS de romc1.sql y romc2.sql.
--
-- Sin hardcode de clubes. Depende de:
--   riviera_official_ranking_emitters
--   organizer_player_access
--   riviera_official_player_identity / profile_link

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Canonical: jugador origen (grant) o el mismo id si es perfil propio
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._resolve_canonical_jugador_for_official(p_jugador_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_id uuid;
BEGIN
  IF p_jugador_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT opa.jugador_id
  INTO v_source_id
  FROM public.organizer_player_access opa
  WHERE opa.is_active = true
    AND opa.local_jugador_id = p_jugador_id
  LIMIT 1;

  IF v_source_id IS NOT NULL THEN
    RETURN v_source_id;
  END IF;

  RETURN p_jugador_id;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_canonical_jugador_for_official(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._resolve_canonical_jugador_for_official(uuid) FROM anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Identidad oficial idempotente (sin duplicar riviera_jugadores)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._ensure_official_player_identity_for_jugador(p_jugador_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key uuid;
  v_jugador record;
BEGIN
  IF p_jugador_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_key := public._resolve_official_player_key(p_jugador_id);
  IF v_key IS NOT NULL THEN
    RETURN v_key;
  END IF;

  SELECT i.official_player_key
  INTO v_key
  FROM public.riviera_official_player_identity i
  WHERE i.canonical_riviera_jugador_id = p_jugador_id;

  IF v_key IS NULL THEN
    SELECT rj.id, rj.organizador_id, rj.nombre
    INTO v_jugador
    FROM public.riviera_jugadores rj
    WHERE rj.id = p_jugador_id;

    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    INSERT INTO public.riviera_official_player_identity (
      canonical_riviera_jugador_id,
      created_by
    )
    VALUES (p_jugador_id, NULL)
    RETURNING official_player_key INTO v_key;

    INSERT INTO public.riviera_official_player_profile_link (
      official_player_key,
      riviera_jugador_id,
      organizer_id,
      link_source,
      created_by
    )
    VALUES (v_key, p_jugador_id, v_jugador.organizador_id, 'owner', NULL)
    ON CONFLICT (riviera_jugador_id) DO NOTHING;

    INSERT INTO public.riviera_official_player_totals (official_player_key, points_total)
    VALUES (v_key, 0)
    ON CONFLICT (official_player_key) DO NOTHING;

    RETURN v_key;
  END IF;

  INSERT INTO public.riviera_official_player_profile_link (
    official_player_key,
    riviera_jugador_id,
    organizer_id,
    link_source,
    created_by
  )
  SELECT
    v_key,
    rj.id,
    rj.organizador_id,
    'owner',
    NULL
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_jugador_id
  ON CONFLICT (riviera_jugador_id) DO NOTHING;

  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public._ensure_official_player_identity_for_jugador(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ensure_official_player_identity_for_jugador(uuid) FROM anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Perfil local concedido → misma official_player_key que el origen
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._ensure_official_profile_link_for_granted_local(
  p_local_jugador_id uuid,
  p_official_player_key uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access public.organizer_player_access%ROWTYPE;
  v_org_id uuid;
BEGIN
  IF p_local_jugador_id IS NULL OR p_official_player_key IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.riviera_official_player_profile_link l
    WHERE l.riviera_jugador_id = p_local_jugador_id
  ) THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_access
  FROM public.organizer_player_access opa
  WHERE opa.is_active = true
    AND opa.local_jugador_id = p_local_jugador_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT rj.organizador_id
  INTO v_org_id
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_local_jugador_id;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.riviera_official_player_profile_link (
    official_player_key,
    riviera_jugador_id,
    organizer_id,
    link_source,
    organizer_player_access_id,
    created_by
  )
  VALUES (
    p_official_player_key,
    p_local_jugador_id,
    v_org_id,
    'granted_local',
    v_access.id,
    NULL
  )
  ON CONFLICT (riviera_jugador_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public._ensure_official_profile_link_for_granted_local(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ensure_official_profile_link_for_granted_local(uuid, uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._ensure_official_identity_for_participation_jugador(
  p_jugador_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical uuid;
  v_key uuid;
BEGIN
  IF p_jugador_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_key := public._resolve_official_player_key(p_jugador_id);
  IF v_key IS NOT NULL THEN
    RETURN v_key;
  END IF;

  v_canonical := public._resolve_canonical_jugador_for_official(p_jugador_id);
  v_key := public._ensure_official_player_identity_for_jugador(v_canonical);

  IF v_key IS NOT NULL AND v_canonical IS DISTINCT FROM p_jugador_id THEN
    PERFORM public._ensure_official_profile_link_for_granted_local(p_jugador_id, v_key);
  END IF;

  RETURN COALESCE(public._resolve_official_player_key(p_jugador_id), v_key);
END;
$$;

REVOKE ALL ON FUNCTION public._ensure_official_identity_for_participation_jugador(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ensure_official_identity_for_participation_jugador(uuid) FROM anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Ledger: asegurar identidad + respuestas diagnósticas
-- ══════════════════════════════════════════════════════════════════════════════

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

GRANT EXECUTE ON FUNCTION public.try_write_riviera_official_ledger(uuid) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Reintento idempotente para participaciones ya corregidas (backfill)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.retry_official_ledger_for_organizer(p_organizador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_result jsonb;
  v_inserted int := 0;
  v_already int := 0;
  v_skipped int := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF p_organizador_id IS NULL THEN
    RAISE EXCEPTION 'organizador_id requerido';
  END IF;

  IF NOT public._is_official_ranking_emitter(p_organizador_id) THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'organizer_not_authorized',
      'organizador_id', p_organizador_id
    );
  END IF;

  FOR v_row IN
    SELECT jp.id
    FROM public.jugador_participaciones jp
    JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
    WHERE rj.organizador_id = p_organizador_id
      AND COALESCE(jp.puntos_obtenidos, 0) > 0
      AND coalesce(jp.metadata->>'subtipo', '') <> 'ajuste_manual'
      AND NOT EXISTS (
        SELECT 1
        FROM public.riviera_official_points_ledger l
        WHERE l.participacion_id = jp.id
      )
    ORDER BY jp.created_at ASC
  LOOP
    v_result := public.try_write_riviera_official_ledger(v_row.id);
    v_results := v_results || jsonb_build_array(v_result);

    IF v_result->>'status' = 'inserted' THEN
      v_inserted := v_inserted + 1;
    ELSIF v_result->>'status' = 'already_exists' THEN
      v_already := v_already + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'organizador_id', p_organizador_id,
    'inserted', v_inserted,
    'already_exists', v_already,
    'skipped', v_skipped,
    'results', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_official_ledger_for_organizer(uuid) TO authenticated;

COMMENT ON FUNCTION public.retry_official_ledger_for_organizer(uuid) IS
  'ROMC 2.2: reintenta ledger oficial para participaciones con puntos>0 sin fila en ledger. Idempotente.';
