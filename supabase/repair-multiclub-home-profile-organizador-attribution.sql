-- Corrección opcional en prod: metadata de participaciones reparadas en perfil nativo
-- Riviera Open que el override histórico asignó a Hackpadel.
--
-- Aplica la misma regla que el fix en app (multiclub + repaired_orphan_parent):
-- si la carrera tiene perfiles en ≥2 clubes, la fila en perfil oficial Riviera
-- vuelve a contar para Riviera Open.
--
-- Ejecutar PREVIEW primero; luego BEGIN + UPDATE + refresh_jugador_stats + COMMIT.

-- IDs prod (confirmados)
-- Riviera Open: 2770b522-9064-4c7b-a729-4a0ea7e3f6e8
-- Hackpadel:     e724de97-3552-4a01-a269-f621e6f1ed26

-- ═══════════════════════════════════════════════════════════════════════════
-- CTE compartido (PREVIEW y UPDATE)
-- get_public_career_jugador_ids → SETOF uuid → alias AS g(jugador_id)
-- ═══════════════════════════════════════════════════════════════════════════
/*
WITH career_homes AS (
  SELECT
    jp.id AS participacion_id,
    jp.jugador_id,
    jp.evento_nombre,
    jp.puntos_obtenidos,
    rj.organizador_id AS home_org,
    NULLIF(trim(jp.metadata->>'organizador_id'), '') AS meta_org,
    jp.metadata
  FROM public.jugador_participaciones jp
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  WHERE COALESCE(jp.puntos_obtenidos, 0) > 0
    AND COALESCE(jp.metadata->>'repair_reason', '') = 'manual_override_parent_deleted'
    AND COALESCE(jp.metadata->>'repaired_from_orphan_parent', '') = 'true'
),
linked_multiclub AS (
  SELECT DISTINCT ch.participacion_id, ch.home_org
  FROM career_homes ch
  WHERE ch.home_org = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
    AND ch.meta_org = 'e724de97-3552-4a01-a269-f621e6f1ed26'
    AND EXISTS (
      SELECT 1
      FROM public.get_public_career_jugador_ids(ch.jugador_id) AS g(jugador_id)
      JOIN public.riviera_jugadores rj2 ON rj2.id = g.jugador_id
      WHERE rj2.organizador_id IS DISTINCT FROM ch.home_org
    )
)
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- A) PREVIEW — solo lectura
-- ═══════════════════════════════════════════════════════════════════════════
WITH career_homes AS (
  SELECT
    jp.id AS participacion_id,
    jp.jugador_id,
    jp.evento_nombre,
    jp.puntos_obtenidos,
    rj.organizador_id AS home_org,
    rj.nombre AS jugador_nombre,
    NULLIF(trim(jp.metadata->>'organizador_id'), '') AS meta_org,
    jp.metadata
  FROM public.jugador_participaciones jp
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  WHERE COALESCE(jp.puntos_obtenidos, 0) > 0
    AND COALESCE(jp.metadata->>'repair_reason', '') = 'manual_override_parent_deleted'
    AND COALESCE(jp.metadata->>'repaired_from_orphan_parent', '') = 'true'
),
linked_multiclub AS (
  SELECT DISTINCT ch.participacion_id, ch.home_org
  FROM career_homes ch
  WHERE ch.home_org = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
    AND ch.meta_org = 'e724de97-3552-4a01-a269-f621e6f1ed26'
    AND EXISTS (
      SELECT 1
      FROM public.get_public_career_jugador_ids(ch.jugador_id) AS g(jugador_id)
      JOIN public.riviera_jugadores rj2 ON rj2.id = g.jugador_id
      WHERE rj2.organizador_id IS DISTINCT FROM ch.home_org
    )
)
SELECT
  ch.participacion_id,
  ch.jugador_nombre,
  ch.evento_nombre,
  ch.puntos_obtenidos,
  ch.meta_org AS meta_org_actual,
  ch.home_org AS meta_org_nuevo
FROM career_homes ch
JOIN linked_multiclub lm ON lm.participacion_id = ch.participacion_id
ORDER BY ch.jugador_nombre, ch.evento_nombre, ch.participacion_id;

SELECT COUNT(*)::integer AS filas_a_corregir
FROM (
  WITH career_homes AS (
    SELECT
      jp.id AS participacion_id,
      jp.jugador_id,
      rj.organizador_id AS home_org,
      NULLIF(trim(jp.metadata->>'organizador_id'), '') AS meta_org
    FROM public.jugador_participaciones jp
    JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
    WHERE COALESCE(jp.puntos_obtenidos, 0) > 0
      AND COALESCE(jp.metadata->>'repair_reason', '') = 'manual_override_parent_deleted'
      AND COALESCE(jp.metadata->>'repaired_from_orphan_parent', '') = 'true'
  )
  SELECT ch.participacion_id
  FROM career_homes ch
  WHERE ch.home_org = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
    AND ch.meta_org = 'e724de97-3552-4a01-a269-f621e6f1ed26'
    AND EXISTS (
      SELECT 1
      FROM public.get_public_career_jugador_ids(ch.jugador_id) AS g(jugador_id)
      JOIN public.riviera_jugadores rj2 ON rj2.id = g.jugador_id
      WHERE rj2.organizador_id IS DISTINCT FROM ch.home_org
    )
) sub;

-- ═══════════════════════════════════════════════════════════════════════════
-- B) UPDATE — descomentar y ejecutar dentro de BEGIN … COMMIT
-- ═══════════════════════════════════════════════════════════════════════════
/*
BEGIN;

WITH career_homes AS (
  SELECT
    jp.id AS participacion_id,
    jp.jugador_id,
    rj.organizador_id AS home_org,
    NULLIF(trim(jp.metadata->>'organizador_id'), '') AS meta_org,
    jp.metadata
  FROM public.jugador_participaciones jp
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  WHERE COALESCE(jp.puntos_obtenidos, 0) > 0
    AND COALESCE(jp.metadata->>'repair_reason', '') = 'manual_override_parent_deleted'
    AND COALESCE(jp.metadata->>'repaired_from_orphan_parent', '') = 'true'
),
linked_multiclub AS (
  SELECT DISTINCT ch.participacion_id, ch.home_org
  FROM career_homes ch
  WHERE ch.home_org = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
    AND ch.meta_org = 'e724de97-3552-4a01-a269-f621e6f1ed26'
    AND EXISTS (
      SELECT 1
      FROM public.get_public_career_jugador_ids(ch.jugador_id) AS g(jugador_id)
      JOIN public.riviera_jugadores rj2 ON rj2.id = g.jugador_id
      WHERE rj2.organizador_id IS DISTINCT FROM ch.home_org
    )
),
targets AS (
  SELECT participacion_id, home_org FROM linked_multiclub
)
UPDATE public.jugador_participaciones jp
SET metadata = COALESCE(jp.metadata, '{}'::jsonb)
  || jsonb_build_object(
    'organizador_id', t.home_org::text,
    'club_name', COALESCE(
      public.get_organizador_display_name(t.home_org),
      'Riviera Open'
    ),
    'repair_reason', 'home_profile_attribution_correction',
    'integrity_status', 'repaired_home_profile_org',
    'previous_organizador_id', jp.metadata->>'organizador_id'
  )
FROM targets t
WHERE jp.id = t.participacion_id;

DO $$
DECLARE v_jid uuid;
BEGIN
  FOR v_jid IN
    SELECT DISTINCT jp.jugador_id
    FROM public.jugador_participaciones jp
    WHERE COALESCE(jp.metadata->>'repair_reason', '') = 'home_profile_attribution_correction'
  LOOP
    PERFORM public.refresh_jugador_stats(v_jid);
  END LOOP;
END $$;

COMMIT;
*/

NOTIFY pgrst, 'reload schema';
