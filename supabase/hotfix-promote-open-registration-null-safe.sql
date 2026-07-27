-- Hotfix: promote_tournament_open_registration_entry comparaba el resultado
-- de _open_reg_organizer_id(...) con v_uid usando <>. Si el entity_id de la
-- inscripción abierta no resuelve ningún dueño (registro huérfano: el
-- torneo/duelo referenciado ya no existe), _open_reg_organizer_id devuelve
-- NULL, y "NULL <> v_uid" se evalúa NULL, no TRUE — en PL/pgSQL un IF con
-- condición NULL no dispara el RAISE EXCEPTION, saltándose en silencio la
-- verificación de dueño. Confirmado que esta condición ya existe hoy en 4
-- inscripciones abiertas reales de duelo_2v2 huérfanas.
--
-- Único cambio: <> por IS DISTINCT FROM (NULL-safe). Para cualquier fila
-- donde el dueño resuelve correctamente (el caso normal), el comportamiento
-- es idéntico. Resto del cuerpo sin cambios.

CREATE OR REPLACE FUNCTION public.promote_tournament_open_registration_entry(p_entry_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_entry public.tournament_open_registration_entries%ROWTYPE;
  v_cfg public.tournament_open_registration;
  v_confirmed int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticación requerida'; END IF;

  SELECT * INTO v_entry FROM public.tournament_open_registration_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  SELECT * INTO v_cfg FROM public.tournament_open_registration WHERE id = v_entry.registration_id FOR UPDATE;
  IF public._open_reg_organizer_id(v_cfg.mode_type, v_cfg.entity_id) IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  IF v_entry.status NOT IN ('waitlist', 'pending_approval') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries
  WHERE registration_id = v_cfg.id AND status = 'confirmed';

  IF v_confirmed >= v_cfg.capacity THEN
    RETURN jsonb_build_object('ok', false, 'error', 'full');
  END IF;

  UPDATE public.tournament_open_registration_entries
  SET status = 'confirmed', confirmed_at = now(), updated_at = now()
  WHERE id = v_entry.id;

  IF v_cfg.mode_type = 'americano' THEN
    PERFORM public._open_reg_sync_americano_roster(v_cfg.entity_id);
  ELSIF v_cfg.mode_type = 'duelo_2v2' THEN
    PERFORM public._open_reg_sync_duelo_slots(v_cfg.entity_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'entry_id', v_entry.id, 'status', 'confirmed');
END;
$function$;
