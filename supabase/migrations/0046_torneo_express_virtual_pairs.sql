-- Plaza virtual de Torneo Express. No crea jugadores.
-- Corre después de 0044 en el mismo despliegue: apply/replace/append
-- ya leen e insertan is_virtual y virtual_label.
-- Las 546 parejas reales auditadas el 2026-10-01 (ids y nombres presentes)
-- quedan con is_virtual = false por default. No se reescriben filas.
-- Las FKs player1_id/player2_id → players.id se conservan. NULL es válido en una FK.

ALTER TABLE public.pairs
  ADD COLUMN is_virtual boolean NOT NULL DEFAULT false;

ALTER TABLE public.pairs
  ADD COLUMN virtual_label text;

DO $fn$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.pairs
  WHERE player1_id IS NULL
     OR player2_id IS NULL
     OR player1_name IS NULL
     OR player2_name IS NULL;

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'pairs existentes no cumplen la forma real (% filas)', v_bad;
  END IF;
END;
$fn$;

ALTER TABLE public.pairs ALTER COLUMN player1_id DROP NOT NULL;
ALTER TABLE public.pairs ALTER COLUMN player2_id DROP NOT NULL;
ALTER TABLE public.pairs ALTER COLUMN player1_name DROP NOT NULL;
ALTER TABLE public.pairs ALTER COLUMN player2_name DROP NOT NULL;

ALTER TABLE public.pairs
  ADD CONSTRAINT pairs_shape_real_or_virtual CHECK (
    (
      is_virtual = false
      AND player1_id IS NOT NULL
      AND player2_id IS NOT NULL
      AND player1_name IS NOT NULL
      AND player2_name IS NOT NULL
      AND virtual_label IS NULL
    )
    OR
    (
      is_virtual = true
      AND player1_id IS NULL
      AND player2_id IS NULL
      AND player1_name IS NULL
      AND player2_name IS NULL
      AND virtual_label IS NOT NULL
      AND btrim(virtual_label) <> ''
    )
  );

