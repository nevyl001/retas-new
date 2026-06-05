-- País / bandera del jugador (ISO 3166-1 alpha-2, ej. MX, ESP→ES, USA→US)
-- Ejecutar en Supabase después de riviera-jugadores-categorias-public.sql

ALTER TABLE public.riviera_jugadores
  ADD COLUMN IF NOT EXISTS pais_codigo char(2);

ALTER TABLE public.riviera_jugadores
  DROP CONSTRAINT IF EXISTS riviera_jugadores_pais_codigo_check;

ALTER TABLE public.riviera_jugadores
  ADD CONSTRAINT riviera_jugadores_pais_codigo_check CHECK (
    pais_codigo IS NULL OR pais_codigo ~ '^[A-Z]{2}$'
  );

COMMENT ON COLUMN public.riviera_jugadores.pais_codigo IS
  'Código ISO 3166-1 alpha-2 del país del jugador (bandera en ranking y ficha pública).';
