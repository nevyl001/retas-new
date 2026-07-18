-- =============================================================================
-- AUDITORÍA READ-ONLY — cierres históricos parciales (pre-deploy)
-- 100% SELECT/CTE. Sin INSERT/UPDATE/DELETE/DDL/DO/TEMP/RPC con efectos.
--
-- Contratos (código + DDL del repo):
--   participaciones: jugador_participaciones (tipo_evento, evento_id, metadata.subtipo)
--   rating: rating_historial.partido_ref
--     reta:<matches.id> | americano:<match_id JSON> | duelo2v2:<duelos_2v2.id>
--     liga:<liga_partidos.id> | te-grupo:<torneo_express_partidos.id>
--     te-elim:<torneo_express_eliminatoria_partidos.id>
--   ledger ROMC: riviera_official_points_ledger
--     FK UNIQUE(participacion_id); también event_type + event_id (= tipo_evento/evento_id)
--
-- duplicate_* = filas EXCEDENTES (SUM(cnt-1) donde cnt>1), no número de grupos.
-- ledger ausente NO implica CLOSED_WITHOUT_CAREER (ROMC puede skip por gates).
-- POSSIBLE_PARTIAL_CLOSE usa solo participaciones+ledger (rating live en abierto es normal).
-- Salida por defecto: solo diagnosis <> CLEAN. Quitar el WHERE final para inventario completo.
-- =============================================================================

BEGIN;
SET TRANSACTION READ ONLY;

WITH
-- ── Clasificación Americano vs Reta en tournaments ─────────────────────────
americano_tournament_ids AS (
  SELECT DISTINCT c.tournament_id AS id
  FROM public.tournament_public_config c
  WHERE (
      lower(coalesce(c.format, '')) LIKE 'americano%'
      OR (
        c.americano_live IS NOT NULL
        AND jsonb_typeof(c.americano_live) = 'object'
        AND coalesce((c.americano_live->>'version')::int, 0) = 1
      )
    )
),

-- ── Partido refs por modo ──────────────────────────────────────────────────
reta_partido_refs AS (
  SELECT
    m.tournament_id AS event_id,
    ('reta:' || m.id::text) AS partido_ref
  FROM public.matches m
  WHERE m.tournament_id NOT IN (SELECT id FROM americano_tournament_ids)
),
americano_partido_refs AS (
  SELECT
    c.tournament_id AS event_id,
    ('americano:' || (match_el.elem->>'id')) AS partido_ref
  FROM public.tournament_public_config c
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(c.americano_live->'rounds') = 'array'
        THEN c.americano_live->'rounds'
      ELSE '[]'::jsonb
    END
  ) AS round_el(elem)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(round_el.elem->'matches') = 'array'
        THEN round_el.elem->'matches'
      ELSE '[]'::jsonb
    END
  ) AS match_el(elem)
  WHERE c.tournament_id IN (SELECT id FROM americano_tournament_ids)
    AND nullif(match_el.elem->>'id', '') IS NOT NULL
),
duelo_partido_refs AS (
  SELECT
    d.id AS event_id,
    ('duelo2v2:' || d.id::text) AS partido_ref
  FROM public.duelos_2v2 d
),
liga_jornada_partido_refs AS (
  SELECT
    lp.jornada_id AS event_id,
    ('liga:' || lp.id::text) AS partido_ref
  FROM public.liga_partidos lp
),
te_partido_refs AS (
  SELECT
    g.torneo_id AS event_id,
    ('te-grupo:' || tp.id::text) AS partido_ref
  FROM public.torneo_express_partidos tp
  JOIN public.torneo_express_grupos g ON g.id = tp.grupo_id
  UNION ALL
  SELECT
    ep.torneo_id AS event_id,
    ('te-elim:' || ep.id::text) AS partido_ref
  FROM public.torneo_express_eliminatoria_partidos ep
),

