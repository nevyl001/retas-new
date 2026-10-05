-- Roster de grupos: snapshot de quién jugó, alta con versión,
-- cambio/reemplazo desde ahora, retiro y reconciliación.
--
-- Depende de 0048 (version, reset, índice de enfrentamientos) y de
-- _revert_rating_for_partido_ref. No reescribe 0044 ni 0048.
--
-- Orden de locks, el mismo de apply/reset:
--   1. torneo_express
--   2. torneo_express_grupos
--   3. torneo_express_grupo_parejas ORDER BY pareja_id
--   4. torneo_express_partidos ORDER BY id
--   5. pairs ORDER BY id
--
-- pairs es identidad viva y puede usarse fuera del grupo. Si el slot ya
-- jugó o la fila está referenciada fuera, no se muta: se crea otra pareja
-- y los pendientes apuntan a ella. El partido jugado conserva su snapshot.
--
-- Nombres del snapshot: los que la pareja ya tenía. No son un dato nuevo.
-- Hacen falta porque un rename posterior de players.name no debe reescribir
-- el partido. Los ids son la identidad de rating y carrera.
--
-- Reset: limpia marcador y snapshot. Si el id del partido es una pareja
-- previa del slot activo, lo reescribe al id vigente para que el próximo
-- resultado congele la composición actual. Un partido de una pareja
-- retirada se borra después de revertir su rating: ya no es fixture.
-- Los de parejas activas no se borran.
--
-- Reemplazar y reiniciar, más adelante: primero reset (ya no hay historial)
-- y después el cambio in-place. No hay un RPC combinado.
--
-- Carrera se publica al cerrar. El cierre lee el snapshot del partido de
-- grupo cuando existe. Esta migración no toca el ledger.
--
-- Rollback lógico:
--   DROP TRIGGER te_partidos_participantes_biu ON torneo_express_partidos;
--   DROP FUNCTION te_partidos_participantes_biu();
--   DROP FUNCTION cambiar/reemplazar/retirar/reconciliar;
--   DROP FUNCTION append(uuid,uuid,uuid,uuid,jsonb,integer);
--   recrear append de 5 argumentos desde 0044;
--   recrear reset desde 0048;
--   DROP CONSTRAINT de participantes y de grupo_parejas;
--   DROP COLUMN participantes, activa, retirada_at, pareja_previa_ids.

ALTER TABLE public.torneo_express_partidos
  ADD COLUMN IF NOT EXISTS participantes jsonb;

ALTER TABLE public.torneo_express_grupo_parejas
  ADD COLUMN IF NOT EXISTS activa boolean NOT NULL DEFAULT true;

ALTER TABLE public.torneo_express_grupo_parejas
  ADD COLUMN IF NOT EXISTS retirada_at timestamptz;

