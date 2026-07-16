-- ══════════════════════════════════════════════════════════════════════════════
-- Convocatoria pública: meta desde entidad (no cache stale)
--
-- Problema: /jugar leía title_public / location_label / scheduled_at del cache
-- tournament_open_registration. Tras editar la entidad (nombre, duelo, etc.)
-- el cache quedaba STALE → título/lugar/hora distintos en admin vs público.
--
-- Decisión: leer SIEMPRE en vivo desde la entidad según mode_type.
-- tournaments NO tenía lugar/cancha/horario → se agregan columnas (SoT unificada).
--
-- NO ejecutar automáticamente. Revisar → aplicar en SQL Editor (staging → prod).
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1) SoT en tournaments (reta / round_robin / americano) ────────────────────

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS lugar text NULL;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS mostrar_lugar boolean NOT NULL DEFAULT true;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS cancha text NULL;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS programado_en timestamptz NULL;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS programado_hasta timestamptz NULL;

COMMENT ON COLUMN public.tournaments.lugar IS
  'Sede del encuentro (ej. Hack Padel). Independiente del nombre del organizador/tenant.';
COMMENT ON COLUMN public.tournaments.mostrar_lugar IS
  'Si false, la convocatoria pública omite la línea de lugar.';
COMMENT ON COLUMN public.tournaments.cancha IS
  'Etiqueta de cancha (ej. 1 / Cancha 1). Distinto de courts (conteo para matchmaking).';
COMMENT ON COLUMN public.tournaments.programado_en IS
  'Inicio programado del encuentro (fuente de verdad para /jugar y admin).';
COMMENT ON COLUMN public.tournaments.programado_hasta IS
  'Fin programado del encuentro. Preferir rango vs duration_minutes.';

-- Deprecated para display público (siguen existiendo por compat upsert/admin):
COMMENT ON COLUMN public.tournament_open_registration.title_public IS
  'DEPRECATED display: /jugar lee el nombre de la entidad. Se conserva por compat de upsert.';
COMMENT ON COLUMN public.tournament_open_registration.location_label IS
  'DEPRECATED display: /jugar lee lugar/cancha de la entidad. Se conserva por compat de upsert.';

-- ── 2) Backfill desde cache open_registration → entidad ──────────────────────

-- Duelo: ya tiene columnas; no tocar.

-- Tournaments: copiar desde open_reg solo si la entidad aún está vacía.
UPDATE public.tournaments t
SET
  lugar = COALESCE(
    NULLIF(trim(t.lugar), ''),
    CASE
      WHEN NULLIF(trim(r.location_label), '') IS NULL THEN NULL
      WHEN trim(r.location_label) ~ '^\d{1,2}$' THEN NULL
      WHEN trim(r.location_label) ~* '^cancha\s*\d{1,2}$' THEN NULL
      ELSE NULLIF(trim(r.location_label), '')
    END
  ),
  cancha = COALESCE(
    NULLIF(trim(t.cancha), ''),
    CASE
      WHEN trim(coalesce(r.location_label, '')) ~ '^\d{1,2}$'
        THEN trim(r.location_label)
      WHEN trim(coalesce(r.location_label, '')) ~* '^cancha\s*\d{1,2}$'
        THEN trim(r.location_label)
      ELSE NULL
    END
  ),
  programado_en = COALESCE(t.programado_en, r.scheduled_at),
  programado_hasta = COALESCE(
    t.programado_hasta,
    CASE
      WHEN r.scheduled_at IS NOT NULL
           AND r.duration_minutes IS NOT NULL
           AND r.duration_minutes > 0
        THEN r.scheduled_at + make_interval(mins => r.duration_minutes)
      ELSE NULL
    END
  )
FROM public.tournament_open_registration r
WHERE r.entity_id = t.id
  AND r.mode_type IN ('reta', 'americano');

-- ── 3) RPC pública: meta siempre desde entidad ───────────────────────────────

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