-- ── Expected player counts ─────────────────────────────────────────────────
reta_expected AS (
  SELECT
    p.tournament_id AS event_id,
    count(DISTINCT x.player_id)::bigint AS expected_player_count
  FROM public.pairs p
  CROSS JOIN LATERAL (VALUES (p.player1_id), (p.player2_id)) AS x(player_id)
  WHERE p.tournament_id NOT IN (SELECT id FROM americano_tournament_ids)
    AND x.player_id IS NOT NULL
  GROUP BY p.tournament_id
),
americano_expected AS (
  SELECT
    c.tournament_id AS event_id,
    CASE
      WHEN jsonb_typeof(c.americano_live->'roster') = 'array'
        THEN jsonb_array_length(c.americano_live->'roster')::bigint
      WHEN jsonb_typeof(c.americano_live->'ranking') = 'array'
        THEN jsonb_array_length(c.americano_live->'ranking')::bigint
      ELSE NULL::bigint
    END AS expected_player_count
  FROM public.tournament_public_config c
  WHERE c.tournament_id IN (SELECT id FROM americano_tournament_ids)
),
duelo_expected AS (
  SELECT
    d.id AS event_id,
    (
      (CASE WHEN d.pareja_a_j1_id IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN d.pareja_a_j2_id IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN d.pareja_b_j1_id IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN d.pareja_b_j2_id IS NOT NULL THEN 1 ELSE 0 END)
    )::bigint AS expected_player_count
  FROM public.duelos_2v2 d
),
liga_jornada_expected AS (
  -- Jugadores de parejas que aparecen en partidos completed de la jornada
  SELECT
    lp.jornada_id AS event_id,
    count(DISTINCT x.jugador_id)::bigint AS expected_player_count
  FROM public.liga_partidos lp
  JOIN public.liga_jornada_parejas jp1 ON jp1.id = lp.pareja1_id
  JOIN public.liga_jornada_parejas jp2 ON jp2.id = lp.pareja2_id
  CROSS JOIN LATERAL (
    VALUES
      (jp1.jugador1_id),
      (jp1.jugador2_id),
      (jp2.jugador1_id),
      (jp2.jugador2_id)
  ) AS x(jugador_id)
  WHERE lp.estado = 'completed'
    AND x.jugador_id IS NOT NULL
  GROUP BY lp.jornada_id
),
liga_podio_expected AS (
  SELECT
    l.id AS event_id,
    least(3, count(li.id))::bigint AS expected_player_count
  FROM public.ligas l
  LEFT JOIN public.liga_inscripciones li ON li.liga_id = l.id
  WHERE l.estado = 'completed'
  GROUP BY l.id
),
te_expected AS (
  SELECT
    g.torneo_id AS event_id,
    count(DISTINCT x.player_id)::bigint AS expected_player_count
  FROM public.torneo_express_grupos g
  JOIN public.torneo_express_grupo_parejas gp ON gp.grupo_id = g.id
  JOIN public.pairs p ON p.id = gp.pareja_id
  CROSS JOIN LATERAL (VALUES (p.player1_id), (p.player2_id)) AS x(player_id)
  WHERE x.player_id IS NOT NULL
  GROUP BY g.torneo_id
),

-- ── Participaciones de cierre (subtipo canónico) ───────────────────────────
jp_close AS (
  SELECT
    jp.id,
    jp.jugador_id,
    jp.tipo_evento::text AS tipo_evento,
    trim(jp.evento_id::text) AS evento_id,
    coalesce(jp.metadata->>'subtipo', '') AS subtipo,
    jp.created_at,
    jp.fecha
  FROM public.jugador_participaciones jp
  WHERE (
      (jp.tipo_evento::text = 'reta' AND jp.metadata->>'subtipo' = 'reta_cierre')
      OR (jp.tipo_evento::text = 'americano' AND jp.metadata->>'subtipo' = 'americano_cierre')
      OR (jp.tipo_evento::text = 'duelo_2v2' AND jp.metadata->>'subtipo' = 'duelo_2v2_cierre')
      OR (jp.tipo_evento::text = 'torneo_express' AND jp.metadata->>'subtipo' = 'express_cierre')
      OR (jp.tipo_evento::text = 'liga' AND jp.metadata->>'subtipo' = 'liga_jornada')
      OR (jp.tipo_evento::text = 'liga' AND jp.metadata->>'subtipo' = 'liga_podio_final')
    )
),

jp_stats AS (
  SELECT
    j.tipo_evento,
    j.evento_id,
    j.subtipo,
    count(*)::bigint AS participation_count,
    count(DISTINCT j.jugador_id)::bigint AS distinct_player_count,
    min(coalesce(j.created_at, j.fecha)) AS first_write_at,
    max(coalesce(j.created_at, j.fecha)) AS last_write_at
  FROM jp_close j
  GROUP BY j.tipo_evento, j.evento_id, j.subtipo
),
jp_dup AS (
  SELECT
    tipo_evento,
    evento_id,
    subtipo,
    coalesce(sum(cnt - 1), 0)::bigint AS duplicate_participation_count
  FROM (
    SELECT
      tipo_evento,
      evento_id,
      subtipo,
      jugador_id,
      count(*)::bigint AS cnt
    FROM jp_close
    GROUP BY tipo_evento, evento_id, subtipo, jugador_id
    HAVING count(*) > 1
  ) d
  GROUP BY tipo_evento, evento_id, subtipo
),

