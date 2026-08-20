-- ══════════════════════════════════════════════════════════════════════════════
-- Patch: cancelar convocatoria pública por Riviera ID (además del token)
--
-- Mismo modelo de confianza que el join: quien conoce el Riviera ID puede
-- gestionar esa inscripción. El token de dispositivo sigue funcionando.
-- Ejecutar en staging/prod cuando se autorice.
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.cancel_tournament_open_registration(text, text);

CREATE OR REPLACE FUNCTION public.cancel_tournament_open_registration(
  p_slug text,
  p_cancellation_token text DEFAULT NULL,
  p_riviera_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cfg public.tournament_open_registration;
  v_hash text;
  v_entry public.tournament_open_registration_entries%ROWTYPE;
  v_norm text;
  v_token text := nullif(trim(coalesce(p_cancellation_token, '')), '');
BEGIN
  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, ''))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_token IS NOT NULL AND length(v_token) >= 16
     AND nullif(trim(coalesce(p_riviera_id, '')), '') IS NULL THEN
    v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

    SELECT * INTO v_entry
    FROM public.tournament_open_registration_entries e
    WHERE e.registration_id = v_cfg.id
      AND e.cancellation_token_hash = v_hash
      AND e.status IN ('confirmed', 'waitlist', 'pending_approval')
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
    END IF;
  ELSE
    v_norm := public._normalize_riviera_id_loose(p_riviera_id);
    IF v_norm IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_riviera_id');
    END IF;

    SELECT * INTO v_entry
    FROM public.tournament_open_registration_entries e
    WHERE e.registration_id = v_cfg.id
      AND public._normalize_riviera_id_loose(e.riviera_id) = v_norm
      AND e.status IN ('confirmed', 'waitlist', 'pending_approval')
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_registered');
    END IF;
  END IF;

  UPDATE public.tournament_open_registration_entries
  SET
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now(),
    cancellation_token_hash = NULL
  WHERE id = v_entry.id;

  IF v_entry.status = 'confirmed' THEN
    IF v_cfg.mode_type = 'americano' THEN
      PERFORM public._open_reg_sync_americano_roster(v_cfg.entity_id);
    ELSIF v_cfg.mode_type = 'duelo_2v2' THEN
      PERFORM public._open_reg_sync_duelo_slots(v_cfg.entity_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'entry_id', v_entry.id,
    'previous_status', v_entry.status,
    'message', 'Inscripción cancelada.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_tournament_open_registration(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_tournament_open_registration(text, text, text) TO anon, authenticated;
