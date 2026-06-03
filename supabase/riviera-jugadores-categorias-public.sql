-- Categorías Riviera (Open, 1ra–6ta fuerza), perfil extendido y lectura pública
-- Ejecutar en Supabase después de riviera-jugadores-migration.sql

-- ── Columnas de perfil ──
ALTER TABLE public.riviera_jugadores
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS edad smallint,
  ADD COLUMN IF NOT EXISTS mano_dominante text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS visible_publico boolean NOT NULL DEFAULT true;

ALTER TABLE public.riviera_jugadores
  DROP CONSTRAINT IF EXISTS riviera_jugadores_categoria_check;

ALTER TABLE public.riviera_jugadores
  ADD CONSTRAINT riviera_jugadores_categoria_check CHECK (
    categoria IS NULL OR categoria IN (
      'open',
      '1ra_fuerza',
      '2da_fuerza',
      '3ra_fuerza',
      '4ta_fuerza',
      '5ta_fuerza',
      '6ta_fuerza'
    )
  );

ALTER TABLE public.riviera_jugadores
  DROP CONSTRAINT IF EXISTS riviera_jugadores_edad_check;

ALTER TABLE public.riviera_jugadores
  ADD CONSTRAINT riviera_jugadores_edad_check CHECK (
    edad IS NULL OR (edad >= 5 AND edad <= 99)
  );

ALTER TABLE public.riviera_jugadores
  DROP CONSTRAINT IF EXISTS riviera_jugadores_mano_check;

ALTER TABLE public.riviera_jugadores
  ADD CONSTRAINT riviera_jugadores_mano_check CHECK (
    mano_dominante IS NULL OR mano_dominante IN ('derecha', 'izquierda', 'ambidiestro')
  );

-- Migrar nivel antiguo → categoría deportiva
UPDATE public.riviera_jugadores
SET categoria = CASE nivel::text
  WHEN 'élite' THEN 'open'
  WHEN 'competición' THEN '1ra_fuerza'
  WHEN 'avanzado' THEN '2da_fuerza'
  WHEN 'intermedio' THEN '3ra_fuerza'
  WHEN 'iniciación' THEN '4ta_fuerza'
  ELSE '3ra_fuerza'
END
WHERE categoria IS NULL;

UPDATE public.riviera_jugadores
SET categoria = 'open'
WHERE categoria IS NULL;

ALTER TABLE public.riviera_jugadores
  ALTER COLUMN categoria SET DEFAULT 'open';

ALTER TABLE public.riviera_jugadores
  ALTER COLUMN categoria SET NOT NULL;

-- Puntos acumulados para ranking público
ALTER TABLE public.jugador_stats
  ADD COLUMN IF NOT EXISTS puntos_totales int NOT NULL DEFAULT 0;