-- ── Rating counts por event_id (vía partido_ref exacto) ─────────────────────
rating_by_ref AS (
  SELECT
    rh.partido_ref,
    rh.jugador_id,
    rh.fecha,
    rh.id
  FROM public.rating_historial rh
  WHERE rh.partido_ref IS NOT NULL
),
reta_rating AS (
  SELECT
    r.event_id::text AS evento_id,
    count(rh.id)::bigint AS rating_count,
    min(rh.fecha) AS first_rating_at,
    max(rh.fecha) AS last_rating_at
  FROM reta_partido_refs r
  LEFT JOIN rating_by_ref rh ON rh.partido_ref = r.partido_ref
  GROUP BY r.event_id
),
reta_rating_dup AS (
  SELECT
    r.event_id::text AS evento_id,
    coalesce(sum(x.cnt - 1), 0)::bigint AS duplicate_rating_count
  FROM reta_partido_refs r
  JOIN (
    SELECT partido_ref, jugador_id, count(*)::bigint AS cnt
    FROM rating_by_ref
    GROUP BY partido_ref, jugador_id
    HAVING count(*) > 1
  ) x ON x.partido_ref = r.partido_ref
  GROUP BY r.event_id
),
americano_rating AS (
  SELECT
    r.event_id::text AS evento_id,
    count(rh.id)::bigint AS rating_count,
    min(rh.fecha) AS first_rating_at,
    max(rh.fecha) AS last_rating_at
  FROM americano_partido_refs r
  LEFT JOIN rating_by_ref rh ON rh.partido_ref = r.partido_ref
  GROUP BY r.event_id
),
americano_rating_dup AS (
  SELECT
    r.event_id::text AS evento_id,
    coalesce(sum(x.cnt - 1), 0)::bigint AS duplicate_rating_count
  FROM americano_partido_refs r
  JOIN (
    SELECT partido_ref, jugador_id, count(*)::bigint AS cnt
    FROM rating_by_ref
    GROUP BY partido_ref, jugador_id
    HAVING count(*) > 1
  ) x ON x.partido_ref = r.partido_ref
  GROUP BY r.event_id
),
duelo_rating AS (
  SELECT
    r.event_id::text AS evento_id,
    count(rh.id)::bigint AS rating_count,
    min(rh.fecha) AS first_rating_at,
    max(rh.fecha) AS last_rating_at
  FROM duelo_partido_refs r
  LEFT JOIN rating_by_ref rh ON rh.partido_ref = r.partido_ref
  GROUP BY r.event_id
),
duelo_rating_dup AS (
  SELECT
    r.event_id::text AS evento_id,
    coalesce(sum(x.cnt - 1), 0)::bigint AS duplicate_rating_count
  FROM duelo_partido_refs r
  JOIN (
    SELECT partido_ref, jugador_id, count(*)::bigint AS cnt
    FROM rating_by_ref
    GROUP BY partido_ref, jugador_id
    HAVING count(*) > 1
  ) x ON x.partido_ref = r.partido_ref
  GROUP BY r.event_id
),
liga_jornada_rating AS (
  SELECT
    r.event_id::text AS evento_id,
    count(rh.id)::bigint AS rating_count,
    min(rh.fecha) AS first_rating_at,
    max(rh.fecha) AS last_rating_at
  FROM liga_jornada_partido_refs r
  LEFT JOIN rating_by_ref rh ON rh.partido_ref = r.partido_ref
  GROUP BY r.event_id
),
liga_jornada_rating_dup AS (
  SELECT
    r.event_id::text AS evento_id,
    coalesce(sum(x.cnt - 1), 0)::bigint AS duplicate_rating_count
  FROM liga_jornada_partido_refs r
  JOIN (
    SELECT partido_ref, jugador_id, count(*)::bigint AS cnt
    FROM rating_by_ref
    GROUP BY partido_ref, jugador_id
    HAVING count(*) > 1
  ) x ON x.partido_ref = r.partido_ref
  GROUP BY r.event_id
),
te_rating AS (
  SELECT
    r.event_id::text AS evento_id,
    count(rh.id)::bigint AS rating_count,
    min(rh.fecha) AS first_rating_at,
    max(rh.fecha) AS last_rating_at
  FROM te_partido_refs r
  LEFT JOIN rating_by_ref rh ON rh.partido_ref = r.partido_ref
  GROUP BY r.event_id
),
te_rating_dup AS (
  SELECT
    r.event_id::text AS evento_id,
    coalesce(sum(x.cnt - 1), 0)::bigint AS duplicate_rating_count
  FROM te_partido_refs r
  JOIN (
    SELECT partido_ref, jugador_id, count(*)::bigint AS cnt
    FROM rating_by_ref
    GROUP BY partido_ref, jugador_id
    HAVING count(*) > 1
  ) x ON x.partido_ref = r.partido_ref
  GROUP BY r.event_id
),

