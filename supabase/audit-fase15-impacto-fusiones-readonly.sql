-- =============================================================================
-- FASE 1.5 — AUDIT DE IMPACTO (READ-ONLY)
-- ¿Las 6 fusiones históricas contaminaron carrera (participaciones/rating/ledger)
-- o solo son problema estructural de proyecciones legacy?
--
-- SOLO SELECT. Prohibido: INSERT/UPDATE/DELETE/DDL/CALL/DO/reparación.
-- Ejecutar en SQL Editor como postgres (o rol que vea information_schema + tablas).
-- =============================================================================
--
-- COLUMNAS CONFIRMADAS EN REPO (antes de information_schema):
--   riviera_jugadores.id, legacy_player_id, legacy_liga_jugador_id, organizador_id
--   jugador_participaciones.jugador_id
--   rating_historial.jugador_id
--   riviera_official_points_ledger.source_local_jugador_id  (NO se llama riviera_jugador_id)
--   organizer_player_access.jugador_id, local_jugador_id,
--     owner_organizador_id, grantee_organizer_id, is_active
--   pairs.player1_id, player2_id  → players.id
--   liga_inscripciones.jugador_id → liga_jugadores.id
--   liga_equipos.jugador1_id, jugador2_id
--   liga_jornada_parejas.jugador1_id, jugador2_id
--
-- El bloque 0 valida todo esto en producción vía information_schema.
-- Si alguna columna falta, NO interpretar resultados posteriores a ciegas.
-- =============================================================================

BEGIN;
SET TRANSACTION READ ONLY;

-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 0 — VALIDACIÓN information_schema
-- ══════════════════════════════════════════════════════════════════════════════

-- 0A) ¿Existen las tablas esperadas?
WITH expected(table_name) AS (
  VALUES
    ('riviera_jugadores'),
    ('players'),
    ('liga_jugadores'),
    ('organizer_player_access'),
    ('jugador_participaciones'),
    ('rating_historial'),
    ('riviera_official_points_ledger'),
    ('pairs'),
    ('liga_inscripciones'),
    ('liga_equipos'),
    ('liga_jornada_parejas')
)
SELECT
  'schema_tables' AS section,
  e.table_name AS expected_table,
  CASE
    WHEN t.table_name IS NULL THEN 'NO_EXISTE'
    ELSE 'EXISTE'
  END AS status,
  t.table_schema
FROM expected e
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public'
 AND t.table_name = e.table_name
ORDER BY e.table_name;

-- 0B) Columnas reales de cada tabla (identity-related)
SELECT
  'schema_columns' AS section,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.ordinal_position
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'riviera_jugadores',
    'players',
    'liga_jugadores',
    'organizer_player_access',
    'jugador_participaciones',
    'rating_historial',
    'riviera_official_points_ledger',
    'pairs',
    'liga_inscripciones',
    'liga_equipos',
    'liga_jornada_parejas'
  )
ORDER BY c.table_name, c.ordinal_position;

-- 0C) Checklist de columnas críticas (EXISTE / NO_EXISTE)
WITH need(table_name, column_name, role) AS (
  VALUES
    ('riviera_jugadores', 'id', 'pk_riviera'),
    ('riviera_jugadores', 'legacy_player_id', 'bridge_players'),
    ('riviera_jugadores', 'legacy_liga_jugador_id', 'bridge_liga'),
    ('riviera_jugadores', 'organizador_id', 'org'),
    ('players', 'id', 'pk_players'),
    ('liga_jugadores', 'id', 'pk_liga'),
    ('jugador_participaciones', 'jugador_id', 'career_riviera'),
    ('rating_historial', 'jugador_id', 'rating_riviera'),
    ('riviera_official_points_ledger', 'source_local_jugador_id', 'ledger_riviera'),
    ('organizer_player_access', 'jugador_id', 'opa_source'),
    ('organizer_player_access', 'local_jugador_id', 'opa_local'),
    ('organizer_player_access', 'owner_organizador_id', 'opa_owner'),
    ('organizer_player_access', 'grantee_organizer_id', 'opa_grantee'),
    ('pairs', 'player1_id', 'pairs_p1'),
    ('pairs', 'player2_id', 'pairs_p2'),
    ('liga_inscripciones', 'jugador_id', 'liga_insc'),
    ('liga_equipos', 'jugador1_id', 'liga_eq1'),
    ('liga_equipos', 'jugador2_id', 'liga_eq2'),
    ('liga_jornada_parejas', 'jugador1_id', 'liga_jp1'),
    ('liga_jornada_parejas', 'jugador2_id', 'liga_jp2')
)
SELECT
  'schema_critical_columns' AS section,
  n.table_name,
  n.column_name,
  n.role,
  CASE WHEN c.column_name IS NULL THEN 'NO_EXISTE' ELSE 'EXISTE' END AS status,
  c.data_type
