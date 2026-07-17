-- =============================================================================
-- AUDIT READ-ONLY: duplicación / sobrescritura de players al seleccionar
-- jugadores concedidos en retas (linkLegacyOnSelectForReta).
--
-- NO ejecutar automáticamente. Solo SELECT / WITH.
-- Prohibido: INSERT, UPDATE, DELETE, ALTER, CREATE, DROP, TRUNCATE, CALL.
-- =============================================================================

-- Formato sintético (código):
--   reta-link-<uuid_sin_guiones_minusculas>@padel.local
--   syntheticEmailForRivieraJugadorId(riviera_jugador_id)

-- ── 0) Yusuke / RIV-00000046: resolver perfiles ───────────────────────────────
WITH yusuke AS (
  SELECT
    rj.id,
    rj.nombre,
    rj.riviera_id,
    rj.organizador_id,
    rj.legacy_player_id,
    rj.estado,
    rj.created_at
  FROM public.riviera_jugadores rj
  WHERE rj.riviera_id = 'RIV-00000046'
     OR lower(coalesce(rj.nombre, '')) LIKE '%yusuke%'
)
SELECT 'yusuke_profiles' AS section, y.*
FROM yusuke y
ORDER BY y.created_at NULLS LAST;

-- Grants relacionados con esos perfiles
WITH yusuke_ids AS (
  SELECT rj.id
  FROM public.riviera_jugadores rj
  WHERE rj.riviera_id = 'RIV-00000046'
     OR lower(coalesce(rj.nombre, '')) LIKE '%yusuke%'
)
SELECT
  'yusuke_grants' AS section,
  opa.id AS access_id,
  opa.jugador_id AS source_jugador_id,
  opa.local_jugador_id,
  opa.owner_organizador_id,
  opa.grantee_organizer_id,
  opa.is_active,
  opa.created_at AS grant_created_at
FROM public.organizer_player_access opa
WHERE opa.jugador_id IN (SELECT id FROM yusuke_ids)
   OR opa.local_jugador_id IN (SELECT id FROM yusuke_ids)
ORDER BY opa.created_at NULLS LAST;

-- Legacy players apuntados por perfiles Yusuke
WITH yusuke AS (
  SELECT rj.id, rj.nombre, rj.riviera_id, rj.organizador_id, rj.legacy_player_id
  FROM public.riviera_jugadores rj
  WHERE rj.riviera_id = 'RIV-00000046'
     OR lower(coalesce(rj.nombre, '')) LIKE '%yusuke%'
)
SELECT
  'yusuke_legacy' AS section,
  y.id AS riviera_jugador_id,
  y.organizador_id AS perfil_org,
  y.legacy_player_id,
  p.id AS players_id,
  p.name AS players_name,
  p.email AS players_email,
  p.user_id AS players_user_id,
  p.tournament_id,
  p.created_at AS players_created_at,
  CASE
    WHEN p.user_id IS NULL THEN 'players_sin_user_id'
    WHEN p.user_id = y.organizador_id THEN 'legacy_mismo_org_perfil'
    ELSE 'INCONSISTENCIA_A_posible_legacy_otro_org'
  END AS ownership_vs_perfil
FROM yusuke y
LEFT JOIN public.players p ON p.id = y.legacy_player_id
ORDER BY y.organizador_id, y.id;