-- ── Ledger ROMC vía participacion_id (no puntos de participaciones) ────────
ledger_for_jp AS (
  SELECT
    j.tipo_evento,
    j.evento_id,
    j.subtipo,
    l.id AS ledger_id,
    l.official_player_key,
    l.participacion_id,
    l.created_at
  FROM jp_close j
  JOIN public.riviera_official_points_ledger l
    ON l.participacion_id = j.id
),
ledger_stats AS (
  SELECT
    lf.tipo_evento,
    lf.evento_id,
    lf.subtipo,
    count(*)::bigint AS ledger_count,
    min(lf.created_at) AS first_ledger_at,
    max(lf.created_at) AS last_ledger_at
  FROM ledger_for_jp lf
  GROUP BY lf.tipo_evento, lf.evento_id, lf.subtipo
),
ledger_dup AS (
  SELECT
    tipo_evento,
    evento_id,
    subtipo,
    coalesce(sum(cnt - 1), 0)::bigint AS duplicate_ledger_count
  FROM (
    SELECT
      tipo_evento,
      evento_id,
      subtipo,
      official_player_key,
      count(*)::bigint AS cnt
    FROM ledger_for_jp
    GROUP BY tipo_evento, evento_id, subtipo, official_player_key
    HAVING count(*) > 1
  ) d
  GROUP BY tipo_evento, evento_id, subtipo
),

-- ── Filas base por modo ────────────────────────────────────────────────────
reta_rows AS (
  SELECT
    'reta'::text AS mode_type,
    t.id::text AS event_id,
    t.name::text AS event_name,
    CASE WHEN t.is_finished THEN 'finished' ELSE 'open' END AS event_status,
    (t.is_finished = true) AS is_closed,
    e.expected_player_count,
    coalesce(js.participation_count, 0)::bigint AS participation_count,
    coalesce(rr.rating_count, 0)::bigint AS rating_count,
    coalesce(ls.ledger_count, 0)::bigint AS ledger_count,
    coalesce(jd.duplicate_participation_count, 0)::bigint AS duplicate_participation_count,
    coalesce(rd.duplicate_rating_count, 0)::bigint AS duplicate_rating_count,
    coalesce(ld.duplicate_ledger_count, 0)::bigint AS duplicate_ledger_count,
    least(
      js.first_write_at,
      rr.first_rating_at,
      ls.first_ledger_at
    ) AS first_write_at,
    greatest(
      js.last_write_at,
      rr.last_rating_at,
      ls.last_ledger_at
    ) AS last_write_at,
    'subtipo=reta_cierre; rating via matches.partido_ref=reta:<id>; ledger via participacion_id'::text
      AS contract_note,
    false AS rating_link_missing
  FROM public.tournaments t
  LEFT JOIN reta_expected e ON e.event_id = t.id
  LEFT JOIN jp_stats js
    ON js.tipo_evento = 'reta'
   AND js.evento_id = t.id::text
   AND js.subtipo = 'reta_cierre'
  LEFT JOIN jp_dup jd
    ON jd.tipo_evento = 'reta'
   AND jd.evento_id = t.id::text
   AND jd.subtipo = 'reta_cierre'
  LEFT JOIN reta_rating rr ON rr.evento_id = t.id::text
  LEFT JOIN reta_rating_dup rd ON rd.evento_id = t.id::text
  LEFT JOIN ledger_stats ls
    ON ls.tipo_evento = 'reta'
   AND ls.evento_id = t.id::text
   AND ls.subtipo = 'reta_cierre'
  LEFT JOIN ledger_dup ld
    ON ld.tipo_evento = 'reta'
   AND ld.evento_id = t.id::text
   AND ld.subtipo = 'reta_cierre'
  WHERE t.id NOT IN (SELECT id FROM americano_tournament_ids)
    AND NOT (
      coalesce(t.name, '') LIKE '(Borrador)%'
      OR coalesce(t.name, '') = 'Torneo Express Draft'
    )
),

