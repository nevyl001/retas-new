-- =============================================================================
-- Fase 1 — Hardening de aplicar_rating_partido
-- =============================================================================
-- Confirmado en producción (2026-07-05):
--   - GRANT EXECUTE otorgado a: anon, authenticated, PUBLIC, postgres, service_role
--   - Sin ninguna validación de autenticación ni de organizador en el cuerpo
--   - Helpers ya activos y reutilizados tal cual:
--       _assert_rating_rpc_authenticated()
--       _assert_rating_rpc_organizador_caller(uuid)
-- No cambia fórmula de rating, no cambia firma de la función.
-- Idempotente: seguro de re-ejecutar.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.aplicar_rating_partido(
  p_j1 uuid,
  p_j2 uuid,
  p_j3 uuid,
  p_j4 uuid,
  p_ganador text,
  p_modo_juego text,
  p_partido_ref text DEFAULT NULL,
  p_descripcion text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  -- ── Fase 1: autorización (nuevo) ──
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

  -- ── Cuerpo original: cálculo de rating, sin cambios de lógica ──
  IF p_ganador IS NULL OR p_ganador NOT IN ('a', 'b') THEN
    RAISE EXCEPTION 'p_ganador debe ser ''a'' o ''b''';
  END IF;

  IF p_partido_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM rating_historial
    WHERE partido_ref = p_partido_ref
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

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
$$;

REVOKE ALL ON FUNCTION public.aplicar_rating_partido(uuid, uuid, uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aplicar_rating_partido(uuid, uuid, uuid, uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.aplicar_rating_partido(uuid, uuid, uuid, uuid, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
