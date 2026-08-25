-- Lectura: definición actual de ligas_modalidad_check (Production)
-- Pegar en SQL Editor ANTES de aplicar 0032. No escribe nada.

SELECT
  c.conname,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'ligas'
  AND c.conname = 'ligas_modalidad_check';