americano_rows AS (
  SELECT
    'americano'::text AS mode_type,
    t.id::text AS event_id,
    t.name::text AS event_name,
    CASE WHEN t.is_finished THEN 'finished' ELSE 'open' END AS event_status,
    (t.is_finished = true) AS is_closed,
    e.expected_player_count,
    coalesce(js.participation_count, 0)::bigint AS participation_count,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM americano_partido_refs ar WHERE ar.event_id = t.id
      ) THEN coalesce(ar.rating_count, 0)::bigint
      ELSE NULL::bigint
    END AS rating_count,
    coalesce(ls.ledger_count, 0)::bigint AS ledger_count,
    coalesce(jd.duplicate_participation_count, 0)::bigint AS duplicate_participation_count,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM americano_partido_refs ar2 WHERE ar2.event_id = t.id
      ) THEN coalesce(ard.duplicate_rating_count, 0)::bigint
      ELSE NULL::bigint
    END AS duplicate_rating_count,
    coalesce(ld.duplicate_ledger_count, 0)::bigint AS duplicate_ledger_count,
    least(
      js.first_write_at,
      ar.first_rating_at,
      ls.first_ledger_at
    ) AS first_write_at,
    greatest(
      js.last_write_at,
      ar.last_rating_at,
      ls.last_ledger_at
    ) AS last_write_at,
    'subtipo=americano_cierre; rating via americano_live.rounds[].matches[].id → americano:<id>'::text
      AS contract_note,
    NOT EXISTS (
      SELECT 1 FROM americano_partido_refs ar3 WHERE ar3.event_id = t.id
    ) AS rating_link_missing
  FROM public.tournaments t
  JOIN americano_tournament_ids a ON a.id = t.id
  LEFT JOIN americano_expected e ON e.event_id = t.id
  LEFT JOIN jp_stats js
    ON js.tipo_evento = 'americano'
   AND js.evento_id = t.id::text
   AND js.subtipo = 'americano_cierre'
  LEFT JOIN jp_dup jd
    ON jd.tipo_evento = 'americano'
   AND jd.evento_id = t.id::text
   AND jd.subtipo = 'americano_cierre'
  LEFT JOIN americano_rating ar ON ar.evento_id = t.id::text
  LEFT JOIN americano_rating_dup ard ON ard.evento_id = t.id::text
  LEFT JOIN ledger_stats ls
    ON ls.tipo_evento = 'americano'
   AND ls.evento_id = t.id::text
   AND ls.subtipo = 'americano_cierre'
  LEFT JOIN ledger_dup ld
    ON ld.tipo_evento = 'americano'
   AND ld.evento_id = t.id::text
   AND ld.subtipo = 'americano_cierre'
  WHERE NOT (
      coalesce(t.name, '') LIKE '(Borrador)%'
      OR coalesce(t.name, '') = 'Torneo Express Draft'
    )
),

duelo_rows AS (
  SELECT
    'duelo_2v2'::text AS mode_type,
    d.id::text AS event_id,
    d.nombre::text AS event_name,
    d.estado::text AS event_status,
    (d.estado = 'finalizado') AS is_closed,
    e.expected_player_count,
    coalesce(js.participation_count, 0)::bigint AS participation_count,
    coalesce(dr.rating_count, 0)::bigint AS rating_count,
    coalesce(ls.ledger_count, 0)::bigint AS ledger_count,
    coalesce(jd.duplicate_participation_count, 0)::bigint AS duplicate_participation_count,
    coalesce(drd.duplicate_rating_count, 0)::bigint AS duplicate_rating_count,
    coalesce(ld.duplicate_ledger_count, 0)::bigint AS duplicate_ledger_count,
    least(
      js.first_write_at,
      dr.first_rating_at,
      ls.first_ledger_at
    ) AS first_write_at,
    greatest(
      js.last_write_at,
      dr.last_rating_at,
      ls.last_ledger_at
    ) AS last_write_at,
    'subtipo=duelo_2v2_cierre; rating partido_ref=duelo2v2:<duelo.id>'::text
      AS contract_note,
    false AS rating_link_missing
  FROM public.duelos_2v2 d
  LEFT JOIN duelo_expected e ON e.event_id = d.id
  LEFT JOIN jp_stats js
    ON js.tipo_evento = 'duelo_2v2'
   AND js.evento_id = d.id::text
   AND js.subtipo = 'duelo_2v2_cierre'
  LEFT JOIN jp_dup jd
    ON jd.tipo_evento = 'duelo_2v2'
   AND jd.evento_id = d.id::text
   AND jd.subtipo = 'duelo_2v2_cierre'
  LEFT JOIN duelo_rating dr ON dr.evento_id = d.id::text
  LEFT JOIN duelo_rating_dup drd ON drd.evento_id = d.id::text
  LEFT JOIN ledger_stats ls
    ON ls.tipo_evento = 'duelo_2v2'
   AND ls.evento_id = d.id::text
   AND ls.subtipo = 'duelo_2v2_cierre'
  LEFT JOIN ledger_dup ld
    ON ld.tipo_evento = 'duelo_2v2'
   AND ld.evento_id = d.id::text
   AND ld.subtipo = 'duelo_2v2_cierre'
),

