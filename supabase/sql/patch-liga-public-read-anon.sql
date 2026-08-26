-- Asegura lectura pública de ligas (anon + authenticated no-dueño).
-- Las vistas /public/liga/... y /public/liga/.../jornada/... deben funcionar
-- sin cuenta. is_liga_public usa COALESCE(es_publica, true).

-- 1) Columna + default
ALTER TABLE public.ligas
  ADD COLUMN IF NOT EXISTS es_publica boolean NOT NULL DEFAULT true;

UPDATE public.ligas
SET es_publica = true
WHERE es_publica IS DISTINCT FROM true;

-- 2) Helper
CREATE OR REPLACE FUNCTION public.is_liga_public(p_liga_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_liga_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.ligas l
      WHERE l.id = p_liga_id
        AND COALESCE(l.es_publica, true) = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_liga_public(uuid) TO anon, authenticated;

-- 3) Políticas SELECT públicas (idempotente)
DROP POLICY IF EXISTS ligas_select_anon ON public.ligas;
CREATE POLICY ligas_select_anon ON public.ligas
  FOR SELECT TO anon
  USING (public.is_liga_public(id));

DROP POLICY IF EXISTS ligas_select_public_authenticated ON public.ligas;
CREATE POLICY ligas_select_public_authenticated ON public.ligas
  FOR SELECT TO authenticated
  USING (public.is_liga_public(id) OR organizador_id = auth.uid());

DROP POLICY IF EXISTS li_select_anon ON public.liga_inscripciones;
CREATE POLICY li_select_anon ON public.liga_inscripciones
  FOR SELECT TO anon
  USING (public.is_liga_public(liga_id));

DROP POLICY IF EXISTS li_select_public_authenticated ON public.liga_inscripciones;
CREATE POLICY li_select_public_authenticated ON public.liga_inscripciones
  FOR SELECT TO authenticated
  USING (public.is_liga_public(liga_id) OR public.is_liga_owner(liga_id));

DROP POLICY IF EXISTS ljorn_select_anon ON public.liga_jornadas;
CREATE POLICY ljorn_select_anon ON public.liga_jornadas
  FOR SELECT TO anon
  USING (public.is_liga_public(liga_id));

DROP POLICY IF EXISTS ljorn_select_public_authenticated ON public.liga_jornadas;
CREATE POLICY ljorn_select_public_authenticated ON public.liga_jornadas
  FOR SELECT TO authenticated
  USING (public.is_liga_public(liga_id) OR public.is_liga_owner(liga_id));

DROP POLICY IF EXISTS ljp_select_anon ON public.liga_jornada_parejas;
CREATE POLICY ljp_select_anon ON public.liga_jornada_parejas
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.liga_jornadas lj
      WHERE lj.id = liga_jornada_parejas.jornada_id
        AND public.is_liga_public(lj.liga_id)
    )
  );

DROP POLICY IF EXISTS ljp_select_public_authenticated ON public.liga_jornada_parejas;
CREATE POLICY ljp_select_public_authenticated ON public.liga_jornada_parejas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.liga_jornadas lj
      WHERE lj.id = liga_jornada_parejas.jornada_id
        AND (public.is_liga_public(lj.liga_id) OR public.is_liga_owner(lj.liga_id))
    )
  );

DROP POLICY IF EXISTS lp_select_anon ON public.liga_partidos;
CREATE POLICY lp_select_anon ON public.liga_partidos
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.liga_jornadas lj
      WHERE lj.id = liga_partidos.jornada_id
        AND public.is_liga_public(lj.liga_id)
    )
  );

DROP POLICY IF EXISTS lp_select_public_authenticated ON public.liga_partidos;
CREATE POLICY lp_select_public_authenticated ON public.liga_partidos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.liga_jornadas lj
      WHERE lj.id = liga_partidos.jornada_id
        AND (public.is_liga_public(lj.liga_id) OR public.is_liga_owner(lj.liga_id))
    )
  );

DROP POLICY IF EXISTS leq_select_anon ON public.liga_equipos;
CREATE POLICY leq_select_anon ON public.liga_equipos
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_equipos.liga_id AND public.is_liga_public(l.id)
    )
  );

DROP POLICY IF EXISTS leq_select_public_authenticated ON public.liga_equipos;
CREATE POLICY leq_select_public_authenticated ON public.liga_equipos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_equipos.liga_id
        AND (public.is_liga_public(l.id) OR l.organizador_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS lj_select_anon ON public.liga_jugadores;
CREATE POLICY lj_select_anon ON public.liga_jugadores
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.liga_inscripciones li
      WHERE li.jugador_id = liga_jugadores.id AND public.is_liga_public(li.liga_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.liga_jornada_parejas ljp
      JOIN public.liga_jornadas lj ON lj.id = ljp.jornada_id
      WHERE public.is_liga_public(lj.liga_id)
        AND (ljp.jugador1_id = liga_jugadores.id OR ljp.jugador2_id = liga_jugadores.id)
    )
    OR EXISTS (
      SELECT 1 FROM public.liga_equipos le
      JOIN public.ligas l ON l.id = le.liga_id
      WHERE public.is_liga_public(l.id)
        AND (le.jugador1_id = liga_jugadores.id OR le.jugador2_id = liga_jugadores.id)
    )
  );

DROP POLICY IF EXISTS lj_select_public_authenticated ON public.liga_jugadores;
CREATE POLICY lj_select_public_authenticated ON public.liga_jugadores
  FOR SELECT TO authenticated
  USING (
    organizador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.liga_inscripciones li
      WHERE li.jugador_id = liga_jugadores.id AND public.is_liga_public(li.liga_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.liga_jornada_parejas ljp
      JOIN public.liga_jornadas lj ON lj.id = ljp.jornada_id
      WHERE public.is_liga_public(lj.liga_id)
        AND (ljp.jugador1_id = liga_jugadores.id OR ljp.jugador2_id = liga_jugadores.id)
    )
    OR EXISTS (
      SELECT 1 FROM public.liga_equipos le
      JOIN public.ligas l ON l.id = le.liga_id
      WHERE public.is_liga_public(l.id)
        AND (le.jugador1_id = liga_jugadores.id OR le.jugador2_id = liga_jugadores.id)
    )
  );

-- Anon: solo columnas sin PII
REVOKE SELECT ON public.liga_jugadores FROM anon;
GRANT SELECT (id, nombre, organizador_id, genero, nivel, estado, created_at)
  ON public.liga_jugadores TO anon;

-- Verificación puntual de la liga Padelito
SELECT id, nombre, es_publica, public.is_liga_public(id) AS is_public
FROM public.ligas
WHERE id = '08d658c9-ebf5-411f-bfff-c764f3226858';
