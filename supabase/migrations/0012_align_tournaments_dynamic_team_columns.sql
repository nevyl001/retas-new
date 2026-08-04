-- ══════════════════════════════════════════════════════════════════════════════
-- 0012 — Alinear tournaments.format / tournaments.team_config con el código
--
-- Causa exacta de los 400 tras iniciar una reta con alineación dinámica:
--   code: 42703
--   message: column tournaments.format does not exist
--   (también: column tournaments.team_config does not exist)
--
-- Evidencia:
--   - El cliente hace PATCH tournaments con { format, team_config } al iniciar.
--   - commit_dynamic_team_block (0010) hace UPDATE tournaments SET team_config = …
--   - tournament_public_config YA tiene format text + team_config jsonb y
--     guarda la config; tournaments no tenía esas columnas en producción.
--   - 0007–0011 NO agregan estas columnas a tournaments (0010 solo las asume).
--
-- Tipos derivados de producción (tournament_public_config) y TypeScript
-- (`Tournament.format?: "round_robin" | "teams"`, `team_config?: object` → jsonb).
-- Idempotente: ADD COLUMN IF NOT EXISTS + backfill solo donde NULL.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS format text;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS team_config jsonb;

COMMENT ON COLUMN public.tournaments.format IS
  'Formato de la reta: round_robin | teams (alineado con tournament_public_config.format).';
COMMENT ON COLUMN public.tournaments.team_config IS
  'Config de equipos (teamNames, pairToTeam, dynamicLineups). jsonb, mismo shape que tournament_public_config.team_config.';

-- Backfill desde la fuente pública ya existente; no sobrescribe valores no-NULL.
UPDATE public.tournaments t
SET
  format = COALESCE(t.format, c.format),
  team_config = COALESCE(t.team_config, c.team_config)
FROM public.tournament_public_config c
WHERE c.tournament_id = t.id
  AND (t.format IS NULL OR t.team_config IS NULL);

-- Recuperación: bloques 'generating' que ya tienen partidos en su rango
-- (begin OK + matches insertados + commit falló por 42703). Marcar completed
-- sin tocar el algoritmo de emparejamiento; teams queda [] si no se persistió.
UPDATE public.reta_dynamic_blocks b
SET
  status = 'completed',
  generated_at = COALESCE(b.generated_at, now())
WHERE b.status = 'generating'
  AND EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.tournament_id = b.tournament_id
      AND m.round BETWEEN b.round_start AND b.round_end
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tournaments'
      AND column_name = 'format'
  ) THEN
    RAISE EXCEPTION 'Fix incompleto: tournaments.format no existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tournaments'
      AND column_name = 'team_config'
  ) THEN
    RAISE EXCEPTION 'Fix incompleto: tournaments.team_config no existe';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
