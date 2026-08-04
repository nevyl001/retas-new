-- ══════════════════════════════════════════════════════════════════════════════
-- Equipos con alineación dinámica (Fase 2) — tabla de bloques + RPCs de
-- generación idempotente
--
-- Contexto: "Equipos con alineación dinámica" juega primero un Round Robin
-- completo entre las parejas ORIGINALES de cada equipo (dura exactamente
-- `pairsPerTeam` rondas -- ver `tournaments.team_config.dynamicLineups.
-- pairsPerTeam`), y solo después reorganiza las parejas dentro de cada
-- equipo, una rotación balanceada por ronda, según rendimiento dentro de la
-- reta (nunca rating/ranking global). Un jugador jamás cambia de equipo --
-- ver `tournaments.team_config.dynamicLineups.playerToTeam` (estático,
-- fijado al iniciar la reta, nunca se muta después). Lo que sí cambia por
-- bloque son las PAREJAS dentro de cada equipo; cada alineación de cada
-- bloque se persiste como una fila real de `pairs` (reutiliza el pipeline
-- de cierre/ranking/ledger existente sin tocarlo -- ver
-- `src/lib/rivieraJugadores/syncParticipaciones.ts`). Bloque 1 = rondas
-- 1..pairsPerTeam (Round Robin inicial); bloque N>=2 = una sola ronda
-- (pairsPerTeam + N - 1) -- ver `stage` abajo y
-- `resolveDynamicBlockRoundRange` en `dynamicTeamLineups.ts`.
--
-- Esta migración solo agrega el registro de qué bloques existen y su candado
-- de generación -- las alineaciones concretas (`teams` jsonb) son una
-- fotografía de auditoría/consulta pública; la fuente de verdad deportiva
-- sigue siendo `pairs` + `matches` + `tournaments.team_config.pairToTeam`
-- (extendido por `commit_dynamic_team_block` con cada pareja nueva), para que
-- `computeDynamicTeamStandings` y la vista pública funcionen sin cambios
-- adicionales de esquema.
--
-- Patrón de idempotencia y lock: mismo patrón que
-- `0009_apply_reta_match_update.sql` (lock de fila FOR UPDATE + conflicto
-- explícito vía UNIQUE + ON CONFLICT DO NOTHING), evitando el patrón más
-- débil que ya existe en "remontada" (`maybeGenerateChampionshipRound`, solo
-- re-chequeo client-side sin lock real) -- el spec del organizador pide
-- explícitamente no repetir ese patrón para esta variante.
--
-- Flujo cliente (dos RPC, no uno, porque el cálculo de la alineación
-- balanceada ocurre en TypeScript puro -- ver
-- `src/lib/reta/dynamicTeamLineups.ts` -- y no es práctico ni necesario
-- reimplementar el algoritmo de balanceo en plpgsql para esta primera
-- versión):
--   1. begin_dynamic_team_block: reclama el block_number (INSERT ... ON
--      CONFLICT DO NOTHING sobre la UNIQUE (tournament_id, block_number)) --
--      si no devuelve fila, alguien ya lo generó/está generando -> no-op
--      idempotente en el cliente (dos clics, dos pestañas, o polling no
--      duplican el bloque).
--   2. El cliente crea las filas reales de `pairs`/`matches` del bloque con
--      las funciones existentes `createPair`/`createMatch`.
--   3. commit_dynamic_team_block: valida que el bloque siga 'generating' y
--      pertenezca a este torneo, lo marca 'completed', y mergea el nuevo
--      pairId->teamIndex dentro de `tournaments.team_config.pairToTeam`.
--
-- Recuperación: si el cliente nunca llama a commit (pestaña cerrada a mitad
-- de la generación), el bloque queda 'generating' sin partidos asociados --
-- la acción administrativa "Generar siguiente bloque" detecta ese caso (un
-- bloque 'generating' sin matches en su rango de rondas) y llama
-- retry_dynamic_team_block para liberar el block_number y reintentar
-- limpiamente. Si YA hay matches asociados, retry se niega explícitamente
-- (no se borra nunca un bloque con datos reales).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION +
-- REVOKE/GRANT son repetibles sin error. `begin_dynamic_team_block` usa
-- DROP FUNCTION IF EXISTS + CREATE (no solo CREATE OR REPLACE) porque un
-- parámetro cambió de nombre durante el desarrollo de esta migración --
-- ver el comentario junto a esa función para el detalle.
-- Rollback:
--   DROP FUNCTION public.retry_dynamic_team_block(uuid, integer);
--   DROP FUNCTION public.commit_dynamic_team_block(uuid, jsonb, jsonb);
--   DROP FUNCTION public.begin_dynamic_team_block(uuid, integer, integer, integer, text);
--   DROP TABLE public.reta_dynamic_blocks;
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.reta_dynamic_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  block_number integer NOT NULL CHECK (block_number >= 1),
  round_start integer NOT NULL CHECK (round_start >= 1),
  round_end integer NOT NULL CHECK (round_end >= round_start),
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'completed')),
  -- 'initial_round_robin' = bloque 1 (rondas 1..pairsPerTeam, parejas
  -- originales); 'dynamic_round' = bloque N>=2 (una sola ronda, parejas
  -- rebalanceadas). Ver `DynamicStage` en `dynamicTeamLineups.ts`.
  stage text NOT NULL CHECK (stage IN ('initial_round_robin', 'dynamic_round')),
  teams jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, block_number)
);

