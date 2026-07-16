-- Fix: vista pública /jugar (get_tournament_open_registration_public)
-- Para mode_type = duelo_2v2, título / lugar / cancha / horario salen de duelos_2v2
-- (misma fuente que la vista admin), no de caches stale en tournament_open_registration.
--
-- NO ejecutar automáticamente: aplicar en Supabase SQL Editor tras revisar.
-- Idempotente (CREATE OR REPLACE).

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
  v_scheduled_at timestamptz;
  v_scheduled_until timestamptz;
  v_duration int;
  v_duelo_nombre text;
  v_duelo_lugar text;
  v_mostrar_lugar boolean;
  v_duelo_cancha text;
  v_programado_en timestamptz;
  v_programado_hasta timestamptz;
  v_loc_raw text;
BEGIN
  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, ''))
    AND enabled = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_org := public._open_reg_organizer_id(v_cfg.mode_type, v_cfg.entity_id);

  -- Defaults desde convocatoria (reta/americano y fallback duelo)
  v_title := coalesce(
    nullif(trim(v_cfg.title_public), ''),
    public._open_reg_entity_title(v_cfg.mode_type, v_cfg.entity_id)
  );
  v_location := nullif(trim(coalesce(v_cfg.location_label, '')), '');
  v_cancha := NULL;
  v_scheduled_at := v_cfg.scheduled_at;
  v_scheduled_until := NULL;
  v_duration := v_cfg.duration_minutes;

  IF v_cfg.mode_type = 'duelo_2v2' THEN
    SELECT
      d.nombre,
      d.descripcion,
      d.estado IN ('en_juego', 'finalizado'),
      d.estado = 'finalizado',
      d.lugar,
      coalesce(d.mostrar_lugar, true),
      d.cancha,
      d.programado_en,
      d.programado_hasta
    INTO
      v_duelo_nombre,
      v_desc,
      v_started,
      v_finished,
      v_duelo_lugar,
      v_mostrar_lugar,
      v_duelo_cancha,
      v_programado_en,
      v_programado_hasta
    FROM public.duelos_2v2 d
    WHERE d.id = v_cfg.entity_id;

    -- Fuente de verdad: entidad duelo (igual que admin / Duelo2v2MatchMeta)
    v_title := coalesce(nullif(trim(v_duelo_nombre), ''), v_title);

    v_cancha := nullif(trim(coalesce(v_duelo_cancha, '')), '');

    IF v_mostrar_lugar IS DISTINCT FROM false THEN
      v_location := nullif(trim(coalesce(v_duelo_lugar, '')), '');
      -- Compat legacy: si la convocatoria guardó solo el # de cancha en location_label,
      -- no lo uses como sede (eso provocaba Lugar = nombre del tenant).
      IF v_location IS NULL THEN
        v_loc_raw := nullif(trim(coalesce(v_cfg.location_label, '')), '');
        IF v_loc_raw IS NOT NULL
           AND v_loc_raw !~ '^\d{1,2}$'
           AND v_loc_raw !~* '^cancha\s*\d{1,2}$' THEN
          v_location := v_loc_raw;
        END IF;
      END IF;
    ELSE
      v_location := NULL;
    END IF;

    v_scheduled_at := coalesce(v_programado_en, v_cfg.scheduled_at);
    v_scheduled_until := v_programado_hasta;

    IF v_programado_en IS NOT NULL AND v_programado_hasta IS NOT NULL
       AND v_programado_hasta > v_programado_en THEN
      v_duration := greatest(
        1,
        round(extract(epoch FROM (v_programado_hasta - v_programado_en)) / 60.0)::int
      );
    ELSE
      v_duration := v_cfg.duration_minutes;
    END IF;
  ELSE
    SELECT description, coalesce(is_started, false), coalesce(is_finished, false)
    INTO v_desc, v_started, v_finished
    FROM public.tournaments WHERE id = v_cfg.entity_id;
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
        'nombre', CASE
          WHEN v_cfg.display_full_name THEN coalesce(e.display_name_snapshot, rj.nombre)
          ELSE split_part(coalesce(e.display_name_snapshot, rj.nombre), ' ', 1)
            || CASE
              WHEN array_length(regexp_split_to_array(trim(coalesce(e.display_name_snapshot, rj.nombre)), '\s+'), 1) > 1
              THEN ' ' || left(split_part(coalesce(e.display_name_snapshot, rj.nombre), ' ', 2), 1) || '.'
              ELSE ''
            END
        END,
        'foto_url', CASE WHEN v_cfg.display_photo THEN rj.foto_url ELSE NULL END,
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
