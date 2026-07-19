-- Verify: RPC pública expone formato de producto (Round Robin / championship).
-- Read-only. Esperado: keys presentes; retas RR con format = round_robin.

WITH samples AS (
  SELECT DISTINCT ON (r.mode_type)
    r.mode_type,
    r.public_slug,
    r.entity_id
  FROM public.tournament_open_registration r
  WHERE r.enabled = true
    AND r.public_slug IS NOT NULL
    AND r.mode_type IN ('duelo_2v2', 'reta', 'americano')
  ORDER BY r.mode_type, r.updated_at DESC NULLS LAST
)
SELECT
  s.mode_type,
  s.public_slug,
  dto ? 'tournament_format' AS has_tournament_format,
  dto ? 'championship_enabled' AS has_championship_enabled,
  dto->>'tournament_format' AS tournament_format,
  dto->>'championship_enabled' AS championship_enabled,
  tpc.format AS public_config_format,
  (tpc.championship_config->>'championshipEnabled') AS public_config_champ
FROM samples s
CROSS JOIN LATERAL public.get_tournament_open_registration_public(s.public_slug) AS dto
LEFT JOIN public.tournament_public_config tpc ON tpc.tournament_id = s.entity_id;