liga_jornada_rows AS (
  SELECT
    'liga'::text AS mode_type,
    j.id::text AS event_id,
    (
      'Jornada ' || j.numero::text || ' — ' || coalesce(l.nombre, j.liga_id::text)
    )::text AS event_name,
    j.estado::text AS event_status,
    (j.estado = 'completed') AS is_closed,
    e.expected_player_count,
    coalesce(js.participation_count, 0)::bigint AS participation_count,
    coalesce(lr.rating_count, 0)::bigint AS rating_count,
    coalesce(ls.ledger_count, 0)::bigint AS ledger_count,
    coalesce(jd.duplicate_participation_count, 0)::bigint AS duplicate_participation_count,
    coalesce(lrd.duplicate_rating_count, 0)::bigint AS duplicate_rating_count,
    coalesce(ld.duplicate_ledger_count, 0)::bigint AS duplicate_ledger_count,
    least(
      js.first_write_at,
      lr.first_rating_at,
      ls.first_ledger_at
    ) AS first_write_at,
    greatest(
      js.last_write_at,
      lr.last_rating_at,
      ls.last_ledger_at
    ) AS last_write_at,
    'unidad=liga_jornadas; subtipo=liga_jornada; evento_id=jornada.id; rating=liga:<liga_partidos.id>'::text
      AS contract_note,
    false AS rating_link_missing
  FROM public.liga_jornadas j
  JOIN public.ligas l ON l.id = j.liga_id
  LEFT JOIN liga_jornada_expected e ON e.event_id = j.id
  LEFT JOIN jp_stats js
    ON js.tipo_evento = 'liga'
   AND js.evento_id = j.id::text
   AND js.subtipo = 'liga_jornada'
  LEFT JOIN jp_dup jd
    ON jd.tipo_evento = 'liga'
   AND jd.evento_id = j.id::text
   AND jd.subtipo = 'liga_jornada'
  LEFT JOIN liga_jornada_rating lr ON lr.evento_id = j.id::text
  LEFT JOIN liga_jornada_rating_dup lrd ON lrd.evento_id = j.id::text
  LEFT JOIN ledger_stats ls
    ON ls.tipo_evento = 'liga'
   AND ls.evento_id = j.id::text
   AND ls.subtipo = 'liga_jornada'
  LEFT JOIN ledger_dup ld
    ON ld.tipo_evento = 'liga'
   AND ld.evento_id = j.id::text
   AND ld.subtipo = 'liga_jornada'
),

