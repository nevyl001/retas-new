-- Verify: /jugar (RPC public) alinea nombre/lugar/cancha/horario con la entidad.
-- Read-only. Sustituye slugs o deja que tome 1 fila por mode_type.
-- Esperado: mismatch_* = 0 en todas las filas.

WITH samples AS (
  SELECT DISTINCT ON (r.mode_type)
    r.mode_type,
    r.public_slug,
    r.entity_id,
    r.title_public AS cache_title,
    r.location_label AS cache_location,
    r.scheduled_at AS cache_scheduled_at,
    r.duration_minutes AS cache_duration
  FROM public.tournament_open_registration r
  WHERE r.enabled = true
    AND r.public_slug IS NOT NULL
    AND r.mode_type IN ('duelo_2v2', 'reta', 'americano')
  ORDER BY r.mode_type, r.updated_at DESC NULLS LAST
),
rpc AS (
  SELECT
    s.mode_type,
    s.public_slug,
    s.entity_id,
    s.cache_title,
    s.cache_location,
    s.cache_scheduled_at,
    s.cache_duration,
    public.get_tournament_open_registration_public(s.public_slug) AS dto
  FROM samples s
),
entity AS (
  SELECT
    r.*,
    CASE
      WHEN r.mode_type = 'duelo_2v2' THEN (
        SELECT jsonb_build_object(
          'name', d.nombre,
          'lugar', d.lugar,
          'cancha', d.cancha,
          'programado_en', d.programado_en,
          'programado_hasta', d.programado_hasta,
          'mostrar_lugar', coalesce(d.mostrar_lugar, true)
        )
        FROM public.duelos_2v2 d WHERE d.id = r.entity_id
      )
      ELSE (
        SELECT jsonb_build_object(
          'name', t.name,
          'lugar', t.lugar,
          'cancha', t.cancha,
          'programado_en', t.programado_en,
          'programado_hasta', t.programado_hasta,
          'mostrar_lugar', coalesce(t.mostrar_lugar, true)
        )
        FROM public.tournaments t WHERE t.id = r.entity_id
      )
    END AS ent
  FROM rpc r
)
SELECT
  mode_type,
  public_slug,
  ent->>'name' AS entity_name,
  dto->>'name' AS public_name,
  ent->>'lugar' AS entity_lugar,
  dto->>'location_label' AS public_location,
  ent->>'cancha' AS entity_cancha,
  dto->>'cancha_label' AS public_cancha,
  ent->>'programado_en' AS entity_start,
  dto->>'scheduled_at' AS public_start,
  ent->>'programado_hasta' AS entity_end,
  dto->>'scheduled_until' AS public_end,
  cache_title,
  cache_location,
  (dto->>'name') IS DISTINCT FROM (ent->>'name') AS mismatch_name,
  CASE
    WHEN (ent->>'mostrar_lugar')::boolean IS FALSE THEN
      (dto->>'location_label') IS NOT NULL
    ELSE
      nullif(dto->>'location_label', '') IS DISTINCT FROM nullif(ent->>'lugar', '')
  END AS mismatch_lugar,
  nullif(dto->>'cancha_label', '') IS DISTINCT FROM nullif(ent->>'cancha', '')
    AS mismatch_cancha,
  (dto->>'scheduled_at') IS DISTINCT FROM (ent->>'programado_en') AS mismatch_start,
  (dto->>'scheduled_until') IS DISTINCT FROM (ent->>'programado_hasta') AS mismatch_end
FROM entity
ORDER BY mode_type;