CREATE INDEX IF NOT EXISTS reta_dynamic_blocks_tournament_idx
  ON public.reta_dynamic_blocks (tournament_id, block_number);

ALTER TABLE public.reta_dynamic_blocks ENABLE ROW LEVEL SECURITY;

-- Dueño de la reta: lectura directa (para UI de organizador y recuperación).
DROP POLICY IF EXISTS rdb_select_owner ON public.reta_dynamic_blocks;
CREATE POLICY rdb_select_owner ON public.reta_dynamic_blocks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = reta_dynamic_blocks.tournament_id
        AND t.user_id = auth.uid()
    )
  );

-- Vista pública: mismo helper que ya protege tournaments/pairs/matches/games
-- (ver supabase/rls-multiclub-pr1-public-read-helpers.sql).
DROP POLICY IF EXISTS rdb_select_anon ON public.reta_dynamic_blocks;
CREATE POLICY rdb_select_anon ON public.reta_dynamic_blocks
  FOR SELECT TO anon
  USING (public.is_tournament_publicly_readable(tournament_id));

DROP POLICY IF EXISTS rdb_select_public_authenticated ON public.reta_dynamic_blocks;
CREATE POLICY rdb_select_public_authenticated ON public.reta_dynamic_blocks
  FOR SELECT TO authenticated
  USING (public.is_tournament_publicly_readable(tournament_id));

-- Solo las funciones SECURITY DEFINER de abajo escriben aquí -- mismo
-- criterio que reta_match_admin_corrections en 0009: ningún INSERT/UPDATE/
-- DELETE directo desde el cliente.
REVOKE ALL ON public.reta_dynamic_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reta_dynamic_blocks TO authenticated, anon;

-- ── begin_dynamic_team_block ────────────────────────────────────────────────
-- El 5to parámetro se llamó `p_generation_reason` en un borrador anterior de
-- esta misma migración y se renombró a `p_stage` (ver `DynamicStage` en
-- `dynamicTeamLineups.ts`) antes de que esta migración se aplicara a
-- ningún entorno real de uso continuo -- pero si algún entorno llegó a
-- ejecutar esa versión anterior, `CREATE OR REPLACE FUNCTION` falla con
-- 42P13 ("cannot change name of input parameter") porque Postgres no
-- permite renombrar parámetros de una función existente aunque el tipo y
-- la posición no cambien. `DROP FUNCTION IF EXISTS` con la firma por TIPOS
-- (los nombres no importan para el DROP) hace esta migración idempotente
-- sin depender de qué nombre de parámetro haya quedado de una corrida
-- previa -- así cualquier instalación futura, nueva o parcialmente
-- aplicada, converge al mismo resultado sin edición manual.
DROP FUNCTION IF EXISTS public.begin_dynamic_team_block(
  uuid,
  integer,
  integer,
  integer,
  text
);

