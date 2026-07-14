-- Diagnóstico READ-ONLY: por qué delete_riviera_jugador bloquea un jugador.
-- NO borra nada. Ejecutar en SQL Editor.
--
-- Opción A: por UUIDs
-- Opción B: por nombre (TestplaCT2 / TestplayerCT1)

WITH params AS (
  SELECT
    ARRAY[]::uuid[] AS ids, -- Opción A: p.ej. ARRAY['uuid'::uuid]
    ARRAY[
      lower('TestplaCT2'),
      lower('TestplayerCT1')
    ]::text[] AS names
),
target AS (
  SELECT rj.id
  FROM public.riviera_jugadores rj
  CROSS JOIN params p
  WHERE (
      cardinality(p.ids) > 0 AND rj.id = ANY (p.ids)
    )
    OR (
      cardinality(p.ids) = 0
      AND lower(trim(rj.nombre)) = ANY (p.names)
    )
),
base AS (
  SELECT
    rj.id AS jugador_id,
    rj.nombre,
    rj.organizador_id,
    rj.legacy_player_id,
    rj.legacy_liga_jugador_id,
    rj.created_at
  FROM public.riviera_jugadores rj
  INNER JOIN target t ON t.id = rj.id
)
SELECT
  b.jugador_id,
  b.nombre,
  b.organizador_id,
  b.legacy_player_id,
  b.legacy_liga_jugador_id,

  -- Misma condición exacta del RAISE "jugador concedido" en delete_riviera_jugador
  EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = b.organizador_id
      AND opa.local_jugador_id = b.jugador_id
      AND opa.is_active = true
  ) AS es_local_cedido_activo,

  EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = b.organizador_id
      AND (opa.local_jugador_id = b.jugador_id OR opa.jugador_id = b.jugador_id)
      AND opa.is_active = true
  ) AS aparece_en_opa_activo,

  (
    SELECT jsonb_agg(jsonb_build_object(
      'access_id', opa.id,
      'owner_organizador_id', opa.owner_organizador_id,
      'grantee_organizer_id', opa.grantee_organizer_id,
      'jugador_id_source', opa.jugador_id,
      'local_jugador_id', opa.local_jugador_id,
      'is_active', opa.is_active
    ))
    FROM public.organizer_player_access opa
    WHERE opa.local_jugador_id = b.jugador_id
       OR opa.jugador_id = b.jugador_id
  ) AS filas_organizer_player_access,

  (
    SELECT COUNT(*)::int
    FROM public.jugador_participaciones jp
    WHERE jp.jugador_id = b.jugador_id
  ) AS participaciones_count,

  (
    SELECT COUNT(*)::int
    FROM public.riviera_official_points_ledger l
    WHERE l.source_local_jugador_id = b.jugador_id
       OR l.participacion_id IN (
            SELECT jp.id FROM public.jugador_participaciones jp
            WHERE jp.jugador_id = b.jugador_id
          )
  ) AS ledger_rows_relacionadas,

  CASE
    WHEN to_regprocedure('public.resolve_official_player_key_for_jugador(uuid)') IS NOT NULL
    THEN public.resolve_official_player_key_for_jugador(b.jugador_id)
    ELSE NULL
  END AS official_player_key,

  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.organizer_player_access opa
      WHERE opa.grantee_organizer_id = b.organizador_id
        AND opa.local_jugador_id = b.jugador_id
        AND opa.is_active = true
    ) THEN 'LIKELY_RAISE: No se puede eliminar un jugador concedido… (Revoca desde Admin Principal / Quitar de mi club)'
    ELSE 'Si RPC aún falla: revisar auth.uid()=organizador_id (Sin permiso) o Jugador no encontrado; historial NO bloquea por RAISE en esta función'
  END AS diagnostico_probable
FROM base b
ORDER BY b.nombre;
