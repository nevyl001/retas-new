-- Avatares en vistas públicas de retas/duelos (incluye jugadores cedidos).
-- Ejecutar en Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.riviera_event_player_avatars(p_jugador_ids uuid[])
RETURNS TABLE (
  id uuid,
  foto_url text,
  rating numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    req.id,
    nullif(
      trim(
        coalesce(
          nullif(trim(l.foto_url), ''),
          nullif(trim(src.foto_url), '')
        )
      ),
      ''
    ) AS foto_url,
    coalesce(l.rating, src.rating, 3::numeric) AS rating
  FROM unnest(coalesce(p_jugador_ids, ARRAY[]::uuid[])) AS req(id)
  LEFT JOIN public.riviera_jugadores l
    ON l.id = req.id
   AND l.estado = 'activo'
  LEFT JOIN public.organizer_player_access opa
    ON opa.local_jugador_id = l.id
   AND opa.is_active = true
  LEFT JOIN public.riviera_jugadores src
    ON src.id = opa.jugador_id
   AND src.estado = 'activo'
  WHERE l.id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.riviera_event_legacy_player_avatars(
  p_organizador_id uuid,
  p_legacy_player_ids uuid[]
)
RETURNS TABLE (
  legacy_player_id uuid,
  foto_url text,
  rating numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rj.legacy_player_id,
    nullif(
      trim(
        coalesce(
          nullif(trim(rj.foto_url), ''),
          nullif(trim(src.foto_url), '')
        )
      ),
      ''
    ) AS foto_url,
    coalesce(rj.rating, src.rating, 3::numeric) AS rating
  FROM public.riviera_jugadores rj
  LEFT JOIN public.organizer_player_access opa
    ON opa.local_jugador_id = rj.id
   AND opa.is_active = true
  LEFT JOIN public.riviera_jugadores src
    ON src.id = opa.jugador_id
   AND src.estado = 'activo'
  WHERE rj.organizador_id = p_organizador_id
    AND rj.estado = 'activo'
    AND rj.legacy_player_id = ANY(coalesce(p_legacy_player_ids, ARRAY[]::uuid[]));
$$;

GRANT EXECUTE ON FUNCTION public.riviera_event_player_avatars(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.riviera_event_legacy_player_avatars(uuid, uuid[]) TO anon, authenticated;

COMMENT ON FUNCTION public.riviera_event_player_avatars(uuid[]) IS
  'Foto y rating para riviera_jugadores en eventos públicos (cedidos incluidos; fallback al origen).';

COMMENT ON FUNCTION public.riviera_event_legacy_player_avatars(uuid, uuid[]) IS
  'Foto y rating por legacy_player_id del organizador (retas/americanos; cedidos incluidos).';
