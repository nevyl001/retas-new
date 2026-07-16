-- Read-only: comparar meta duelo (fuente de verdad) vs convocatoria abierta (vista /jugar).
-- Sustituye :duelo_id o filtra por nombre. Sin PII.

-- 1) Entidad del juego
SELECT
  d.id AS duelo_id,
  d.nombre,
  d.lugar,
  d.mostrar_lugar,
  d.cancha,
  d.programado_en,
  d.programado_hasta,
  EXTRACT(EPOCH FROM (d.programado_hasta - d.programado_en)) / 60 AS duracion_min_calc,
  d.estado,
  d.organizador_id
FROM public.duelos_2v2 d
WHERE d.id = 'afcf962f-6607-4603-b587-3793997f7345'
   OR d.nombre ILIKE '%5ta Solida%';

-- 2) Fila de convocatoria (lo que alimenta get_tournament_open_registration_public)
SELECT
  r.id AS registration_id,
  r.public_slug,
  r.mode_type,
  r.entity_id,
  r.enabled,
  r.status,
  r.title_public,
  r.location_label,
  r.scheduled_at,
  r.duration_minutes,
  r.category_label
FROM public.tournament_open_registration r
WHERE r.mode_type = 'duelo_2v2'
  AND r.entity_id = 'afcf962f-6607-4603-b587-3793997f7345';

-- 3) Side-by-side (esperado: título/lugar/hora deben alinearse al duelo tras el fix)
SELECT
  d.nombre AS duelo_nombre,
  r.title_public AS tor_title_public,
  d.lugar AS duelo_lugar,
  r.location_label AS tor_location_label,
  d.cancha AS duelo_cancha,
  d.programado_en AS duelo_inicio,
  d.programado_hasta AS duelo_fin,
  r.scheduled_at AS tor_scheduled_at,
  r.duration_minutes AS tor_duration_minutes,
  r.public_slug
FROM public.duelos_2v2 d
LEFT JOIN public.tournament_open_registration r
  ON r.entity_id = d.id AND r.mode_type = 'duelo_2v2'
WHERE d.id = 'afcf962f-6607-4603-b587-3793997f7345';
