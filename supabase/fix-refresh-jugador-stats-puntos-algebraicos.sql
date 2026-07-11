-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: refresh_jugador_stats — suma algebraica de puntos (sin GREATEST clamp)
--
-- Bug: COALESCE(SUM(GREATEST(0, jp.puntos_obtenidos)), 0) descartaba ajustes
-- negativos (equivalente al Math.max(0, …) corregido en rebuildJugadorStats.ts).
--
-- ORDEN EN PROD:
--   1) Correr PRE-CHECK (solo lectura) abajo
--   2) Correr CREATE OR REPLACE + GRANT + NOTIFY
--   3) Correr POST-CHECK (refresh Nevyl + verificar grants)
--   4) Después: auditoría de mismatches + UPDATE masivo jugador_stats
--
-- NO usar DROP FUNCTION salvo error 42P13 (cambio de firma); DROP borra GRANTs.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PRE-CHECK (solo lectura): definición actual y grants ───────────────────
/*
SELECT pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'refresh_jugador_stats';

SELECT
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'refresh_jugador_stats'
ORDER BY grantee, privilege_type;
*/

-- ── FIX: único cambio = línea puntos_totales en el SELECT agregado ─────────

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
    COALESCE(SUM(jp.puntos_obtenidos), 0)::integer AS puntos_totales,
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

-- CREATE OR REPLACE conserva GRANTs existentes (misma firma). Re-aplicar por seguridad:
GRANT EXECUTE ON FUNCTION public.refresh_jugador_stats(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── POST-CHECK ─────────────────────────────────────────────────────────────
/*
SELECT public.refresh_jugador_stats('810f9308-fe0a-4c63-b9aa-e44fca6fa243'::uuid);

SELECT js.puntos_totales, s.suma_esperada
FROM public.jugador_stats js
CROSS JOIN (
  SELECT COALESCE(SUM(jp.puntos_obtenidos), 0)::integer AS suma_esperada
  FROM public.jugador_participaciones jp
  WHERE jp.jugador_id = '810f9308-fe0a-4c63-b9aa-e44fca6fa243'::uuid
) s
WHERE js.jugador_id = '810f9308-fe0a-4c63-b9aa-e44fca6fa243'::uuid;
-- Esperado: puntos_totales = suma_esperada = 345 (Nevyl)
*/
