-- ══════════════════════════════════════════════════════════════════════════════
-- Rollback de supabase/migrations/0020_strict_padel_set_validation.sql
--
-- Quita los triggers y las funciones de validación de marcador. NO revierte el
-- cuerpo del RPC apply_torneo_express_grupo_resultado: para eso, reaplicar
-- supabase/migrations/0003_apply_torneo_express_grupo_resultado.sql, que
-- contiene la versión previa completa (CREATE OR REPLACE, idempotente).
-- ══════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_legal_padel_sets ON public.torneo_express_partidos;
DROP TRIGGER IF EXISTS trg_legal_padel_sets ON public.torneo_express_eliminatoria_partidos;

DROP FUNCTION IF EXISTS public._enforce_legal_padel_sets();
DROP FUNCTION IF EXISTS public._are_legal_padel_sets(jsonb);
DROP FUNCTION IF EXISTS public._is_legal_padel_super_tie_break(integer, integer);
DROP FUNCTION IF EXISTS public._is_legal_padel_set(integer, integer);
