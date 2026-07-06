-- Diagnóstico: perfiles huérfanos con participaciones/puntos fuera del grafo oficial.
-- Ejecutar en Supabase SQL Editor (staging → prod). Solo lectura.
--
-- Detecta riviera_jugadores con puntos pero sin riviera_official_player_profile_link,
-- fuera de get_public_career_jugador_ids del candidato oficial, y propone match.

-- ── Normalización de nombre (compartida con repair) ─────────────────────────
CREATE OR REPLACE FUNCTION public._riviera_normalize_player_name(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(regexp_replace(COALESCE(p_nombre, ''), '\s+', ' ', 'g')));
$$;

COMMENT ON FUNCTION public._riviera_normalize_player_name(text) IS
  'Clave estable de nombre para matching de perfiles huérfanos.';

-- ── Auditoría de huérfanos ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._riviera_orphan_profile_audit()
RETURNS TABLE (
  orphan_jugador_id uuid,
  orphan_nombre text,
  orphan_organizador_id uuid,
  orphan_club_name text,
  total_participaciones bigint,
  total_puntos bigint,
  eventos text,
  host_clubs text,
  in_career_rpc boolean,
  candidate_official_jugador_id uuid,
  candidate_nombre text,
  candidate_riviera_id text,
  candidate_official_player_key uuid,
  candidate_count integer,
  confidence text,
  reason text,
  action_sugerida text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH orphan_base AS (
    SELECT
      rj.id AS jugador_id,
      rj.nombre,
      rj.organizador_id,
      rj.legacy_player_id
    FROM public.riviera_jugadores rj
    WHERE rj.estado = 'activo'
      AND NOT EXISTS (
        SELECT 1
        FROM public.riviera_official_player_profile_link pl
        WHERE pl.riviera_jugador_id = rj.id
      )
      AND EXISTS (
        SELECT 1
        FROM public.jugador_participaciones jp
        WHERE jp.jugador_id = rj.id
          AND COALESCE(jp.puntos_obtenidos, 0) > 0
      )
  ),
  orphan_stats AS (
    SELECT
      ob.jugador_id,
      COUNT(jp.id)::bigint AS total_participaciones,
      COALESCE(SUM(jp.puntos_obtenidos), 0)::bigint AS total_puntos,
      string_agg(DISTINCT jp.evento_nombre, ' | ' ORDER BY jp.evento_nombre) AS eventos,
      string_agg(
        DISTINCT COALESCE(
          NULLIF(trim(jp.metadata->>'organizador_id'), ''),
          ob.organizador_id::text
        ),
        ', '
      ) AS host_clubs
    FROM orphan_base ob
    INNER JOIN public.jugador_participaciones jp ON jp.jugador_id = ob.jugador_id
    WHERE COALESCE(jp.puntos_obtenidos, 0) > 0
    GROUP BY ob.jugador_id
  ),
  official_profiles AS (
    SELECT
      rj.id AS jugador_id,
      rj.nombre,
      rj.organizador_id,
      rj.legacy_player_id,
      i.official_player_key,
      i.riviera_id,
      i.canonical_riviera_jugador_id,
      public._riviera_normalize_player_name(rj.nombre) AS name_key
    FROM public.riviera_jugadores rj
    INNER JOIN public.riviera_official_player_profile_link pl
      ON pl.riviera_jugador_id = rj.id
    INNER JOIN public.riviera_official_player_identity i
      ON i.official_player_key = pl.official_player_key
    WHERE rj.estado = 'activo'
      AND i.riviera_id IS NOT NULL
  ),
  official_clubs AS (
    SELECT
      pl.official_player_key,
      array_agg(DISTINCT pl.organizer_id::text) AS organizer_ids
    FROM public.riviera_official_player_profile_link pl
    GROUP BY pl.official_player_key
  ),
  candidate_pairs AS (
    SELECT
      ob.jugador_id AS orphan_id,
      op.jugador_id AS candidate_id,
      op.nombre AS candidate_nombre,
      op.riviera_id AS candidate_riviera_id,
      op.official_player_key AS candidate_key,
      op.canonical_riviera_jugador_id,
      op.organizador_id AS candidate_org,
      ob.organizador_id AS orphan_org,
      ob.legacy_player_id AS orphan_legacy,
      op.legacy_player_id AS candidate_legacy,
      os.host_clubs,
      EXISTS (
        SELECT 1
        FROM public.organizer_player_access opa
        WHERE opa.is_active = true
          AND opa.local_jugador_id = ob.jugador_id
          AND opa.jugador_id = op.canonical_riviera_jugador_id
      ) AS grant_to_canonical,
      EXISTS (
        SELECT 1
        FROM public.organizer_player_access opa
        INNER JOIN public.riviera_official_player_profile_link pls
          ON pls.riviera_jugador_id = opa.jugador_id
        WHERE opa.is_active = true
          AND opa.local_jugador_id = ob.jugador_id
          AND pls.official_player_key = op.official_player_key
      ) AS grant_to_identity,
      (
        ob.legacy_player_id IS NOT NULL
        AND ob.legacy_player_id = op.legacy_player_id
      ) AS same_legacy,
      (
        ob.organizador_id = ANY (
          SELECT unnest(oc.organizer_ids)::uuid
          FROM official_clubs oc
          WHERE oc.official_player_key = op.official_player_key
        )
      ) AS orphan_org_in_official_clubs,
      EXISTS (
        SELECT 1
        FROM unnest(string_to_array(os.host_clubs, ', ')) AS hc(host_org)
        WHERE trim(hc.host_org) <> ''
          AND trim(hc.host_org) = ANY (
            SELECT unnest(oc.organizer_ids)
            FROM official_clubs oc
            WHERE oc.official_player_key = op.official_player_key
          )
      ) AS host_club_overlap,
      (
        ob.organizador_id IS DISTINCT FROM op.organizador_id
      ) AS cross_club_profile
    FROM orphan_base ob
    INNER JOIN orphan_stats os ON os.jugador_id = ob.jugador_id
    INNER JOIN official_profiles op
      ON public._riviera_normalize_player_name(ob.nombre) = op.name_key
  ),
  candidate_ranked AS (
    SELECT
      cp.*,
      COUNT(*) OVER (PARTITION BY cp.orphan_id) AS candidate_count,
      ROW_NUMBER() OVER (
        PARTITION BY cp.orphan_id
        ORDER BY
          (cp.grant_to_canonical OR cp.grant_to_identity) DESC,
          cp.same_legacy DESC,
          cp.host_club_overlap DESC,
          cp.orphan_org_in_official_clubs DESC,
          cp.cross_club_profile DESC,
          cp.candidate_riviera_id NULLS LAST
      ) AS rn
    FROM candidate_pairs cp
  ),
  scored AS (
    SELECT
      cr.orphan_id,
      cr.candidate_id,
      cr.candidate_nombre,
      cr.candidate_riviera_id,
      cr.candidate_key,
      cr.candidate_count::integer,
      CASE
        WHEN cr.candidate_count = 1
          AND (
            cr.grant_to_canonical
            OR cr.grant_to_identity
            OR cr.same_legacy
            OR cr.host_club_overlap
            OR cr.orphan_org_in_official_clubs
            OR cr.cross_club_profile
          )
        THEN 'HIGH'
        WHEN cr.candidate_count > 1 THEN 'REVIEW'
        ELSE 'LOW'
      END AS confidence,
      CASE
        WHEN cr.grant_to_canonical OR cr.grant_to_identity THEN
          'grant activo entre huérfano y carrera oficial'
        WHEN cr.same_legacy THEN
          'mismo legacy_player_id que perfil oficial'
        WHEN cr.host_club_overlap THEN
          'participaciones en club(es) de la identidad oficial'
        WHEN cr.orphan_org_in_official_clubs THEN
          'perfil huérfano en club con perfil oficial enlazado'
        WHEN cr.cross_club_profile AND cr.candidate_count = 1 THEN
          'nombre único con identidad oficial en otro club (perfil local faltante)'
        WHEN cr.candidate_count > 1 THEN
          'múltiples candidatos oficiales con el mismo nombre'
        ELSE
          'sin evidencia suficiente de match'
      END AS reason
    FROM candidate_ranked cr
    WHERE cr.rn = 1
  )
  SELECT
    ob.jugador_id AS orphan_jugador_id,
    ob.nombre AS orphan_nombre,
    ob.organizador_id AS orphan_organizador_id,
    public.get_organizador_display_name(ob.organizador_id) AS orphan_club_name,
    os.total_participaciones,
    os.total_puntos,
    os.eventos,
    os.host_clubs,
    EXISTS (
      SELECT 1
      FROM scored s
      CROSS JOIN LATERAL (
        SELECT g.jugador_id
        FROM public.get_public_career_jugador_ids(s.candidate_id) AS g(jugador_id)
        WHERE g.jugador_id = ob.jugador_id
        LIMIT 1
      ) inc
      WHERE s.orphan_id = ob.jugador_id
    ) AS in_career_rpc,
    s.candidate_id AS candidate_official_jugador_id,
    s.candidate_nombre,
    s.candidate_riviera_id,
    s.candidate_key AS candidate_official_player_key,
    COALESCE(s.candidate_count, 0) AS candidate_count,
    COALESCE(s.confidence, 'LOW') AS confidence,
    COALESCE(s.reason, 'sin candidato oficial con Riviera ID') AS reason,
    CASE COALESCE(s.confidence, 'LOW')
      WHEN 'HIGH' THEN 'LINK_TO_OFFICIAL'
      WHEN 'REVIEW' THEN 'MANUAL_REVIEW'
      ELSE 'INSUFFICIENT_EVIDENCE'
    END AS action_sugerida
  FROM orphan_base ob
  INNER JOIN orphan_stats os ON os.jugador_id = ob.jugador_id
  LEFT JOIN scored s ON s.orphan_id = ob.jugador_id
  ORDER BY
    CASE COALESCE(s.confidence, 'LOW')
      WHEN 'HIGH' THEN 1
      WHEN 'REVIEW' THEN 2
      ELSE 3
    END,
    os.total_puntos DESC,
    ob.nombre;
$$;

COMMENT ON FUNCTION public._riviera_orphan_profile_audit() IS
  'Auditoría de perfiles huérfanos con puntos fuera del grafo official_player_key.';

GRANT EXECUTE ON FUNCTION public._riviera_orphan_profile_audit() TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Resultado principal
-- ═══════════════════════════════════════════════════════════════════════════
SELECT *
FROM public._riviera_orphan_profile_audit()
ORDER BY
  CASE confidence
    WHEN 'HIGH' THEN 1
    WHEN 'REVIEW' THEN 2
    ELSE 3
  END,
  total_puntos DESC,
  orphan_nombre;

-- ═══════════════════════════════════════════════════════════════════════════
-- Resumen
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  confidence,
  COUNT(*) AS perfiles,
  COALESCE(SUM(total_puntos), 0) AS puntos_afectados
FROM public._riviera_orphan_profile_audit()
GROUP BY confidence
ORDER BY 1;

NOTIFY pgrst, 'reload schema';
