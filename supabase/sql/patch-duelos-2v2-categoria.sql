-- ══════════════════════════════════════════════════════════════════════════════
-- Descripción libre del duelo (distinta del nivel/fuerza)
--
-- duelos_2v2.descripcion = nivel / fuerza (legado usado por vista pública).
-- duelos_2v2.categoria   = descripción libre (UI "Descripción").
--
-- NO ejecutar automáticamente. Revisar → SQL Editor (staging → prod). Idempotente.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.duelos_2v2
  ADD COLUMN IF NOT EXISTS categoria text NULL;

COMMENT ON COLUMN public.duelos_2v2.categoria IS
  'Descripción libre del encuentro (ej. mixta, verano). Distinto de descripcion (nivel/fuerza).';