liga_podio_rows AS (
  SELECT
    'liga'::text AS mode_type,
    l.id::text AS event_id,
    ('Podio — ' || l.nombre)::text AS event_name,
    l.estado::text AS event_status,
    (l.estado = 'completed') AS is_closed,
    e.expected_player_count,
    coalesce(js.participation_count, 0)::bigint AS participation_count,
    NULL::bigint AS rating_count,
    coalesce(ls.ledger_count, 0)::bigint AS ledger_count,
    coalesce(jd.duplicate_participation_count, 0)::bigint AS duplicate_participation_count,
    NULL::bigint AS duplicate_rating_count,
    coalesce(ld.duplicate_ledger_count, 0)::bigint AS duplicate_ledger_count,
    least(js.first_write_at, ls.first_ledger_at) AS first_write_at,
    greatest(js.last_write_at, ls.last_ledger_at) AS last_write_at,
    'unidad=ligas (podio); subtipo=liga_podio_final; evento_id=liga.id; rating no atribuible al liga.id (vive en partidos de jornada)'::text
      AS contract_note,
    true AS rating_link_missing
  FROM public.ligas l
  LEFT JOIN liga_podio_expected e ON e.event_id = l.id
  LEFT JOIN jp_stats js
    ON js.tipo_evento = 'liga'
   AND js.evento_id = l.id::text
   AND js.subtipo = 'liga_podio_final'
  LEFT JOIN jp_dup jd
    ON jd.tipo_evento = 'liga'
   AND jd.evento_id = l.id::text
   AND jd.subtipo = 'liga_podio_final'
  LEFT JOIN ledger_stats ls
    ON ls.tipo_evento = 'liga'
   AND ls.evento_id = l.id::text
   AND ls.subtipo = 'liga_podio_final'
  LEFT JOIN ledger_dup ld
    ON ld.tipo_evento = 'liga'
   AND ld.evento_id = l.id::text
   AND ld.subtipo = 'liga_podio_final'
  WHERE l.estado = 'completed'
),

te_rows AS (
  SELECT
    'torneo_express'::text AS mode_type,
    te.id::text AS event_id,
    te.nombre::text AS event_name,
    (
      coalesce(te.estado::text, '')
      || CASE
           WHEN te.fase_torneo IS NOT NULL THEN ('/' || te.fase_torneo::text)
           ELSE ''
         END
    ) AS event_status,
    (
      coalesce(te.estado::text, '') = 'finalizado'
      OR coalesce(te.fase_torneo::text, '') = 'cerrado'
    ) AS is_closed,
    e.expected_player_count,
    coalesce(js.participation_count, 0)::bigint AS participation_count,
    coalesce(tr.rating_count, 0)::bigint AS rating_count,
    coalesce(ls.ledger_count, 0)::bigint AS ledger_count,
    coalesce(jd.duplicate_participation_count, 0)::bigint AS duplicate_participation_count,
    coalesce(trd.duplicate_rating_count, 0)::bigint AS duplicate_rating_count,
    coalesce(ld.duplicate_ledger_count, 0)::bigint AS duplicate_ledger_count,
    least(
      js.first_write_at,
      tr.first_rating_at,
      ls.first_ledger_at
    ) AS first_write_at,
    greatest(
      js.last_write_at,
      tr.last_rating_at,
      ls.last_ledger_at
    ) AS last_write_at,
    'subtipo=express_cierre; rating te-grupo:<id>|te-elim:<id>'::text
      AS contract_note,
    false AS rating_link_missing
  FROM public.torneo_express te
  LEFT JOIN te_expected e ON e.event_id = te.id
  LEFT JOIN jp_stats js
    ON js.tipo_evento = 'torneo_express'
   AND js.evento_id = te.id::text
   AND js.subtipo = 'express_cierre'
  LEFT JOIN jp_dup jd
    ON jd.tipo_evento = 'torneo_express'
   AND jd.evento_id = te.id::text
   AND jd.subtipo = 'express_cierre'
  LEFT JOIN te_rating tr ON tr.evento_id = te.id::text
  LEFT JOIN te_rating_dup trd ON trd.evento_id = te.id::text
  LEFT JOIN ledger_stats ls
    ON ls.tipo_evento = 'torneo_express'
   AND ls.evento_id = te.id::text
   AND ls.subtipo = 'express_cierre'
  LEFT JOIN ledger_dup ld
    ON ld.tipo_evento = 'torneo_express'
   AND ld.evento_id = te.id::text
   AND ld.subtipo = 'express_cierre'
),

all_events AS (
  SELECT * FROM reta_rows
  UNION ALL
  SELECT * FROM americano_rows
  UNION ALL
  SELECT * FROM duelo_rows
  UNION ALL
  SELECT * FROM liga_jornada_rows
  UNION ALL
  SELECT * FROM liga_podio_rows
  UNION ALL
  SELECT * FROM te_rows
),

diagnosed AS (
  SELECT
    a.*,
    -- Cierre parcial = escrituras de carrera de cierre (participaciones/ledger).
    -- Rating live por partido durante evento abierto es contrato normal, no parcial.
    (a.participation_count + a.ledger_count) AS close_write_units,
    (
      a.duplicate_participation_count
      + coalesce(a.duplicate_rating_count, 0)
      + a.duplicate_ledger_count
    ) AS duplicate_units
  FROM all_events a
),

