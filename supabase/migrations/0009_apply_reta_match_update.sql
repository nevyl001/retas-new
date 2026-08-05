-- ══════════════════════════════════════════════════════════════════════════════
-- FC-04 + FC-05 (Fase C1) — Reta: sin control de concurrencia en el
-- guardado de resultado, y corrección posible después del cierre sin
-- recalcular nada
--
-- FC-04: MatchCardWithResults.tsx guardaba un resultado en 3-4 llamadas
-- separadas (getGames → getNextGameNumber → createGame con reintento →
-- updateMatch), sin lock ni transacción. Dos dispositivos guardando el mismo
-- partido casi a la vez podían duplicar filas `games` o pisarse el marcador
-- final silenciosamente ("last write wins"). Se unifica en UN RPC que cubre
-- TODA actualización de un partido de Reta (reasignar cancha/ronda, y
-- guardar/corregir el resultado), con el mismo patrón que ya usan
-- Liga/Torneo Express/Americano: lock de fila + idempotencia + conflicto
-- explícito + reintento con `force`.
--
-- FC-05: decisión de producto (ver diseño presentado) -- se bloquea la
-- edición NORMAL de un partido una vez que el torneo (tournaments.is_finished)
-- ya cerró, igual que ya hace Torneo Express en sus dos RPCs atómicos. No se
-- cierra la puerta a una corrección administrativa futura: el RPC ya acepta
-- `p_admin_override`/`p_admin_reason` (exigen is_master_admin()) que
-- permiten saltarse el bloqueo de cierre y quedan registrados en
-- `reta_match_admin_corrections` (auditoría: quién, cuándo, valor anterior,
-- valor nuevo, motivo). El RECÁLCULO COMPLETO de rating/historial/ledger/
-- ranking tras una corrección administrativa es una función futura --
-- deliberadamente NO implementada aquí (fuera del alcance de Fase C1); esta
-- migración solo deja el modelo de datos y el punto de entrada listos.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION +
-- REVOKE/GRANT son repetibles sin error.
-- Rollback:
--   DROP FUNCTION public.apply_reta_match_update(uuid, integer, integer, jsonb, boolean, boolean, text);
--   DROP TABLE public.reta_match_admin_corrections;
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.reta_match_admin_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL,
  previous_status text,
  previous_pair1_score integer,
  previous_pair2_score integer,
  previous_sets jsonb,
  new_pair1_score integer,
  new_pair2_score integer,
  new_sets jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reta_match_admin_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmac_select_master_admin ON public.reta_match_admin_corrections;
CREATE POLICY rmac_select_master_admin ON public.reta_match_admin_corrections
  FOR SELECT TO authenticated
  USING (public.is_master_admin());

