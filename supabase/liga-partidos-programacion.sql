-- Programación editable por partido (cancha + horario) y fecha de jornada.
-- Ejecutar en Supabase SQL Editor una vez.

ALTER TABLE public.liga_partidos
  ADD COLUMN IF NOT EXISTS hora_inicio time;

COMMENT ON COLUMN public.liga_partidos.hora_inicio IS
  'Hora de inicio del partido (editable en la jornada).';

-- liga_jornadas.fecha ya existe en el esquema base (date).
