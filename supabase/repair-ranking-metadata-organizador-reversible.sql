-- ═══════════════════════════════════════════════════════════════════════════
-- REPAIR REVERSIBLE (OBSOLETO — 5 filas): usar repair-riviera-open-metadata-16-rows-reversible.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- REPAIR REVERSIBLE: metadata.organizador_id → Riviera Open
--
-- EVIDENCIA (prod 2026-07-07, diagnose-ranking-metadata-organizador.sql):
--   6 participaciones con repair_reason=manual_override_parent_deleted
--   escritas a Hackpadel el 2026-07-06, que deben contar como Riviera Open
--   para cuadrar el desglose esperado SIN tocar Edgardo/Irving/David R.
--
-- NO ejecutar UPDATE hasta revisar PREVIEW + backup.
--
-- Riviera Open: 2770b522-9064-4c7b-a729-4a0ea7e3f6e8
-- Hackpadel:     e724de97-3552-4a01-a269-f621e6f1ed26
-- ═══════════════════════════════════════════════════════════════════════════

-- ── FILAS OBJETIVO (lista explícita — sin heurística) ─────────────────────
-- | participacion_id                       | jugador     | evento              | pts | efecto esperado        |
-- |----------------------------------------|-------------|---------------------|-----|------------------------|
-- | c211351e-401c-4e03-b42f-87942ccec04a   | Nevyl       | Hack Padel 5ta Fuerza|  50 | HP→RO (+50 RO)         |
-- | a8ef7057-ef5b-40e4-8d00-78d9bf75291f   | Nevyl       | Hack Padel          |  70 | HP→RO (+70 RO)         |
-- | 47e16c96-4658-4590-a194-ab1c8dce491c   | Daniel N    | Remontada Final     |  75 | HP→RO (+75 RO)         |
-- | af969403-28ec-4aa4-8638-22121b3b7591   | Alejandro R | Remontada Final     |  75 | HP→RO (+75 RO)         |
-- | ee2a6797-61b3-4dd2-b5e5-7e537b10f16c   | Sebastian   | Remontada Final     |  25 | HP→RO (+25 RO)         |
--
-- NO TOCAR (OK en diagnóstico):
--   Edgardo Remontada 6425dfbf… (50 HP correcto junto a Rush RO)
--   Irving Remontada dca25cba… (50 HP correcto junto a Rush RO)
--   David R Hack Padel 5ta 97d04a08… (50 HP correcto junto a Rush RO 550)

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) PREVIEW — antes / después por jugador
-- ═══════════════════════════════════════════════════════════════════════════
WITH target_ids AS (
  SELECT unnest(ARRAY[
    'c211351e-401c-4e03-b42f-87942ccec04a'::uuid,
    'a8ef7057-ef5b-40e4-8d00-78d9bf75291f'::uuid,
    '47e16c96-4658-4590-a194-ab1c8dce491c'::uuid,
    'af969403-28ec-4aa4-8638-22121b3b7591'::uuid,
    'ee2a6797-61b3-4dd2-b5e5-7e537b10f16c'::uuid
  ]) AS participacion_id
),
rows AS (
  SELECT
    jp.id AS participacion_id,
    rj.nombre AS jugador_nombre,
    ident.riviera_id,
    jp.evento_nombre,
    jp.puntos_obtenidos,
    jp.metadata->>'organizador_id' AS org_antes,
    '2770b522-9064-4c7b-a729-4a0ea7e3f6e8' AS org_despues,
    jp.metadata->>'repair_reason' AS repair_reason,
    jp.metadata->>'manual_override_approved_at' AS repair_applied_at
  FROM target_ids t
  JOIN public.jugador_participaciones jp ON jp.id = t.participacion_id
  LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  LEFT JOIN public.riviera_official_player_identity ident
    ON ident.canonical_riviera_jugador_id = jp.jugador_id
)
SELECT * FROM rows ORDER BY jugador_nombre, evento_nombre;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) BACKUP — ejecutar ANTES del UPDATE (crea tabla de respaldo)
-- ═══════════════════════════════════════════════════════════════════════════
/*
DROP TABLE IF EXISTS public._backup_jp_metadata_20260707_ranking;

CREATE TABLE public._backup_jp_metadata_20260707_ranking AS
SELECT
  jp.id AS participacion_id,
  jp.jugador_id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  jp.metadata AS metadata_before,
  now() AS backed_up_at
FROM public.jugador_participaciones jp
WHERE jp.id IN (
  'c211351e-401c-4e03-b42f-87942ccec04a',
  'a8ef7057-ef5b-40e4-8d00-78d9bf75291f',
  '47e16c96-4658-4590-a194-ab1c8dce491c',
  'af969403-28ec-4aa4-8638-22121b3b7591',
  'ee2a6797-61b3-4dd2-b5e5-7e537b10f16c'
);

SELECT COUNT(*)::integer AS filas_respaldadas
FROM public._backup_jp_metadata_20260707_ranking;
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) UPDATE — dentro de BEGIN … COMMIT tras validar backup
-- ═══════════════════════════════════════════════════════════════════════════
/*
BEGIN;

UPDATE public.jugador_participaciones jp
SET metadata = COALESCE(jp.metadata, '{}'::jsonb)
  || jsonb_build_object(
    'organizador_id', '2770b522-9064-4c7b-a729-4a0ea7e3f6e8',
    'club_name', COALESCE(
      public.get_organizador_display_name('2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid),
      'Riviera Open'
    ),
    'repair_reason', 'metadata_organizador_restored_to_riviera_open',
    'integrity_status', 'repaired_ranking_metadata',
    'previous_organizador_id', jp.metadata->>'organizador_id',
    'previous_repair_reason', jp.metadata->>'repair_reason',
    'metadata_restored_at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )
WHERE jp.id IN (
  'c211351e-401c-4e03-b42f-87942ccec04a',
  'a8ef7057-ef5b-40e4-8d00-78d9bf75291f',
  '47e16c96-4658-4590-a194-ab1c8dce491c',
  'af969403-28ec-4aa4-8638-22121b3b7591',
  'ee2a6797-61b3-4dd2-b5e5-7e537b10f16c'
)
AND jp.metadata->>'organizador_id' = 'e724de97-3552-4a01-a269-f621e6f1ed26'
AND jp.metadata->>'repair_reason' = 'manual_override_parent_deleted';

-- refresh stats por jugador afectado
DO $$
DECLARE v_jid uuid;
BEGIN
  FOR v_jid IN
    SELECT DISTINCT b.jugador_id
    FROM public._backup_jp_metadata_20260707_ranking b
  LOOP
    PERFORM public.refresh_jugador_stats(v_jid);
  END LOOP;
END $$;

COMMIT;
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) VERIFICACIÓN POST-UPDATE (ejecutar tras COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════
-- Re-ejecutar sección C de diagnose-ranking-metadata-organizador.sql
-- Esperado tras repair:
--   Nevyl       RO 120 | HP  50 | Total 170
--   Daniel N    RO  75 | HP  75 | Total 150
--   Alejandro R RO  75 | HP   0 | Total  75
--   Sebastian   RO  25 | HP  25 | Total  50
--   Edgardo T   RO  50 | HP  70 | Total 120  (sin cambio)
--   Irving      RO  50 | HP  50 | Total 100  (sin cambio)
--   David R     RO 550 | HP  50 | Total 600  (sin cambio)

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) ROLLBACK — restaurar metadata exacta desde backup
-- ═══════════════════════════════════════════════════════════════════════════
/*
BEGIN;

UPDATE public.jugador_participaciones jp
SET metadata = b.metadata_before
FROM public._backup_jp_metadata_20260707_ranking b
WHERE jp.id = b.participacion_id;

DO $$
DECLARE v_jid uuid;
BEGIN
  FOR v_jid IN
    SELECT DISTINCT b.jugador_id
    FROM public._backup_jp_metadata_20260707_ranking b
  LOOP
    PERFORM public.refresh_jugador_stats(v_jid);
  END LOOP;
END $$;

COMMIT;
*/
