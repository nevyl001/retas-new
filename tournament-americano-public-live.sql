-- Vista pública Americano en vivo (JSON). Ejecutar en Supabase SQL Editor.
-- Lectura ya permitida por la política SELECT de tournament_public_config.

ALTER TABLE tournament_public_config
  ADD COLUMN IF NOT EXISTS americano_live JSONB;

COMMENT ON COLUMN tournament_public_config.americano_live IS 'Snapshot JSON del Americano Dinámico para /public/americano/{id} (tiempo real).';
