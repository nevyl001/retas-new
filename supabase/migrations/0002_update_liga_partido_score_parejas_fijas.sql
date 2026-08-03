-- ══════════════════════════════════════════════════════════════════════════════
-- BLK-03 — Concurrencia en Liga de parejas fijas (guardado de marcador)
--
-- Problema (confirmado, src/services/ligaService.ts:1244-1329,
-- updateScoreParejasFijas/updateLigaPartidoScoreParejasFijas): SELECT del
-- partido + UPDATE directo por separado, sin lock de fila, sin verificación
-- de conflicto ni de ownership propia (dependía 100% de RLS). Dos guardados
-- concurrentes del mismo partido (doble clic, dos co-admins, red lenta)
-- podían sobrescribirse en silencio — exactamente el mismo bug ya
-- identificado y corregido para Liga rotativa en
-- supabase/hotfix-liga-partido-score-atomic.sql (update_liga_partido_score),
-- que el propio comentario de ese fix marcó explícitamente como "fuera de
-- alcance" para parejas fijas.
--
-- Fix: mismo patrón que update_liga_partido_score (SELECT...FOR UPDATE +
-- ownership server-side + conflicto explícito + idempotencia), adaptado a
-- las columnas propias de parejas fijas (games totales + detalle por sets en
-- `set_scores` jsonb, en vez de un score entero simple). No se reimplementa
-- el cálculo de totals/sets (computeParejasFijasMatchTotals sigue en
-- TypeScript, sin cambios) — la RPC solo aplica el resultado ya calculado de
-- forma atómica.
--
-- Prerrequisito idempotente: liga_partidos.set_scores (por si
-- supabase/liga-partidos-set-scores.sql no se hubiera aplicado aún).
--
-- Idempotente: CREATE OR REPLACE FUNCTION + REVOKE/GRANT son repetibles sin error.
-- Rollback: DROP FUNCTION public.update_liga_partido_score_parejas_fijas(uuid, integer, integer, jsonb, boolean);
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.liga_partidos
  ADD COLUMN IF NOT EXISTS set_scores jsonb;

CREATE OR REPLACE FUNCTION public.update_liga_partido_score_parejas_fijas(
  p_partido_id uuid,
  p_score1 integer,
  p_score2 integer,
  p_set_scores jsonb,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partido record;
  v_organizador uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_score1 IS NULL OR p_score2 IS NULL OR p_score1 < 0 OR p_score2 < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  IF p_set_scores IS NULL OR jsonb_typeof(p_set_scores -> 'sets') IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  SELECT id, jornada_id, ronda, estado, score_pareja1, score_pareja2, set_scores
    INTO v_partido
    FROM public.liga_partidos
    WHERE id = p_partido_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT l.organizador_id INTO v_organizador
  FROM public.liga_jornadas j
  JOIN public.ligas l ON l.id = j.liga_id
  WHERE j.id = v_partido.jornada_id;

  IF v_organizador IS NULL OR v_organizador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este partido';
  END IF;

  -- Idempotente: mismo marcador (games Y detalle de sets) ya guardado.
  IF v_partido.estado = 'completed'
     AND v_partido.score_pareja1 = p_score1
     AND v_partido.score_pareja2 = p_score2
     AND v_partido.set_scores IS NOT DISTINCT FROM p_set_scores
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'unchanged',
      'partido_id', p_partido_id,
      'jornada_id', v_partido.jornada_id
    );
  END IF;

  IF v_partido.estado = 'completed' AND NOT p_force THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conflict',
      'score_pareja1', v_partido.score_pareja1,
      'score_pareja2', v_partido.score_pareja2,
      'set_scores', v_partido.set_scores
    );
  END IF;

  UPDATE public.liga_partidos
  SET score_pareja1 = p_score1,
      score_pareja2 = p_score2,
      set_scores = p_set_scores,
      estado = 'completed'
  WHERE id = p_partido_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'updated',
    'partido_id', p_partido_id,
    'jornada_id', v_partido.jornada_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_liga_partido_score_parejas_fijas(uuid, integer, integer, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_liga_partido_score_parejas_fijas(uuid, integer, integer, jsonb, boolean)
  TO authenticated;

-- ── Verificación en la misma transacción implícita del CREATE anterior ───
DO $$
BEGIN
  IF to_regprocedure('public.update_liga_partido_score_parejas_fijas(uuid,integer,integer,jsonb,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: update_liga_partido_score_parejas_fijas no existe tras el CREATE';
  END IF;
END $$;
