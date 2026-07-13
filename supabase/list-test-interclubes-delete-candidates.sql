-- ═══════════════════════════════════════════════════════════════════════════
-- SOLO LECTURA — listar las 3 filas Test interclubes pendientes de borrar
-- NO modifica datos. Corre esto ANTES de backup/delete.
-- ═══════════════════════════════════════════════════════════════════════════

-- A) Las 3 participaciones + ledger (excluye Marco siempre)
SELECT
  jp.id AS participacion_id,
  jp.jugador_id,
  rj.nombre AS jugador_nombre,
  jp.tipo_evento::text AS tipo_evento,
  jp.evento_id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  jp.metadata->>'organizador_id' AS metadata_organizador_id,
  l.id AS ledger_id,
  l.points AS ledger_points,
  l.source_organizer_id AS ledger_source_organizer_id,
  (jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20') AS es_marco_NO_BORRAR
FROM public.jugador_participaciones jp
INNER JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE jp.evento_nombre ILIKE '%Test interclubes%'
  AND jp.id IS DISTINCT FROM 'c46767cf-74fd-4e03-9e39-5c5773319f20'
ORDER BY jp.id;

-- B) Conteos (esperado: 3 y 3)
SELECT
  COUNT(DISTINCT jp.id) AS jp_count,
  COUNT(l.id) AS ledger_count,
  COUNT(*) FILTER (
    WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20'
  ) AS marco_en_resultado_debe_ser_0
FROM public.jugador_participaciones jp
INNER JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
WHERE jp.evento_nombre ILIKE '%Test interclubes%'
  AND jp.id IS DISTINCT FROM 'c46767cf-74fd-4e03-9e39-5c5773319f20';

-- C) Texto listo para pegar en backup/delete (array de 3 UUIDs)
SELECT
  format(
    E'ARRAY[\n  %L::uuid,\n  %L::uuid,\n  %L::uuid\n]::uuid[]',
    (array_agg(jp.id ORDER BY jp.id))[1],
    (array_agg(jp.id ORDER BY jp.id))[2],
    (array_agg(jp.id ORDER BY jp.id))[3]
  ) AS pegar_en_v_ids
FROM public.jugador_participaciones jp
INNER JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
WHERE jp.evento_nombre ILIKE '%Test interclubes%'
  AND jp.id IS DISTINCT FROM 'c46767cf-74fd-4e03-9e39-5c5773319f20';

-- D) Confirmación: Marco NO está en el set de delete
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.jugador_participaciones jp
      WHERE jp.evento_nombre ILIKE '%Test interclubes%'
        AND jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20'
    )
    THEN 'FAIL — Marco aparece como Test interclubes (revisar nombre de evento)'
    ELSE 'OK — Marco no está en candidatos Test interclubes'
  END AS marco_fuera_del_delete;
