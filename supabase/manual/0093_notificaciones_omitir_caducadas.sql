-- NO EJECUTAR hasta autorización expresa.
-- No envía correos, no borra filas y no toca torneos en curso.
-- Medición del 2026-10-26: 425 pendientes con torneo finalizado y fase cerrado.
-- Si ese número cambió, la transacción se revierte y no deja filas a medias.
--
-- Antes de correr este archivo, en la misma sesión:
--   SET riviera.recover_notificaciones = 'ADELANTE';

DO $recover$
DECLARE
  v_updated integer;
BEGIN
  IF current_setting('riviera.recover_notificaciones', true) IS DISTINCT FROM 'ADELANTE' THEN
    RAISE EXCEPTION 'recuperación detenida: falta SET riviera.recover_notificaciones = ADELANTE';
  END IF;

  UPDATE public.notificaciones_eventos_queue q
  SET estado = 'omitido',
      error_detalle = 'omitido: torneo finalizado; no se reenvía',
      processed_at = now()
  FROM public.torneo_express t
  WHERE t.id = q.torneo_express_id
    AND q.estado = 'pendiente'
    AND q.attempts = 0
    AND t.estado = 'finalizado'
    AND t.fase_torneo = 'cerrado';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated IS DISTINCT FROM 425 THEN
    RAISE EXCEPTION 'recuperación detenida: iban a omitirse % filas y la medición espera 425', v_updated;
  END IF;
END
$recover$;
