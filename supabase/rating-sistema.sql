-- Sistema de rating Playtomic-style (1.00–7.00) para Riviera Open
-- Ejecutar en Supabase SQL Editor si aún no existe.

ALTER TABLE public.riviera_jugadores
  ADD COLUMN IF NOT EXISTS rating numeric DEFAULT 3.00,
  ADD COLUMN IF NOT EXISTS rating_partidos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_fiabilidad numeric DEFAULT 0.20;

CREATE TABLE IF NOT EXISTS public.rating_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  fecha timestamptz NOT NULL DEFAULT now(),
  rating_antes numeric NOT NULL,
  rating_despues numeric NOT NULL,
  delta numeric NOT NULL,
  modo_juego text NOT NULL,
  descripcion text,
  partido_ref text
);

CREATE UNIQUE INDEX IF NOT EXISTS rating_historial_jugador_partido_uidx
  ON public.rating_historial (jugador_id, partido_ref)
  WHERE partido_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS rating_historial_jugador_fecha_idx
  ON public.rating_historial (jugador_id, fecha DESC);

-- Aplica rating Elo-style a los 4 jugadores de un partido 2v2.
-- p_ganador: 'a' = pareja 1 (j1+j2), 'b' = pareja 2 (j3+j4)
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
  IF p_ganador IS NULL OR p_ganador NOT IN ('a', 'b') THEN
    RAISE EXCEPTION 'p_ganador debe ser ''a'' o ''b''';
  END IF;

  IF p_partido_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM rating_historial
    WHERE partido_ref = p_partido_ref AND jugador_id = p_j1
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(ids) u(id) WHERE id IS NULL) THEN
    RAISE EXCEPTION 'Los cuatro jugador_id son obligatorios';
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
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_rating_partido(
  uuid, uuid, uuid, uuid, text, text, text, text
) TO anon, authenticated;

GRANT SELECT ON public.rating_historial TO anon, authenticated;

ALTER TABLE public.rating_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rating_historial_select_public ON public.rating_historial;

CREATE POLICY rating_historial_select_public ON public.rating_historial
  FOR SELECT TO anon, authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
