-- Rollback: restaura get_tournament_open_registration_public al comportamiento
-- previo (meta desde cache title_public / location_label / scheduled_at).
-- NO dropea columnas nuevas de tournaments (lugar/cancha/programado_*) —
-- son aditivas y seguras; dropearlas borraría datos. Si hace falta:
--   ALTER TABLE public.tournaments DROP COLUMN IF EXISTS lugar;
--   ... (solo con backup explícito).
--
-- NO ejecutar automáticamente.

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
BEGIN
  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, ''))
    AND enabled = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_org := public._open_reg_organizer_id(v_cfg.mode_type, v_cfg.entity_id);
  v_title := coalesce(
    nullif(trim(v_cfg.title_public), ''),
    public._open_reg_entity_title(v_cfg.mode_type, v_cfg.entity_id)
  );

  IF v_cfg.mode_type = 'duelo_2v2' THEN
    SELECT descripcion, estado IN ('en_juego', 'finalizado'), estado = 'finalizado'
    INTO v_desc, v_started, v_finished
    FROM public.duelos_2v2 WHERE id = v_cfg.entity_id;
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
    'scheduled_at', v_cfg.scheduled_at,
    'duration_minutes', v_cfg.duration_minutes,
    'category_label', v_cfg.category_label,
    'rama_label', v_cfg.rama_label,
    'location_label', v_cfg.location_label,
    'display_rating', v_cfg.display_rating,
    'display_photo', v_cfg.display_photo,
    'entries', v_entries,
    'is_finished', coalesce(v_finished, false),
    'is_started', coalesce(v_started, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tournament_open_registration_public(text) TO anon, authenticated;

COMMENT ON COLUMN public.tournament_open_registration.title_public IS NULL;
COMMENT ON COLUMN public.tournament_open_registration.location_label IS NULL;

NOTIFY pgrst, 'reload schema';
