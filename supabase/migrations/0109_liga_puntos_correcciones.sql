CREATE TABLE IF NOT EXISTS public.liga_puntos_correcciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES public.ligas(id) ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES public.liga_jugadores(id) ON DELETE CASCADE,
  puntos_antes integer,
  puntos_despues integer NOT NULL,
  motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 3 AND 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS liga_puntos_correcciones_liga_jugador
  ON public.liga_puntos_correcciones (liga_id, jugador_id, created_at DESC);

ALTER TABLE public.liga_puntos_correcciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS liga_puntos_correcciones_owner
  ON public.liga_puntos_correcciones;

CREATE POLICY liga_puntos_correcciones_owner
  ON public.liga_puntos_correcciones
  FOR ALL
  TO authenticated
  USING (
    public.is_liga_owner(liga_id)
    OR COALESCE(public.is_master_admin(), false)
  )
  WITH CHECK (
    public.is_liga_owner(liga_id)
    OR COALESCE(public.is_master_admin(), false)
  );

REVOKE ALL ON TABLE public.liga_puntos_correcciones FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.liga_puntos_correcciones TO authenticated;

INSERT INTO public.liga_puntos_correcciones (
  liga_id,
  jugador_id,
  puntos_antes,
  puntos_despues,
  motivo,
  created_at,
  updated_at
)
SELECT
  i.liga_id,
  i.jugador_id,
  NULL,
  i.puntos,
  btrim(i.puntos_ajuste_motivo),
  COALESCE(i.puntos_ajuste_at, now()),
  COALESCE(i.puntos_ajuste_at, now())
FROM public.liga_inscripciones i
WHERE i.puntos_ajuste_motivo IS NOT NULL
  AND char_length(btrim(i.puntos_ajuste_motivo)) >= 3
  AND NOT EXISTS (
    SELECT 1
    FROM public.liga_puntos_correcciones c
    WHERE c.liga_id = i.liga_id
      AND c.jugador_id = i.jugador_id
  );
