-- Una bienvenida ya enviada es historial. No bloquea otra confirmación del administrador.
-- El índice único sigue impidiendo dos envíos en curso del mismo jugador.
-- No toca resultados deportivos, consentimientos ni filas existentes.
-- NO APLICAR hasta autorización explícita.

DROP INDEX IF EXISTS public.liga_notificaciones_queue_una_bienvenida;

CREATE UNIQUE INDEX liga_notificaciones_queue_una_bienvenida
  ON public.liga_notificaciones_queue (
    liga_id,
    COALESCE(inscripcion_id, '00000000-0000-0000-0000-000000000000'::uuid),
    liga_jugador_id,
    tipo
  )
  WHERE estado IN ('pendiente', 'procesando')
    AND tipo = 'bienvenida';