FROM need n
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = n.table_name
 AND c.column_name = n.column_name
ORDER BY n.table_name, n.column_name;

-- 0D) PK y FK físicas (si existen en el catálogo)
SELECT
  'schema_pks' AS section,
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_name IN (
    'riviera_jugadores',
    'players',
    'liga_jugadores',
    'organizer_player_access',
    'jugador_participaciones',
    'rating_historial',
    'riviera_official_points_ledger',
    'pairs',
    'liga_inscripciones',
    'liga_equipos',
    'liga_jornada_parejas'
  )
ORDER BY tc.table_name, kcu.ordinal_position;

SELECT
  'schema_fks' AS section,
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND (
    tc.table_name IN (
      'riviera_jugadores',
      'organizer_player_access',
      'jugador_participaciones',
      'rating_historial',
      'riviera_official_points_ledger',
      'pairs',
      'liga_inscripciones',
      'liga_equipos',
      'liga_jornada_parejas'
    )
    OR ccu.table_name IN (
      'riviera_jugadores',
      'players',
      'liga_jugadores'
    )
  )
ORDER BY tc.table_name, kcu.column_name;

-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 1 — GRUPOS AFECTADOS (solo fusiones ya detectadas: >1 riviera por legacy)
-- ══════════════════════════════════════════════════════════════════════════════

WITH fused_players AS (
  SELECT
    rj.legacy_player_id,
    array_agg(rj.id ORDER BY rj.id) AS riviera_ids,
    count(DISTINCT rj.id) AS riviera_count
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_player_id IS NOT NULL
  GROUP BY rj.legacy_player_id
  HAVING count(DISTINCT rj.id) > 1
),
fused_liga AS (
  SELECT
    rj.legacy_liga_jugador_id,
    array_agg(rj.id ORDER BY rj.id) AS riviera_ids,
    count(DISTINCT rj.id) AS riviera_count
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_liga_jugador_id IS NOT NULL
  GROUP BY rj.legacy_liga_jugador_id
  HAVING count(DISTINCT rj.id) > 1
),
-- Emparejar players↔liga solo si el conjunto de riviera_ids es idéntico
joint AS (
  SELECT
    fp.legacy_player_id,
    fl.legacy_liga_jugador_id,
    fp.riviera_ids,
    fp.riviera_count,
    'PLAYERS_Y_LIGA'::text AS layer_class
  FROM fused_players fp
  JOIN fused_liga fl
    ON fp.riviera_ids @> fl.riviera_ids
   AND fp.riviera_ids <@ fl.riviera_ids
),
solo_players AS (
  SELECT
    fp.legacy_player_id,
    NULL::uuid AS legacy_liga_jugador_id,
    fp.riviera_ids,
    fp.riviera_count,
    'SOLO_PLAYERS'::text AS layer_class
  FROM fused_players fp
  WHERE NOT EXISTS (
    SELECT 1 FROM joint j WHERE j.legacy_player_id = fp.legacy_player_id
  )
),
solo_liga AS (
  SELECT
    NULL::uuid AS legacy_player_id,
    fl.legacy_liga_jugador_id,
    fl.riviera_ids,
    fl.riviera_count,
    'SOLO_LIGA'::text AS layer_class
  FROM fused_liga fl
  WHERE NOT EXISTS (
    SELECT 1 FROM joint j WHERE j.legacy_liga_jugador_id = fl.legacy_liga_jugador_id
  )
),
groups AS (
  SELECT * FROM joint
  UNION ALL
  SELECT * FROM solo_players
  UNION ALL
  SELECT * FROM solo_liga
)
SELECT
  'groups_inventory' AS section,
  CASE
    WHEN g.layer_class = 'PLAYERS_Y_LIGA' THEN
      'joint:' || g.legacy_player_id::text || '|' || g.legacy_liga_jugador_id::text
    WHEN g.layer_class = 'SOLO_PLAYERS' THEN
      'players:' || g.legacy_player_id::text
    ELSE
      'liga:' || g.legacy_liga_jugador_id::text
  END AS group_key,
  g.layer_class,
  g.legacy_player_id,
  g.legacy_liga_jugador_id,
  g.riviera_count,
  g.riviera_ids
