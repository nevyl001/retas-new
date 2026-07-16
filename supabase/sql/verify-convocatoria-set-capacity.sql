-- Verify set_open_game_registration_capacity (read-only checks + dry RPC probes).
-- Sustituye entity ids o deja que tome 1 muestra por modo.
-- Esperado:
--   - duelo_2v2 → error capacity_locked
--   - reta/americano → ok al setear el MISMO capacity; below_confirmed si pides confirmed-1

WITH samples AS (
  SELECT DISTINCT ON (r.mode_type)
    r.mode_type,
    r.entity_id,
    r.id AS registration_id,
    r.capacity,
    (
      SELECT count(*)::int
      FROM public.tournament_open_registration_entries e
      WHERE e.registration_id = r.id AND e.status = 'confirmed'
    ) AS confirmed_count
  FROM public.tournament_open_registration r
  WHERE r.mode_type IN ('duelo_2v2', 'reta', 'americano')
    AND r.enabled = true
  ORDER BY r.mode_type, r.updated_at DESC NULLS LAST
)
SELECT
  mode_type,
  entity_id,
  capacity,
  confirmed_count,
  CASE
    WHEN mode_type = 'duelo_2v2' THEN 'expect capacity_locked'
    ELSE 'expect ok when p_capacity = capacity'
  END AS expectation
FROM samples
ORDER BY mode_type;

-- Probes (requieren sesión del organizador; si falla auth, ok en verify manual):
-- SELECT public.set_open_game_registration_capacity('duelo_2v2', '<duelo_id>', 6);
--   → ok=false, error=capacity_locked
-- SELECT public.set_open_game_registration_capacity('reta', '<tournament_id>', <confirmed>);
--   → ok=true (noop floor)
-- SELECT public.set_open_game_registration_capacity('reta', '<tournament_id>', <confirmed>-1);
--   → ok=false, error=capacity_below_confirmed (si confirmed>0)
-- SELECT public.set_open_game_registration_capacity('reta', '<tournament_id>', 200);
--   → ok=false, error=capacity_out_of_range

-- Realtime: UPDATE capacity debe notificar canal convocatoria-cfg (tabla en publication).
SELECT
  'tournament_open_registration' AS tbl,
  EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tournament_open_registration'
  ) AS in_realtime_publication;
