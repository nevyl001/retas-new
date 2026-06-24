-- Vista y helpers para www.rivieraopen.com (sitio oficial).
-- La app Riviera (appriviera) y el sitio oficial comparten esta base de datos.
-- Ejecutar después de admin-master-controls.sql

-- ── ¿Este jugador debe aparecer en rivieraopen.com? ──
CREATE OR REPLACE FUNCTION public.is_jugador_visible_sitio_oficial(p_jugador_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.riviera_jugadores rj
    WHERE rj.id = p_jugador_id
      AND rj.estado = 'activo'
      AND COALESCE(rj.visible_publico, true) = true
      AND COALESCE(rj.suma_ranking, true) = true
      AND public.is_organizador_ranking_publico(rj.organizador_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_jugador_visible_sitio_oficial(uuid) TO anon, authenticated;

-- ── Jugadores visibles en ranking/perfil del sitio oficial ──
CREATE OR REPLACE VIEW public.riviera_jugadores_sitio_oficial
WITH (security_invoker = true) AS
SELECT
  rj.id,
  rj.organizador_id,
  rj.nombre,
  rj.slug,
  rj.foto_url,
  rj.categoria,
  rj.genero,
  rj.pais_codigo,
  rj.club,
  rj.estado,
  rj.visible_publico,
  rj.suma_ranking,
  rj.rating,
  rj.rating_partidos,
  rj.rating_fiabilidad,
  rj.created_at,
  rj.updated_at,
  COALESCE(js.puntos_totales, 0)::integer AS puntos_totales,
  COALESCE(js.total_partidos, 0)::integer AS total_partidos,
  COALESCE(js.victorias, 0)::integer AS victorias
FROM public.riviera_jugadores rj
LEFT JOIN public.jugador_stats js ON js.jugador_id = rj.id
WHERE rj.estado = 'activo'
  AND COALESCE(rj.visible_publico, true) = true
  AND COALESCE(rj.suma_ranking, true) = true
  AND public.is_organizador_ranking_publico(rj.organizador_id);

COMMENT ON VIEW public.riviera_jugadores_sitio_oficial IS
  'Fuente única para listados y perfiles en www.rivieraopen.com. Respeta flags del admin maestro.';

GRANT SELECT ON public.riviera_jugadores_sitio_oficial TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
