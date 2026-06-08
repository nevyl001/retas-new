-- Permisos RPC para estadísticas de jugadores (ejecutar en Supabase SQL Editor).
-- Si un GRANT falla, ejecuta solo la línea que necesites.

-- Recalcular puntos y stats tras borrar/editar historial
GRANT EXECUTE ON FUNCTION public.refresh_jugador_stats(uuid) TO authenticated;

-- Registrar participaciones (firma real: evento_id es uuid, no text)
GRANT EXECUTE ON FUNCTION public.registrar_participacion_jugador(
  uuid,
  public.jugador_tipo_evento,
  uuid,
  text,
  text,
  public.jugador_resultado,
  integer,
  integer,
  integer,
  jsonb,
  date
) TO authenticated;
