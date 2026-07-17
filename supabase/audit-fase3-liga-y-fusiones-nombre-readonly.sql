-- =============================================================================
-- AUDIT READ-ONLY AMPLIADO (Fase 3): Reta/players + Liga + fusiones por nombre
-- Esquema real: riviera_jugadores(id, slug, organizador_id, legacy_player_id,
--   legacy_liga_jugador_id) · players · liga_jugadores · organizer_player_access
--
-- SOLO SELECT / WITH. No INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/CALL/DO.
-- No ejecutar automáticamente. Pegar en SQL Editor de Supabase.
-- =============================================================================

-- ── A) Conteos clave players (mismos 3 del audit original) ───────────────────
SELECT 'count_synth_players' AS metric, count(*)::bigint AS value
FROM public.players
WHERE email ILIKE 'reta-link-%@padel.local'

UNION ALL

SELECT 'count_origen_legacy_otro_org', count(*)::bigint
FROM public.riviera_jugadores rj
JOIN public.players p ON p.id = rj.legacy_player_id
WHERE p.user_id IS NOT NULL
  AND rj.organizador_id IS NOT NULL
  AND p.user_id <> rj.organizador_id
  AND EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.jugador_id = rj.id
      AND opa.is_active = true
  )

UNION ALL

SELECT 'count_orphan_legacy_physical', count(*)::bigint
FROM public.riviera_jugadores rj
LEFT JOIN public.players p ON p.id = rj.legacy_player_id
WHERE rj.legacy_player_id IS NOT NULL
  AND p.id IS NULL

UNION ALL

-- ── B) Equivalentes Liga (legacy_liga_jugador_id → liga_jugadores) ───────────
-- Orígenes concedidos cuyo legacy_liga apunta a fila de OTRO organizador.
SELECT 'count_origen_legacy_liga_otro_org', count(*)::bigint
FROM public.riviera_jugadores rj
JOIN public.liga_jugadores lj ON lj.id = rj.legacy_liga_jugador_id
WHERE rj.organizador_id IS NOT NULL
  AND lj.organizador_id IS NOT NULL
  AND lj.organizador_id <> rj.organizador_id
  AND EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.jugador_id = rj.id
      AND opa.is_active = true
  )

UNION ALL

-- Huérfanos físicos: legacy_liga set pero no existe fila en liga_jugadores.
SELECT 'count_orphan_legacy_liga_physical', count(*)::bigint
FROM public.riviera_jugadores rj
LEFT JOIN public.liga_jugadores lj ON lj.id = rj.legacy_liga_jugador_id
WHERE rj.legacy_liga_jugador_id IS NOT NULL
  AND lj.id IS NULL

UNION ALL

-- Inventario: cuántos perfiles Riviera tienen legacy_liga (contexto, ≠ daño).
SELECT 'count_riviera_con_legacy_liga', count(*)::bigint
FROM public.riviera_jugadores
WHERE legacy_liga_jugador_id IS NOT NULL

UNION ALL

-- Grupos de fusión indebida (players): ≥2 riviera distintos → mismo legacy_player_id.
SELECT 'count_fused_groups_legacy_player', count(*)::bigint
FROM (
  SELECT rj.legacy_player_id
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_player_id IS NOT NULL
  GROUP BY rj.legacy_player_id
  HAVING count(DISTINCT rj.id) > 1
) g

UNION ALL

-- Grupos de fusión indebida (liga): ≥2 riviera distintos → mismo legacy_liga.
SELECT 'count_fused_groups_legacy_liga', count(*)::bigint
FROM (
  SELECT rj.legacy_liga_jugador_id
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_liga_jugador_id IS NOT NULL
  GROUP BY rj.legacy_liga_jugador_id
  HAVING count(DISTINCT rj.id) > 1
) g;

-- ── C) Detalle: orígenes players cross-org (si count > 0) ────────────────────
SELECT
  'detalle_origen_legacy_otro_org' AS section,
  rj.id AS riviera_jugador_id,
  rj.slug,
  rj.nombre,
  rj.organizador_id AS perfil_org,
  rj.legacy_player_id,
  p.user_id AS players_user_id,
  p.email AS players_email,
  p.created_at AS players_created_at
FROM public.riviera_jugadores rj
JOIN public.players p ON p.id = rj.legacy_player_id
WHERE p.user_id IS NOT NULL
  AND rj.organizador_id IS NOT NULL
  AND p.user_id <> rj.organizador_id
  AND EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.jugador_id = rj.id
      AND opa.is_active = true
  )
ORDER BY p.created_at DESC NULLS LAST;

-- ── D) Detalle: orígenes Liga cross-org ──────────────────────────────────────
SELECT
  'detalle_origen_legacy_liga_otro_org' AS section,
  rj.id AS riviera_jugador_id,
  rj.slug,
  rj.nombre,
  rj.organizador_id AS perfil_org,
  rj.legacy_liga_jugador_id,
  lj.organizador_id AS liga_jugador_org,
  lj.nombre AS liga_jugador_nombre,
  lj.estado AS liga_jugador_estado,
  lj.created_at AS liga_jugador_created_at
