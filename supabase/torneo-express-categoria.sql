-- Categoría del torneo express (ej. 4ta, 5ta, Open)
-- Ejecutar en Supabase SQL Editor si ya tienes torneo_express creado.

ALTER TABLE torneo_express
  ADD COLUMN IF NOT EXISTS categoria TEXT;

COMMENT ON COLUMN torneo_express.categoria IS
  'Categoría o nivel del torneo (ej. 4ta, 5ta, Open).';