FROM groups g
ORDER BY g.layer_class, group_key;

-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 2 — IMPACTO POR GRUPO (conteos; sin atribución forense)
-- Columnas usadas = las validadas en repo + checklist 0C.
-- ══════════════════════════════════════════════════════════════════════════════

WITH fused_players AS (
  SELECT
    rj.legacy_player_id,
    array_agg(rj.id ORDER BY rj.id) AS riviera_ids,
    count(DISTINCT rj.id) AS riviera_count
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_player_id IS NOT NULL
  GROUP BY rj.legacy_player_id
  HAVING count(DISTINCT rj.id) > 1
),
fused_liga AS (
  SELECT
    rj.legacy_liga_jugador_id,
    array_agg(rj.id ORDER BY rj.id) AS riviera_ids,
    count(DISTINCT rj.id) AS riviera_count
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_liga_jugador_id IS NOT NULL
  GROUP BY rj.legacy_liga_jugador_id
  HAVING count(DISTINCT rj.id) > 1
),
joint AS (
  SELECT
    fp.legacy_player_id,
    fl.legacy_liga_jugador_id,
    fp.riviera_ids,
    fp.riviera_count,
    'PLAYERS_Y_LIGA'::text AS layer_class
  FROM fused_players fp
  JOIN fused_liga fl
    ON fp.riviera_ids @> fl.riviera_ids
   AND fp.riviera_ids <@ fl.riviera_ids
),
solo_players AS (
  SELECT
    fp.legacy_player_id,
    NULL::uuid AS legacy_liga_jugador_id,
    fp.riviera_ids,
    fp.riviera_count,
    'SOLO_PLAYERS'::text AS layer_class
  FROM fused_players fp
  WHERE NOT EXISTS (
    SELECT 1 FROM joint j WHERE j.legacy_player_id = fp.legacy_player_id
  )
),
solo_liga AS (
  SELECT
    NULL::uuid AS legacy_player_id,
    fl.legacy_liga_jugador_id,
    fl.riviera_ids,
    fl.riviera_count,
    'SOLO_LIGA'::text AS layer_class
  FROM fused_liga fl
  WHERE NOT EXISTS (
    SELECT 1 FROM joint j WHERE j.legacy_liga_jugador_id = fl.legacy_liga_jugador_id
  )
),
groups AS (
  SELECT * FROM joint
  UNION ALL
  SELECT * FROM solo_players
  UNION ALL
  SELECT * FROM solo_liga
),
impact AS (
  SELECT
    CASE
      WHEN g.layer_class = 'PLAYERS_Y_LIGA' THEN
        'joint:' || g.legacy_player_id::text || '|' || g.legacy_liga_jugador_id::text
      WHEN g.layer_class = 'SOLO_PLAYERS' THEN
        'players:' || g.legacy_player_id::text
      ELSE
        'liga:' || g.legacy_liga_jugador_id::text
    END AS group_key,
    g.layer_class,
    g.legacy_player_id,
    g.legacy_liga_jugador_id,
    g.riviera_ids,
    g.riviera_count,
    (
      SELECT count(*)::bigint
      FROM public.jugador_participaciones jp
      WHERE jp.jugador_id = ANY (g.riviera_ids)
    ) AS participaciones,
    (
      SELECT count(*)::bigint
      FROM public.rating_historial rh
      WHERE rh.jugador_id = ANY (g.riviera_ids)
    ) AS rating,
    (
      SELECT count(*)::bigint
      FROM public.riviera_official_points_ledger led
      WHERE led.source_local_jugador_id = ANY (g.riviera_ids)
    ) AS ledger,
    (
      SELECT count(*)::bigint
      FROM public.pairs p
      WHERE g.legacy_player_id IS NOT NULL
        AND (p.player1_id = g.legacy_player_id OR p.player2_id = g.legacy_player_id)
    ) AS pairs,
    (
      SELECT count(*)::bigint
      FROM public.liga_inscripciones li
      WHERE g.legacy_liga_jugador_id IS NOT NULL
        AND li.jugador_id = g.legacy_liga_jugador_id
    ) AS liga_inscripciones,
    (
      SELECT count(*)::bigint
      FROM public.liga_equipos le
      WHERE g.legacy_liga_jugador_id IS NOT NULL
        AND (
          le.jugador1_id = g.legacy_liga_jugador_id
          OR le.jugador2_id = g.legacy_liga_jugador_id
        )
    ) AS liga_equipos,
    (
      SELECT count(*)::bigint
      FROM public.liga_jornada_parejas ljp
      WHERE g.legacy_liga_jugador_id IS NOT NULL
        AND (
          ljp.jugador1_id = g.legacy_liga_jugador_id
          OR ljp.jugador2_id = g.legacy_liga_jugador_id
        )
    ) AS liga_jornada_parejas,
    (
      SELECT count(*)::bigint
      FROM public.organizer_player_access opa
      WHERE opa.jugador_id = ANY (g.riviera_ids)
         OR opa.local_jugador_id = ANY (g.riviera_ids)
    ) AS organizer_player_access
  FROM groups g
)
SELECT
  'impact_by_group' AS section,
  i.*,
  (i.liga_inscripciones + i.liga_equipos + i.liga_jornada_parejas) AS liga_total,
  CASE
    WHEN i.participaciones > 0 OR i.rating > 0 OR i.ledger > 0 THEN 'CARRERA_AFECTADA'
    WHEN (i.liga_inscripciones + i.liga_equipos + i.liga_jornada_parejas) > 0
         AND i.pairs = 0 THEN 'SOLO_LIGA'
    WHEN i.pairs > 0
         AND (i.liga_inscripciones + i.liga_equipos + i.liga_jornada_parejas) = 0 THEN 'SOLO_POOL'
    WHEN i.pairs > 0
         AND (i.liga_inscripciones + i.liga_equipos + i.liga_jornada_parejas) > 0 THEN 'SOLO_POOL'
      -- pool+liga operativa sin carrera → marcar como SOLO_POOL en capa players
      -- (la capa liga queda visible en liga_total; no es carrera ROMC)
    WHEN i.organizer_player_access > 0 THEN 'SIN_HISTORIAL'
      -- OPA sola = acceso, no carrera deportiva
    ELSE 'SIN_HISTORIAL'
  END AS classification
