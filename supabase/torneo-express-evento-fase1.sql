-- =============================================================================
-- Torneo Express — FASE 1: Evento (contenedor multi-categoría)
-- =============================================================================
-- Propósito:
--   Crear tabla public.torneo_express_evento y columna nullable
--   torneo_express.evento_id (FK ON DELETE SET NULL).
--   Solo esquema + RLS. Sin agenda, sin canchas, sin career/ranking.
--
-- Naturaleza: ADITIVO / idempotente donde es posible.
--   - Torneos legacy quedan con evento_id NULL → comportamiento idéntico.
--   - No renombra ni borra columnas/tablas existentes.
--
-- Prerrequisitos:
--   - Tabla public.torneo_express existente
--   - Preferible: rls-enable-public-schema.sql (helpers owner)
--   - Preferible: rls-multiclub-pr1-public-read-helpers.sql (patrón lectura pública)
--
-- Orden de ejecución (docs/SQL-ORDEN.md):
--   Tras el stack TE/RLS base (rls-enable-public-schema + rls-multiclub-pr1).
--   Antes de cualquier fase de agenda o defaults de categoría.
--
-- Arquitectura: docs/TOURNAMENT-MULTI-CATEGORY-ARCHITECTURE.md
-- Ejecutar en: Supabase → SQL Editor (staging primero). NO ejecutar desde la app.
-- =============================================================================

-- ── 0. Guard: torneo_express debe existir ──
DO $$
BEGIN
  IF to_regclass('public.torneo_express') IS NULL THEN
    RAISE EXCEPTION
      'Prerrequisito: public.torneo_express debe existir antes de torneo-express-evento-fase1.sql';
  END IF;
END $$;

-- =============================================================================
-- 1) Tabla torneo_express_evento
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.torneo_express_evento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  -- Misma semántica que torneo_express.organizador_id / duelos_2v2.organizador_id
  organizador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Slug público nullable (se puede generar después).
  -- UNIQUE GLOBAL: las rutas conceptuales son /eventos/{eventoSlug} sin org en path;
  -- en Postgres UNIQUE permite múltiples NULL.
  slug text,
  estado text NOT NULL DEFAULT 'draft'
    CHECK (estado IN ('draft', 'published', 'in_progress', 'completed', 'archived')),
  flyer_url text,
  logo_source text NOT NULL DEFAULT 'club'
    CHECK (logo_source IN ('flyer', 'club')),
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  fecha_inicio date,
  fecha_fin date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT torneo_express_evento_slug_unique UNIQUE (slug)
);

COMMENT ON TABLE public.torneo_express_evento IS
  'Evento contenedor de categorías (filas torneo_express vía evento_id). No mezcla datos deportivos.';

COMMENT ON COLUMN public.torneo_express_evento.estado IS
  'Ciclo de vida del Evento (organizativo). draft/published/archived propios; in_progress/completed derivados en app. No altera torneo_express.estado.';

COMMENT ON COLUMN public.torneo_express_evento.slug IS
  'Slug público único global (nullable). UNIQUE en Postgres permite varios NULL.';

COMMENT ON COLUMN public.torneo_express_evento.logo_source IS
  'Origen del logo en vistas públicas del evento: flyer del evento o branding del club.';

COMMENT ON COLUMN public.torneo_express_evento.timezone IS
  'Zona IANA del evento (default America/Mexico_City / APP_TIMEZONE).';

CREATE INDEX IF NOT EXISTS torneo_express_evento_organizador_idx
  ON public.torneo_express_evento (organizador_id, created_at DESC);

CREATE INDEX IF NOT EXISTS torneo_express_evento_slug_idx
  ON public.torneo_express_evento (slug)
  WHERE slug IS NOT NULL;

-- =============================================================================
-- 2) Columna evento_id en torneo_express (nullable → legacy intacto)
-- =============================================================================

