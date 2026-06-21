-- Duelo 2 vs 2 — encuentro entre dos parejas del registro Riviera Open
-- Ejecutar en Supabase → SQL Editor (proyecto padel-app / giswxhmgjepoobdoljb)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'jugador_tipo_evento'
      AND e.enumlabel = 'duelo_2v2'
  ) THEN
    ALTER TYPE public.jugador_tipo_evento ADD VALUE 'duelo_2v2';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.duelos_2v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  estado text NOT NULL DEFAULT 'configuracion'
    CHECK (estado IN ('configuracion', 'en_juego', 'finalizado')),
  pareja_a_j1_id uuid REFERENCES public.riviera_jugadores(id),
  pareja_a_j2_id uuid REFERENCES public.riviera_jugadores(id),
  pareja_a_j1_nombre text NOT NULL,
  pareja_a_j2_nombre text NOT NULL,
  pareja_b_j1_id uuid REFERENCES public.riviera_jugadores(id),
  pareja_b_j2_id uuid REFERENCES public.riviera_jugadores(id),
  pareja_b_j1_nombre text NOT NULL,
  pareja_b_j2_nombre text NOT NULL,
  sets_pareja_a integer NOT NULL DEFAULT 0,
  sets_pareja_b integer NOT NULL DEFAULT 0,
  detalle_sets jsonb NOT NULL DEFAULT '[]'::jsonb,
  ganador text CHECK (ganador IN ('a', 'b')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalizado_at timestamptz
);

CREATE INDEX IF NOT EXISTS duelos_2v2_organizador_idx
  ON public.duelos_2v2 (organizador_id, created_at DESC);

ALTER TABLE public.duelos_2v2 ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.duelos_2v2 TO authenticated;
GRANT SELECT ON public.duelos_2v2 TO anon;

DROP POLICY IF EXISTS duelos_2v2_select_anon ON public.duelos_2v2;
DROP POLICY IF EXISTS duelos_2v2_select_auth ON public.duelos_2v2;
DROP POLICY IF EXISTS duelos_2v2_mutate ON public.duelos_2v2;

CREATE POLICY duelos_2v2_select_anon ON public.duelos_2v2
  FOR SELECT TO anon
  USING (true);

CREATE POLICY duelos_2v2_select_auth ON public.duelos_2v2
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid() OR true);

CREATE POLICY duelos_2v2_mutate ON public.duelos_2v2
  FOR ALL TO authenticated
  USING (organizador_id = auth.uid())
  WITH CHECK (organizador_id = auth.uid());

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.duelos_2v2;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