final AS (
  SELECT
    d.mode_type,
    d.event_id,
    d.event_name,
    d.event_status,
    d.expected_player_count,
    d.participation_count,
    d.rating_count,
    d.ledger_count,
    d.duplicate_participation_count,
    d.duplicate_rating_count,
    d.duplicate_ledger_count,
    d.first_write_at,
    d.last_write_at,
    CASE
      WHEN d.duplicate_units > 0 THEN 'DUPLICATE_CAREER'
      WHEN NOT d.is_closed AND d.close_write_units = 0 THEN 'CLEAN'
      WHEN NOT d.is_closed AND d.close_write_units > 0 THEN 'POSSIBLE_PARTIAL_CLOSE'
      WHEN d.is_closed AND d.participation_count = 0 THEN 'CLOSED_WITHOUT_CAREER'
      WHEN d.is_closed
        AND d.expected_player_count IS NULL THEN 'NOT_DETERMINABLE'
      WHEN d.is_closed
        AND d.participation_count < d.expected_player_count THEN 'CLOSED_WITHOUT_CAREER'
      WHEN d.is_closed
        AND d.participation_count > d.expected_player_count
        AND d.duplicate_units = 0 THEN 'NOT_DETERMINABLE'
      WHEN d.is_closed
        AND d.participation_count >= d.expected_player_count
        AND d.duplicate_units = 0 THEN 'CLEAN'
      ELSE 'NOT_DETERMINABLE'
    END AS diagnosis,
    trim(
      both ' '
      FROM concat_ws(
        ' | ',
        d.contract_note,
        CASE
          WHEN d.rating_link_missing THEN
            'rating_count=NULL: sin vínculo determinable partido_ref→evento'
          ELSE NULL
        END,
        CASE
          WHEN NOT d.is_closed
            AND d.close_write_units = 0
            AND coalesce(d.rating_count, 0) > 0 THEN
            'rating live presente con evento abierto: esperado; no cuenta como cierre parcial'
          ELSE NULL
        END,
        CASE
          WHEN d.ledger_count = 0 AND d.participation_count > 0 THEN
            'ledger=0 no prueba fallo (ROMC puede skip por emitter/identity/points)'
          ELSE NULL
        END,
        CASE
          WHEN d.is_closed
            AND d.expected_player_count IS NULL
            AND d.participation_count > 0 THEN
            'cerrado con carrera pero expected_player_count no derivable'
          ELSE NULL
        END,
        CASE
          WHEN d.is_closed
            AND d.expected_player_count IS NOT NULL
            AND d.participation_count < d.expected_player_count THEN
            format(
              'participaciones %s < expected %s',
              d.participation_count,
              d.expected_player_count
            )
          ELSE NULL
        END,
        CASE
          WHEN d.is_closed
            AND d.expected_player_count IS NOT NULL
            AND d.participation_count > d.expected_player_count
            AND d.duplicate_units = 0 THEN
            format(
              'participaciones %s > expected %s sin duplicado lógico detectado',
              d.participation_count,
              d.expected_player_count
            )
          ELSE NULL
        END,
        CASE
          WHEN d.duplicate_units > 0 THEN
            format(
              'duplicados: jp=%s rating=%s ledger=%s (excedentes)',
              d.duplicate_participation_count,
              coalesce(d.duplicate_rating_count::text, 'NULL'),
              d.duplicate_ledger_count
            )
          ELSE NULL
        END
      )
    ) AS diagnosis_detail
  FROM diagnosed d
)

SELECT
  mode_type,
  event_id,
  event_name,
  event_status,
  expected_player_count,
  participation_count,
  rating_count,
  ledger_count,
  duplicate_participation_count,
  duplicate_rating_count,
  duplicate_ledger_count,
  first_write_at,
  last_write_at,
  diagnosis,
  diagnosis_detail
FROM final
WHERE diagnosis IS DISTINCT FROM 'CLEAN'
ORDER BY
  CASE diagnosis
    WHEN 'DUPLICATE_CAREER' THEN 1
    WHEN 'POSSIBLE_PARTIAL_CLOSE' THEN 2
    WHEN 'CLOSED_WITHOUT_CAREER' THEN 3
    WHEN 'NOT_DETERMINABLE' THEN 4
    ELSE 5
  END,
  mode_type,
  event_id;

ROLLBACK;