FROM public.riviera_jugadores rj
JOIN public.liga_jugadores lj ON lj.id = rj.legacy_liga_jugador_id
WHERE rj.organizador_id IS NOT NULL
  AND lj.organizador_id IS NOT NULL
  AND lj.organizador_id <> rj.organizador_id
  AND EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.jugador_id = rj.id
      AND opa.is_active = true
  )
ORDER BY lj.created_at DESC NULLS LAST;

-- ── E) Detalle: huérfanos players ───────────────────────────────────────────
SELECT
  'detalle_orphan_legacy_physical' AS section,
  rj.id AS riviera_jugador_id,
  rj.slug,
  rj.nombre,
  rj.organizador_id,
  rj.legacy_player_id
FROM public.riviera_jugadores rj
LEFT JOIN public.players p ON p.id = rj.legacy_player_id
WHERE rj.legacy_player_id IS NOT NULL
  AND p.id IS NULL
ORDER BY rj.organizador_id, rj.slug;

-- ── F) Detalle: huérfanos Liga ──────────────────────────────────────────────
SELECT
  'detalle_orphan_legacy_liga_physical' AS section,
  rj.id AS riviera_jugador_id,
  rj.slug,
  rj.nombre,
  rj.organizador_id,
  rj.legacy_liga_jugador_id
FROM public.riviera_jugadores rj
LEFT JOIN public.liga_jugadores lj ON lj.id = rj.legacy_liga_jugador_id
WHERE rj.legacy_liga_jugador_id IS NOT NULL
  AND lj.id IS NULL
ORDER BY rj.organizador_id, rj.slug;

-- ── G) Fusiones indebidas: mismo legacy_player_id, distintos id/slug ─────────
-- Evidencia de matching por nombre ya materializado (bug viejo).
WITH fused AS (
  SELECT
    rj.legacy_player_id,
    count(DISTINCT rj.id) AS riviera_count,
    count(DISTINCT rj.slug) AS slug_count,
    count(DISTINCT rj.organizador_id) AS org_count,
    array_agg(rj.id ORDER BY rj.created_at NULLS LAST) AS riviera_ids,
    array_agg(rj.slug ORDER BY rj.created_at NULLS LAST) AS slugs,
    array_agg(rj.organizador_id ORDER BY rj.created_at NULLS LAST) AS organizador_ids,
    array_agg(rj.nombre ORDER BY rj.created_at NULLS LAST) AS nombres
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_player_id IS NOT NULL
  GROUP BY rj.legacy_player_id
  HAVING count(DISTINCT rj.id) > 1
)
SELECT
  'fused_same_legacy_player_id' AS section,
  f.*,
  p.user_id AS players_user_id,
  p.email AS players_email,
  p.name AS players_name
FROM fused f
LEFT JOIN public.players p ON p.id = f.legacy_player_id
ORDER BY f.riviera_count DESC, f.legacy_player_id;

-- ── H) Fusiones indebidas: mismo legacy_liga_jugador_id, distintos id/slug ───
WITH fused AS (
  SELECT
    rj.legacy_liga_jugador_id,
    count(DISTINCT rj.id) AS riviera_count,
    count(DISTINCT rj.slug) AS slug_count,
    count(DISTINCT rj.organizador_id) AS org_count,
    array_agg(rj.id ORDER BY rj.created_at NULLS LAST) AS riviera_ids,
    array_agg(rj.slug ORDER BY rj.created_at NULLS LAST) AS slugs,
    array_agg(rj.organizador_id ORDER BY rj.created_at NULLS LAST) AS organizador_ids,
    array_agg(rj.nombre ORDER BY rj.created_at NULLS LAST) AS nombres
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_liga_jugador_id IS NOT NULL
  GROUP BY rj.legacy_liga_jugador_id
  HAVING count(DISTINCT rj.id) > 1
)
SELECT
  'fused_same_legacy_liga_jugador_id' AS section,
  f.*,
  lj.organizador_id AS liga_jugador_org,
  lj.nombre AS liga_jugador_nombre,
  lj.estado AS liga_jugador_estado
FROM fused f
LEFT JOIN public.liga_jugadores lj ON lj.id = f.legacy_liga_jugador_id
ORDER BY f.riviera_count DESC, f.legacy_liga_jugador_id;

-- ── I) Excedentes (filas Riviera de más por fusión) ──────────────────────────
-- Un grupo con 3 riviera = 1 grupo afectado + 2 excedentes.
SELECT
  'excedentes_fusion_legacy_player' AS section,
  coalesce(sum(riviera_count - 1), 0)::bigint AS riviera_excedentes,
  count(*)::bigint AS grupos_afectados
FROM (
  SELECT legacy_player_id, count(DISTINCT id) AS riviera_count
  FROM public.riviera_jugadores
  WHERE legacy_player_id IS NOT NULL
  GROUP BY legacy_player_id
  HAVING count(DISTINCT id) > 1
) g

UNION ALL

SELECT
  'excedentes_fusion_legacy_liga',
  coalesce(sum(riviera_count - 1), 0)::bigint,
  count(*)::bigint
FROM (
  SELECT legacy_liga_jugador_id, count(DISTINCT id) AS riviera_count
  FROM public.riviera_jugadores
  WHERE legacy_liga_jugador_id IS NOT NULL
  GROUP BY legacy_liga_jugador_id
  HAVING count(DISTINCT id) > 1
) g;
