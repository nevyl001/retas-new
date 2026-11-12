-- =============================================================================
-- 0127_official_points_by_club.sql
--
-- Lectura del ranking oficial por club. Suma riviera_official_points_ledger
-- (la misma fuente que riviera_official_player_totals). No inserta, no
-- actualiza y no borra movimientos.
--
-- APLICACIÓN: ejecutar este archivo solo, a mano. No usar db push.
-- Después de aplicarla hay que registrar la versión 0127 en el historial
-- antes de cualquier db push futuro. CREATE OR REPLACE es idempotente.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.riviera_official_points_by_club_for_jugador(
  p_riviera_jugador_id uuid
)
RETURNS TABLE (
  organizador_id uuid,
  points integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.source_organizer_id AS organizador_id,
    SUM(l.points)::integer AS points
  FROM public.riviera_official_points_ledger l
  WHERE p_riviera_jugador_id IS NOT NULL
    AND l.counts_for_official_ranking
    AND l.official_player_key = public._resolve_official_player_key(p_riviera_jugador_id)
    AND l.source_organizer_id IS NOT NULL
  GROUP BY l.source_organizer_id
  HAVING SUM(l.points) > 0
  ORDER BY SUM(l.points) DESC, l.source_organizer_id;
$$;

COMMENT ON FUNCTION public.riviera_official_points_by_club_for_jugador(uuid) IS
  'Puntos del ranking oficial Riviera Open por club emisor. Suma el ledger ROMC; no incluye ajustes manuales de carrera.';

REVOKE ALL ON FUNCTION public.riviera_official_points_by_club_for_jugador(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.riviera_official_points_by_club_for_jugador(uuid)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
