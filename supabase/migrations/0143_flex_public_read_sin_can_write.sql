-- La lectura pública de Flex evaluaba flex_league_can_write(),
-- función sin EXECUTE para anon. Aunque is_liga_public sea true,
-- el OR falla y el visitante no ve convocatoria, canchas ni rondas.
-- La escritura no cambia. Anon solo lee si la liga es pública.

DROP POLICY IF EXISTS liga_flex_config_read ON public.liga_flex_config;
CREATE POLICY liga_flex_config_read_anon ON public.liga_flex_config
  FOR SELECT TO anon
  USING (public.is_liga_public(liga_id));
CREATE POLICY liga_flex_config_read_auth ON public.liga_flex_config
  FOR SELECT TO authenticated
  USING (public.is_liga_public(liga_id) OR public.flex_league_can_write(liga_id));

DROP POLICY IF EXISTS liga_jornada_flex_read ON public.liga_jornada_flex;
CREATE POLICY liga_jornada_flex_read_anon ON public.liga_jornada_flex
  FOR SELECT TO anon
  USING (public.is_liga_public(liga_id));
CREATE POLICY liga_jornada_flex_read_auth ON public.liga_jornada_flex
  FOR SELECT TO authenticated
  USING (public.is_liga_public(liga_id) OR public.flex_league_can_write(liga_id));

DROP POLICY IF EXISTS liga_jornada_participantes_read ON public.liga_jornada_participantes;
CREATE POLICY liga_jornada_participantes_read_anon ON public.liga_jornada_participantes
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.liga_jornadas j
      WHERE j.id = jornada_id
        AND public.is_liga_public(j.liga_id)
    )
  );
CREATE POLICY liga_jornada_participantes_read_auth ON public.liga_jornada_participantes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.liga_jornadas j
      WHERE j.id = jornada_id
        AND (public.is_liga_public(j.liga_id) OR public.flex_league_can_write(j.liga_id))
    )
  );

DROP POLICY IF EXISTS liga_flex_posiciones_read ON public.liga_flex_posiciones;
CREATE POLICY liga_flex_posiciones_read_anon ON public.liga_flex_posiciones
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.liga_jornadas j
      WHERE j.id = jornada_id
        AND public.is_liga_public(j.liga_id)
    )
  );
CREATE POLICY liga_flex_posiciones_read_auth ON public.liga_flex_posiciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.liga_jornadas j
      WHERE j.id = jornada_id
        AND (public.is_liga_public(j.liga_id) OR public.flex_league_can_write(j.liga_id))
    )
  );

DROP POLICY IF EXISTS liga_flex_honores_read ON public.liga_flex_honores;
CREATE POLICY liga_flex_honores_read_anon ON public.liga_flex_honores
  FOR SELECT TO anon
  USING (public.is_liga_public(liga_id));
CREATE POLICY liga_flex_honores_read_auth ON public.liga_flex_honores
  FOR SELECT TO authenticated
  USING (public.is_liga_public(liga_id) OR public.flex_league_can_write(liga_id));
