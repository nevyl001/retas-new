-- Vista pública Americano en vivo (JSON). Ejecutar en Supabase SQL Editor.
-- Requisito: exista la tabla tournament_public_config (ver tournament-public-config.sql).
-- Sin esta columna, el enlace /public/americano/{id} en móvil u otros dispositivos no verá datos
-- (el navegador del organizador no se comparte entre teléfonos; solo Supabase).

ALTER TABLE tournament_public_config
  ADD COLUMN IF NOT EXISTS americano_live JSONB;

COMMENT ON COLUMN tournament_public_config.americano_live IS 'Snapshot JSON del Americano Dinámico para /public/americano/{id} (tiempo real).';
