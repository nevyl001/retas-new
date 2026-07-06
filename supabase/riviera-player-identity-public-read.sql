-- Identidad pública global: resolver jugador por UUID / Riviera ID sin gate org-first.
-- Complementa get_public_career_jugador_ids (sin exigir visible_publico en toda la carrera).
-- Ejecutar en Supabase SQL Editor (staging → prod).

CREATE OR REPLACE FUNCTION public.resolve_public_player_identity(
  p_jugador_id uuid DEFAULT NULL,
  p_riviera_id text DEFAULT NULL
)
RETURNS TABLE (
  anchor_jugador_id uuid,
  canonical_jugador_id uuid,
  riviera_id text,
  official_player_key text,
  home_organizador_id uuid,
  linked_jugador_id uuid,
  linked_organizador_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH anchor AS (
    SELECT COALESCE(
      p_jugador_id,
      (
        SELECT i.canonical_riviera_jugador_id
        FROM public.riviera_official_player_identity i
        WHERE i.riviera_id = NULLIF(TRIM(p_riviera_id), '')
        LIMIT 1
      )
    ) AS jugador_id
  ),
  official AS (
    SELECT public._resolve_official_player_key(a.jugador_id) AS official_key
    FROM anchor a
    WHERE a.jugador_id IS NOT NULL
  ),
  career AS (
    SELECT a.jugador_id AS jugador_id
    FROM anchor a
    WHERE a.jugador_id IS NOT NULL
    UNION
    SELECT l.riviera_jugador_id
    FROM official o
    JOIN public.riviera_official_player_profile_link l
      ON l.official_player_key = o.official_key
    WHERE o.official_key IS NOT NULL
    UNION
    SELECT i.canonical_riviera_jugador_id
    FROM official o
    JOIN public.riviera_official_player_identity i
      ON i.official_player_key = o.official_key
    WHERE o.official_key IS NOT NULL
      AND i.canonical_riviera_jugador_id IS NOT NULL
    UNION
    SELECT opa.local_jugador_id
    FROM official o
    JOIN public.riviera_official_player_identity i
      ON i.official_player_key = o.official_key
    JOIN public.organizer_player_access opa
      ON opa.jugador_id = i.canonical_riviera_jugador_id
     AND opa.is_active = true
    WHERE o.official_key IS NOT NULL
      AND opa.local_jugador_id IS NOT NULL
    UNION
    SELECT opa.jugador_id
    FROM anchor a
    JOIN public.organizer_player_access opa
      ON opa.is_active = true
     AND opa.local_jugador_id = a.jugador_id
    WHERE a.jugador_id IS NOT NULL
      AND opa.jugador_id IS NOT NULL
  ),
  linked AS (
    SELECT DISTINCT c.jugador_id
    FROM career c
    WHERE c.jugador_id IS NOT NULL
  ),
  identity_row AS (
    SELECT
      i.riviera_id::text AS riviera_id,
      i.official_player_key::text AS official_player_key,
      i.canonical_riviera_jugador_id AS canonical_jugador_id
    FROM official o
    JOIN public.riviera_official_player_identity i
      ON i.official_player_key = o.official_key
    WHERE o.official_key IS NOT NULL
    LIMIT 1
  ),
  home AS (
    SELECT rj.organizador_id
    FROM anchor a
    JOIN public.riviera_jugadores rj ON rj.id = a.jugador_id
    WHERE rj.estado = 'activo'
    LIMIT 1
  )
  SELECT
    a.jugador_id AS anchor_jugador_id,
    COALESCE(ir.canonical_jugador_id, a.jugador_id) AS canonical_jugador_id,
    ir.riviera_id,
    ir.official_player_key,
    h.organizador_id AS home_organizador_id,
    l.jugador_id AS linked_jugador_id,
    rj.organizador_id AS linked_organizador_id
  FROM anchor a
  CROSS JOIN linked l
  LEFT JOIN identity_row ir ON true
  LEFT JOIN home h ON true
  LEFT JOIN public.riviera_jugadores rj
    ON rj.id = l.jugador_id
   AND rj.estado = 'activo'
  WHERE a.jugador_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.resolve_public_player_identity(uuid, text) IS
  'Identidad global pública: Riviera ID, official_player_key y perfiles enlazados (cross-org).';

GRANT EXECUTE ON FUNCTION public.resolve_public_player_identity(uuid, text)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
