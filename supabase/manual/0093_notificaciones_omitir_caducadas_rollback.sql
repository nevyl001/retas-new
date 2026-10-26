-- NO EJECUTAR salvo para revertir 0093_notificaciones_omitir_caducadas.sql.
-- Solo devuelve a pendiente las filas marcadas por ese archivo.
-- No reenvía correos.
--
--   SET riviera.recover_notificaciones = 'ADELANTE';

DO $recover$
DECLARE
  v_updated integer;
BEGIN
  IF current_setting('riviera.recover_notificaciones', true) IS DISTINCT FROM 'ADELANTE' THEN
    RAISE EXCEPTION 'rollback detenido: falta SET riviera.recover_notificaciones = ADELANTE';
  END IF;

  UPDATE public.notificaciones_eventos_queue
  SET estado = 'pendiente',
      error_detalle = NULL,
      processed_at = NULL
  WHERE estado = 'omitido'
    AND attempts = 0
    AND error_detalle = 'omitido: torneo finalizado; no se reenvía';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated IS DISTINCT FROM 425 THEN
    RAISE EXCEPTION 'rollback detenido: iban a reabrirse % filas y se esperaban 425', v_updated;
  END IF;
END
$recover$;