-- Solo la función SECURITY DEFINER escribe aquí -- ningún grant de
-- INSERT/UPDATE/DELETE a authenticated ni anon.
REVOKE ALL ON public.reta_match_admin_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reta_match_admin_corrections TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_reta_match_update(
  p_match_id uuid,
  p_court integer DEFAULT NULL,
  p_round integer DEFAULT NULL,
  p_sets jsonb DEFAULT NULL,
  p_force boolean DEFAULT false,
  p_admin_override boolean DEFAULT false,
  p_admin_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_tournament_owner uuid;
  v_tournament_closed boolean;
  v_is_admin boolean := false;
  v_i int;
  v_set jsonb;
  v_pair1_score int;
  v_pair2_score int;
  v_existing_sets jsonb;
  v_new_sets jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT m.*, t.user_id AS tournament_owner, coalesce(t.is_finished, false) AS tournament_closed
  INTO v_match
  FROM public.matches m
  JOIN public.tournaments t ON t.id = m.tournament_id
  WHERE m.id = p_match_id
  FOR UPDATE OF m;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_tournament_owner := v_match.tournament_owner;
  v_tournament_closed := v_match.tournament_closed;

  IF p_admin_override THEN
    SELECT public.is_master_admin() INTO v_is_admin;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Solo un Admin Maestro puede usar corrección administrativa';
    END IF;
  ELSIF v_tournament_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este partido';
  END IF;

  -- FC-05: edición normal bloqueada tras el cierre del torneo (mismo
  -- criterio que Torneo Express) -- p_admin_override (ya validado arriba
  -- como exclusivo de Admin Maestro) es la única vía para saltarlo.
  IF v_tournament_closed AND NOT p_admin_override THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tournament_closed');
  END IF;

  -- ── Reasignación de cancha/ronda (metadata, no toca marcador) ──
  IF p_court IS NOT NULL OR p_round IS NOT NULL THEN
    UPDATE public.matches
    SET
      court = coalesce(p_court, court),
      round = coalesce(p_round, round)
    WHERE id = p_match_id;
  END IF;

  -- ── Resultado (sets) ──
  IF p_sets IS NOT NULL THEN
    IF jsonb_typeof(p_sets) <> 'array' OR jsonb_array_length(p_sets) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_sets');
    END IF;

    v_pair1_score := 0;
    v_pair2_score := 0;
    FOR v_i IN 0 .. jsonb_array_length(p_sets) - 1 LOOP
      v_set := p_sets -> v_i;
      IF NOT (v_set ? 'pair1_games') OR NOT (v_set ? 'pair2_games') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_sets');
      END IF;
      IF (v_set->>'pair1_games')::int >= 6 THEN
        v_pair1_score := v_pair1_score + 1;
      END IF;
      IF (v_set->>'pair2_games')::int >= 6 THEN
        v_pair2_score := v_pair2_score + 1;
      END IF;
      v_new_sets := v_new_sets || jsonb_build_array(jsonb_build_object(
        'game_number', v_i + 1,
        'pair1_games', (v_set->>'pair1_games')::int,
        'pair2_games', (v_set->>'pair2_games')::int,
        'is_tie_break', coalesce((v_set->>'is_tie_break')::boolean, false),
        'tie_break_pair1_points', coalesce((v_set->>'tie_break_pair1_points')::int, 0),
        'tie_break_pair2_points', coalesce((v_set->>'tie_break_pair2_points')::int, 0)
      ));
    END LOOP;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'game_number', g.game_number,
             'pair1_games', g.pair1_games,
             'pair2_games', g.pair2_games,
             'is_tie_break', g.is_tie_break,
             'tie_break_pair1_points', g.tie_break_pair1_points,
             'tie_break_pair2_points', g.tie_break_pair2_points
           ) ORDER BY g.game_number), '[]'::jsonb)
    INTO v_existing_sets
    FROM public.games g
    WHERE g.match_id = p_match_id;

    -- Idempotente: mismo resultado ya guardado (mismos sets y mismo status).
    -- v_existing_sets viene ordenado por game_number ascendente (igual que
    -- v_new_sets, construido en el mismo orden 1..N) -- comparación directa.
    IF v_match.status = 'finished'
       AND v_match.pair1_score = v_pair1_score
       AND v_match.pair2_score = v_pair2_score
       AND v_existing_sets = v_new_sets
    THEN
      RETURN jsonb_build_object(
        'ok', true, 'status', 'unchanged',
        'pair1_score', v_pair1_score, 'pair2_score', v_pair2_score, 'sets', v_existing_sets
      );
    END IF;

    -- Conflicto explícito: el partido ya estaba finalizado con OTRO
    -- resultado y no se pidió forzar ni es corrección administrativa.
    IF v_match.status = 'finished' AND NOT p_force AND NOT p_admin_override THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'conflict',
        'pair1_score', v_match.pair1_score, 'pair2_score', v_match.pair2_score, 'sets', v_existing_sets
      );
    END IF;

    IF p_admin_override THEN
      INSERT INTO public.reta_match_admin_corrections (
        match_id, admin_user_id, previous_status, previous_pair1_score,
        previous_pair2_score, previous_sets, new_pair1_score, new_pair2_score,
        new_sets, reason
      ) VALUES (
        p_match_id, auth.uid(), v_match.status, v_match.pair1_score,
        v_match.pair2_score, v_existing_sets, v_pair1_score, v_pair2_score,
        v_new_sets, p_admin_reason
      );
    END IF;

    DELETE FROM public.games WHERE match_id = p_match_id;

    FOR v_i IN 0 .. jsonb_array_length(v_new_sets) - 1 LOOP
      v_set := v_new_sets -> v_i;
      INSERT INTO public.games (
        match_id, game_number, pair1_games, pair2_games,
        is_tie_break, tie_break_pair1_points, tie_break_pair2_points
      ) VALUES (
        p_match_id, (v_set->>'game_number')::int,
        (v_set->>'pair1_games')::int, (v_set->>'pair2_games')::int,
        (v_set->>'is_tie_break')::boolean,
        (v_set->>'tie_break_pair1_points')::int, (v_set->>'tie_break_pair2_points')::int
      );
    END LOOP;

    UPDATE public.matches
    SET status = 'finished', pair1_score = v_pair1_score, pair2_score = v_pair2_score
    WHERE id = p_match_id;

    RETURN jsonb_build_object(
      'ok', true, 'status', 'updated',
      'pair1_score', v_pair1_score, 'pair2_score', v_pair2_score, 'sets', v_new_sets
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'updated_metadata');
END;
$$;

REVOKE ALL ON FUNCTION public.apply_reta_match_update(uuid, integer, integer, jsonb, boolean, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_reta_match_update(uuid, integer, integer, jsonb, boolean, boolean, text)
  TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.apply_reta_match_update(uuid,integer,integer,jsonb,boolean,boolean,text)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: apply_reta_match_update no existe tras el CREATE';
  END IF;
END $$;
