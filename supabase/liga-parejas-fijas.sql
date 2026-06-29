-- Liga por parejas fijas: modalidad, vueltas y tabla liga_equipos.
-- Ejecutar en Supabase SQL Editor (producción) una vez.

-- ── ligas: modalidad y vueltas ──
ALTER TABLE public.ligas
  ADD COLUMN IF NOT EXISTS modalidad text NOT NULL DEFAULT 'individual_rotativo',
  ADD COLUMN IF NOT EXISTS vueltas integer NOT NULL DEFAULT 1;

ALTER TABLE public.ligas DROP CONSTRAINT IF EXISTS ligas_modalidad_check;
ALTER TABLE public.ligas
  ADD CONSTRAINT ligas_modalidad_check
  CHECK (modalidad IN ('individual_rotativo', 'parejas_fijas'));

ALTER TABLE public.ligas DROP CONSTRAINT IF EXISTS ligas_vueltas_check;
ALTER TABLE public.ligas
  ADD CONSTRAINT ligas_vueltas_check
  CHECK (vueltas IN (1, 2, 3));

COMMENT ON COLUMN public.ligas.modalidad IS
  'individual_rotativo = parejas rotativas por jornada; parejas_fijas = equipos inscritos fijos.';
COMMENT ON COLUMN public.ligas.vueltas IS
  'Solo parejas_fijas: 1, 2 o 3 vueltas (ida / ida-vuelta / triple).';

-- ── equipos inscritos (parejas fijas) ──
CREATE TABLE IF NOT EXISTS public.liga_equipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES public.ligas(id) ON DELETE CASCADE,
  nombre text,
  jugador1_id uuid NOT NULL REFERENCES public.liga_jugadores(id) ON DELETE RESTRICT,
  jugador2_id uuid NOT NULL REFERENCES public.liga_jugadores(id) ON DELETE RESTRICT,
  puntos integer NOT NULL DEFAULT 0,
  partidos_jugados integer NOT NULL DEFAULT 0,
  partidos_ganados integer NOT NULL DEFAULT 0,
  partidos_perdidos integer NOT NULL DEFAULT 0,
  games_favor integer NOT NULL DEFAULT 0,
  games_contra integer NOT NULL DEFAULT 0,
  diferencia_games integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT liga_equipos_distinct_players CHECK (jugador1_id <> jugador2_id)
);

CREATE INDEX IF NOT EXISTS liga_equipos_liga_id_idx ON public.liga_equipos(liga_id);

-- ── vínculo jornada ↔ equipo fijo ──
ALTER TABLE public.liga_jornada_parejas
  ADD COLUMN IF NOT EXISTS equipo_id uuid REFERENCES public.liga_equipos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS liga_jornada_parejas_equipo_id_idx
  ON public.liga_jornada_parejas(equipo_id);

-- ── RLS liga_equipos (mismo criterio que ligas hijas) ──
ALTER TABLE public.liga_equipos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leq_select_auth ON public.liga_equipos;
DROP POLICY IF EXISTS leq_select_anon ON public.liga_equipos;
DROP POLICY IF EXISTS leq_mutate_auth ON public.liga_equipos;

CREATE POLICY leq_select_auth ON public.liga_equipos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_equipos.liga_id
        AND l.organizador_id = auth.uid()
    )
  );

CREATE POLICY leq_select_anon ON public.liga_equipos
  FOR SELECT TO anon
  USING (true);

CREATE POLICY leq_mutate_auth ON public.liga_equipos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_equipos.liga_id
        AND l.organizador_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_equipos.liga_id
        AND l.organizador_id = auth.uid()
    )
  );