FROM impact i
ORDER BY
  CASE
    WHEN i.participaciones > 0 OR i.rating > 0 OR i.ledger > 0 THEN 0
    ELSE 1
  END,
  i.group_key;

-- Ajuste fino de clasificación pool+liga sin carrera:
-- (repite lógica explícita en resumen)

WITH fused_players AS (
  SELECT
    rj.legacy_player_id,
    array_agg(rj.id ORDER BY rj.id) AS riviera_ids
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_player_id IS NOT NULL
  GROUP BY rj.legacy_player_id
  HAVING count(DISTINCT rj.id) > 1
),
fused_liga AS (
  SELECT
    rj.legacy_liga_jugador_id,
    array_agg(rj.id ORDER BY rj.id) AS riviera_ids
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_liga_jugador_id IS NOT NULL
  GROUP BY rj.legacy_liga_jugador_id
  HAVING count(DISTINCT rj.id) > 1
),
joint AS (
  SELECT
    fp.legacy_player_id,
    fl.legacy_liga_jugador_id,
    fp.riviera_ids,
    'PLAYERS_Y_LIGA'::text AS layer_class
  FROM fused_players fp
  JOIN fused_liga fl
    ON fp.riviera_ids @> fl.riviera_ids
   AND fp.riviera_ids <@ fl.riviera_ids
),
solo_players AS (
  SELECT
    fp.legacy_player_id,
    NULL::uuid AS legacy_liga_jugador_id,
    fp.riviera_ids,
    'SOLO_PLAYERS'::text AS layer_class
  FROM fused_players fp
  WHERE NOT EXISTS (
    SELECT 1 FROM joint j WHERE j.legacy_player_id = fp.legacy_player_id
  )
),
solo_liga AS (
  SELECT
    NULL::uuid AS legacy_player_id,
    fl.legacy_liga_jugador_id,
    fl.riviera_ids,
    'SOLO_LIGA'::text AS layer_class
  FROM fused_liga fl
  WHERE NOT EXISTS (
    SELECT 1 FROM joint j WHERE j.legacy_liga_jugador_id = fl.legacy_liga_jugador_id
  )
),
groups AS (
  SELECT * FROM joint
  UNION ALL SELECT * FROM solo_players
  UNION ALL SELECT * FROM solo_liga
),
impact AS (
  SELECT
    CASE
      WHEN g.layer_class = 'PLAYERS_Y_LIGA' THEN
        'joint:' || g.legacy_player_id::text || '|' || g.legacy_liga_jugador_id::text
      WHEN g.layer_class = 'SOLO_PLAYERS' THEN
        'players:' || g.legacy_player_id::text
      ELSE
        'liga:' || g.legacy_liga_jugador_id::text
    END AS group_key,
    g.legacy_player_id,
    g.legacy_liga_jugador_id,
    (
      SELECT count(*)::bigint FROM public.jugador_participaciones jp
      WHERE jp.jugador_id = ANY (g.riviera_ids)
    ) AS participaciones,
    (
      SELECT count(*)::bigint FROM public.rating_historial rh
      WHERE rh.jugador_id = ANY (g.riviera_ids)
    ) AS rating,
    (
      SELECT count(*)::bigint FROM public.riviera_official_points_ledger led
      WHERE led.source_local_jugador_id = ANY (g.riviera_ids)
    ) AS ledger,
    (
      SELECT count(*)::bigint FROM public.pairs p
      WHERE g.legacy_player_id IS NOT NULL
        AND (p.player1_id = g.legacy_player_id OR p.player2_id = g.legacy_player_id)
    ) AS pairs,
    (
      SELECT count(*)::bigint FROM public.liga_inscripciones li
      WHERE g.legacy_liga_jugador_id IS NOT NULL
        AND li.jugador_id = g.legacy_liga_jugador_id
    ) AS liga_inscripciones,
    (
      SELECT count(*)::bigint FROM public.liga_equipos le
      WHERE g.legacy_liga_jugador_id IS NOT NULL
        AND (le.jugador1_id = g.legacy_liga_jugador_id OR le.jugador2_id = g.legacy_liga_jugador_id)
    ) AS liga_equipos,
    (
      SELECT count(*)::bigint FROM public.liga_jornada_parejas ljp
      WHERE g.legacy_liga_jugador_id IS NOT NULL
        AND (ljp.jugador1_id = g.legacy_liga_jugador_id OR ljp.jugador2_id = g.legacy_liga_jugador_id)
    ) AS liga_jornada_parejas,
    (
      SELECT count(*)::bigint FROM public.organizer_player_access opa
      WHERE opa.jugador_id = ANY (g.riviera_ids)
         OR opa.local_jugador_id = ANY (g.riviera_ids)
    ) AS organizer_player_access
  FROM groups g
)
SELECT
  'impact_summary' AS section,
  i.group_key AS "Grupo",
  i.participaciones AS "Participaciones",
  i.rating AS "Rating",
  i.ledger AS "Ledger",
  i.pairs AS "Pairs",
  (i.liga_inscripciones + i.liga_equipos + i.liga_jornada_parejas) AS "Liga",
  CASE
    WHEN i.participaciones > 0 OR i.rating > 0 OR i.ledger > 0 THEN 'SÍ'
    ELSE 'NO'
  END AS "Carrera afectada",
  CASE
    WHEN i.participaciones > 0 OR i.rating > 0 OR i.ledger > 0 THEN 'CARRERA_AFECTADA'
    WHEN (i.liga_inscripciones + i.liga_equipos + i.liga_jornada_parejas) > 0
         AND i.pairs = 0
         AND i.participaciones = 0 AND i.rating = 0 AND i.ledger = 0 THEN 'SOLO_LIGA'
    WHEN i.pairs > 0
         AND i.participaciones = 0 AND i.rating = 0 AND i.ledger = 0 THEN 'SOLO_POOL'
    ELSE 'SIN_HISTORIAL'
  END AS "Clasificación",
  i.legacy_player_id,
  i.legacy_liga_jugador_id,
  i.liga_inscripciones,
  i.liga_equipos,
  i.liga_jornada_parejas,
  i.organizer_player_access