-- ── 1) Todos los synthetic reta-link players ────────────────────────────────
WITH synth AS (
  SELECT
    p.id,
    p.name,
    p.email,
    p.user_id,
    p.tournament_id,
    p.created_at,
    -- uuid sin guiones → reconstruir 8-4-4-4-12
    lower(substring(p.email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) AS compact_uuid,
    CASE
      WHEN p.email ~* '^reta-link-[0-9a-f]{32}@padel\.local$' THEN
        (
          substring(lower(substring(p.email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) FROM 1 FOR 8) || '-' ||
          substring(lower(substring(p.email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) FROM 9 FOR 4) || '-' ||
          substring(lower(substring(p.email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) FROM 13 FOR 4) || '-' ||
          substring(lower(substring(p.email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) FROM 17 FOR 4) || '-' ||
          substring(lower(substring(p.email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) FROM 21 FOR 12)
        )::uuid
      ELSE NULL
    END AS riviera_uuid_from_email
  FROM public.players p
  WHERE p.email ILIKE 'reta-link-%@padel.local'
)
SELECT
  'synth_players' AS section,
  s.*,
  rj.id AS referring_rj_id,
  rj.organizador_id AS referring_rj_org,
  rj.riviera_id AS referring_riviera_id,
  rj.legacy_player_id AS referring_legacy,
  CASE
    WHEN rj.id IS NULL THEN 'sin_referencia_rj'
    WHEN opa_as_local.id IS NOT NULL THEN 'perfil_local_concedido'
    WHEN opa_as_source.id IS NOT NULL THEN 'perfil_origen_con_grant'
    ELSE 'perfil_propio_u_otro'
  END AS perfil_rol,
  opa_as_source.jugador_id AS opa_source_jugador_id,
  opa_as_source.local_jugador_id AS opa_source_local_id,
  opa_as_source.owner_organizador_id AS opa_source_owner,
  opa_as_source.grantee_organizer_id AS opa_source_grantee,
  opa_as_local.jugador_id AS opa_local_source_id,
  opa_as_local.local_jugador_id AS opa_local_id,
  opa_as_local.owner_organizador_id AS opa_local_owner,
  opa_as_local.grantee_organizer_id AS opa_local_grantee
FROM synth s
LEFT JOIN public.riviera_jugadores rj
  ON rj.id = s.riviera_uuid_from_email
  OR rj.legacy_player_id = s.id
LEFT JOIN LATERAL (
  SELECT *
  FROM public.organizer_player_access opa
  WHERE opa.jugador_id = rj.id AND opa.is_active = true
  ORDER BY opa.updated_at DESC NULLS LAST
  LIMIT 1
) opa_as_source ON true
LEFT JOIN LATERAL (
  SELECT *
  FROM public.organizer_player_access opa
  WHERE opa.local_jugador_id = rj.id AND opa.is_active = true
  ORDER BY opa.updated_at DESC NULLS LAST
  LIMIT 1
) opa_as_local ON true
ORDER BY s.created_at DESC NULLS LAST;

-- ── 2) Inconsistencia A: origen apunta a players de otro org ────────────────
SELECT
  'inconsistencia_A' AS section,
  rj.id AS origen_rj_id,
  rj.nombre,
  rj.riviera_id,
  rj.organizador_id AS origen_org,
  rj.legacy_player_id,
  p.user_id AS players_user_id,
  p.email,
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

-- ── 3) Inconsistencia B: local sin legacy; origen apunta a pool del grantee ──
SELECT
  'inconsistencia_B' AS section,
  opa.grantee_organizer_id,
  opa.owner_organizador_id,
  opa.jugador_id AS source_id,
  opa.local_jugador_id AS local_id,
  src.legacy_player_id AS source_legacy,
  loc.legacy_player_id AS local_legacy,
  p.user_id AS source_legacy_players_user_id,
  p.email AS source_legacy_email
FROM public.organizer_player_access opa
JOIN public.riviera_jugadores src ON src.id = opa.jugador_id
JOIN public.riviera_jugadores loc ON loc.id = opa.local_jugador_id
LEFT JOIN public.players p ON p.id = src.legacy_player_id
WHERE opa.is_active = true
  AND opa.local_jugador_id IS NOT NULL
  AND (loc.legacy_player_id IS NULL OR nullif(trim(loc.legacy_player_id::text), '') IS NULL)
  AND src.legacy_player_id IS NOT NULL
  AND p.user_id IS NOT NULL
  AND p.user_id = opa.grantee_organizer_id
ORDER BY opa.updated_at DESC NULLS LAST;

-- ── 4) Inconsistencia C: mismo UUID sintético → varios players ──────────────
WITH synth AS (
  SELECT
    p.id,
    p.email,
    p.user_id,
    p.created_at,
    lower(substring(p.email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) AS compact_uuid
  FROM public.players p
  WHERE p.email ~* '^reta-link-[0-9a-f]{32}@padel\.local$'
)
SELECT
  'inconsistencia_C' AS section,
  compact_uuid,
  count(*) AS players_count,
  array_agg(id ORDER BY created_at) AS player_ids,
  array_agg(user_id ORDER BY created_at) AS user_ids
FROM synth
WHERE compact_uuid IS NOT NULL
GROUP BY compact_uuid
HAVING count(*) > 1
ORDER BY players_count DESC;

-- ── 5) Inconsistencia D: varios synth por (org destino + local operativo) ────
WITH synth AS (
  SELECT
    p.id,
    p.user_id,
    p.email,
    p.created_at,
    CASE
      WHEN p.email ~* '^reta-link-[0-9a-f]{32}@padel\.local$' THEN
        (
          substring(lower(substring(p.email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) FROM 1 FOR 8) || '-' ||
          substring(lower(substring(p.email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) FROM 9 FOR 4) || '-' ||
          substring(lower(substring(p.email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) FROM 13 FOR 4) || '-' ||
          substring(lower(substring(p.email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) FROM 17 FOR 4) || '-' ||
          substring(lower(substring(p.email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) FROM 21 FOR 12)
        )::uuid
      ELSE NULL
    END AS riviera_uuid_from_email
  FROM public.players p
  WHERE p.email ILIKE 'reta-link-%@padel.local'
),
paired AS (
  SELECT
    s.user_id AS organizador_destino,
    s.riviera_uuid_from_email AS local_or_encoded_rj,
    s.id AS players_id,
    s.created_at
  FROM synth s
  WHERE s.riviera_uuid_from_email IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organizer_player_access opa
      WHERE opa.local_jugador_id = s.riviera_uuid_from_email
        AND opa.grantee_organizer_id = s.user_id
        AND opa.is_active = true
    )
)
SELECT
  'inconsistencia_D' AS section,
  organizador_destino,
  local_or_encoded_rj,
  count(*) AS players_count,
  array_agg(players_id ORDER BY created_at) AS player_ids
FROM paired
GROUP BY organizador_destino, local_or_encoded_rj
HAVING count(*) > 1
ORDER BY players_count DESC;

-- ── 6) Inconsistencia E (sospecha temporal, no hecho): legacy posterior al grant
SELECT
  'inconsistencia_E_sospecha' AS section,
  opa.grantee_organizer_id,
  opa.jugador_id AS source_id,
  opa.local_jugador_id,
  opa.created_at AS grant_created_at,
  loc.created_at AS local_rj_created_at,
  loc.legacy_player_id,
  p.created_at AS legacy_players_created_at,
  p.email
FROM public.organizer_player_access opa
JOIN public.riviera_jugadores loc ON loc.id = opa.local_jugador_id
LEFT JOIN public.players p ON p.id = loc.legacy_player_id
WHERE opa.is_active = true
  AND loc.legacy_player_id IS NOT NULL
  AND p.created_at IS NOT NULL
  AND (
    p.created_at > opa.created_at + interval '1 minute'
    OR (loc.created_at IS NOT NULL AND p.created_at > loc.created_at + interval '1 minute')
  )
ORDER BY p.created_at DESC NULLS LAST
LIMIT 200;

-- ── 7) Conteos finales ──────────────────────────────────────────────────────
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
    SELECT 1 FROM public.organizer_player_access opa
    WHERE opa.jugador_id = rj.id AND opa.is_active = true
  )

UNION ALL

SELECT 'count_local_sin_legacy_origen_en_grantee', count(*)::bigint
FROM public.organizer_player_access opa
JOIN public.riviera_jugadores src ON src.id = opa.jugador_id
JOIN public.riviera_jugadores loc ON loc.id = opa.local_jugador_id
JOIN public.players p ON p.id = src.legacy_player_id
WHERE opa.is_active = true
  AND opa.local_jugador_id IS NOT NULL
  AND loc.legacy_player_id IS NULL
  AND p.user_id = opa.grantee_organizer_id

UNION ALL

SELECT 'count_dup_synth_uuid', count(*)::bigint
FROM (
  SELECT lower(substring(email FROM '^reta-link-([0-9a-f]{32})@padel\.local$')) AS c
  FROM public.players
  WHERE email ~* '^reta-link-[0-9a-f]{32}@padel\.local$'
  GROUP BY 1
  HAVING count(*) > 1
) d

UNION ALL

SELECT 'count_grants_activos', count(*)::bigint
FROM public.organizer_player_access
WHERE is_active = true

UNION ALL

SELECT 'count_orphan_legacy_physical', count(*)::bigint
FROM public.riviera_jugadores rj
LEFT JOIN public.players p ON p.id = rj.legacy_player_id
WHERE rj.legacy_player_id IS NOT NULL
  AND p.id IS NULL;
