-- ══════════════════════════════════════════════════════════════════════════════
-- Liga modalidad parejas_fijas_playoffs — columnas aditivas + RPCs
--
-- - ligas.playoff_seeds / playoff_seeded_at: fotografía congelada 1–8
-- - liga_partidos.fase / bracket_slot / liga_id: distinguir playoffs + UNIQUE
-- - CHECK: bracket_slot NOT NULL ⇒ liga_id NOT NULL
-- - update_liga_partido_score_parejas_fijas_playoffs: solo marcador (force=corrección)
-- - liga_playoffs_freeze_and_generate_jornada9: FOR UPDATE + seeds solo una vez
--   + cruces derivados SOLO de playoff_seeds (no del cliente)
--
-- Compatible con ligas existentes (columnas NULL, sin backfill).
-- NO sustituye update_liga_partido_score_parejas_fijas (legacy).
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ligas
  ADD COLUMN IF NOT EXISTS playoff_seeds jsonb NULL;

ALTER TABLE public.ligas
  ADD COLUMN IF NOT EXISTS playoff_seeded_at timestamptz NULL;

COMMENT ON COLUMN public.ligas.playoff_seeds IS
  'parejas_fijas_playoffs: {"1":"equipo_uuid",...,"8":"equipo_uuid"} al cerrar fase regular';

COMMENT ON COLUMN public.ligas.playoff_seeded_at IS
  'Timestamp de congelación de playoff_seeds (fase regular cerrada)';

ALTER TABLE public.liga_partidos
  ADD COLUMN IF NOT EXISTS fase text NULL;

ALTER TABLE public.liga_partidos
  ADD COLUMN IF NOT EXISTS bracket_slot text NULL;

ALTER TABLE public.liga_partidos
  ADD COLUMN IF NOT EXISTS liga_id uuid NULL REFERENCES public.ligas(id);

COMMENT ON COLUMN public.liga_partidos.fase IS
  'regular | semifinal | classification | final (NULL = histórico / otra modalidad)';

COMMENT ON COLUMN public.liga_partidos.bracket_slot IS
  'SF1 | SF2 | CL1 | CL2 | FINAL (NULL en regulares)';

-- Garantía: un slot de bracket nunca puede existir sin liga_id (el UNIQUE lo necesita).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'liga_partidos_bracket_requires_liga_id'
  ) THEN
    ALTER TABLE public.liga_partidos
      ADD CONSTRAINT liga_partidos_bracket_requires_liga_id
      CHECK (bracket_slot IS NULL OR liga_id IS NOT NULL);
  END IF;
END $$;

-- Idempotencia: una liga no puede tener dos partidos con el mismo bracket_slot.
-- Exige liga_id NOT NULL en el predicado (Postgres trata NULL como distinto en UNIQUE).
DROP INDEX IF EXISTS public.liga_partidos_liga_bracket_slot_uidx;
CREATE UNIQUE INDEX liga_partidos_liga_bracket_slot_uidx
  ON public.liga_partidos (liga_id, bracket_slot)
  WHERE bracket_slot IS NOT NULL AND liga_id IS NOT NULL;

