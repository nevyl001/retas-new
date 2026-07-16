-- Rollback: quita set_open_game_registration_capacity y restaura upsert
-- sin validación de confirmed_count / force duelo (comportamiento previo al patch).
-- NO ejecutar automáticamente.

DROP FUNCTION IF EXISTS public.set_open_game_registration_capacity(text, uuid, integer);

CREATE OR REPLACE FUNCTION public.upsert_open_game_registration(
  p_mode_type text,
  p_entity_id uuid,
  p_enabled boolean DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_capacity integer DEFAULT NULL,
  p_waitlist_enabled boolean DEFAULT NULL,
  p_approval_required boolean DEFAULT NULL,
  p_registration_deadline timestamptz DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_category_label text DEFAULT NULL,
  p_location_label text DEFAULT NULL,
  p_display_rating boolean DEFAULT NULL,
  p_display_photo boolean DEFAULT NULL,
  p_display_full_name boolean DEFAULT NULL,
  p_title_public text DEFAULT NULL,
  p_rama_label text DEFAULT NULL
)
RETURNS public.tournament_open_registration
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_row public.tournament_open_registration;
  v_mode text;
  v_tournament uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticación requerida'; END IF;
  v_mode := public._assert_convocatoria_mode_allowed(p_mode_type);
  IF p_entity_id IS NULL THEN RAISE EXCEPTION 'entity_id requerido'; END IF;

  v_org := public._open_reg_organizer_id(v_mode, p_entity_id);
  IF v_org IS NULL OR v_org <> v_uid THEN
    RAISE EXCEPTION 'Evento no encontrado o sin permiso';
  END IF;

  v_tournament := CASE WHEN v_mode = 'duelo_2v2' THEN NULL ELSE p_entity_id END;

  INSERT INTO public.tournament_open_registration AS tor (
    id, tournament_id, mode_type, entity_id, public_slug, enabled, status,
    capacity, waitlist_enabled, approval_required, registration_deadline,
    scheduled_at, duration_minutes, category_label, location_label,
    display_rating, display_photo, display_full_name, title_public, rama_label
  ) VALUES (
    gen_random_uuid(),
    v_tournament,
    v_mode,
    p_entity_id,
    public._tor_open_reg_slug(),
    coalesce(p_enabled, false),
    coalesce(p_status, 'draft'),
    coalesce(p_capacity, CASE WHEN v_mode = 'duelo_2v2' THEN 4 ELSE 8 END),
    coalesce(p_waitlist_enabled, true),
    coalesce(p_approval_required, false),
    p_registration_deadline,
    p_scheduled_at,
    p_duration_minutes,
    nullif(trim(coalesce(p_category_label, '')), ''),
    nullif(trim(coalesce(p_location_label, '')), ''),
    coalesce(p_display_rating, true),
    coalesce(p_display_photo, true),
    coalesce(p_display_full_name, true),
    nullif(trim(coalesce(p_title_public, '')), ''),
    nullif(trim(coalesce(p_rama_label, '')), '')
  )
  ON CONFLICT (mode_type, entity_id) DO UPDATE SET
    enabled = coalesce(p_enabled, tor.enabled),
    status = coalesce(p_status, tor.status),
    capacity = coalesce(p_capacity, tor.capacity),
    waitlist_enabled = coalesce(p_waitlist_enabled, tor.waitlist_enabled),
    approval_required = coalesce(p_approval_required, tor.approval_required),
    registration_deadline = coalesce(p_registration_deadline, tor.registration_deadline),
    scheduled_at = coalesce(p_scheduled_at, tor.scheduled_at),
    duration_minutes = coalesce(p_duration_minutes, tor.duration_minutes),
    category_label = coalesce(nullif(trim(coalesce(p_category_label, '')), ''), tor.category_label),
    location_label = coalesce(nullif(trim(coalesce(p_location_label, '')), ''), tor.location_label),
    display_rating = coalesce(p_display_rating, tor.display_rating),
    display_photo = coalesce(p_display_photo, tor.display_photo),
    display_full_name = coalesce(p_display_full_name, tor.display_full_name),
    title_public = coalesce(nullif(trim(coalesce(p_title_public, '')), ''), tor.title_public),
    rama_label = coalesce(nullif(trim(coalesce(p_rama_label, '')), ''), tor.rama_label),
    tournament_id = coalesce(tor.tournament_id, v_tournament),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_open_game_registration(
  text, uuid, boolean, text, integer, boolean, boolean, timestamptz, timestamptz,
  integer, text, text, boolean, boolean, boolean, text, text
) TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_open_game_registration(
  text, uuid, boolean, text, integer, boolean, boolean, timestamptz, timestamptz,
  integer, text, text, boolean, boolean, boolean, text, text
) FROM anon;

NOTIFY pgrst, 'reload schema';
