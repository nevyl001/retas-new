-- Realtime para ranking público Riviera Open (jugador_stats, participaciones)
-- Ejecutar en Supabase → SQL Editor si el ranking no se actualiza en vivo.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.jugador_stats;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.jugador_participaciones;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.riviera_jugadores;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
