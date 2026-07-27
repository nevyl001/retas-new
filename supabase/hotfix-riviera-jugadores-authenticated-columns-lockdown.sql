-- Fase 3: cierre final del riesgo critico de PII cross-organizer.
--
-- authenticated tenia GRANT SELECT de tabla completa sobre riviera_jugadores
-- (incluye email, telefono, whatsapp, fecha_nacimiento). Combinado con la
-- politica riviera_jugadores_public_read (roles {anon, authenticated}),
-- cualquier cuenta autenticada podia leer el contacto de un jugador PUBLICO
-- de OTRO organizador via SELECT directo (?select=email,telefono),
-- confirmado en vivo.
--
-- Precondicion ya cumplida: todos los consumidores authenticated que
-- legitimamente necesitaban esas 4 columnas fueron migrados a RPC
-- SECURITY DEFINER (riviera_jugador_privado_por_id /
-- riviera_jugadores_privados_listar), que validan ownership/admin
-- server-side sin depender de este GRANT. Busqueda final en todo el
-- repositorio confirmo cero SELECT directo restante de esas columnas o
-- select("*") sobre riviera_jugadores en codigo de producto.
--
-- Mismo patron ya aplicado antes a anon: revocar el SELECT de tabla
-- completa y volver a otorgar exactamente las 26 columnas publicas.

REVOKE SELECT ON public.riviera_jugadores FROM authenticated;

GRANT SELECT (
  id, nombre, slug, foto_url, nivel, genero, club, organizador_id, estado,
  legacy_player_id, legacy_liga_jugador_id, created_at, updated_at, categoria,
  edad, mano_dominante, instagram_url, facebook_url, visible_publico,
  tiktok_url, en_cancha, pais_codigo, rating, rating_partidos,
  rating_fiabilidad, suma_ranking
) ON public.riviera_jugadores TO authenticated;
