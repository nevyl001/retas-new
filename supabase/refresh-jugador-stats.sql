-- Recalcula jugador_stats desde jugador_participaciones (SECURITY DEFINER, evita RLS 403).
-- Ejecutar en Supabase SQL Editor.
--
-- En prod puede existir una versión anterior con DEFAULT en el parámetro;
-- hay que dropearla antes (error 42P13 si no).

DROP FUNCTION IF EXISTS public.refresh_jugador_stats(uuid);

CREATE OR REPLACE FUNCTION public.refresh_jugador_stats(p_jugador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats record;
BEGIN
  IF p_jugador_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(GREATEST(0, jp.puntos_obtenidos)), 0)::integer AS puntos_totales,
    COALESCE(SUM(jp.sets_favor), 0)::integer AS sets_favor_total,
    COALESCE(SUM(jp.sets_contra), 0)::integer AS sets_contra_total,
    COUNT(*) FILTER (
      WHERE COALESCE(jp.metadata->>'subtipo', '') <> 'liga_inscripcion'
        AND COALESCE(jp.metadata->>'subtipo', '') <> 'ajuste_manual'
    )::integer AS participaciones_solo,
    COUNT(*) FILTER (WHERE jp.tipo_evento::text = 'reta')::integer AS total_retas,
    COUNT(*) FILTER (WHERE jp.tipo_evento::text = 'torneo_express')::integer AS total_torneos_express,
    COUNT(*) FILTER (WHERE jp.tipo_evento::text = 'liga')::integer AS total_ligas,
    COUNT(*) FILTER (WHERE jp.tipo_evento::text = 'americano')::integer AS total_americanos,
    COALESCE(SUM(
      CASE
        WHEN COALESCE(jp.metadata->>'subtipo', '') IN ('liga_inscripcion', 'ajuste_manual') THEN 0
        ELSE COALESCE(
          NULLIF(jp.metadata->>'partidos_ganados', '')::integer,
          CASE WHEN jp.resultado::text = 'victoria' THEN 1 ELSE 0 END
        )
      END
    ), 0)::integer AS victorias,
    COALESCE(SUM(
      CASE
        WHEN COALESCE(jp.metadata->>'subtipo', '') IN ('liga_inscripcion', 'ajuste_manual') THEN 0
        ELSE COALESCE(
          NULLIF(jp.metadata->>'partidos_perdidos', '')::integer,
          CASE WHEN jp.resultado::text = 'derrota' THEN 1 ELSE 0 END
        )
      END
    ), 0)::integer AS derrotas,
    COALESCE(SUM(
      CASE
        WHEN COALESCE(jp.metadata->>'subtipo', '') IN ('liga_inscripcion', 'ajuste_manual') THEN 0
        ELSE COALESCE(
          NULLIF(jp.metadata->>'partidos_empatados', '')::integer,
          CASE WHEN jp.resultado::text = 'empate' THEN 1 ELSE 0 END
        )
      END
    ), 0)::integer AS empates,
    MAX(jp.fecha) FILTER (
      WHERE COALESCE(jp.metadata->>'subtipo', '') NOT IN ('liga_inscripcion', 'ajuste_manual')
    ) AS ultima_actividad
  INTO v_stats
  FROM public.jugador_participaciones jp
  WHERE jp.jugador_id = p_jugador_id;

  INSERT INTO public.jugador_stats (
    jugador_id,
    total_partidos,
    victorias,
    derrotas,
    empates,
    participaciones_solo,
    pct_victorias,
    total_retas,
    total_torneos_express,
    total_ligas,
    total_americanos,
    sets_favor_total,
    sets_contra_total,
    racha_actual,
    ultima_actividad,
    puntos_totales,
    updated_at
  )
  VALUES (
    p_jugador_id,
    GREATEST(0, COALESCE(v_stats.victorias, 0) + COALESCE(v_stats.derrotas, 0)),
    COALESCE(v_stats.victorias, 0),
    COALESCE(v_stats.derrotas, 0),
    COALESCE(v_stats.empates, 0),
    COALESCE(v_stats.participaciones_solo, 0),
    CASE
      WHEN COALESCE(v_stats.victorias, 0) + COALESCE(v_stats.derrotas, 0) > 0 THEN
        ROUND(
          (v_stats.victorias::numeric /
            (v_stats.victorias + v_stats.derrotas)::numeric) * 10000
        ) / 100
      ELSE 0
    END,
    COALESCE(v_stats.total_retas, 0),
    COALESCE(v_stats.total_torneos_express, 0),
    COALESCE(v_stats.total_ligas, 0),
    COALESCE(v_stats.total_americanos, 0),
    COALESCE(v_stats.sets_favor_total, 0),
    COALESCE(v_stats.sets_contra_total, 0),
    '',
    v_stats.ultima_actividad,
    COALESCE(v_stats.puntos_totales, 0),
    now()
  )
  ON CONFLICT (jugador_id) DO UPDATE SET
    total_partidos = EXCLUDED.total_partidos,
    victorias = EXCLUDED.victorias,
    derrotas = EXCLUDED.derrotas,
    empates = EXCLUDED.empates,
    participaciones_solo = EXCLUDED.participaciones_solo,
    pct_victorias = EXCLUDED.pct_victorias,
    total_retas = EXCLUDED.total_retas,
    total_torneos_express = EXCLUDED.total_torneos_express,
    total_ligas = EXCLUDED.total_ligas,
    total_americanos = EXCLUDED.total_americanos,
    sets_favor_total = EXCLUDED.sets_favor_total,
    sets_contra_total = EXCLUDED.sets_contra_total,
    ultima_actividad = EXCLUDED.ultima_actividad,
    puntos_totales = EXCLUDED.puntos_totales,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_jugador_stats(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