-- Resolver una plaza virtual en la misma pair.id.
-- Grupos y eliminatoria sí. Cerrado o finalizado no.
-- El historial no se borra: con p_accept_existing_history queda asociado
-- a los jugadores nuevos. No toca grupos, partidos, horarios ni bracket.
CREATE OR REPLACE FUNCTION public.resolve_torneo_express_virtual_pair(
  p_torneo_id uuid,
  p_pareja_id uuid,
  p_player1_id uuid,
  p_player2_id uuid,
  p_accept_existing_history boolean
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
  v_fase text;
  v_estado text;
  v_is_virtual boolean;
  v_name1 text;
  v_name2 text;
  v_played integer := 0;
  v_updated integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_torneo_id IS NULL OR p_pareja_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_NOT_IN_TOURNAMENT');
  END IF;

  IF p_player1_id IS NULL OR p_player2_id IS NULL OR p_player1_id = p_player2_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
  END IF;

  -- lock-order: torneo
  SELECT organizador_id, fase_torneo, estado
    INTO v_owner, v_fase, v_estado
  FROM public.torneo_express
  WHERE id = p_torneo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOURNAMENT_NOT_FOUND');
  END IF;

  IF v_owner IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este torneo';
  END IF;

  IF v_fase = 'cerrado' OR v_estado = 'finalizado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOURNAMENT_CLOSED');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.torneo_express_grupo_parejas gp
    JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
    WHERE g.torneo_id = p_torneo_id
      AND gp.pareja_id = p_pareja_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.torneo_express_eliminatoria_partidos e
    WHERE e.torneo_id = p_torneo_id
      AND (
        e.pareja_local_id = p_pareja_id
        OR e.pareja_visitante_id = p_pareja_id
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_NOT_IN_TOURNAMENT');
  END IF;

  -- lock-order: partidos de grupo, luego eliminatoria, luego la pareja.
  PERFORM 1
  FROM public.torneo_express_partidos p
  JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
  WHERE g.torneo_id = p_torneo_id
    AND (p.pareja_local_id = p_pareja_id OR p.pareja_visitante_id = p_pareja_id)
  ORDER BY p.id
  FOR UPDATE OF p;

  PERFORM 1
  FROM public.torneo_express_eliminatoria_partidos e
  WHERE e.torneo_id = p_torneo_id
    AND (e.pareja_local_id = p_pareja_id OR e.pareja_visitante_id = p_pareja_id)
  ORDER BY e.id
  FOR UPDATE;

  SELECT is_virtual
    INTO v_is_virtual
  FROM public.pairs
  WHERE id = p_pareja_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_NOT_FOUND');
  END IF;

  IF NOT v_is_virtual THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VIRTUAL_PAIR_ALREADY_RESOLVED');
  END IF;

  SELECT btrim(name) INTO v_name1 FROM public.players WHERE id = p_player1_id;
  SELECT btrim(name) INTO v_name2 FROM public.players WHERE id = p_player2_id;
  IF v_name1 IS NULL OR v_name1 = '' OR v_name2 IS NULL OR v_name2 = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_grupo_parejas gp
    JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
    JOIN public.pairs pr ON pr.id = gp.pareja_id
    WHERE g.torneo_id = p_torneo_id
      AND gp.pareja_id <> p_pareja_id
      AND (
        pr.player1_id IN (p_player1_id, p_player2_id)
        OR pr.player2_id IN (p_player1_id, p_player2_id)
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.torneo_express_eliminatoria_partidos e
    JOIN public.pairs pr
      ON pr.id = e.pareja_local_id OR pr.id = e.pareja_visitante_id
    WHERE e.torneo_id = p_torneo_id
      AND pr.id <> p_pareja_id
      AND (
        pr.player1_id IN (p_player1_id, p_player2_id)
        OR pr.player2_id IN (p_player1_id, p_player2_id)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_ALREADY_REGISTERED');
  END IF;

  SELECT count(*) INTO v_played
  FROM (
    SELECT p.id
    FROM public.torneo_express_partidos p
    JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
    WHERE g.torneo_id = p_torneo_id
      AND (p.pareja_local_id = p_pareja_id OR p.pareja_visitante_id = p_pareja_id)
      AND public.te_partido_tiene_historial(
        p.estado, p.ganador_id, p.puntos_local, p.puntos_visitante, p.sets_resultado
      )
    UNION ALL
    SELECT e.id
    FROM public.torneo_express_eliminatoria_partidos e
    WHERE e.torneo_id = p_torneo_id
      AND coalesce(e.es_bye, false) = false
      AND (e.pareja_local_id = p_pareja_id OR e.pareja_visitante_id = p_pareja_id)
      AND public.te_partido_tiene_historial(
        e.estado, e.ganador_id, e.puntos_local, e.puntos_visitante, e.sets_resultado
      )
  ) played;

  IF v_played > 0 AND NOT coalesce(p_accept_existing_history, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'VIRTUAL_PAIR_HAS_HISTORY',
      'played_count', v_played
    );
  END IF;

  UPDATE public.pairs
  SET is_virtual = false,
      virtual_label = NULL,
      player1_id = p_player1_id,
      player1_name = v_name1,
      player2_id = p_player2_id,
      player2_name = v_name2
  WHERE id = p_pareja_id
    AND is_virtual = true;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VIRTUAL_PAIR_ALREADY_RESOLVED');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'pareja_id', p_pareja_id,
    'player1_id', p_player1_id,
    'player2_id', p_player2_id,
    'played_count', v_played
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.resolve_torneo_express_virtual_pair(uuid, uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_torneo_express_virtual_pair(uuid, uuid, uuid, uuid, boolean)
  TO authenticated;

DO $fn$
BEGIN
  IF to_regprocedure(
    'public.resolve_torneo_express_virtual_pair(uuid,uuid,uuid,uuid,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Falta resolve_torneo_express_virtual_pair';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pairs_shape_real_or_virtual'
      AND conrelid = 'public.pairs'::regclass
  ) THEN
    RAISE EXCEPTION 'Falta pairs_shape_real_or_virtual';
  END IF;
END;
$fn$;