FROM impact i
ORDER BY
  CASE
    WHEN i.participaciones > 0 OR i.rating > 0 OR i.ledger > 0 THEN 0
    WHEN i.pairs > 0 OR (i.liga_inscripciones + i.liga_equipos + i.liga_jornada_parejas) > 0 THEN 1
    ELSE 2
  END,
  i.group_key;

-- Detalle opcional: conteo de carrera POR riviera_jugador_id (sin atribuir identidad)
WITH fused_ids AS (
  SELECT DISTINCT rj.id AS riviera_jugador_id
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_player_id IN (
    SELECT legacy_player_id
    FROM public.riviera_jugadores
    WHERE legacy_player_id IS NOT NULL
    GROUP BY legacy_player_id
    HAVING count(DISTINCT id) > 1
  )
  OR rj.legacy_liga_jugador_id IN (
    SELECT legacy_liga_jugador_id
    FROM public.riviera_jugadores
    WHERE legacy_liga_jugador_id IS NOT NULL
    GROUP BY legacy_liga_jugador_id
    HAVING count(DISTINCT id) > 1
  )
),
career_counts AS (
  SELECT
    f.riviera_jugador_id,
    (
      SELECT count(*)::bigint
      FROM public.jugador_participaciones jp
      WHERE jp.jugador_id = f.riviera_jugador_id
    ) AS participaciones,
    (
      SELECT count(*)::bigint
      FROM public.rating_historial rh
      WHERE rh.jugador_id = f.riviera_jugador_id
    ) AS rating,
    (
      SELECT count(*)::bigint
      FROM public.riviera_official_points_ledger led
      WHERE led.source_local_jugador_id = f.riviera_jugador_id
    ) AS ledger
  FROM fused_ids f
)
SELECT
  'career_counts_per_riviera_id' AS section,
  riviera_jugador_id,
  participaciones,
  rating,
  ledger
