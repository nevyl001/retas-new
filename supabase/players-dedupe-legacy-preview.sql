-- PASO 1 — Solo lectura: revisar qué se fusionaría (ejecutar este archivo completo).
-- Agrupa por nombre normalizado, igual que la verificación de duplicados.

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
SELECT
  g.name_key,
  g.ids[1] AS keep_id,
  u.dup_id,
  k.name AS keep_name,
  k.email AS keep_email,
  d.name AS dup_name,
  d.email AS dup_email
FROM grouped g
CROSS JOIN LATERAL unnest(g.ids[2:cardinality(g.ids)]) AS u(dup_id)
JOIN public.players k ON k.id = g.ids[1]
JOIN public.players d ON d.id = u.dup_id
ORDER BY g.name_key;