ALTER TABLE public.torneo_express_grupo_parejas
  ADD COLUMN IF NOT EXISTS pareja_previa_ids uuid[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'torneo_express_grupo_parejas_retiro'
  ) THEN
    ALTER TABLE public.torneo_express_grupo_parejas
      ADD CONSTRAINT torneo_express_grupo_parejas_retiro
      CHECK (
        (activa AND retirada_at IS NULL)
        OR (NOT activa AND retirada_at IS NOT NULL)
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.te_lado_participante_valido(p_lado jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT
    p_lado IS NOT NULL
    AND jsonb_typeof(p_lado) = 'object'
    AND (
      (
        (p_lado ->> 'is_virtual') = 'true'
        AND (p_lado ->> 'player1_id') IS NULL
        AND (p_lado ->> 'player2_id') IS NULL
        AND (p_lado ->> 'player1_name') IS NULL
        AND (p_lado ->> 'player2_name') IS NULL
        AND nullif(btrim(p_lado ->> 'virtual_label'), '') IS NOT NULL
      )
      OR (
        (p_lado ->> 'is_virtual') = 'false'
        AND (p_lado ->> 'player1_id') IS NOT NULL
        AND (p_lado ->> 'player2_id') IS NOT NULL
        AND (p_lado ->> 'player1_id') <> (p_lado ->> 'player2_id')
        AND nullif(btrim(p_lado ->> 'player1_name'), '') IS NOT NULL
        AND nullif(btrim(p_lado ->> 'player2_name'), '') IS NOT NULL
        AND (p_lado ->> 'virtual_label') IS NULL
      )
    );
$fn$;

CREATE OR REPLACE FUNCTION public.te_participantes_completos(p_snap jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT
    p_snap IS NOT NULL
    AND jsonb_typeof(p_snap) = 'object'
    AND public.te_lado_participante_valido(p_snap -> 'local')
    AND public.te_lado_participante_valido(p_snap -> 'visitante');
$fn$;

CREATE OR REPLACE FUNCTION public.te_lado_desde_pareja(p_pareja_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'player1_id', pr.player1_id,
    'player2_id', pr.player2_id,
    'player1_name', pr.player1_name,
    'player2_name', pr.player2_name,
    'is_virtual', pr.is_virtual,
    'virtual_label', pr.virtual_label
  )
  FROM public.pairs pr
  WHERE pr.id = p_pareja_id;
$fn$;

CREATE OR REPLACE FUNCTION public.te_build_participantes(
  p_local uuid,
  p_visitante uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN public.te_lado_desde_pareja(p_local) IS NULL
      OR public.te_lado_desde_pareja(p_visitante) IS NULL
    THEN NULL
    ELSE jsonb_build_object(
      'local', public.te_lado_desde_pareja(p_local),
      'visitante', public.te_lado_desde_pareja(p_visitante)
    )
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.te_partidos_participantes_biu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.estado = 'jugado' THEN
    IF TG_OP = 'UPDATE' AND OLD.participantes IS NOT NULL THEN
      NEW.participantes := OLD.participantes;
    ELSE
      NEW.participantes := public.te_build_participantes(
        NEW.pareja_local_id,
        NEW.pareja_visitante_id
      );
    END IF;
  ELSE
    NEW.participantes := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS te_partidos_participantes_biu ON public.torneo_express_partidos;
CREATE TRIGGER te_partidos_participantes_biu
  BEFORE INSERT OR UPDATE ON public.torneo_express_partidos
  FOR EACH ROW
  EXECUTE FUNCTION public.te_partidos_participantes_biu();

UPDATE public.torneo_express_partidos
SET participantes = public.te_build_participantes(pareja_local_id, pareja_visitante_id)
WHERE estado = 'jugado'
  AND participantes IS NULL;

DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.torneo_express_partidos
  WHERE estado = 'jugado'
    AND NOT public.te_participantes_completos(participantes);

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Hay % partidos jugados sin snapshot completo. No se borró ninguno.',
      v_bad;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'torneo_express_partidos_participantes_chk'
  ) THEN
    ALTER TABLE public.torneo_express_partidos
      ADD CONSTRAINT torneo_express_partidos_participantes_chk
      CHECK (
        (
          estado IS DISTINCT FROM 'jugado'
          AND participantes IS NULL
        )
        OR (
          estado = 'jugado'
          AND public.te_participantes_completos(participantes)
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.te_pareja_referenciada_fuera(
  p_pareja_id uuid,
  p_grupo_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.torneo_express_grupo_parejas gp
    WHERE gp.pareja_id = p_pareja_id
      AND gp.grupo_id <> p_grupo_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.torneo_express_partidos p
    WHERE p.grupo_id IS DISTINCT FROM p_grupo_id
      AND (p.pareja_local_id = p_pareja_id OR p.pareja_visitante_id = p_pareja_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.torneo_express_eliminatoria_partidos e
    WHERE e.pareja_local_id = p_pareja_id
       OR e.pareja_visitante_id = p_pareja_id
  );
$fn$;

CREATE OR REPLACE FUNCTION public.te_slot_pareja_actual(
  p_grupo_id uuid,
  p_pareja_id uuid
) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT gp.pareja_id
  FROM public.torneo_express_grupo_parejas gp
  WHERE gp.grupo_id = p_grupo_id
    AND gp.activa
    AND (
      gp.pareja_id = p_pareja_id
      OR p_pareja_id = ANY (gp.pareja_previa_ids)
    )
  LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION public.te_grupo_version_ok(
  p_grupo_id uuid,
  p_expected integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_version integer;
BEGIN
  SELECT version INTO v_version
  FROM public.torneo_express_grupos
  WHERE id = p_grupo_id;

  IF p_expected IS NULL OR p_expected IS DISTINCT FROM v_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'STALE_GROUP_VERSION',
      'version', v_version
    );
  END IF;
  RETURN jsonb_build_object('ok', true, 'version', v_version);
END;
$fn$;

-- El grupo ya está bloqueado por quien llama.
CREATE OR REPLACE FUNCTION public.te_grupo_bump_version(p_grupo_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_version integer;
  v_rows integer;
BEGIN
  UPDATE public.torneo_express_grupos
  SET version = version + 1
  WHERE id = p_grupo_id
  RETURNING version INTO v_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'GROUP_VERSION_UPDATE_FAILED';
  END IF;
  RETURN v_version;
END;
$fn$;

DROP FUNCTION IF EXISTS public.append_torneo_express_pareja_grupo(uuid, uuid, uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.append_torneo_express_pareja_grupo(
  p_torneo_id uuid,
  p_grupo_id uuid,
  p_player1_id uuid,
  p_player2_id uuid,
  p_partidos jsonb,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_guard jsonb;
  v_grupo_id uuid;
  v_version integer;
  v_name1 text;
  v_name2 text;
  v_tournament_id uuid;
  v_tournament_count integer;
  v_null_tournament integer;
  v_pareja_id uuid;
  v_group_count integer;
  v_payload_count integer;
  v_max_ronda integer;
  v_max_orden integer;
  v_scheduled_count integer;
  v_category_count integer;
  v_category_incomplete integer;
  v_last_slot text;
  elem jsonb;
  v_rival uuid;
  v_ronda integer;
  v_orden integer;
  v_cancha text;
  v_programado timestamptz;
  v_created integer := 0;
BEGIN
  v_guard := public.te_lock_categoria_editable(p_torneo_id);
  IF NOT (v_guard ->> 'ok')::boolean THEN
    RETURN v_guard;
  END IF;

  IF p_grupo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_GROUP');
  END IF;

  -- lock-order: grupo
  SELECT g.id, g.version
    INTO v_grupo_id, v_version
  FROM public.torneo_express_grupos g
  WHERE g.id = p_grupo_id
    AND g.torneo_id = p_torneo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_GROUP');
  END IF;

  IF p_expected_version IS NULL OR p_expected_version IS DISTINCT FROM v_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'STALE_GROUP_VERSION',
      'version', v_version
    );
  END IF;

  -- lock-order: partidos. Después del grupo, como apply y reset.
  BEGIN
    PERFORM 1
    FROM public.torneo_express_partidos p
    JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
    WHERE g.torneo_id = p_torneo_id
    ORDER BY p.id
    FOR UPDATE OF p NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
  END;

  IF p_player1_id IS NULL OR p_player2_id IS NULL OR p_player1_id = p_player2_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
  END IF;

  SELECT btrim(name) INTO v_name1 FROM public.players WHERE id = p_player1_id;
  SELECT btrim(name) INTO v_name2 FROM public.players WHERE id = p_player2_id;
  IF v_name1 IS NULL OR v_name1 = '' OR v_name2 IS NULL OR v_name2 = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_grupo_parejas gp
    JOIN public.pairs pr ON pr.id = gp.pareja_id
    WHERE gp.grupo_id = v_grupo_id
      AND gp.activa
      AND (
        (pr.player1_id = p_player1_id AND pr.player2_id = p_player2_id)
        OR (pr.player1_id = p_player2_id AND pr.player2_id = p_player1_id)
      )
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'PAIR_ALREADY_IN_GROUP',
      'version', v_version
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_grupo_parejas gp
    JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
    JOIN public.pairs pr ON pr.id = gp.pareja_id
    WHERE g.torneo_id = p_torneo_id
      AND (
        pr.player1_id IN (p_player1_id, p_player2_id)
        OR pr.player2_id IN (p_player1_id, p_player2_id)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_ALREADY_REGISTERED');
  END IF;

  SELECT count(DISTINCT pr.tournament_id) FILTER (WHERE pr.tournament_id IS NOT NULL),
         count(*) FILTER (WHERE pr.tournament_id IS NULL)
    INTO v_tournament_count, v_null_tournament
  FROM public.torneo_express_grupo_parejas gp
  JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
  JOIN public.pairs pr ON pr.id = gp.pareja_id
  WHERE g.torneo_id = p_torneo_id;

  IF v_null_tournament > 0 OR v_tournament_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_TOURNAMENT_UNRESOLVED');
  END IF;

  SELECT DISTINCT pr.tournament_id INTO v_tournament_id
  FROM public.torneo_express_grupo_parejas gp
  JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
  JOIN public.pairs pr ON pr.id = gp.pareja_id
  WHERE g.torneo_id = p_torneo_id
    AND pr.tournament_id IS NOT NULL;

  IF p_partidos IS NULL OR jsonb_typeof(p_partidos) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
  END IF;

  DROP TABLE IF EXISTS te_append_partidos;

  SELECT count(*) INTO v_group_count
  FROM public.torneo_express_grupo_parejas
  WHERE grupo_id = v_grupo_id
    AND activa;

  v_payload_count := jsonb_array_length(p_partidos);
  IF v_payload_count <> v_group_count THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
  END IF;

  SELECT coalesce(max(CASE WHEN p.ronda > 0 THEN p.ronda ELSE 0 END), 0),
         coalesce(max(CASE WHEN p.orden > 0 THEN p.orden ELSE 0 END), 0)
    INTO v_max_ronda, v_max_orden
  FROM public.torneo_express_partidos p
  WHERE p.grupo_id = v_grupo_id;

  CREATE TEMP TABLE te_append_partidos (
    rival_id uuid PRIMARY KEY,
    ronda integer NOT NULL,
    orden integer NOT NULL,
    cancha text,
    programado_en timestamptz,
    scheduled boolean NOT NULL
  ) ON COMMIT DROP;

  FOR elem IN SELECT value FROM jsonb_array_elements(p_partidos) LOOP
    BEGIN
      v_rival := (elem ->> 'rival_id')::uuid;
      v_ronda := (elem ->> 'ronda')::integer;
      v_orden := (elem ->> 'orden')::integer;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
    END;

    IF v_rival IS NULL OR v_ronda IS NULL OR v_orden IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.torneo_express_grupo_parejas
      WHERE grupo_id = v_grupo_id AND pareja_id = v_rival AND activa
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
    END IF;

    IF v_ronda <> v_max_ronda + 1
       OR v_orden <= v_max_orden
       OR v_orden > v_max_orden + v_group_count THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
    END IF;

    v_cancha := nullif(btrim(elem ->> 'cancha'), '');
    BEGIN
      IF nullif(btrim(elem ->> 'programado_en'), '') IS NULL THEN
        v_programado := NULL;
      ELSE
        v_programado := (elem ->> 'programado_en')::timestamptz;
      END IF;
    EXCEPTION
      WHEN invalid_text_representation OR datetime_field_overflow THEN
        RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
    END;

    BEGIN
      INSERT INTO te_append_partidos (rival_id, ronda, orden, cancha, programado_en, scheduled)
      VALUES (
        v_rival, v_ronda, v_orden, v_cancha, v_programado,
        v_cancha IS NOT NULL AND v_programado IS NOT NULL
      );
    EXCEPTION
      WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'DUPLICATE_MATCH');
    END;
  END LOOP;

  IF (SELECT count(*) FROM te_append_partidos) <> v_group_count
     OR (SELECT count(DISTINCT orden) FROM te_append_partidos) <> v_group_count THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_grupo_parejas gp
    WHERE gp.grupo_id = v_grupo_id
      AND gp.activa
      AND NOT EXISTS (
        SELECT 1 FROM te_append_partidos a WHERE a.rival_id = gp.pareja_id
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
  END IF;

  SELECT count(*) FILTER (WHERE scheduled),
         count(*) FILTER (WHERE NOT scheduled)
    INTO v_scheduled_count, v_payload_count
  FROM te_append_partidos;

  IF v_scheduled_count <> 0 AND v_payload_count <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
  END IF;

  SELECT count(*) INTO v_category_count
  FROM public.torneo_express_partidos p
  JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
  WHERE g.torneo_id = p_torneo_id;

  SELECT count(*) INTO v_category_incomplete
  FROM public.torneo_express_partidos p
  JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
  WHERE g.torneo_id = p_torneo_id
    AND (p.programado_en IS NULL OR p.cancha IS NULL OR btrim(p.cancha) = '');

  IF v_scheduled_count = 0 THEN
    IF v_category_count > 0 AND v_category_incomplete = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
    END IF;
  ELSE
    IF v_category_count = 0 OR v_category_incomplete > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
    END IF;

    SELECT max(public.te_mexico_slot_key(p.programado_en))
      INTO v_last_slot
    FROM public.torneo_express_partidos p
    JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
    WHERE g.torneo_id = p_torneo_id
      AND p.programado_en IS NOT NULL;

    IF EXISTS (
      SELECT 1 FROM te_append_partidos a
      WHERE public.te_mexico_slot_key(a.programado_en) <= v_last_slot
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM te_append_partidos a
      JOIN te_append_partidos b
        ON a.rival_id <> b.rival_id
       AND public.te_mexico_slot_key(a.programado_en) = public.te_mexico_slot_key(b.programado_en)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM te_append_partidos a
      JOIN public.torneo_express_partidos p ON true
      JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
      WHERE g.torneo_id = p_torneo_id
        AND public.te_mexico_slot_key(p.programado_en) = public.te_mexico_slot_key(a.programado_en)
        AND (
          btrim(p.cancha) = a.cancha
          OR p.pareja_local_id = a.rival_id
          OR p.pareja_visitante_id = a.rival_id
        )
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
    END IF;
  END IF;

  INSERT INTO public.pairs (
    id, tournament_id, player1_id, player2_id, player1_name, player2_name, is_virtual, virtual_label
  ) VALUES (
    gen_random_uuid(), v_tournament_id, p_player1_id, p_player2_id, v_name1, v_name2, false, NULL
  )
  RETURNING id INTO v_pareja_id;

  INSERT INTO public.torneo_express_grupo_parejas (grupo_id, pareja_id)
  VALUES (v_grupo_id, v_pareja_id);

  INSERT INTO public.torneo_express_partidos (
    id, grupo_id, pareja_local_id, pareja_visitante_id, estado, ronda, orden, cancha, programado_en
  )
  SELECT
    gen_random_uuid(), v_grupo_id, v_pareja_id, a.rival_id, 'pendiente', a.ronda, a.orden, a.cancha, a.programado_en
  FROM te_append_partidos a;

  GET DIAGNOSTICS v_created = ROW_COUNT;
  v_version := public.te_grupo_bump_version(v_grupo_id);

  RETURN jsonb_build_object(
    'ok', true,
    'pareja_id', v_pareja_id,
    'partidos_creados', v_created,
    'version', v_version
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cambiar_torneo_express_jugador_grupo(
  p_grupo_id uuid,
  p_pareja_id uuid,
  p_jugador_saliente_id uuid,
  p_jugador_nuevo_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_torneo_id uuid;
  v_guard jsonb;
  v_version_guard jsonb;
  v_player1 uuid;
  v_player2 uuid;
  v_is_virtual boolean;
  v_tournament uuid;
  v_name text;
  v_slot text;
  v_partner uuid;
  v_has_history boolean;
  v_shared boolean;
  v_new_pair uuid;
  v_version integer;
BEGIN
  IF p_grupo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;

  SELECT torneo_id INTO v_torneo_id
  FROM public.torneo_express_grupos
  WHERE id = p_grupo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;

  v_guard := public.te_lock_categoria_editable(v_torneo_id);
  IF NOT (v_guard ->> 'ok')::boolean THEN
    IF (v_guard ->> 'error') IN ('TOURNAMENT_NOT_EDITABLE', 'ELIMINATORIA_EXISTS') THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'GROUP_NOT_EDITABLE', 'reason', v_guard ->> 'error'
      );
    END IF;
    RETURN v_guard;
  END IF;

  -- lock-order: grupo
  PERFORM 1 FROM public.torneo_express_grupos WHERE id = p_grupo_id FOR UPDATE;
  v_version_guard := public.te_grupo_version_ok(p_grupo_id, p_expected_version);
  IF NOT (v_version_guard ->> 'ok')::boolean THEN
    RETURN v_version_guard;
  END IF;

  -- lock-order: grupo_parejas
  PERFORM 1
  FROM public.torneo_express_grupo_parejas
  WHERE grupo_id = p_grupo_id
  ORDER BY pareja_id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.torneo_express_grupo_parejas
    WHERE grupo_id = p_grupo_id AND pareja_id = p_pareja_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_NOT_IN_GROUP');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.torneo_express_grupo_parejas
    WHERE grupo_id = p_grupo_id AND pareja_id = p_pareja_id AND NOT activa
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_ALREADY_WITHDRAWN');
  END IF;

  -- lock-order: partidos
  PERFORM 1
  FROM public.torneo_express_partidos
  WHERE grupo_id = p_grupo_id
    AND (pareja_local_id = p_pareja_id OR pareja_visitante_id = p_pareja_id)
  ORDER BY id
  FOR UPDATE;

  -- lock-order: pairs
  SELECT player1_id, player2_id, is_virtual, tournament_id
    INTO v_player1, v_player2, v_is_virtual, v_tournament
  FROM public.pairs
  WHERE id = p_pareja_id
  ORDER BY id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PAIR');
  END IF;
  IF v_is_virtual THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_IS_VIRTUAL');
  END IF;
  IF p_jugador_saliente_id IS NULL OR p_jugador_nuevo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PAIR');
  END IF;

  IF v_player1 = p_jugador_saliente_id THEN
    v_slot := 'player1';
    v_partner := v_player2;
  ELSIF v_player2 = p_jugador_saliente_id THEN
    v_slot := 'player2';
    v_partner := v_player1;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'OUTGOING_NOT_IN_PAIR');
  END IF;

  IF p_jugador_nuevo_id = v_partner OR p_jugador_nuevo_id = p_jugador_saliente_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_ALREADY_IN_PAIR');
  END IF;

  SELECT btrim(name) INTO v_name FROM public.players WHERE id = p_jugador_nuevo_id;
  IF v_name IS NULL OR v_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_grupo_parejas gp
    JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
    JOIN public.pairs pr ON pr.id = gp.pareja_id
    WHERE g.torneo_id = v_torneo_id
      AND gp.pareja_id <> p_pareja_id
      AND (pr.player1_id = p_jugador_nuevo_id OR pr.player2_id = p_jugador_nuevo_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_ALREADY_REGISTERED');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.torneo_express_partidos p
    WHERE p.grupo_id = p_grupo_id
      AND (p.pareja_local_id = p_pareja_id OR p.pareja_visitante_id = p_pareja_id)
      AND public.te_partido_tiene_historial(
        p.estado, p.ganador_id, p.puntos_local, p.puntos_visitante, p.sets_resultado
      )
  ) INTO v_has_history;

  v_shared := public.te_pareja_referenciada_fuera(p_pareja_id, p_grupo_id);

  IF NOT v_has_history AND NOT v_shared THEN
    IF v_slot = 'player1' THEN
      UPDATE public.pairs
      SET player1_id = p_jugador_nuevo_id, player1_name = v_name
      WHERE id = p_pareja_id;
    ELSE
      UPDATE public.pairs
      SET player2_id = p_jugador_nuevo_id, player2_name = v_name
      WHERE id = p_pareja_id;
    END IF;
    v_version := public.te_grupo_bump_version(p_grupo_id);
    RETURN jsonb_build_object(
      'ok', true,
      'mode', 'in_place',
      'pareja_id', p_pareja_id,
      'version', v_version
    );
  END IF;

  INSERT INTO public.pairs (
    id, tournament_id, player1_id, player2_id, player1_name, player2_name, is_virtual, virtual_label
  )
  SELECT
    gen_random_uuid(),
    v_tournament,
    CASE WHEN v_slot = 'player1' THEN p_jugador_nuevo_id ELSE v_player1 END,
    CASE WHEN v_slot = 'player2' THEN p_jugador_nuevo_id ELSE v_player2 END,
    CASE WHEN v_slot = 'player1' THEN v_name ELSE player1_name END,
    CASE WHEN v_slot = 'player2' THEN v_name ELSE player2_name END,
    false,
    NULL
  FROM public.pairs
  WHERE id = p_pareja_id
  RETURNING id INTO v_new_pair;

  UPDATE public.torneo_express_grupo_parejas
  SET pareja_previa_ids = pareja_previa_ids || ARRAY[p_pareja_id],
      pareja_id = v_new_pair
  WHERE grupo_id = p_grupo_id
    AND pareja_id = p_pareja_id;

  UPDATE public.torneo_express_partidos
  SET pareja_local_id = CASE WHEN pareja_local_id = p_pareja_id THEN v_new_pair ELSE pareja_local_id END,
      pareja_visitante_id = CASE WHEN pareja_visitante_id = p_pareja_id THEN v_new_pair ELSE pareja_visitante_id END
  WHERE grupo_id = p_grupo_id
    AND (pareja_local_id = p_pareja_id OR pareja_visitante_id = p_pareja_id)
    AND NOT public.te_partido_tiene_historial(
      estado, ganador_id, puntos_local, puntos_visitante, sets_resultado
    );

  v_version := public.te_grupo_bump_version(p_grupo_id);
  RETURN jsonb_build_object(
    'ok', true,
    'mode', 'desde_ahora',
    'pareja_id', v_new_pair,
    'pareja_anterior_id', p_pareja_id,
    'version', v_version
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.reemplazar_torneo_express_pareja_grupo(
  p_grupo_id uuid,
  p_pareja_id uuid,
  p_player1_id uuid,
  p_player2_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_torneo_id uuid;
  v_guard jsonb;
  v_version_guard jsonb;
  v_player1 uuid;
  v_player2 uuid;
  v_is_virtual boolean;
  v_tournament uuid;
  v_name1 text;
  v_name2 text;
  v_has_history boolean;
  v_shared boolean;
  v_new_pair uuid;
  v_version integer;
BEGIN
  IF p_grupo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;
  SELECT torneo_id INTO v_torneo_id
  FROM public.torneo_express_grupos WHERE id = p_grupo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;

  v_guard := public.te_lock_categoria_editable(v_torneo_id);
  IF NOT (v_guard ->> 'ok')::boolean THEN
    IF (v_guard ->> 'error') IN ('TOURNAMENT_NOT_EDITABLE', 'ELIMINATORIA_EXISTS') THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'GROUP_NOT_EDITABLE', 'reason', v_guard ->> 'error'
      );
    END IF;
    RETURN v_guard;
  END IF;

  PERFORM 1 FROM public.torneo_express_grupos WHERE id = p_grupo_id FOR UPDATE;
  v_version_guard := public.te_grupo_version_ok(p_grupo_id, p_expected_version);
  IF NOT (v_version_guard ->> 'ok')::boolean THEN
    RETURN v_version_guard;
  END IF;

  PERFORM 1
  FROM public.torneo_express_grupo_parejas
  WHERE grupo_id = p_grupo_id
  ORDER BY pareja_id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.torneo_express_grupo_parejas
    WHERE grupo_id = p_grupo_id AND pareja_id = p_pareja_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_NOT_IN_GROUP');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.torneo_express_grupo_parejas
    WHERE grupo_id = p_grupo_id AND pareja_id = p_pareja_id AND NOT activa
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_ALREADY_WITHDRAWN');
  END IF;

  PERFORM 1
  FROM public.torneo_express_partidos
  WHERE grupo_id = p_grupo_id
    AND (pareja_local_id = p_pareja_id OR pareja_visitante_id = p_pareja_id)
  ORDER BY id
  FOR UPDATE;

  SELECT player1_id, player2_id, is_virtual, tournament_id
    INTO v_player1, v_player2, v_is_virtual, v_tournament
  FROM public.pairs
  WHERE id = p_pareja_id
  FOR UPDATE;

  IF NOT FOUND OR v_is_virtual THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE WHEN v_is_virtual THEN 'PAIR_IS_VIRTUAL' ELSE 'INVALID_PAIR' END
    );
  END IF;
  IF p_player1_id IS NULL OR p_player2_id IS NULL OR p_player1_id = p_player2_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PAIR');
  END IF;

  IF (p_player1_id = v_player1 AND p_player2_id = v_player2)
     OR (p_player1_id = v_player2 AND p_player2_id = v_player1) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'pareja_id', p_pareja_id,
      'version', (v_version_guard ->> 'version')::integer
    );
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
    WHERE g.torneo_id = v_torneo_id
      AND gp.pareja_id <> p_pareja_id
      AND (
        pr.player1_id IN (p_player1_id, p_player2_id)
        OR pr.player2_id IN (p_player1_id, p_player2_id)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_ALREADY_REGISTERED');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.torneo_express_partidos p
    WHERE p.grupo_id = p_grupo_id
      AND (p.pareja_local_id = p_pareja_id OR p.pareja_visitante_id = p_pareja_id)
      AND public.te_partido_tiene_historial(
        p.estado, p.ganador_id, p.puntos_local, p.puntos_visitante, p.sets_resultado
      )
  ) INTO v_has_history;
  v_shared := public.te_pareja_referenciada_fuera(p_pareja_id, p_grupo_id);

  IF NOT v_has_history AND NOT v_shared THEN
    UPDATE public.pairs
    SET player1_id = p_player1_id,
        player2_id = p_player2_id,
        player1_name = v_name1,
        player2_name = v_name2,
        is_virtual = false,
        virtual_label = NULL
    WHERE id = p_pareja_id;
    v_version := public.te_grupo_bump_version(p_grupo_id);
    RETURN jsonb_build_object(
      'ok', true, 'mode', 'in_place', 'pareja_id', p_pareja_id, 'version', v_version
    );
  END IF;

  INSERT INTO public.pairs (
    id, tournament_id, player1_id, player2_id, player1_name, player2_name, is_virtual, virtual_label
  ) VALUES (
    gen_random_uuid(), v_tournament, p_player1_id, p_player2_id, v_name1, v_name2, false, NULL
  )
  RETURNING id INTO v_new_pair;

  UPDATE public.torneo_express_grupo_parejas
  SET pareja_previa_ids = pareja_previa_ids || ARRAY[p_pareja_id],
      pareja_id = v_new_pair
  WHERE grupo_id = p_grupo_id AND pareja_id = p_pareja_id;

  UPDATE public.torneo_express_partidos
  SET pareja_local_id = CASE WHEN pareja_local_id = p_pareja_id THEN v_new_pair ELSE pareja_local_id END,
      pareja_visitante_id = CASE WHEN pareja_visitante_id = p_pareja_id THEN v_new_pair ELSE pareja_visitante_id END
  WHERE grupo_id = p_grupo_id
    AND (pareja_local_id = p_pareja_id OR pareja_visitante_id = p_pareja_id)
    AND NOT public.te_partido_tiene_historial(
      estado, ganador_id, puntos_local, puntos_visitante, sets_resultado
    );

  v_version := public.te_grupo_bump_version(p_grupo_id);
  RETURN jsonb_build_object(
    'ok', true,
    'mode', 'desde_ahora',
    'pareja_id', v_new_pair,
    'pareja_anterior_id', p_pareja_id,
    'version', v_version
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.retirar_torneo_express_pareja_grupo(
  p_grupo_id uuid,
  p_pareja_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_torneo_id uuid;
  v_guard jsonb;
  v_version_guard jsonb;
  v_dropped integer := 0;
  v_version integer;
  v_ids uuid[];
BEGIN
  IF p_grupo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;
  SELECT torneo_id INTO v_torneo_id
  FROM public.torneo_express_grupos WHERE id = p_grupo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;

  v_guard := public.te_lock_categoria_editable(v_torneo_id);
  IF NOT (v_guard ->> 'ok')::boolean THEN
    IF (v_guard ->> 'error') IN ('TOURNAMENT_NOT_EDITABLE', 'ELIMINATORIA_EXISTS') THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'GROUP_NOT_EDITABLE', 'reason', v_guard ->> 'error'
      );
    END IF;
    RETURN v_guard;
  END IF;

  PERFORM 1 FROM public.torneo_express_grupos WHERE id = p_grupo_id FOR UPDATE;
  v_version_guard := public.te_grupo_version_ok(p_grupo_id, p_expected_version);
  IF NOT (v_version_guard ->> 'ok')::boolean THEN
    RETURN v_version_guard;
  END IF;

  PERFORM 1
  FROM public.torneo_express_grupo_parejas
  WHERE grupo_id = p_grupo_id
  ORDER BY pareja_id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.torneo_express_grupo_parejas
    WHERE grupo_id = p_grupo_id AND pareja_id = p_pareja_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_NOT_IN_GROUP');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.torneo_express_grupo_parejas
    WHERE grupo_id = p_grupo_id AND pareja_id = p_pareja_id AND NOT activa
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'PAIR_ALREADY_WITHDRAWN',
      'version', (v_version_guard ->> 'version')::integer
    );
  END IF;

  SELECT pareja_previa_ids || ARRAY[pareja_id]
    INTO v_ids
  FROM public.torneo_express_grupo_parejas
  WHERE grupo_id = p_grupo_id AND pareja_id = p_pareja_id;

  PERFORM 1
  FROM public.torneo_express_partidos
  WHERE grupo_id = p_grupo_id
    AND (pareja_local_id = ANY (v_ids) OR pareja_visitante_id = ANY (v_ids))
  ORDER BY id
  FOR UPDATE;

  UPDATE public.torneo_express_grupo_parejas
  SET activa = false, retirada_at = now()
  WHERE grupo_id = p_grupo_id AND pareja_id = p_pareja_id;

  DELETE FROM public.torneo_express_partidos p
  WHERE p.grupo_id = p_grupo_id
    AND (p.pareja_local_id = ANY (v_ids) OR p.pareja_visitante_id = ANY (v_ids))
    AND NOT public.te_partido_tiene_historial(
      p.estado, p.ganador_id, p.puntos_local, p.puntos_visitante, p.sets_resultado
    );
  GET DIAGNOSTICS v_dropped = ROW_COUNT;

  v_version := public.te_grupo_bump_version(p_grupo_id);
  RETURN jsonb_build_object(
    'ok', true,
    'pareja_id', p_pareja_id,
    'pendientes_retirados', v_dropped,
    'version', v_version
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.reconciliar_torneo_express_grupo(
  p_grupo_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_torneo_id uuid;
  v_guard jsonb;
  v_version_guard jsonb;
  v_created integer := 0;
  v_dropped integer := 0;
  v_version integer;
  v_max_orden integer;
  v_max_ronda integer;
BEGIN
  IF p_grupo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;
  SELECT torneo_id INTO v_torneo_id
  FROM public.torneo_express_grupos WHERE id = p_grupo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;

  v_guard := public.te_lock_categoria_editable(v_torneo_id);
  IF NOT (v_guard ->> 'ok')::boolean THEN
    IF (v_guard ->> 'error') IN ('TOURNAMENT_NOT_EDITABLE', 'ELIMINATORIA_EXISTS') THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'GROUP_NOT_EDITABLE', 'reason', v_guard ->> 'error'
      );
    END IF;
    RETURN v_guard;
  END IF;

  PERFORM 1 FROM public.torneo_express_grupos WHERE id = p_grupo_id FOR UPDATE;
  v_version_guard := public.te_grupo_version_ok(p_grupo_id, p_expected_version);
  IF NOT (v_version_guard ->> 'ok')::boolean THEN
    RETURN v_version_guard;
  END IF;

  PERFORM 1
  FROM public.torneo_express_grupo_parejas
  WHERE grupo_id = p_grupo_id
  ORDER BY pareja_id
  FOR UPDATE;

  PERFORM 1
  FROM public.torneo_express_partidos
  WHERE grupo_id = p_grupo_id
  ORDER BY id
  FOR UPDATE;

  DROP TABLE IF EXISTS te_reconcile_slots;
  DROP TABLE IF EXISTS te_reconcile_required;
  CREATE TEMP TABLE te_reconcile_slots (
    pareja_id uuid PRIMARY KEY,
    lineage uuid[] NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO te_reconcile_slots (pareja_id, lineage)
  SELECT pareja_id, pareja_previa_ids || ARRAY[pareja_id]
  FROM public.torneo_express_grupo_parejas
  WHERE grupo_id = p_grupo_id AND activa;

  CREATE TEMP TABLE te_reconcile_required (
    left_id uuid NOT NULL,
    right_id uuid NOT NULL,
    matchup text NOT NULL,
    PRIMARY KEY (left_id, right_id)
  ) ON COMMIT DROP;

  INSERT INTO te_reconcile_required (left_id, right_id, matchup)
  SELECT a.pareja_id, b.pareja_id, public.te_matchup_key(a.pareja_id, b.pareja_id)
  FROM te_reconcile_slots a
  JOIN te_reconcile_slots b ON a.pareja_id < b.pareja_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.torneo_express_partidos p
    JOIN te_reconcile_slots sa
      ON p.pareja_local_id = ANY (sa.lineage)
    JOIN te_reconcile_slots sb
      ON p.pareja_visitante_id = ANY (sb.lineage)
    WHERE p.grupo_id = p_grupo_id
      AND sa.pareja_id <> sb.pareja_id
      AND (
        (sa.pareja_id = a.pareja_id AND sb.pareja_id = b.pareja_id)
        OR (sa.pareja_id = b.pareja_id AND sb.pareja_id = a.pareja_id)
      )
      AND public.te_partido_tiene_historial(
        p.estado, p.ganador_id, p.puntos_local, p.puntos_visitante, p.sets_resultado
      )
  );

  DELETE FROM public.torneo_express_partidos p
  WHERE p.grupo_id = p_grupo_id
    AND NOT public.te_partido_tiene_historial(
      p.estado, p.ganador_id, p.puntos_local, p.puntos_visitante, p.sets_resultado
    )
    AND NOT EXISTS (
      SELECT 1 FROM te_reconcile_required r
      WHERE r.matchup = public.te_matchup_key(p.pareja_local_id, p.pareja_visitante_id)
        AND p.pareja_local_id IN (r.left_id, r.right_id)
        AND p.pareja_visitante_id IN (r.left_id, r.right_id)
    );
  GET DIAGNOSTICS v_dropped = ROW_COUNT;

  SELECT coalesce(max(orden), 0), coalesce(max(ronda), 0)
    INTO v_max_orden, v_max_ronda
  FROM public.torneo_express_partidos
  WHERE grupo_id = p_grupo_id;

  INSERT INTO public.torneo_express_partidos (
    id, grupo_id, pareja_local_id, pareja_visitante_id, estado, ronda, orden
  )
  SELECT
    gen_random_uuid(),
    p_grupo_id,
    r.left_id,
    r.right_id,
    'pendiente',
    v_max_ronda + 1,
    v_max_orden + row_number() OVER (ORDER BY r.left_id, r.right_id)
  FROM te_reconcile_required r
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.torneo_express_partidos p
    WHERE p.grupo_id = p_grupo_id
      AND public.te_matchup_key(p.pareja_local_id, p.pareja_visitante_id) = r.matchup
  );
  GET DIAGNOSTICS v_created = ROW_COUNT;

  IF v_created = 0 AND v_dropped = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'creados', 0,
      'retirados', 0,
      'version', (v_version_guard ->> 'version')::integer
    );
  END IF;

  v_version := public.te_grupo_bump_version(p_grupo_id);
  RETURN jsonb_build_object(
    'ok', true,
    'creados', v_created,
    'retirados', v_dropped,
    'version', v_version
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.reset_torneo_express_grupo(
  p_grupo_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_torneo_id uuid;
  v_version integer;
  v_guard jsonb;
  v_partido record;
  v_ref text;
  v_rating_rows integer;
  v_matches_reset integer := 0;
  v_ratings_reverted integer := 0;
  v_local uuid;
  v_visit uuid;
BEGIN
  IF p_grupo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;

  SELECT torneo_id INTO v_torneo_id
  FROM public.torneo_express_grupos
  WHERE id = p_grupo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;

  v_guard := public.te_lock_categoria_editable(v_torneo_id);
  IF NOT (v_guard ->> 'ok')::boolean THEN
    IF (v_guard ->> 'error') IN ('TOURNAMENT_NOT_EDITABLE', 'ELIMINATORIA_EXISTS') THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'GROUP_NOT_EDITABLE', 'reason', v_guard ->> 'error'
      );
    END IF;
    RETURN v_guard;
  END IF;

  SELECT version INTO v_version
  FROM public.torneo_express_grupos
  WHERE id = p_grupo_id
  FOR UPDATE;

  IF p_expected_version IS NULL OR p_expected_version IS DISTINCT FROM v_version THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'STALE_GROUP_VERSION', 'version', v_version
    );
  END IF;

  PERFORM 1
  FROM public.torneo_express_partidos
  WHERE grupo_id = p_grupo_id
  ORDER BY id
  FOR UPDATE;

  FOR v_partido IN
    SELECT id, estado, puntos_local, puntos_visitante, ganador_id, sets_resultado,
           pareja_local_id, pareja_visitante_id
    FROM public.torneo_express_partidos
    WHERE grupo_id = p_grupo_id
    ORDER BY id
  LOOP
    v_ref := 'te-grupo:' || v_partido.id::text;
    SELECT count(*) INTO v_rating_rows
    FROM public.rating_historial
    WHERE partido_ref = v_ref;
    PERFORM public._revert_rating_for_partido_ref(v_ref);
    IF v_rating_rows > 0 THEN
      v_ratings_reverted := v_ratings_reverted + 1;
    END IF;

    v_local := public.te_slot_pareja_actual(p_grupo_id, v_partido.pareja_local_id);
    v_visit := public.te_slot_pareja_actual(p_grupo_id, v_partido.pareja_visitante_id);

    IF v_local IS NULL OR v_visit IS NULL THEN
      DELETE FROM public.torneo_express_partidos WHERE id = v_partido.id;
      v_matches_reset := v_matches_reset + 1;
    ELSIF v_partido.estado IS DISTINCT FROM 'pendiente'
       OR v_partido.puntos_local IS NOT NULL
       OR v_partido.puntos_visitante IS NOT NULL
       OR v_partido.ganador_id IS NOT NULL
       OR v_partido.sets_resultado IS NOT NULL
       OR v_partido.pareja_local_id IS DISTINCT FROM v_local
       OR v_partido.pareja_visitante_id IS DISTINCT FROM v_visit THEN
      UPDATE public.torneo_express_partidos
      SET puntos_local = NULL,
          puntos_visitante = NULL,
          sets_resultado = NULL,
          ganador_id = NULL,
          estado = 'pendiente',
          pareja_local_id = v_local,
          pareja_visitante_id = v_visit
      WHERE id = v_partido.id;
      v_matches_reset := v_matches_reset + 1;
    END IF;
  END LOOP;

  UPDATE public.torneo_express_grupos
  SET version = version + 1
  WHERE id = p_grupo_id;

  RETURN jsonb_build_object(
    'ok', true,
    'group_id', p_grupo_id,
    'matches_reset', v_matches_reset,
    'ratings_reverted', v_ratings_reverted,
    'version', v_version + 1
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.te_lado_desde_pareja(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.te_build_participantes(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.te_pareja_referenciada_fuera(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.te_slot_pareja_actual(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.te_grupo_version_ok(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.te_grupo_bump_version(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.append_torneo_express_pareja_grupo(uuid, uuid, uuid, uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cambiar_torneo_express_jugador_grupo(uuid, uuid, uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reemplazar_torneo_express_pareja_grupo(uuid, uuid, uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retirar_torneo_express_pareja_grupo(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconciliar_torneo_express_grupo(uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.append_torneo_express_pareja_grupo(uuid, uuid, uuid, uuid, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_torneo_express_jugador_grupo(uuid, uuid, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reemplazar_torneo_express_pareja_grupo(uuid, uuid, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retirar_torneo_express_pareja_grupo(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconciliar_torneo_express_grupo(uuid, integer) TO authenticated;

COMMENT ON COLUMN public.torneo_express_partidos.participantes IS
  'Jugadores que disputaron el partido. Se llena al pasar a jugado y se borra al volver a pendiente. Los nombres son los de la pareja en ese momento.';