-- ── Refrescar stats (incluye puntos_totales) ──
CREATE OR REPLACE FUNCTION public.refresh_jugador_stats(p_jugador_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_racha text;
  v_last_results text[];
  v_streak int;
  v_label text;
BEGIN
  FOR r IN
    SELECT j.id AS jugador_id
    FROM public.riviera_jugadores j
    WHERE p_jugador_id IS NULL OR j.id = p_jugador_id
  LOOP
    INSERT INTO public.jugador_stats (jugador_id)
    VALUES (r.jugador_id)
    ON CONFLICT (jugador_id) DO NOTHING;

    WITH agg AS (
      SELECT
        COUNT(*) FILTER (WHERE resultado IN ('victoria', 'derrota', 'empate'))::int AS total_partidos,
        COUNT(*) FILTER (WHERE resultado = 'victoria')::int AS victorias,
        COUNT(*) FILTER (WHERE resultado = 'derrota')::int AS derrotas,
        COUNT(*) FILTER (WHERE resultado = 'empate')::int AS empates,
        COUNT(*) FILTER (WHERE resultado = 'participación')::int AS participaciones_solo,
        COUNT(DISTINCT evento_id) FILTER (WHERE tipo_evento = 'reta')::int AS total_retas,
        COUNT(DISTINCT evento_id) FILTER (WHERE tipo_evento = 'torneo_express')::int AS total_torneos_express,
        COUNT(DISTINCT evento_id) FILTER (WHERE tipo_evento = 'liga')::int AS total_ligas,
        COUNT(DISTINCT evento_id) FILTER (WHERE tipo_evento = 'americano')::int AS total_americanos,
        COALESCE(SUM(sets_favor), 0)::int AS sets_favor_total,
        COALESCE(SUM(sets_contra), 0)::int AS sets_contra_total,
        COALESCE(SUM(puntos_obtenidos), 0)::int AS puntos_totales,
        MAX(fecha) AS ultima_actividad
      FROM public.jugador_participaciones
      WHERE jugador_id = r.jugador_id
    )
    UPDATE public.jugador_stats s
    SET
      total_partidos = COALESCE(a.total_partidos, 0),
      victorias = COALESCE(a.victorias, 0),
      derrotas = COALESCE(a.derrotas, 0),
      empates = COALESCE(a.empates, 0),
      participaciones_solo = COALESCE(a.participaciones_solo, 0),
      pct_victorias = CASE
        WHEN COALESCE(a.total_partidos, 0) > 0
        THEN ROUND((a.victorias::numeric / a.total_partidos::numeric) * 100, 2)
        ELSE 0
      END,
      total_retas = COALESCE(a.total_retas, 0),
      total_torneos_express = COALESCE(a.total_torneos_express, 0),
      total_ligas = COALESCE(a.total_ligas, 0),
      total_americanos = COALESCE(a.total_americanos, 0),
      sets_favor_total = COALESCE(a.sets_favor_total, 0),
      sets_contra_total = COALESCE(a.sets_contra_total, 0),
      puntos_totales = COALESCE(a.puntos_totales, 0),
      ultima_actividad = a.ultima_actividad,
      updated_at = now()
    FROM agg a
    WHERE s.jugador_id = r.jugador_id;

    SELECT array_agg(resultado::text ORDER BY fecha DESC, created_at DESC)
    INTO v_last_results
    FROM (
      SELECT resultado, fecha, created_at
      FROM public.jugador_participaciones
      WHERE jugador_id = r.jugador_id
        AND resultado IN ('victoria', 'derrota', 'empate')
      ORDER BY fecha DESC, created_at DESC
      LIMIT 12
    ) sub;

    v_racha := '';
    IF v_last_results IS NOT NULL AND array_length(v_last_results, 1) > 0 THEN
      v_label := v_last_results[1];
      v_streak := 1;
      FOR i IN 2 .. array_length(v_last_results, 1) LOOP
        IF v_last_results[i] = v_label THEN
          v_streak := v_streak + 1;
        ELSE
          EXIT;
        END IF;
      END LOOP;
      IF v_label = 'victoria' THEN
        v_racha := v_streak || ' victoria' || CASE WHEN v_streak > 1 THEN 's' ELSE '' END || ' seguida' || CASE WHEN v_streak > 1 THEN 's' ELSE '' END;
      ELSIF v_label = 'derrota' THEN
        v_racha := v_streak || ' derrota' || CASE WHEN v_streak > 1 THEN 's' ELSE '' END || ' seguida' || CASE WHEN v_streak > 1 THEN 's' ELSE '' END;
      ELSIF v_label = 'empate' THEN
        v_racha := v_streak || ' empate' || CASE WHEN v_streak > 1 THEN 's' ELSE '' END || ' seguido' || CASE WHEN v_streak > 1 THEN 's' ELSE '' END;
      END IF;
    END IF;

    UPDATE public.jugador_stats
    SET racha_actual = COALESCE(v_racha, '')
    WHERE jugador_id = r.jugador_id;
  END LOOP;
END;
$$;

SELECT public.refresh_jugador_stats(NULL);

-- ── RLS lectura pública (anon + authenticated) ──
DROP POLICY IF EXISTS riviera_jugadores_public_read ON public.riviera_jugadores;
CREATE POLICY riviera_jugadores_public_read ON public.riviera_jugadores
  FOR SELECT TO anon, authenticated
  USING (
    estado = 'activo'
    AND visible_publico = true
  );

DROP POLICY IF EXISTS jugador_stats_public_read ON public.jugador_stats;
CREATE POLICY jugador_stats_public_read ON public.jugador_stats
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_jugadores j
      WHERE j.id = jugador_stats.jugador_id
        AND j.estado = 'activo'
        AND j.visible_publico = true
    )
  );

DROP POLICY IF EXISTS jugador_participaciones_public_read ON public.jugador_participaciones;
CREATE POLICY jugador_participaciones_public_read ON public.jugador_participaciones
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_jugadores j
      WHERE j.id = jugador_participaciones.jugador_id
        AND j.estado = 'activo'
        AND j.visible_publico = true
    )
  );
