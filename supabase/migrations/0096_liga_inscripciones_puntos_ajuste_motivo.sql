-- Motivo de ajuste manual de puntos en ranking de liga (visible al jugador).
ALTER TABLE public.liga_inscripciones
  ADD COLUMN IF NOT EXISTS puntos_ajuste_motivo text,
  ADD COLUMN IF NOT EXISTS puntos_ajuste_at timestamptz;

COMMENT ON COLUMN public.liga_inscripciones.puntos_ajuste_motivo IS
  'Motivo del último ajuste manual de puntos; se muestra al jugador en el ranking.';
COMMENT ON COLUMN public.liga_inscripciones.puntos_ajuste_at IS
  'Momento del último ajuste manual de puntos de inscripción.';
