-- ══════════════════════════════════════════════════════════════════════════════
-- Nivel de la reta (fuerza) en tournaments — SoT para Detalles + convocatoria
--
-- category_label de open_registration se alimenta desde tournaments.nivel.
-- NO ejecutar automáticamente. Revisar → SQL Editor (staging → prod). Idempotente.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS nivel text NULL;

COMMENT ON COLUMN public.tournaments.nivel IS
  'Nivel / fuerza del encuentro (ej. 5ta Fuerza). Distinto de description (categoría libre).';

-- Backfill opcional desde cache de convocatoria (si había categoría/nivel ahí)
UPDATE public.tournaments t
SET nivel = trim(c.category_label)
FROM public.tournament_open_registration c
WHERE c.entity_id = t.id
  AND c.mode_type IN ('reta', 'americano')
  AND (t.nivel IS NULL OR trim(t.nivel) = '')
  AND c.category_label IS NOT NULL
  AND trim(c.category_label) <> '';