FROM career_counts
ORDER BY
  (participaciones + rating + ledger) DESC,
  riviera_jugador_id;

-- ══════════════════════════════════════════════════════════════════════════════
-- RESULT SET 5 — IDENTITY_CONSISTENCY
-- ¿La carrera del grupo está en un solo riviera_jugadores.id o repartida?
--
-- UNKNOWN      = no existe carrera en ninguno de los riviera_jugadores.id del grupo
-- SINGLE_OWNER = exactamente un riviera_jugadores.id del grupo tiene carrera
--                (NO afirma que sea el propietario correcto; solo que no está repartida)
-- MULTI_OWNER  = ≥2 riviera_jugadores.id del mismo grupo tienen carrera
--                (mezcla potencial → atribución forense en fase siguiente)
--
-- No usar CONSISTENT: implicaría propiedad correcta, aún no demostrada.
-- ══════════════════════════════════════════════════════════════════════════════

WITH fused_players AS (
  SELECT
    rj.legacy_player_id,
    array_agg(rj.id ORDER BY rj.id) AS riviera_ids
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_player_id IS NOT NULL
  GROUP BY rj.legacy_player_id
  HAVING count(DISTINCT rj.id) > 1
),
fused_liga AS (
  SELECT
    rj.legacy_liga_jugador_id,
    array_agg(rj.id ORDER BY rj.id) AS riviera_ids
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_liga_jugador_id IS NOT NULL
  GROUP BY rj.legacy_liga_jugador_id
  HAVING count(DISTINCT rj.id) > 1
),
joint AS (
  SELECT
    fp.legacy_player_id,
    fl.legacy_liga_jugador_id,
    fp.riviera_ids,
    'PLAYERS_Y_LIGA'::text AS layer_class
  FROM fused_players fp
  JOIN fused_liga fl
    ON fp.riviera_ids @> fl.riviera_ids
   AND fp.riviera_ids <@ fl.riviera_ids
),
solo_players AS (
  SELECT
    fp.legacy_player_id,
    NULL::uuid AS legacy_liga_jugador_id,
    fp.riviera_ids,
    'SOLO_PLAYERS'::text AS layer_class
  FROM fused_players fp
  WHERE NOT EXISTS (
    SELECT 1 FROM joint j WHERE j.legacy_player_id = fp.legacy_player_id
  )
),
solo_liga AS (
  SELECT
    NULL::uuid AS legacy_player_id,
    fl.legacy_liga_jugador_id,
    fl.riviera_ids,
    'SOLO_LIGA'::text AS layer_class
  FROM fused_liga fl
  WHERE NOT EXISTS (
    SELECT 1 FROM joint j WHERE j.legacy_liga_jugador_id = fl.legacy_liga_jugador_id
  )
),
groups AS (
  SELECT * FROM joint
  UNION ALL SELECT * FROM solo_players
  UNION ALL SELECT * FROM solo_liga
),
members AS (
  SELECT
    CASE
      WHEN g.layer_class = 'PLAYERS_Y_LIGA' THEN
        'joint:' || g.legacy_player_id::text || '|' || g.legacy_liga_jugador_id::text
      WHEN g.layer_class = 'SOLO_PLAYERS' THEN
        'players:' || g.legacy_player_id::text
      ELSE
        'liga:' || g.legacy_liga_jugador_id::text
    END AS group_key,
    g.legacy_player_id,
    g.legacy_liga_jugador_id,
    unnest(g.riviera_ids) AS riviera_jugador_id
  FROM groups g
),
per_riviera AS (
  SELECT
    m.group_key,
    m.riviera_jugador_id,
    m.legacy_player_id,
    m.legacy_liga_jugador_id,
    (
      SELECT count(*)::bigint
      FROM public.jugador_participaciones jp
      WHERE jp.jugador_id = m.riviera_jugador_id
    ) AS participaciones,
    (
      SELECT count(*)::bigint
      FROM public.rating_historial rh
      WHERE rh.jugador_id = m.riviera_jugador_id
    ) AS rating,
    (
      SELECT count(*)::bigint
      FROM public.riviera_official_points_ledger led
      WHERE led.source_local_jugador_id = m.riviera_jugador_id
    ) AS ledger
  FROM members m
),
group_flags AS (
  SELECT
    group_key,
    count(*) FILTER (
      WHERE (participaciones + rating + ledger) > 0
    )::bigint AS riviera_ids_with_career
  FROM per_riviera
  GROUP BY group_key
)
SELECT
  'IDENTITY_CONSISTENCY' AS section,
  p.group_key,
  p.riviera_jugador_id,
  p.legacy_player_id,
  p.legacy_liga_jugador_id,
  p.participaciones,
  p.rating,
  p.ledger,
  CASE
    WHEN f.riviera_ids_with_career = 0 THEN 'UNKNOWN'
    WHEN f.riviera_ids_with_career = 1 THEN 'SINGLE_OWNER'
    WHEN f.riviera_ids_with_career >= 2 THEN 'MULTI_OWNER'
    ELSE 'UNKNOWN'
  END AS identity_consistent
