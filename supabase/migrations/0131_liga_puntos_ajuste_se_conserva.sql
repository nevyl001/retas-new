-- El ajuste administrativo queda como delta sobre los juegos ya jugados.
-- La siguiente jornada suma sus puntos encima de ese total.
-- No cambia el puntaje oficial vigente: solo guarda el delta para el próximo cierre.

ALTER TABLE public.liga_inscripciones
  ADD COLUMN IF NOT EXISTS puntos_ajuste_delta integer NOT NULL DEFAULT 0;

WITH aportes AS (
  SELECT j.liga_id, par.jugador1_id AS jugador_id, COALESCE(p.score_pareja1, 0) AS pts
  FROM public.liga_partidos p
  JOIN public.liga_jornadas j ON j.id = p.jornada_id
  JOIN public.liga_jornada_parejas par ON par.id = p.pareja1_id
  WHERE p.estado = 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.liga_partidos x
      WHERE x.jornada_id = p.jornada_id
        AND x.estado <> 'completed'
    )
  UNION ALL
  SELECT j.liga_id, par.jugador2_id, COALESCE(p.score_pareja1, 0)
  FROM public.liga_partidos p
  JOIN public.liga_jornadas j ON j.id = p.jornada_id
  JOIN public.liga_jornada_parejas par ON par.id = p.pareja1_id
  WHERE p.estado = 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.liga_partidos x
      WHERE x.jornada_id = p.jornada_id
        AND x.estado <> 'completed'
    )
  UNION ALL
  SELECT j.liga_id, par.jugador1_id, COALESCE(p.score_pareja2, 0)
  FROM public.liga_partidos p
  JOIN public.liga_jornadas j ON j.id = p.jornada_id
  JOIN public.liga_jornada_parejas par ON par.id = p.pareja2_id
  WHERE p.estado = 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.liga_partidos x
      WHERE x.jornada_id = p.jornada_id
        AND x.estado <> 'completed'
    )
  UNION ALL
  SELECT j.liga_id, par.jugador2_id, COALESCE(p.score_pareja2, 0)
  FROM public.liga_partidos p
  JOIN public.liga_jornadas j ON j.id = p.jornada_id
  JOIN public.liga_jornada_parejas par ON par.id = p.pareja2_id
  WHERE p.estado = 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.liga_partidos x
      WHERE x.jornada_id = p.jornada_id
        AND x.estado <> 'completed'
    )
),
raw AS (
  SELECT liga_id, jugador_id, SUM(pts)::integer AS puntos_partidos
  FROM aportes
  GROUP BY liga_id, jugador_id
)
UPDATE public.liga_inscripciones i
SET puntos_ajuste_delta =
  i.puntos - (COALESCE(r.puntos_partidos, 0) + COALESCE(i.puntos_heredados, 0))
FROM raw r
WHERE r.liga_id = i.liga_id
  AND r.jugador_id = i.jugador_id
  AND i.puntos_ajuste_motivo IS NOT NULL
  AND btrim(i.puntos_ajuste_motivo) <> ''
  AND i.puntos_ajuste_delta = 0;
