-- PASO 2 — Fusionar duplicados por nombre (ejecutar UNA vez, con backup).
-- Preview: supabase/players-dedupe-legacy-preview.sql
--
-- Verificación después:
--   SELECT lower(trim(name)), count(*) FROM public.players
--   WHERE trim(coalesce(name,'')) <> '' GROUP BY 1 HAVING count(*) > 1;

BEGIN;

CREATE TEMP TABLE _players_dedupe_map (
  dup_id uuid PRIMARY KEY,
  keep_id uuid NOT NULL
);

WITH grouped AS (
  SELECT
    lower(trim(name)) AS name_key,
    array_agg(p.id ORDER BY
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.riviera_jugadores r
          WHERE r.legacy_player_id = p.id
        ) THEN 0
        ELSE 1
      END,
      p.id ASC
    ) AS ids
  FROM public.players p
  WHERE trim(coalesce(name, '')) <> ''
  GROUP BY 1
  HAVING count(*) > 1
)
INSERT INTO _players_dedupe_map (dup_id, keep_id)
SELECT u.dup_id, g.ids[1]
FROM grouped g
CROSS JOIN LATERAL unnest(g.ids[2:cardinality(g.ids)]) AS u(dup_id)
WHERE u.dup_id IS DISTINCT FROM g.ids[1];

UPDATE public.players k
SET email = COALESCE(NULLIF(trim(k.email), ''), NULLIF(trim(d.email), ''))
FROM _players_dedupe_map m
JOIN public.players d ON d.id = m.dup_id
WHERE k.id = m.keep_id
  AND (k.email IS NULL OR trim(k.email) = '')
  AND d.email IS NOT NULL
  AND trim(d.email) <> '';

UPDATE public.pairs pr
SET player1_id = m.keep_id
FROM _players_dedupe_map m
WHERE pr.player1_id = m.dup_id;

UPDATE public.pairs pr
SET player2_id = m.keep_id
FROM _players_dedupe_map m
WHERE pr.player2_id = m.dup_id;

UPDATE public.riviera_jugadores r
SET legacy_player_id = m.keep_id
FROM _players_dedupe_map m
WHERE r.legacy_player_id = m.dup_id;

DO $$
BEGIN
  IF to_regclass('public.notificaciones_log') IS NOT NULL THEN
    UPDATE public.notificaciones_log n
    SET player_id = m.keep_id
    FROM _players_dedupe_map m
    WHERE n.player_id = m.dup_id;
  END IF;
END $$;

DELETE FROM public.players p
USING _players_dedupe_map m
WHERE p.id = m.dup_id;

COMMIT;