CREATE OR REPLACE FUNCTION public.begin_dynamic_team_block(
  p_tournament_id uuid,
  p_block_number integer,
  p_round_start integer,
  p_round_end integer,
  p_stage text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament record;
  v_new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT id, user_id, coalesce(is_finished, false) AS is_finished
  INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_tournament.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre esta reta';
  END IF;

  IF v_tournament.is_finished THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tournament_finished');
  END IF;

  IF p_block_number > 1 AND NOT EXISTS (
    SELECT 1 FROM public.reta_dynamic_blocks
    WHERE tournament_id = p_tournament_id
      AND block_number = p_block_number - 1
      AND status = 'completed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'previous_block_not_completed');
  END IF;

  INSERT INTO public.reta_dynamic_blocks (
    tournament_id, block_number, round_start, round_end, stage
  ) VALUES (
    p_tournament_id, p_block_number, p_round_start, p_round_end, p_stage
  )
  ON CONFLICT (tournament_id, block_number) DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    -- Ya reclamado (en curso o completado) por otro clic/pestaña/poll --
    -- no-op idempotente, el cliente debe releer el estado actual.
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  RETURN jsonb_build_object('ok', true, 'block_id', v_new_id);
END;
$$;

REVOKE ALL ON FUNCTION public.begin_dynamic_team_block(uuid, integer, integer, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_dynamic_team_block(uuid, integer, integer, integer, text)
  TO authenticated;

-- ── commit_dynamic_team_block ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commit_dynamic_team_block(
  p_block_id uuid,
  p_teams jsonb,
  p_pair_to_team_delta jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block record;
  v_tournament record;
  v_key text;
  v_value jsonb;
  v_merged jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT * INTO v_block
  FROM public.reta_dynamic_blocks
  WHERE id = p_block_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT id, user_id, coalesce(team_config, '{}'::jsonb) AS team_config
  INTO v_tournament
  FROM public.tournaments
  WHERE id = v_block.tournament_id
  FOR UPDATE;

  IF v_tournament.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre esta reta';
  END IF;

  IF v_block.status = 'completed' THEN
    -- Idempotente: reintento tras un timeout de red del primer commit --
    -- no vuelve a mergear pairToTeam (evitaría corromper ediciones
    -- manuales posteriores del organizador, aunque hoy no existen).
    RETURN jsonb_build_object('ok', true, 'status', 'unchanged');
  END IF;

  v_merged := coalesce(v_tournament.team_config -> 'pairToTeam', '{}'::jsonb);
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_pair_to_team_delta) LOOP
    v_merged := jsonb_set(v_merged, ARRAY[v_key], v_value, true);
  END LOOP;

  UPDATE public.tournaments
  SET team_config = jsonb_set(
    coalesce(team_config, '{}'::jsonb),
    ARRAY['pairToTeam'],
    v_merged,
    true
  )
  WHERE id = v_block.tournament_id;

  UPDATE public.reta_dynamic_blocks
  SET status = 'completed', teams = p_teams, generated_at = now()
  WHERE id = p_block_id;

  RETURN jsonb_build_object('ok', true, 'status', 'completed');
END;
$$;

REVOKE ALL ON FUNCTION public.commit_dynamic_team_block(uuid, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_dynamic_team_block(uuid, jsonb, jsonb)
  TO authenticated;

-- ── retry_dynamic_team_block (recuperación administrativa) ────────────────
-- Solo libera un bloque atascado en 'generating' que NO tiene ningún match
-- asociado en su rango de rondas -- si ya hay matches, nunca se borra nada
-- con datos reales; el cliente debe reintentar el commit normal.
CREATE OR REPLACE FUNCTION public.retry_dynamic_team_block(
  p_tournament_id uuid,
  p_block_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament record;
  v_block record;
  v_match_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT id, user_id INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND OR v_tournament.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre esta reta';
  END IF;

  SELECT * INTO v_block
  FROM public.reta_dynamic_blocks
  WHERE tournament_id = p_tournament_id AND block_number = p_block_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_block.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_completed');
  END IF;

  SELECT count(*) INTO v_match_count
  FROM public.matches
  WHERE tournament_id = p_tournament_id
    AND round BETWEEN v_block.round_start AND v_block.round_end;

  IF v_match_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'matches_exist');
  END IF;

  DELETE FROM public.reta_dynamic_blocks WHERE id = v_block.id;

  RETURN jsonb_build_object('ok', true, 'status', 'released');
END;
$$;

REVOKE ALL ON FUNCTION public.retry_dynamic_team_block(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_dynamic_team_block(uuid, integer)
  TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- Bloqueo de corrección histórica: patch de `apply_reta_match_update`
-- (0009_apply_reta_match_update.sql) para que conozca los bloques dinámicos.
--
-- Problema real: sin este patch, un organizador podía cambiar el resultado
-- de un partido de una ronda ya usada para balancear un bloque posterior
-- (ver `generateNextDynamicBlock.ts`) y el RPC lo aceptaba en silencio -- las
-- alineaciones ya generadas quedaban basadas en datos que ya no son
-- ciertos, sin ninguna advertencia. Igual que el criterio ya usado por
-- `is_finished` (FC-05, 0009), esto se resuelve bloqueando la escritura, no
-- recalculando nada automáticamente.
--
-- Alcance del bloqueo: SOLO el CAMBIO de un resultado ya `finished` cuya
-- ronda cae dentro del rango de un bloque (`reta_dynamic_blocks`) que ya
-- tiene un bloque MÁS RECIENTE (`block_number` mayor) reclamado -- nunca el
-- primer guardado (estructuralmente imposible que un partido de un bloque ya
-- superado siga sin resultado, porque `canGenerateNextDynamicBlock` exige
-- que todos los partidos del bloque activo estén `finished` antes de
-- generar el siguiente), ni la reasignación de cancha/ronda (metadata, no
-- afecta el balanceo). Solo aplica cuando el torneo tiene
-- `team_config.dynamicLineups.enabled = true` -- Equipos clásico y el resto
-- de modalidades no se ven afectados en absoluto. `p_admin_override`
-- (exclusivo de Admin Maestro, mismo criterio que 0009) puede saltarlo,
-- igual que ya salta el bloqueo por cierre.
--
-- CREATE OR REPLACE reproduce el cuerpo completo de 0009 (misma firma, no se
-- puede "parchear" solo una parte) más el bloqueo nuevo, insertado justo
-- después del retorno idempotente ("unchanged") y antes del chequeo de
-- conflicto -- así un reintento con el MISMO resultado sigue funcionando sin
-- fricción; solo un CAMBIO real de resultado en una ronda ya usada se
-- rechaza.
--
-- Rollback (además del rollback ya documentado arriba en este archivo):
-- volver a ejecutar el CREATE OR REPLACE FUNCTION de
-- 0009_apply_reta_match_update.sql para restaurar la versión sin este
-- bloqueo (no usar DROP FUNCTION aquí -- borraría también la versión base
-- de 0009).
-- ══════════════════════════════════════════════════════════════════════════════

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
  v_dynamic_lineups_enabled boolean;
  v_dynamic_block_locked boolean;
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

    -- Alineación dinámica: bloquear un CAMBIO real de resultado en una ronda
    -- que ya se usó para generar un bloque posterior (ver comentario arriba
    -- de esta función). Solo si dynamicLineups.enabled -- Equipos clásico y
    -- el resto de modalidades no se ven afectados.
    IF v_match.status = 'finished' AND NOT p_admin_override THEN
      SELECT coalesce((t.team_config -> 'dynamicLineups' ->> 'enabled')::boolean, false)
      INTO v_dynamic_lineups_enabled
      FROM public.tournaments t
      WHERE t.id = v_match.tournament_id;

      IF v_dynamic_lineups_enabled THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.reta_dynamic_blocks owner_block
          WHERE owner_block.tournament_id = v_match.tournament_id
            AND v_match.round BETWEEN owner_block.round_start AND owner_block.round_end
            AND EXISTS (
              SELECT 1 FROM public.reta_dynamic_blocks later_block
              WHERE later_block.tournament_id = owner_block.tournament_id
                AND later_block.block_number > owner_block.block_number
            )
        ) INTO v_dynamic_block_locked;

        IF v_dynamic_block_locked THEN
          RETURN jsonb_build_object('ok', false, 'error', 'dynamic_block_locked');
        END IF;
      END IF;
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
  IF to_regclass('public.reta_dynamic_blocks') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: reta_dynamic_blocks no existe tras el CREATE';
  END IF;
  IF to_regprocedure('public.begin_dynamic_team_block(uuid,integer,integer,integer,text)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: begin_dynamic_team_block no existe tras el CREATE';
  END IF;
  IF to_regprocedure('public.commit_dynamic_team_block(uuid,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: commit_dynamic_team_block no existe tras el CREATE';
  END IF;
  IF to_regprocedure('public.retry_dynamic_team_block(uuid,integer)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: retry_dynamic_team_block no existe tras el CREATE';
  END IF;
  IF to_regprocedure('public.apply_reta_match_update(uuid,integer,integer,jsonb,boolean,boolean,text)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: apply_reta_match_update no existe tras el CREATE OR REPLACE';
  END IF;
END $$;
