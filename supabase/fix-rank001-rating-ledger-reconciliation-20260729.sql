-- =============================================================================
-- FIX RANK-001 -- rating y ledger oficial quedaban permanentemente
-- desincronizados tras corregir un resultado ya cerrado (auditoría 2026-07-29).
--
-- Causa raíz (doble, confirmada leyendo el código):
--   1) aplicar_rating_partido() (RPC, SECURITY DEFINER) tenía su PROPIO guard
--      de idempotencia: "si ya existe CUALQUIER fila en rating_historial para
--      este partido_ref, RETURN sin hacer nada" -- sin comparar si el
--      resultado nuevo es distinto del guardado. Arreglar solo el cliente
--      (src/lib/rivieraJugadores/aplicarRatingPartido.ts) no habría servido
--      de nada: el RPC volvía a cortar la ejecución de todos modos.
--   2) try_write_riviera_official_ledger() usaba
--      ON CONFLICT (participacion_id) DO NOTHING -- si la participación ya
--      tenía fila en el ledger, cualquier corrección posterior de puntos se
--      descartaba silenciosamente, sin actualizar ni el ledger ni
--      riviera_official_player_totals.
--
-- Alcance de este fix:
--   A) aplicar_rating_partido(): en vez de "ya existe -> no hacer nada",
--      ahora compara el ganador YA REGISTRADO (signo del delta de p_j1 --
--      matemáticamente garantizado positivo si ganó, negativo si perdió,
--      dado que delta = k*(s-e) con s en {0,1} y e estrictamente en (0,1))
--      contra el nuevo p_ganador:
--        - Si coincide -> idempotencia real, RETURN sin tocar nada (mismo
--          comportamiento que antes para el caso que SÍ era correcto).
--        - Si difiere -> revierte el efecto de ESTE partido_ref para los 4
--          jugadores (restaura rating a rating_antes, decrementa
--          rating_partidos, recalcula fiabilidad, borra las filas viejas de
--          rating_historial) y continúa con el cálculo normal más abajo, que
--          aplica el resultado nuevo desde cero.
--      LIMITACIÓN CONOCIDA (documentada, no oculta): esto revierte
--      correctamente el efecto de ESE partido específico. Si alguno de los 4
--      jugadores jugó OTRO partido después de este y antes de la corrección,
--      ese otro partido calculó su propio delta usando un rating que ya
--      incluía el resultado ahora revertido -- este fix NO re-encadena
--      automáticamente esos partidos intermedios (requeriría un motor de
--      re-simulación completo del historial, fuera de alcance de esta fase).
--      En la práctica esto cubre el caso real reportado (corregir un
--      resultado poco después de cerrarlo, antes de que haya más partidos).
--
--   B) try_write_riviera_official_ledger(): ON CONFLICT ahora hace UPDATE en
--      vez de DO NOTHING cuando los puntos cambiaron (WHERE points IS
--      DISTINCT FROM), y ajusta riviera_official_player_totals.points_total
--      por el DELTA (puntos_nuevos - puntos_viejos), no por un re-sumado
--      ciego -- esto SÍ es seguro sin problema de encadenamiento porque
--      points_total es una suma agregada simple, no una serie secuencial
--      como el rating.
--
-- Autorización: sin cambios -- ambas funciones conservan exactamente los
-- mismos guards de _assert_rating_rpc_authenticated() /
-- _assert_rating_rpc_organizador_caller() / _is_official_ranking_emitter()
-- ya vigentes desde el hotfix de seguridad del 2026-07-26.
--
-- Rollback: rollback-rank001-rating-ledger-reconciliation-20260729.sql
-- Verificación: verify-rank001-rating-ledger-reconciliation-20260729.sql
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.aplicar_rating_partido(p_j1 uuid, p_j2 uuid, p_j3 uuid, p_j4 uuid, p_ganador text, p_modo_juego text, p_partido_ref text DEFAULT NULL::text, p_descripcion text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ids uuid[] := ARRAY[p_j1, p_j2, p_j3, p_j4];
  v_org uuid;
  r record;
  ra numeric;
  rb numeric;
  ea numeric;
  eb numeric;
  sa numeric;
  sb numeric;
  k numeric;
  delta_a numeric;
  delta_b numeric;
  antes numeric;
  despues numeric;
  partidos int;
  fiab numeric;
  d numeric := 0.4;
  v_prev_delta_j1 numeric;
  v_prev_ganador text;
BEGIN
  -- ── Fase 1: autorización (sin cambios) ──
  PERFORM public._assert_rating_rpc_authenticated();

  IF EXISTS (SELECT 1 FROM unnest(ids) u(id) WHERE id IS NULL) THEN
    RAISE EXCEPTION 'Los cuatro jugador_id son obligatorios';
  END IF;

  FOR v_org IN
    SELECT DISTINCT organizador_id
    FROM public.riviera_jugadores
    WHERE id = ANY(ids)
  LOOP
    PERFORM public._assert_rating_rpc_organizador_caller(v_org);
  END LOOP;

  IF p_ganador IS NULL OR p_ganador NOT IN ('a', 'b') THEN
    RAISE EXCEPTION 'p_ganador debe ser ''a'' o ''b''';
  END IF;

  -- ── Reconciliación (nuevo, RANK-001) ──
  -- Antes: "si ya existe cualquier fila para este partido_ref, RETURN".
  -- Ahora: comparar el resultado registrado contra el nuevo; solo hacer
  -- no-op si de verdad es el mismo resultado.
  IF p_partido_ref IS NOT NULL THEN
    SELECT delta INTO v_prev_delta_j1
    FROM rating_historial
    WHERE partido_ref = p_partido_ref AND jugador_id = p_j1
    LIMIT 1;

    IF v_prev_delta_j1 IS NOT NULL THEN
      v_prev_ganador := CASE WHEN v_prev_delta_j1 > 0 THEN 'a' ELSE 'b' END;

      IF v_prev_ganador = p_ganador THEN
        RETURN; -- idempotencia real: mismo resultado ya aplicado.
      END IF;

      -- Resultado cambió: revertir el efecto de ESTE partido_ref para los
      -- jugadores que tengan historial aquí (ver limitación documentada
      -- arriba sobre partidos intermedios no re-encadenados).
      FOR r IN
        SELECT rh.jugador_id, rh.rating_antes
        FROM rating_historial rh
        WHERE rh.partido_ref = p_partido_ref
      LOOP
        UPDATE riviera_jugadores
        SET
          rating = r.rating_antes,
          rating_partidos = GREATEST(0, COALESCE(rating_partidos, 1) - 1),
          rating_fiabilidad = LEAST(1.0, 0.2 + GREATEST(0, COALESCE(rating_partidos, 1) - 1) * 0.04),
          updated_at = now()
        WHERE id = r.jugador_id;
      END LOOP;

      DELETE FROM rating_historial WHERE partido_ref = p_partido_ref;
    END IF;
  END IF;

  -- ── Cálculo del resultado (nuevo o recién revertido) -- sin cambios de
  --    lógica respecto al original ──
  SELECT
    COALESCE(AVG(CASE WHEN id IN (p_j1, p_j2) THEN rating END), 3.0),
    COALESCE(AVG(CASE WHEN id IN (p_j3, p_j4) THEN rating END), 3.0)
  INTO ra, rb
  FROM riviera_jugadores
  WHERE id = ANY(ids);

  ea := 1.0 / (1.0 + power(10.0, (rb - ra) / d));
  eb := 1.0 - ea;

  IF p_ganador = 'a' THEN
    sa := 1.0;
    sb := 0.0;
  ELSE
    sa := 0.0;
    sb := 1.0;
  END IF;

  k := 0.10;

  delta_a := k * (sa - ea);
  delta_b := k * (sb - eb);

  FOR r IN
    SELECT id,
      COALESCE(rating, 3.0) AS rating,
      COALESCE(rating_partidos, 0) AS rating_partidos,
      COALESCE(rating_fiabilidad, 0.2) AS rating_fiabilidad
    FROM riviera_jugadores
    WHERE id = ANY(ids)
  LOOP
    antes := r.rating;
    IF r.id IN (p_j1, p_j2) THEN
      despues := GREATEST(1.0, LEAST(7.0, antes + delta_a));
    ELSE
      despues := GREATEST(1.0, LEAST(7.0, antes + delta_b));
    END IF;

    partidos := r.rating_partidos + 1;
    fiab := LEAST(1.0, 0.2 + partidos * 0.04);

    UPDATE riviera_jugadores
    SET
      rating = ROUND(despues::numeric, 2),
      rating_partidos = partidos,
      rating_fiabilidad = ROUND(fiab::numeric, 2),
      updated_at = now()
    WHERE id = r.id;

    INSERT INTO rating_historial (
      jugador_id, fecha, rating_antes, rating_despues, delta,
      modo_juego, descripcion, partido_ref
    ) VALUES (
      r.id,
      now(),
      ROUND(antes::numeric, 2),
      ROUND(despues::numeric, 2),
      ROUND((despues - antes)::numeric, 2),
      p_modo_juego,
      p_descripcion,
      p_partido_ref
    )
    ON CONFLICT (jugador_id, partido_ref) WHERE partido_ref IS NOT NULL DO NOTHING;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.try_write_riviera_official_ledger(p_participacion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p record;
  v_organizador_id uuid;
  v_key uuid;
  v_points integer;
  v_subtipo text;
  v_club_name text;
  v_ledger_id uuid;
  v_prev_points integer;
  v_delta integer;
  v_valid_types text[] := ARRAY[
    'reta',
    'torneo_express',
    'liga',
    'americano',
    'duelo_2v2'
  ];
BEGIN
  IF p_participacion_id IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'null_participacion_id');
  END IF;

  SELECT
    jp.id,
    jp.jugador_id,
    jp.tipo_evento,
    jp.evento_id,
    jp.evento_nombre,
    jp.puntos_obtenidos,
    jp.metadata,
    jp.created_at
  INTO v_p
  FROM public.jugador_participaciones jp
  WHERE jp.id = p_participacion_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'participacion_not_found');
  END IF;

  v_subtipo := v_p.metadata->>'subtipo';
  IF v_subtipo = 'ajuste_manual' THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'ajuste_manual');
  END IF;

  IF NOT (v_p.tipo_evento::text = ANY (v_valid_types)) THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'invalid_event_type',
      'tipo_evento', v_p.tipo_evento
    );
  END IF;

  v_points := GREATEST(0, COALESCE(v_p.puntos_obtenidos, 0));
  IF v_points <= 0 THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'no_positive_points');
  END IF;

  -- Club real donde se jugó el evento (no el de origen del perfil).
  BEGIN
    v_organizador_id := NULLIF(trim(v_p.metadata->>'organizador_id'), '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_organizador_id := NULL;
  END;

  IF v_organizador_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'missing_local_organizador_id'
    );
  END IF;

  IF NOT public._is_official_ranking_emitter(v_organizador_id) THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'organizer_not_authorized');
  END IF;

  v_key := public._resolve_official_player_key(v_p.jugador_id);
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'no_official_identity');
  END IF;

  SELECT coalesce(u.name, u.email, 'Club')
  INTO v_club_name
  FROM public.users u
  WHERE u.id = v_organizador_id;

  -- ── Reconciliación (nuevo, RANK-001) ──
  -- Antes: ON CONFLICT (participacion_id) DO NOTHING -- una corrección de
  -- puntos posterior se descartaba en silencio. Ahora: si ya existe una fila
  -- para esta participación y los puntos cambiaron, se actualiza el ledger
  -- Y se ajustan los totales por el delta (no por un re-sumado ciego --
  -- points_total es una suma agregada simple, sin problema de encadenamiento
  -- secuencial como el rating).
  SELECT points INTO v_prev_points
  FROM public.riviera_official_points_ledger
  WHERE participacion_id = p_participacion_id;

  IF v_prev_points IS NOT NULL AND v_prev_points = v_points THEN
    RETURN jsonb_build_object(
      'status', 'already_exists',
      'participacion_id', p_participacion_id
    );
  END IF;

  INSERT INTO public.riviera_official_points_ledger (
    official_player_key,
    source_organizer_id,
    source_local_jugador_id,
    participacion_id,
    event_type,
    event_id,
    event_name,
    points,
    source_club_name,
    created_at
  ) VALUES (
    v_key,
    v_organizador_id,
    v_p.jugador_id,
    p_participacion_id,
    v_p.tipo_evento,
    v_p.evento_id,
    v_p.evento_nombre,
    v_points,
    v_club_name,
    COALESCE(v_p.created_at, now())
  )
  ON CONFLICT (participacion_id) DO UPDATE SET
    points = EXCLUDED.points,
    event_name = EXCLUDED.event_name,
    source_club_name = EXCLUDED.source_club_name
  RETURNING id INTO v_ledger_id;

  v_delta := v_points - COALESCE(v_prev_points, 0);

  INSERT INTO public.riviera_official_player_totals (
    official_player_key,
    points_total,
    last_activity_at
  ) VALUES (
    v_key,
    v_delta,
    now()
  )
  ON CONFLICT (official_player_key) DO UPDATE
  SET
    points_total = riviera_official_player_totals.points_total + v_delta,
    last_activity_at = EXCLUDED.last_activity_at,
    updated_at = now();

  RETURN jsonb_build_object(
    'status', CASE WHEN v_prev_points IS NULL THEN 'inserted' ELSE 'updated' END,
    'ledger_id', v_ledger_id,
    'official_player_key', v_key,
    'points', v_points,
    'previous_points', v_prev_points,
    'participacion_id', p_participacion_id
  );
END;
$function$;

-- ── Verificación final dentro de la misma transacción ─────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.aplicar_rating_partido(uuid,uuid,uuid,uuid,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: aplicar_rating_partido no existe tras el CREATE OR REPLACE';
  END IF;
  IF to_regprocedure('public.try_write_riviera_official_ledger(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: try_write_riviera_official_ledger no existe tras el CREATE OR REPLACE';
  END IF;
END $$;

-- Revisar el resultado con calma antes de aceptar. Cuando estés conforme:
--   COMMIT;
-- Si algo se ve mal:
--   ROLLBACK;
