-- Verificación Lunes Mixta + cedidos Hack (ejecutar en Supabase SQL Editor con rol postgres).
-- Copiar resultado y pegar en ticket / chat.

\set hack_org 'e724de97-3552-4a01-a269-f621e6f1ed26'
\set riviera_org '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'

-- 1) Reta
SELECT id, name, user_id AS hack_organizador_id, is_finished, created_at
FROM public.tournaments
WHERE name ILIKE '%Lunes Mixta%'
ORDER BY created_at DESC
LIMIT 3;

-- 2) Participaciones de la reta (todas)
SELECT
  jp.id,
  jp.jugador_id,
  rj.nombre,
  rj.organizador_id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  jp.fecha,
  jp.metadata->>'subtipo' AS subtipo,
  jp.metadata->>'source_club_name' AS source_club
FROM public.jugador_participaciones jp
JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE jp.tipo_evento = 'reta'
  AND jp.evento_id = (
    SELECT id FROM public.tournaments
    WHERE name ILIKE '%Lunes Mixta%'
    ORDER BY created_at DESC
    LIMIT 1
  )
ORDER BY rj.nombre;

-- 3) Cedidos Daniel / Sebastian / Nevyl — clon Hack + participación Lunes Mixta
WITH reta AS (
  SELECT id FROM public.tournaments
  WHERE name ILIKE '%Lunes Mixta%'
  ORDER BY created_at DESC
  LIMIT 1
),
targets AS (
  SELECT unnest(ARRAY['Daniel N', 'Sebastian', 'Nevyl']) AS nombre
)
SELECT
  t.nombre,
  opa.local_jugador_id,
  opa.jugador_id AS source_jugador_id,
  opa.owner_organizador_id,
  lh.organizador_id AS local_org,
  jp.id AS participacion_id,
  jp.puntos_obtenidos,
  (SELECT COUNT(*) FROM public.jugador_participaciones x
   WHERE x.jugador_id = opa.local_jugador_id
     AND x.tipo_evento = 'reta'
     AND x.evento_id = (SELECT id FROM reta)) AS dup_count
FROM targets t
LEFT JOIN public.riviera_jugadores src
  ON src.nombre ILIKE t.nombre
 AND src.organizador_id = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'
LEFT JOIN public.organizer_player_access opa
  ON opa.jugador_id = src.id
 AND opa.grantee_organizer_id = 'e724de97-3552-4a01-a269-f621e6f1ed26'
 AND opa.is_active = true
LEFT JOIN public.riviera_jugadores lh ON lh.id = opa.local_jugador_id
LEFT JOIN public.jugador_participaciones jp
  ON jp.jugador_id = opa.local_jugador_id
 AND jp.tipo_evento = 'reta'
 AND jp.evento_id = (SELECT id FROM reta)
ORDER BY t.nombre;

-- 4) jugador_stats clon Hack
SELECT rj.nombre, js.jugador_id, js.puntos_totales, js.total_partidos, js.total_retas, js.updated_at
FROM public.riviera_jugadores rj
JOIN public.jugador_stats js ON js.jugador_id = rj.id
WHERE rj.organizador_id = 'e724de97-3552-4a01-a269-f621e6f1ed26'
  AND rj.nombre IN ('Daniel N', 'Sebastian', 'Nevyl')
ORDER BY rj.nombre;

-- 5) Ledger oficial (perfil Riviera origen) — Lunes Mixta visible
SELECT
  rj.nombre,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  jp.metadata->>'source_club_name' AS club
FROM public.jugador_participaciones jp
JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE jp.evento_nombre ILIKE '%Lunes Mixta%'
  AND rj.nombre IN ('Daniel N', 'Sebastian', 'Nevyl')
ORDER BY rj.nombre, rj.organizador_id;

-- 6) Duplicados por jugador+evento (debe ser 1 fila por subtipo reta_cierre)
SELECT jugador_id, evento_id, metadata->>'subtipo' AS subtipo, COUNT(*) AS n
FROM public.jugador_participaciones
WHERE evento_id = (
  SELECT id FROM public.tournaments WHERE name ILIKE '%Lunes Mixta%' ORDER BY created_at DESC LIMIT 1
)
GROUP BY 1, 2, 3
HAVING COUNT(*) > 1;