ALTER TABLE public.torneo_express
  ADD COLUMN IF NOT EXISTS evento_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'torneo_express_evento_id_fkey'
      AND conrelid = 'public.torneo_express'::regclass
  ) THEN
    ALTER TABLE public.torneo_express
      ADD CONSTRAINT torneo_express_evento_id_fkey
      FOREIGN KEY (evento_id)
      REFERENCES public.torneo_express_evento(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.torneo_express.evento_id IS
  'FK opcional al Evento contenedor. NULL = torneo/categoría legacy o standalone. ON DELETE SET NULL.';

CREATE INDEX IF NOT EXISTS torneo_express_evento_id_idx
  ON public.torneo_express (evento_id)
  WHERE evento_id IS NOT NULL;

-- =============================================================================
-- 3) Helper lectura pública (mismo patrón que is_torneo_express_public)
-- =============================================================================
-- Visibilidad anon:
--   SÍ: published, in_progress, completed  → página pública del evento
--   NO: draft (borrador), archived (solo consulta del organizador)
-- El estado del Evento NO abre/cierra categorías por sí solo; cada
-- torneo_express sigue usando is_torneo_express_public(id) para sus partidos.

CREATE OR REPLACE FUNCTION public.is_torneo_express_evento_public(p_evento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_evento_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.torneo_express_evento e
      WHERE e.id = p_evento_id
        AND e.estado IN ('published', 'in_progress', 'completed')
    );
$$;

COMMENT ON FUNCTION public.is_torneo_express_evento_public(uuid) IS
  'Evento legible por anon si estado IN (published, in_progress, completed). draft/archived no públicos.';

GRANT EXECUTE ON FUNCTION public.is_torneo_express_evento_public(uuid)
  TO anon, authenticated;

-- =============================================================================
-- 4) RLS + políticas (patrón te_*: owner = organizador_id = auth.uid())
-- =============================================================================

ALTER TABLE public.torneo_express_evento ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.torneo_express_evento TO authenticated;
GRANT SELECT ON public.torneo_express_evento TO anon;

DROP POLICY IF EXISTS te_evento_select_anon ON public.torneo_express_evento;
DROP POLICY IF EXISTS te_evento_select_auth ON public.torneo_express_evento;
DROP POLICY IF EXISTS te_evento_mutate_auth ON public.torneo_express_evento;

-- Lectura pública acotada (sin escritura anon)
CREATE POLICY te_evento_select_anon ON public.torneo_express_evento
  FOR SELECT TO anon
  USING (public.is_torneo_express_evento_public(id));

-- Dueño: lectura completa de sus eventos (incl. draft/archived)
CREATE POLICY te_evento_select_auth ON public.torneo_express_evento
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid());

-- Dueño: escritura completa (sin escritura anon)
CREATE POLICY te_evento_mutate_auth ON public.torneo_express_evento
  FOR ALL TO authenticated
  USING (organizador_id = auth.uid())
  WITH CHECK (organizador_id = auth.uid());

-- =============================================================================
-- ROLLBACK (comentado — solo para pruebas / revertir en staging)
-- =============================================================================
-- CUIDADO: borrar la tabla deja torneo_express.evento_id huérfano si no se
-- elimina la columna; el orden abajo limpia FK → columna → helper → tabla.
--
-- BEGIN;
--
-- DROP POLICY IF EXISTS te_evento_select_anon ON public.torneo_express_evento;
-- DROP POLICY IF EXISTS te_evento_select_auth ON public.torneo_express_evento;
-- DROP POLICY IF EXISTS te_evento_mutate_auth ON public.torneo_express_evento;
--
-- DROP FUNCTION IF EXISTS public.is_torneo_express_evento_public(uuid);
--
-- ALTER TABLE public.torneo_express
--   DROP CONSTRAINT IF EXISTS torneo_express_evento_id_fkey;
--
-- DROP INDEX IF EXISTS public.torneo_express_evento_id_idx;
--
-- ALTER TABLE public.torneo_express
--   DROP COLUMN IF EXISTS evento_id;
--
-- DROP INDEX IF EXISTS public.torneo_express_evento_slug_idx;
-- DROP INDEX IF EXISTS public.torneo_express_evento_organizador_idx;
--
-- DROP TABLE IF EXISTS public.torneo_express_evento;
--
-- COMMIT;
