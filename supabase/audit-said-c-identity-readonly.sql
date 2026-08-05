-- =============================================================================
-- AUDITORÍA READ-ONLY: identidad de "Said C" (incidente 2026-08-05, Batalla Equipos)
-- =============================================================================
-- Objetivo: determinar por qué "Said C" pudo jugar una reta pero no pudo
-- cerrarse ("no tiene una identidad Riviera válida"). Posibles causas a
-- distinguir con este script:
--   (a) nunca se le generó riviera_official_player_identity (ensure_riviera_identity
--       nunca corrió con éxito para él);
--   (b) tiene riviera_official_player_profile_link con confidence REVIEW/LOW
--       (no se auto-vinculó por seguridad, requiere decisión manual);
--   (c) es un homónimo: dos filas riviera_jugadores con el mismo nombre
--       (mismo organizador o distinto club) y el partido quedó pareado con la
--       fila equivocada.
--
-- Este script NO vincula, NO crea identidad, NO decide por nombre. Solo
-- reporta. La decisión de vincular/fusionar es del usuario, a partir de estos
-- resultados (ver plan: sección "Said C diagnostic").
--
-- Cómo correrlo: ajustar el patrón de búsqueda en el CTE `search_term` de cada
-- bloque si "Said C" no es el nombre completo/exacto en la base. Ejecutar
-- contra producción con una sesión autenticada (no anon) porque
-- riviera_jugadores.email/telefono/whatsapp están bloqueados para anon.
--
-- Sin DDL. Sin DML. Sin RPCs con efectos secundarios. BEGIN ... ROLLBACK.
-- =============================================================================

BEGIN;
SET TRANSACTION READ ONLY;

-- ---------------------------------------------------------------------------
-- 1) "Said C" en riviera_jugadores — por nombre, email, teléfono, whatsapp
-- ---------------------------------------------------------------------------
SELECT
  rj.id AS riviera_jugador_id,
  rj.nombre,
  rj.email,
  rj.telefono,
  rj.whatsapp,
  rj.organizador_id,
  rj.estado,
  rj.legacy_player_id,
  rj.legacy_liga_jugador_id,
  rj.created_at
FROM public.riviera_jugadores rj
WHERE rj.nombre ILIKE '%said%c%'
   OR rj.nombre ILIKE '%said%'
   OR rj.email ILIKE '%said%'
   OR rj.telefono ILIKE '%said%'
   OR rj.whatsapp ILIKE '%said%'
ORDER BY rj.organizador_id, rj.nombre, rj.created_at;

-- ---------------------------------------------------------------------------
-- 2) "Said C" en la tabla legacy `players` (players.id es lo que guardan
--    pairs.player1_id / pairs.player2_id — el vínculo real que usó la reta)
-- ---------------------------------------------------------------------------
SELECT p.id AS legacy_player_id, p.name
FROM public.players p
WHERE p.name ILIKE '%said%c%'
   OR p.name ILIKE '%said%'
ORDER BY p.name;

-- ---------------------------------------------------------------------------
-- 3) Estado de identidad oficial + vínculo, para cada riviera_jugadores
--    encontrado en (1) — esto responde "por qué falló el cierre"
-- ---------------------------------------------------------------------------
SELECT
  rj.id AS riviera_jugador_id,
  rj.nombre,
  rj.organizador_id,
  poi.official_player_key AS identity_official_player_key,
  poi.canonical_riviera_jugador_id,
  ppl.official_player_key AS link_official_player_key,
  ppl.link_source,
  ppl.organizer_id AS link_organizer_id,
  CASE
    WHEN poi.official_player_key IS NULL AND ppl.official_player_key IS NULL
      THEN 'SIN_IDENTIDAD_NI_VINCULO — ensure_riviera_identity nunca corrió con éxito'
    WHEN ppl.official_player_key IS NULL
      THEN 'IDENTIDAD_SIN_VINCULO_DE_PERFIL — revisar ensure_official_profile_link_for_participacion'
    ELSE 'IDENTIDAD_Y_VINCULO_OK — el bloqueo pudo ser otra causa (RLS, red, permiso)'
  END AS diagnostico
FROM public.riviera_jugadores rj
LEFT JOIN public.riviera_official_player_identity poi
       ON poi.canonical_riviera_jugador_id = rj.id
LEFT JOIN public.riviera_official_player_profile_link ppl
       ON ppl.riviera_jugador_id = rj.id
WHERE rj.nombre ILIKE '%said%c%'
   OR rj.nombre ILIKE '%said%'
ORDER BY rj.organizador_id, rj.nombre;

-- ---------------------------------------------------------------------------
-- 4) Homónimos: ¿hay más de una fila riviera_jugadores con el mismo nombre
--    normalizado? (mismo patrón que audit-homonimos-riviera-jugadores-readonly.sql)
-- ---------------------------------------------------------------------------
WITH normalized AS (
  SELECT id, organizador_id, nombre,
         lower(btrim(regexp_replace(nombre, '\s+', ' ', 'g'))) AS nombre_norm,
         legacy_player_id, legacy_liga_jugador_id, estado, created_at
  FROM public.riviera_jugadores
  WHERE nombre ILIKE '%said%'
)
SELECT
  organizador_id,
  nombre_norm,
  count(DISTINCT id) AS riviera_ids_distintos,
  array_agg(id ORDER BY created_at) AS riviera_ids,
  array_agg(nombre ORDER BY created_at) AS nombres_raw,
  array_agg(legacy_player_id ORDER BY created_at) AS legacy_player_ids
FROM normalized
GROUP BY organizador_id, nombre_norm
ORDER BY riviera_ids_distintos DESC, organizador_id;

-- ---------------------------------------------------------------------------
-- 5) Pareja(s) y partido(s) de Said C dentro de la reta "Batalla Equipos"
--    específica. Completar :'tournament_id' con el id real (visible en la URL
--    del organizador o vía tournaments.name ILIKE '%batalla%equipos%') y
--    descomentar antes de correr.
-- ---------------------------------------------------------------------------
-- SELECT
--   t.id AS tournament_id, t.name AS tournament_name, t.is_finished, t.user_id,
--   pr.id AS pair_id, pr.player1_id, pr.player1_name, pr.player2_id, pr.player2_name,
--   m.id AS match_id, m.status AS match_status, m.round, m.pair1_score, m.pair2_score
-- FROM public.tournaments t
-- JOIN public.pairs pr ON pr.tournament_id = t.id
-- LEFT JOIN public.matches m ON m.pair1_id = pr.id OR m.pair2_id = pr.id
-- WHERE t.id = :'tournament_id'::uuid
--   AND (pr.player1_name ILIKE '%said%' OR pr.player2_name ILIKE '%said%')
-- ORDER BY m.round, m.id;

ROLLBACK;
