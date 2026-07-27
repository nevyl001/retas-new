-- Hotfix: email, telefono, whatsapp y fecha_nacimiento de riviera_jugadores
-- eran legibles por anon vía REST directamente (ej. ?select=email,telefono)
-- para cualquier jugador visible_publico=true, sin pasar por ninguna
-- pantalla de la app.
--
-- El GRANT original a anon era de TABLA COMPLETA (relacl: anon=arwdDxtm),
-- no por columna, así que un REVOKE SELECT (columnas) por sí solo no tiene
-- efecto: el permiso de tabla completa lo sigue cubriendo. Por eso el fix
-- son dos pasos: se revoca el SELECT de tabla completa y se vuelve a
-- otorgar exactamente sobre las mismas columnas que ya tenía, MENOS las 4
-- privadas (26 de las 30 columnas actuales de riviera_jugadores).
--
-- No se toca authenticated: el organizador ve su propio roster (incluyendo
-- estas 4 columnas) por políticas RLS separadas (organizador_id = auth.uid()
-- / organizer_player_access), no por la política pública que se está
-- cerrando aquí. No se cambia ninguna política RLS ni qué filas ve anon —
-- solo qué columnas de esas filas.

REVOKE SELECT ON public.riviera_jugadores FROM anon;

GRANT SELECT (
  id, nombre, slug, foto_url, nivel, genero, club, organizador_id, estado,
  legacy_player_id, legacy_liga_jugador_id, created_at, updated_at, categoria,
  edad, mano_dominante, instagram_url, facebook_url, visible_publico,
  tiktok_url, en_cancha, pais_codigo, rating, rating_partidos,
  rating_fiabilidad, suma_ranking
) ON public.riviera_jugadores TO anon;