-- ── Score atómico playoffs (mismo patrón que parejas_fijas legacy) ───────────
-- force: SOLO permite sobrescribir un marcador completed distinto.
-- No toca seeds, bracket, participantes ni modalidad.
CREATE OR REPLACE FUNCTION public.update_liga_partido_score_parejas_fijas_playoffs(
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

  IF p_set_scores IS NULL
     OR (p_set_scores ->> 'format') IS DISTINCT FROM 'parejas_fijas_playoffs' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  -- Empate principal sin STB (y sin WO) no debe cerrarse a nivel DB.
  IF COALESCE((p_set_scores ->> 'wo')::boolean, false) IS NOT TRUE
     AND p_score1 = p_score2
     AND (p_set_scores -> 'stb') IS NULL
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stb_required');
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

REVOKE ALL ON FUNCTION public.update_liga_partido_score_parejas_fijas_playoffs(uuid, integer, integer, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_liga_partido_score_parejas_fijas_playoffs(uuid, integer, integer, jsonb, boolean)
  TO authenticated;

-- ── Congelar seeds + generar Jornada 9 (SF/CL) en una transacción ───────────
-- Cruces SIEMPRE derivados de playoff_seeds congelados (1v4, 2v3, 5v8, 6v7).
-- Los uuid p_sf*/p_cl* se ignoran para el emparejamiento (firma estable p/compat).
-- Concurrencia: SELECT … FOR UPDATE sobre ligas serializa dos llamadas.
-- Si playoff_seeds ya existe, NUNCA se reescribe.
CREATE OR REPLACE FUNCTION public.liga_playoffs_freeze_and_generate_jornada9(
  p_liga_id uuid,
  p_seeds jsonb,
  p_sf1_p1 uuid,
  p_sf1_p2 uuid,
  p_sf2_p1 uuid,
  p_sf2_p2 uuid,
  p_cl1_p1 uuid,
  p_cl1_p2 uuid,
  p_cl2_p1 uuid,
  p_cl2_p2 uuid,
  p_canchas integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizador uuid;
  v_modalidad text;
  v_seeds jsonb;
  v_jornada_id uuid;
  v_canchas integer;
  v_equipo record;
  v_pareja_id uuid;
  v_map jsonb := '{}'::jsonb;
  v_slots text[] := ARRAY['SF1','SF2','CL1','CL2'];
  v_fases text[] := ARRAY['semifinal','semifinal','classification','classification'];
  v_seed_home text[] := ARRAY['1','2','5','6'];
  v_seed_away text[] := ARRAY['4','3','8','7'];
  v_eq1 uuid;
  v_eq2 uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_i integer;
  v_existing integer;
  v_regular_done integer;
BEGIN
  -- Parámetros de pareja del cliente no se usan (evita reseeding / cruces adulterados).
  PERFORM p_sf1_p1, p_sf1_p2, p_sf2_p1, p_sf2_p2, p_cl1_p1, p_cl1_p2, p_cl2_p1, p_cl2_p2;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT organizador_id, modalidad, playoff_seeds
    INTO v_organizador, v_modalidad, v_seeds
  FROM public.ligas
  WHERE id = p_liga_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liga no encontrada';
  END IF;

  IF v_organizador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre esta liga';
  END IF;

  IF v_modalidad IS DISTINCT FROM 'parejas_fijas_playoffs' THEN
    RAISE EXCEPTION 'Modalidad incorrecta para playoffs';
  END IF;

  v_canchas := GREATEST(1, COALESCE(p_canchas, 3));

  SELECT COUNT(*)::integer INTO v_regular_done
  FROM public.liga_partidos
  WHERE liga_id = p_liga_id
    AND fase = 'regular'
    AND estado = 'completed';

  IF v_seeds IS NULL THEN
    IF v_regular_done < 56 THEN
      RAISE EXCEPTION 'Fase regular incompleta (%/56)', v_regular_done;
    END IF;
    IF p_seeds IS NULL OR jsonb_typeof(p_seeds) <> 'object' THEN
      RAISE EXCEPTION 'Seeds inválidos';
    END IF;
    IF p_seeds->>'1' IS NULL OR p_seeds->>'2' IS NULL OR p_seeds->>'3' IS NULL
       OR p_seeds->>'4' IS NULL OR p_seeds->>'5' IS NULL OR p_seeds->>'6' IS NULL
       OR p_seeds->>'7' IS NULL OR p_seeds->>'8' IS NULL THEN
      RAISE EXCEPTION 'Seeds incompletos (se requieren claves 1..8)';
    END IF;

    UPDATE public.ligas
    SET playoff_seeds = p_seeds,
        playoff_seeded_at = now()
    WHERE id = p_liga_id
      AND playoff_seeds IS NULL;

    SELECT playoff_seeds INTO v_seeds
    FROM public.ligas
    WHERE id = p_liga_id;

    IF v_seeds IS NULL THEN
      RAISE EXCEPTION 'No se pudieron congelar seeds';
    END IF;
  END IF;
  -- Si v_seeds ya existía: no se reescribe (fotografía única).

  SELECT id INTO v_jornada_id
  FROM public.liga_jornadas
  WHERE liga_id = p_liga_id AND numero = 9
  LIMIT 1;

  IF v_jornada_id IS NULL THEN
    INSERT INTO public.liga_jornadas (liga_id, numero, estado)
    VALUES (p_liga_id, 9, 'upcoming')
    RETURNING id INTO v_jornada_id;
  END IF;

  FOR v_equipo IN
    SELECT e.id AS equipo_id, e.jugador1_id, e.jugador2_id
    FROM public.liga_equipos e
    WHERE e.liga_id = p_liga_id
      AND e.id::text IN (
        v_seeds->>'1', v_seeds->>'2', v_seeds->>'3', v_seeds->>'4',
        v_seeds->>'5', v_seeds->>'6', v_seeds->>'7', v_seeds->>'8'
      )
  LOOP
    SELECT id INTO v_pareja_id
    FROM public.liga_jornada_parejas
    WHERE jornada_id = v_jornada_id AND equipo_id = v_equipo.equipo_id
    LIMIT 1;

    IF v_pareja_id IS NULL THEN
      INSERT INTO public.liga_jornada_parejas (
        jornada_id, equipo_id, jugador1_id, jugador2_id
      ) VALUES (
        v_jornada_id, v_equipo.equipo_id, v_equipo.jugador1_id, v_equipo.jugador2_id
      )
      RETURNING id INTO v_pareja_id;
    END IF;

    v_map := v_map || jsonb_build_object(v_equipo.equipo_id::text, v_pareja_id::text);
  END LOOP;

  FOR v_i IN 1..4 LOOP
    SELECT COUNT(*)::integer INTO v_existing
    FROM public.liga_partidos
    WHERE liga_id = p_liga_id AND bracket_slot = v_slots[v_i];

    IF v_existing > 0 THEN
      CONTINUE;
    END IF;

    v_eq1 := (v_seeds ->> v_seed_home[v_i])::uuid;
    v_eq2 := (v_seeds ->> v_seed_away[v_i])::uuid;
    v_p1 := (v_map ->> v_eq1::text)::uuid;
    v_p2 := (v_map ->> v_eq2::text)::uuid;

    IF v_p1 IS NULL OR v_p2 IS NULL THEN
      RAISE EXCEPTION 'Falta pareja de jornada para slot %', v_slots[v_i];
    END IF;

    INSERT INTO public.liga_partidos (
      jornada_id, pareja1_id, pareja2_id, ronda, cancha, estado,
      score_pareja1, score_pareja2, fase, bracket_slot, liga_id
    ) VALUES (
      v_jornada_id, v_p1, v_p2, 1, ((v_i - 1) % v_canchas) + 1, 'upcoming',
      NULL, NULL, v_fases[v_i], v_slots[v_i], p_liga_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'jornada_id', v_jornada_id,
    'seeds', v_seeds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.liga_playoffs_freeze_and_generate_jornada9(
  uuid, jsonb, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liga_playoffs_freeze_and_generate_jornada9(
  uuid, jsonb, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer
) TO authenticated;

-- Verificación: funciones nuevas existen; legacy de sets intacta.
DO $$
BEGIN
  IF to_regprocedure(
    'public.update_liga_partido_score_parejas_fijas_playoffs(uuid,integer,integer,jsonb,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION 'RPC playoffs score ausente';
  END IF;
  IF to_regprocedure(
    'public.liga_playoffs_freeze_and_generate_jornada9(uuid,jsonb,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'RPC freeze J9 ausente';
  END IF;
  -- No tocar / no exigir drop de legacy:
  -- update_liga_partido_score_parejas_fijas sigue siendo el contrato de sets.
END $$;
