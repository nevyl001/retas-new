-- ══════════════════════════════════════════════════════════════════════════════
-- Hotfix integración: alinear columna de reta_dynamic_blocks con el RPC
-- begin_dynamic_team_block (0010).
--
-- Causa exacta del 400 Bad Request en producción:
--   code: 42703
--   message: column reta_dynamic_blocks.stage does not exist
--
-- Un borrador previo creó la tabla con `generation_reason` (valores
-- 'initial'/'dynamic'). 0010 redefinió el RPC para INSERT en `stage`
-- ('initial_round_robin'/'dynamic_round'), pero CREATE TABLE IF NOT EXISTS
-- no renombró la columna existente. Frontend y firma del RPC ya coinciden;
-- solo faltaba alinear el esquema de la tabla.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reta_dynamic_blocks'
      AND column_name = 'generation_reason'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reta_dynamic_blocks'
      AND column_name = 'stage'
  ) THEN
    ALTER TABLE public.reta_dynamic_blocks
      DROP CONSTRAINT IF EXISTS reta_dynamic_blocks_generation_reason_check;
    ALTER TABLE public.reta_dynamic_blocks
      RENAME COLUMN generation_reason TO stage;
  END IF;
END $$;

ALTER TABLE public.reta_dynamic_blocks
  DROP CONSTRAINT IF EXISTS reta_dynamic_blocks_stage_check;
ALTER TABLE public.reta_dynamic_blocks
  DROP CONSTRAINT IF EXISTS reta_dynamic_blocks_generation_reason_check;

UPDATE public.reta_dynamic_blocks
SET stage = CASE stage
  WHEN 'initial' THEN 'initial_round_robin'
  WHEN 'dynamic' THEN 'dynamic_round'
  ELSE stage
END
WHERE stage IS DISTINCT FROM CASE stage
  WHEN 'initial' THEN 'initial_round_robin'
  WHEN 'dynamic' THEN 'dynamic_round'
  ELSE stage
END;

ALTER TABLE public.reta_dynamic_blocks
  ADD CONSTRAINT reta_dynamic_blocks_stage_check
  CHECK (stage IN ('initial_round_robin', 'dynamic_round'));

-- Bloques atascados en generating sin partidos (p.ej. el intento que falló
-- por 42703) bloquean el UNIQUE (tournament_id, block_number) y hacen que
-- begin devuelva already_claimed. Liberarlos es recuperación, no algoritmo.
DELETE FROM public.reta_dynamic_blocks b
WHERE b.status = 'generating'
  AND NOT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.tournament_id = b.tournament_id
      AND m.round BETWEEN b.round_start AND b.round_end
  );

REVOKE ALL ON FUNCTION public.begin_dynamic_team_block(uuid, integer, integer, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_dynamic_team_block(uuid, integer, integer, integer, text)
  TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reta_dynamic_blocks'
      AND column_name = 'stage'
  ) THEN
    RAISE EXCEPTION 'Fix incompleto: reta_dynamic_blocks.stage no existe';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reta_dynamic_blocks'
      AND column_name = 'generation_reason'
  ) THEN
    RAISE EXCEPTION 'Fix incompleto: generation_reason sigue existiendo';
  END IF;
END $$;

COMMIT;