FROM per_riviera p
JOIN group_flags f ON f.group_key = p.group_key
ORDER BY
  p.group_key,
  (p.participaciones + p.rating + p.ledger) DESC,
  p.riviera_jugador_id;

-- Resumen por grupo (una fila; mismo veredicto)
WITH fused_players AS (
  SELECT
    rj.legacy_player_id,
    array_agg(rj.id ORDER BY rj.id) AS riviera_ids
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_player_id IS NOT NULL
  GROUP BY rj.legacy_player_id
  HAVING count(DISTINCT rj.id) > 1
),
fused_liga AS (
  SELECT
    rj.legacy_liga_jugador_id,
    array_agg(rj.id ORDER BY rj.id) AS riviera_ids
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_liga_jugador_id IS NOT NULL
  GROUP BY rj.legacy_liga_jugador_id
  HAVING count(DISTINCT rj.id) > 1
),
joint AS (
  SELECT
    fp.legacy_player_id,
    fl.legacy_liga_jugador_id,
    fp.riviera_ids,
    'PLAYERS_Y_LIGA'::text AS layer_class
  FROM fused_players fp
  JOIN fused_liga fl
    ON fp.riviera_ids @> fl.riviera_ids
   AND fp.riviera_ids <@ fl.riviera_ids
),
solo_players AS (
  SELECT
    fp.legacy_player_id,
    NULL::uuid AS legacy_liga_jugador_id,
    fp.riviera_ids,
    'SOLO_PLAYERS'::text AS layer_class
  FROM fused_players fp
  WHERE NOT EXISTS (
    SELECT 1 FROM joint j WHERE j.legacy_player_id = fp.legacy_player_id
  )
),
solo_liga AS (
  SELECT
    NULL::uuid AS legacy_player_id,
    fl.legacy_liga_jugador_id,
    fl.riviera_ids,
    'SOLO_LIGA'::text AS layer_class
  FROM fused_liga fl
  WHERE NOT EXISTS (
    SELECT 1 FROM joint j WHERE j.legacy_liga_jugador_id = fl.legacy_liga_jugador_id
  )
),
groups AS (
  SELECT * FROM joint
  UNION ALL SELECT * FROM solo_players
  UNION ALL SELECT * FROM solo_liga
),
members AS (
  SELECT
    CASE
      WHEN g.layer_class = 'PLAYERS_Y_LIGA' THEN
        'joint:' || g.legacy_player_id::text || '|' || g.legacy_liga_jugador_id::text
      WHEN g.layer_class = 'SOLO_PLAYERS' THEN
        'players:' || g.legacy_player_id::text
      ELSE
        'liga:' || g.legacy_liga_jugador_id::text
    END AS group_key,
    g.legacy_player_id,
    g.legacy_liga_jugador_id,
    unnest(g.riviera_ids) AS riviera_jugador_id
  FROM groups g
),
per_riviera AS (
  SELECT
    m.group_key,
    m.legacy_player_id,
    m.legacy_liga_jugador_id,
    m.riviera_jugador_id,
    (
      SELECT count(*)::bigint FROM public.jugador_participaciones jp
      WHERE jp.jugador_id = m.riviera_jugador_id
    ) AS participaciones,
    (
      SELECT count(*)::bigint FROM public.rating_historial rh
      WHERE rh.jugador_id = m.riviera_jugador_id
    ) AS rating,
    (
      SELECT count(*)::bigint FROM public.riviera_official_points_ledger led
      WHERE led.source_local_jugador_id = m.riviera_jugador_id
    ) AS ledger
  FROM members m
)
SELECT
  'IDENTITY_CONSISTENCY_SUMMARY' AS section,
  group_key,
  legacy_player_id,
  legacy_liga_jugador_id,
  count(*)::bigint AS riviera_members,
  count(*) FILTER (WHERE (participaciones + rating + ledger) > 0)::bigint
    AS riviera_ids_with_career,
  sum(participaciones)::bigint AS participaciones_total,
  sum(rating)::bigint AS rating_total,
  sum(ledger)::bigint AS ledger_total,
  CASE
    WHEN count(*) FILTER (WHERE (participaciones + rating + ledger) > 0) = 0
      THEN 'UNKNOWN'
    WHEN count(*) FILTER (WHERE (participaciones + rating + ledger) > 0) = 1
      THEN 'SINGLE_OWNER'
    ELSE 'MULTI_OWNER'
  END AS identity_consistent
FROM per_riviera
GROUP BY group_key, legacy_player_id, legacy_liga_jugador_id
ORDER BY
  CASE
    WHEN count(*) FILTER (WHERE (participaciones + rating + ledger) > 0) >= 2 THEN 0
    WHEN count(*) FILTER (WHERE (participaciones + rating + ledger) > 0) = 1 THEN 1
    ELSE 2
  END,
  group_key;

ROLLBACK;
