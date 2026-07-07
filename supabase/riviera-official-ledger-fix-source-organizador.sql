-- ROMC-2 fix: source_organizer_id del ledger desde metadata.organizador_id
-- (club real del evento), no riviera_jugadores.organizador_id (perfil home).
--
-- Ejecutar en Supabase SQL Editor después de riviera-official-multi-club-romc2.sql
-- Diseño: docs/ADR-ranking-local-vs-global.md (Parte B, 2026-07-07)

CREATE OR REPLACE FUNCTION public.try_write_riviera_official_ledger(p_participacion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.try_write_riviera_official_ledger(uuid) TO authenticated;

COMMENT ON FUNCTION public.try_write_riviera_official_ledger(uuid) IS
  'ROMC-2: registra puntos oficiales desde participación local. source_organizer_id = metadata.organizador_id (club del evento). Idempotente.';

-- ══════════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO (solo lectura): ledger con source_organizer_id distinto del club
-- real en metadata de la participación (daño previo al fix).
-- NO modifica datos. Ejecutar antes de decidir backfill del ledger.
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
  count(*)::integer AS ledger_rows_mismatch_source_org,
  count(DISTINCT l.participacion_id)::integer AS participaciones_afectadas
FROM public.riviera_official_points_ledger l
INNER JOIN public.jugador_participaciones jp ON jp.id = l.participacion_id
WHERE NULLIF(trim(jp.metadata->>'organizador_id'), '') IS NOT NULL
  AND l.source_organizer_id::text IS DISTINCT FROM trim(jp.metadata->>'organizador_id');

SELECT
  l.id AS ledger_id,
  l.participacion_id,
  l.source_organizer_id AS ledger_source_org,
  NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid AS metadata_org,
  l.points,
  l.event_name,
  l.created_at
FROM public.riviera_official_points_ledger l
INNER JOIN public.jugador_participaciones jp ON jp.id = l.participacion_id
WHERE NULLIF(trim(jp.metadata->>'organizador_id'), '') IS NOT NULL
  AND l.source_organizer_id::text IS DISTINCT FROM trim(jp.metadata->>'organizador_id')
ORDER BY l.created_at DESC
LIMIT 50;

NOTIFY pgrst, 'reload schema';
