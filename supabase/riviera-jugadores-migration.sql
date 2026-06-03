-- Registro de Jugadores Riviera Open
-- Ejecutar en Supabase SQL Editor (staging → producción).

-- ── Enums ──
DO $$ BEGIN
  CREATE TYPE public.riviera_jugador_nivel AS ENUM (
    'iniciación',
    'intermedio',
    'avanzado',
    'competición',
    'élite'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.riviera_jugador_estado AS ENUM (
    'activo',
    'invitado',
    'archivado'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.jugador_tipo_evento AS ENUM (
    'reta',
    'torneo_express',
    'liga',
    'americano'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.jugador_resultado AS ENUM (
    'victoria',
    'derrota',
    'empate',
    'participación'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Perfil central ──
CREATE TABLE IF NOT EXISTS public.riviera_jugadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  slug text NOT NULL,
  foto_url text,
  email text,
  telefono text,
  whatsapp text,
  nivel public.riviera_jugador_nivel NOT NULL DEFAULT 'intermedio',
  genero text CHECK (genero IS NULL OR genero IN ('M', 'F', 'otro')),
  fecha_nacimiento date,
  club text,
  organizador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estado public.riviera_jugador_estado NOT NULL DEFAULT 'activo',
  legacy_player_id uuid,
  legacy_liga_jugador_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT riviera_jugadores_slug_org UNIQUE (organizador_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_riviera_jugadores_org ON public.riviera_jugadores(organizador_id);
CREATE INDEX IF NOT EXISTS idx_riviera_jugadores_slug ON public.riviera_jugadores(slug);
CREATE INDEX IF NOT EXISTS idx_riviera_jugadores_legacy_player ON public.riviera_jugadores(legacy_player_id)
  WHERE legacy_player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_riviera_jugadores_legacy_liga ON public.riviera_jugadores(legacy_liga_jugador_id)
  WHERE legacy_liga_jugador_id IS NOT NULL;

COMMENT ON TABLE public.riviera_jugadores IS
  'Registro central de jugadores Riviera Open por organizador';

-- ── Historial de participación ──
CREATE TABLE IF NOT EXISTS public.jugador_participaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  tipo_evento public.jugador_tipo_evento NOT NULL,
  evento_id uuid NOT NULL,
  evento_nombre text NOT NULL,
  fecha date NOT NULL DEFAULT (CURRENT_DATE),
  pareja_con text,
  resultado public.jugador_resultado NOT NULL DEFAULT 'participación',
  sets_favor int NOT NULL DEFAULT 0,
  sets_contra int NOT NULL DEFAULT 0,
  puntos_obtenidos int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jugador_participaciones_jugador
  ON public.jugador_participaciones(jugador_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_jugador_participaciones_evento
  ON public.jugador_participaciones(tipo_evento, evento_id);

-- Idempotencia básica por evento + resultado
CREATE UNIQUE INDEX IF NOT EXISTS idx_jugador_participaciones_dedup
  ON public.jugador_participaciones(jugador_id, tipo_evento, evento_id, resultado);

-- ── Estadísticas agregadas (tabla refrescada por función) ──
CREATE TABLE IF NOT EXISTS public.jugador_stats (
  jugador_id uuid PRIMARY KEY REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  total_partidos int NOT NULL DEFAULT 0,
  victorias int NOT NULL DEFAULT 0,
  derrotas int NOT NULL DEFAULT 0,
  empates int NOT NULL DEFAULT 0,
  participaciones_solo int NOT NULL DEFAULT 0,
  pct_victorias numeric(5, 2) NOT NULL DEFAULT 0,
  total_retas int NOT NULL DEFAULT 0,
  total_torneos_express int NOT NULL DEFAULT 0,
  total_ligas int NOT NULL DEFAULT 0,
  total_americanos int NOT NULL DEFAULT 0,
  sets_favor_total int NOT NULL DEFAULT 0,
  sets_contra_total int NOT NULL DEFAULT 0,
  racha_actual text NOT NULL DEFAULT '',
  ultima_actividad date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── updated_at trigger ──
CREATE OR REPLACE FUNCTION public.riviera_jugadores_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_riviera_jugadores_updated ON public.riviera_jugadores;
CREATE TRIGGER trg_riviera_jugadores_updated
  BEFORE UPDATE ON public.riviera_jugadores
  FOR EACH ROW EXECUTE FUNCTION public.riviera_jugadores_set_updated_at();

-- ── Refrescar estadísticas ──
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

-- Tras cada participación nueva
CREATE OR REPLACE FUNCTION public.trg_jugador_participaciones_refresh_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_jugador_stats(OLD.jugador_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_jugador_stats(NEW.jugador_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jugador_participaciones_stats ON public.jugador_participaciones;
CREATE TRIGGER trg_jugador_participaciones_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.jugador_participaciones
  FOR EACH ROW EXECUTE FUNCTION public.trg_jugador_participaciones_refresh_stats();

-- RPC para la app
CREATE OR REPLACE FUNCTION public.registrar_participacion_jugador(
  p_jugador_id uuid,
  p_tipo_evento public.jugador_tipo_evento,
  p_evento_id uuid,
  p_evento_nombre text,
  p_pareja_con text DEFAULT NULL,
  p_resultado public.jugador_resultado DEFAULT 'participación',
  p_sets_favor int DEFAULT 0,
  p_sets_contra int DEFAULT 0,
  p_puntos_obtenidos int DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_fecha date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_org uuid;
BEGIN
  SELECT organizador_id INTO v_org
  FROM public.riviera_jugadores
  WHERE id = p_jugador_id;

  IF v_org IS NULL OR v_org <> auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para registrar participación de este jugador';
  END IF;

  INSERT INTO public.jugador_participaciones (
    jugador_id,
    tipo_evento,
    evento_id,
    evento_nombre,
    fecha,
    pareja_con,
    resultado,
    sets_favor,
    sets_contra,
    puntos_obtenidos,
    metadata
  )
  VALUES (
    p_jugador_id,
    p_tipo_evento,
    p_evento_id,
    p_evento_nombre,
    p_fecha,
    NULLIF(trim(p_pareja_con), ''),
    p_resultado,
    COALESCE(p_sets_favor, 0),
    COALESCE(p_sets_contra, 0),
    COALESCE(p_puntos_obtenidos, 0),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (jugador_id, tipo_evento, evento_id, resultado)
  DO UPDATE SET
    evento_nombre = EXCLUDED.evento_nombre,
    fecha = EXCLUDED.fecha,
    sets_favor = EXCLUDED.sets_favor,
    sets_contra = EXCLUDED.sets_contra,
    puntos_obtenidos = EXCLUDED.puntos_obtenidos,
    metadata = EXCLUDED.metadata
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── RLS ──
ALTER TABLE public.riviera_jugadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_participaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS riviera_jugadores_select ON public.riviera_jugadores;
CREATE POLICY riviera_jugadores_select ON public.riviera_jugadores
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid());

DROP POLICY IF EXISTS riviera_jugadores_insert ON public.riviera_jugadores;
CREATE POLICY riviera_jugadores_insert ON public.riviera_jugadores
  FOR INSERT TO authenticated
  WITH CHECK (organizador_id = auth.uid());

DROP POLICY IF EXISTS riviera_jugadores_update ON public.riviera_jugadores;
CREATE POLICY riviera_jugadores_update ON public.riviera_jugadores
  FOR UPDATE TO authenticated
  USING (organizador_id = auth.uid())
  WITH CHECK (organizador_id = auth.uid());

DROP POLICY IF EXISTS riviera_jugadores_delete ON public.riviera_jugadores;
CREATE POLICY riviera_jugadores_delete ON public.riviera_jugadores
  FOR DELETE TO authenticated
  USING (organizador_id = auth.uid());

DROP POLICY IF EXISTS jugador_participaciones_select ON public.jugador_participaciones;
CREATE POLICY jugador_participaciones_select ON public.jugador_participaciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_jugadores j
      WHERE j.id = jugador_participaciones.jugador_id
        AND j.organizador_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS jugador_participaciones_insert ON public.jugador_participaciones;
CREATE POLICY jugador_participaciones_insert ON public.jugador_participaciones
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.riviera_jugadores j
      WHERE j.id = jugador_participaciones.jugador_id
        AND j.organizador_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS jugador_participaciones_update ON public.jugador_participaciones;
CREATE POLICY jugador_participaciones_update ON public.jugador_participaciones
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_jugadores j
      WHERE j.id = jugador_participaciones.jugador_id
        AND j.organizador_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS jugador_participaciones_delete ON public.jugador_participaciones;
CREATE POLICY jugador_participaciones_delete ON public.jugador_participaciones
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_jugadores j
      WHERE j.id = jugador_participaciones.jugador_id
        AND j.organizador_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS jugador_stats_select ON public.jugador_stats;
CREATE POLICY jugador_stats_select ON public.jugador_stats
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_jugadores j
      WHERE j.id = jugador_stats.jugador_id
        AND j.organizador_id = auth.uid()
    )
  );

-- ── Storage: jugadores-avatars ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'jugadores-avatars',
  'jugadores-avatars',
  true,
  524288,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS jugadores_avatars_public_read ON storage.objects;
CREATE POLICY jugadores_avatars_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'jugadores-avatars');

DROP POLICY IF EXISTS jugadores_avatars_auth_insert ON storage.objects;
CREATE POLICY jugadores_avatars_auth_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'jugadores-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS jugadores_avatars_auth_update ON storage.objects;
CREATE POLICY jugadores_avatars_auth_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'jugadores-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS jugadores_avatars_auth_delete ON storage.objects;
CREATE POLICY jugadores_avatars_auth_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'jugadores-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
