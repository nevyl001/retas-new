-- Patch: fotos de confirmados en /jugar
-- COALESCE: local → origen (OPA) → canónico por legacy_player_id
-- También expone riviera_jugador_id en entries.
-- Idempotente. Aplicar en SQL Editor tras revisar.
--
-- ── RPC pública (meta desde entidad + fotos canónicas) ───────────────────────

CREATE OR REPLACE FUNCTION public.get_tournament_open_registration_public(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg public.tournament_open_registration;
  v_org uuid;
  v_title text;
  v_desc text;
  v_confirmed int;
  v_waitlist int;
  v_entries jsonb;
  v_finished boolean := false;
  v_started boolean := false;
  v_location text;
  v_cancha text;
  v_mostrar_lugar boolean := true;
  v_scheduled_at timestamptz;
  v_scheduled_until timestamptz;
  v_duration int;
BEGIN
  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, ''))
    AND enabled = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_org := public._open_reg_organizer_id(v_cfg.mode_type, v_cfg.entity_id);

  IF v_cfg.mode_type = 'duelo_2v2' THEN
    SELECT
      nullif(trim(d.nombre), ''),
      d.descripcion,
      d.estado IN ('en_juego', 'finalizado'),
      d.estado = 'finalizado',
      nullif(trim(coalesce(d.lugar, '')), ''),
      coalesce(d.mostrar_lugar, true),
      nullif(trim(coalesce(d.cancha, '')), ''),
      d.programado_en,
      d.programado_hasta
    INTO
      v_title,
      v_desc,
      v_started,
      v_finished,
      v_location,
      v_mostrar_lugar,
      v_cancha,
      v_scheduled_at,
      v_scheduled_until
    FROM public.duelos_2v2 d
    WHERE d.id = v_cfg.entity_id;
  ELSE
    -- reta (incluye round_robin / remontada) + americano
    SELECT
      nullif(trim(t.name), ''),
      t.description,
      coalesce(t.is_started, false),
      coalesce(t.is_finished, false),
      nullif(trim(coalesce(t.lugar, '')), ''),
      coalesce(t.mostrar_lugar, true),
      nullif(trim(coalesce(t.cancha, '')), ''),
      t.programado_en,
      t.programado_hasta
    INTO
      v_title,
      v_desc,
      v_started,
      v_finished,
      v_location,
      v_mostrar_lugar,
      v_cancha,
      v_scheduled_at,
      v_scheduled_until
    FROM public.tournaments t
    WHERE t.id = v_cfg.entity_id;
  END IF;

  IF v_mostrar_lugar IS FALSE THEN
    v_location := NULL;
  END IF;

  v_title := coalesce(v_title, 'Convocatoria');

  IF v_scheduled_at IS NOT NULL AND v_scheduled_until IS NOT NULL
     AND v_scheduled_until > v_scheduled_at THEN
    v_duration := greatest(
      1,
      round(extract(epoch FROM (v_scheduled_until - v_scheduled_at)) / 60.0)::int
    );
  ELSE
    v_duration := NULL;
  END IF;

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries e
  WHERE e.registration_id = v_cfg.id AND e.status = 'confirmed';

  SELECT count(*)::int INTO v_waitlist
  FROM public.tournament_open_registration_entries e
  WHERE e.registration_id = v_cfg.id AND e.status = 'waitlist';

  SELECT coalesce(jsonb_agg(x.obj ORDER BY x.sort_ts), '[]'::jsonb)
  INTO v_entries
  FROM (
    SELECT
      jsonb_build_object(
        'id', e.id,
        'status', e.status,
        'riviera_id', e.riviera_id,
        'riviera_jugador_id', e.riviera_jugador_id,
        'nombre', CASE
          WHEN v_cfg.display_full_name THEN coalesce(e.display_name_snapshot, rj.nombre)
          ELSE split_part(coalesce(e.display_name_snapshot, rj.nombre), ' ', 1)
            || CASE
              WHEN array_length(regexp_split_to_array(trim(coalesce(e.display_name_snapshot, rj.nombre)), '\s+'), 1) > 1
              THEN ' ' || left(split_part(coalesce(e.display_name_snapshot, rj.nombre), ' ', 2), 1) || '.'
              ELSE ''
            END
        END,
        'foto_url', CASE
          WHEN NOT v_cfg.display_photo THEN NULL
          ELSE coalesce(
            nullif(trim(rj.foto_url), ''),
            (
              SELECT nullif(trim(src.foto_url), '')
              FROM public.organizer_player_access opa
              JOIN public.riviera_jugadores src
                ON src.id = opa.jugador_id
               AND src.estado = 'activo'
              WHERE opa.grantee_organizer_id = v_org
                AND opa.is_active = true
                AND (
                  opa.local_jugador_id = rj.id
                  OR opa.jugador_id = rj.id
                )
              ORDER BY opa.updated_at DESC NULLS LAST
              LIMIT 1
            ),
            (
              SELECT nullif(trim(c.foto_url), '')
              FROM public.riviera_jugadores c
              WHERE c.estado = 'activo'
                AND rj.legacy_player_id IS NOT NULL
                AND c.legacy_player_id = rj.legacy_player_id
                AND nullif(trim(c.foto_url), '') IS NOT NULL
              ORDER BY coalesce(c.rating_partidos, 0) DESC NULLS LAST
              LIMIT 1
            )
          )
        END,
        'rating', CASE WHEN v_cfg.display_rating THEN rj.rating ELSE NULL END,
        'categoria', rj.categoria,
        'preferred_side', e.preferred_side
      ) AS obj,
      coalesce(e.confirmed_at, e.created_at) AS sort_ts
    FROM public.tournament_open_registration_entries e
    JOIN public.riviera_jugadores rj ON rj.id = e.riviera_jugador_id
    WHERE e.registration_id = v_cfg.id
      AND e.status IN ('confirmed', 'waitlist')
  ) x;

  RETURN jsonb_build_object(
    'ok', true,
    'slug', v_cfg.public_slug,
    'mode_type', v_cfg.mode_type,
    'entity_id', v_cfg.entity_id,
    'registration_id', v_cfg.id,
    'tournament_id', v_cfg.tournament_id,
    'organizador_id', v_org,
    'name', v_title,
    'description', v_desc,
    'status', v_cfg.status,
    'capacity', v_cfg.capacity,
    'confirmed_count', v_confirmed,
    'waitlist_count', v_waitlist,
    'spots_left', greatest(v_cfg.capacity - v_confirmed, 0),
    'waitlist_enabled', v_cfg.waitlist_enabled,
    'approval_required', v_cfg.approval_required,
    'registration_deadline', v_cfg.registration_deadline,
    'scheduled_at', v_scheduled_at,
    'scheduled_until', v_scheduled_until,
    'duration_minutes', v_duration,
    'category_label', v_cfg.category_label,
    'rama_label', v_cfg.rama_label,
    'location_label', v_location,
    'cancha_label', v_cancha,
    'display_rating', v_cfg.display_rating,
    'display_photo', v_cfg.display_photo,
    'entries', v_entries,
    'is_finished', coalesce(v_finished, false),
    'is_started', coalesce(v_started, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tournament_open_registration_public(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
