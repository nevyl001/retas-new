-- Integridad estricta de profile_link — fuente canónica de scoring y RPC.
-- Ejecutar en Supabase SQL Editor antes de diagnose/repair orphan.
--
-- Reglas HIGH (auto-link permitido):
--   candidate_count = 1 Y al menos una evidencia FUERTE:
--   grant_to_canonical | grant_to_identity | same_legacy | host_club_overlap
--
-- cross_club_profile u orphan_org_in_official_clubs SIN evidencia fuerte → REVIEW
-- candidate_count > 1 → REVIEW

CREATE OR REPLACE FUNCTION public._riviera_normalize_player_name(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(regexp_replace(COALESCE(p_nombre, ''), '\s+', ' ', 'g')));
$$;

CREATE OR REPLACE FUNCTION public._riviera_profile_link_resolution(p_jugador_id uuid)
RETURNS TABLE (
  jugador_id uuid,
  jugador_nombre text,
  jugador_organizador_id uuid,
  has_profile_link boolean,
  existing_official_player_key uuid,
  existing_riviera_id text,
  candidate_official_jugador_id uuid,
  candidate_nombre text,
  candidate_riviera_id text,
  candidate_official_player_key uuid,
  candidate_count integer,
  grant_to_canonical boolean,
  grant_to_identity boolean,
  same_legacy boolean,
  host_club_overlap boolean,
  cross_club_profile boolean,
  confidence text,
  reason text,
  action_sugerida text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jugador AS (
    SELECT rj.id, rj.nombre, rj.organizador_id, rj.legacy_player_id
    FROM public.riviera_jugadores rj
    WHERE rj.id = p_jugador_id
  ),
  existing_link AS (
    SELECT l.official_player_key, i.riviera_id
    FROM jugador j
    INNER JOIN public.riviera_official_player_profile_link l
      ON l.riviera_jugador_id = j.id
    LEFT JOIN public.riviera_official_player_identity i
      ON i.official_player_key = l.official_player_key
  ),
  host_clubs AS (
    SELECT string_agg(
      DISTINCT COALESCE(
        NULLIF(trim(jp.metadata->>'organizador_id'), ''),
        j.organizador_id::text
      ),
      ', '
    ) AS host_clubs
    FROM jugador j
    LEFT JOIN public.jugador_participaciones jp
      ON jp.jugador_id = j.id
     AND COALESCE(jp.puntos_obtenidos, 0) > 0
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
      j.id AS orphan_id,
      op.jugador_id AS candidate_id,
      op.nombre AS candidate_nombre,
      op.riviera_id AS candidate_riviera_id,
      op.official_player_key AS candidate_key,
      op.canonical_riviera_jugador_id,
      EXISTS (
        SELECT 1 FROM public.organizer_player_access opa
        WHERE opa.is_active = true
          AND opa.local_jugador_id = j.id
          AND opa.jugador_id = op.canonical_riviera_jugador_id
      ) AS grant_to_canonical,
      EXISTS (
        SELECT 1 FROM public.organizer_player_access opa
        INNER JOIN public.riviera_official_player_profile_link pls
          ON pls.riviera_jugador_id = opa.jugador_id
        WHERE opa.is_active = true
          AND opa.local_jugador_id = j.id
          AND pls.official_player_key = op.official_player_key
      ) AS grant_to_identity,
      (j.legacy_player_id IS NOT NULL AND j.legacy_player_id = op.legacy_player_id) AS same_legacy,
      EXISTS (
        SELECT 1
        FROM unnest(string_to_array(COALESCE(hc.host_clubs, ''), ', ')) AS h(host_org)
        WHERE trim(h.host_org) <> ''
          AND trim(h.host_org) = ANY (
            SELECT unnest(oc.organizer_ids) FROM official_clubs oc
            WHERE oc.official_player_key = op.official_player_key
          )
      ) AS host_club_overlap,
      (j.organizador_id IS DISTINCT FROM op.organizador_id) AS cross_club_profile,
      (
        j.organizador_id = ANY (
          SELECT unnest(oc.organizer_ids)::uuid FROM official_clubs oc
          WHERE oc.official_player_key = op.official_player_key
        )
      ) AS orphan_org_in_official_clubs
    FROM jugador j
    CROSS JOIN host_clubs hc
    INNER JOIN official_profiles op
      ON public._riviera_normalize_player_name(j.nombre) = op.name_key
    WHERE NOT EXISTS (SELECT 1 FROM existing_link)
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
          cp.candidate_riviera_id NULLS LAST
      ) AS rn
    FROM candidate_pairs cp
  ),
  scored AS (
    SELECT
      cr.*,
      CASE
        WHEN cr.candidate_count > 1 THEN 'REVIEW'
        WHEN cr.candidate_count = 1
          AND (cr.grant_to_canonical OR cr.grant_to_identity OR cr.same_legacy OR cr.host_club_overlap)
        THEN 'HIGH'
        WHEN cr.candidate_count = 1
          AND (cr.cross_club_profile OR cr.orphan_org_in_official_clubs)
        THEN 'REVIEW'
        WHEN cr.candidate_count = 1 THEN 'LOW'
        ELSE 'LOW'
      END AS confidence,
      CASE
        WHEN cr.candidate_count > 1 THEN 'múltiples candidatos oficiales con el mismo nombre'
        WHEN cr.candidate_count = 1 AND (cr.grant_to_canonical OR cr.grant_to_identity) THEN
          'grant activo entre perfil y carrera oficial'
        WHEN cr.candidate_count = 1 AND cr.same_legacy THEN
          'mismo legacy_player_id que perfil oficial'
        WHEN cr.candidate_count = 1 AND cr.host_club_overlap THEN
          'participaciones en club(es) de la identidad oficial'
        WHEN cr.candidate_count = 1 AND (cr.cross_club_profile OR cr.orphan_org_in_official_clubs) THEN
          'solo evidencia débil (nombre/cross-club); requiere revisión manual'
        WHEN cr.candidate_count = 1 THEN 'nombre coincide pero sin evidencia fuerte'
        ELSE 'sin candidato oficial con Riviera ID'
      END AS reason
    FROM candidate_ranked cr
    WHERE cr.rn = 1
  )
  SELECT
    j.id,
    j.nombre,
    j.organizador_id,
    EXISTS (SELECT 1 FROM existing_link),
    (SELECT el.official_player_key FROM existing_link el LIMIT 1),
    (SELECT el.riviera_id::text FROM existing_link el LIMIT 1),
    s.candidate_id,
    s.candidate_nombre,
    s.candidate_riviera_id,
    s.candidate_key,
    COALESCE(s.candidate_count, 0)::integer,
    COALESCE(s.grant_to_canonical, false),
    COALESCE(s.grant_to_identity, false),
    COALESCE(s.same_legacy, false),
    COALESCE(s.host_club_overlap, false),
    COALESCE(s.cross_club_profile, false),
    CASE WHEN EXISTS (SELECT 1 FROM existing_link) THEN 'OK' ELSE COALESCE(s.confidence, 'LOW') END,
    CASE WHEN EXISTS (SELECT 1 FROM existing_link) THEN 'perfil ya enlazado' ELSE COALESCE(s.reason, 'sin candidato oficial con Riviera ID') END,
    CASE
      WHEN EXISTS (SELECT 1 FROM existing_link) THEN 'NONE'
      WHEN COALESCE(s.confidence, 'LOW') = 'HIGH' THEN 'LINK_TO_OFFICIAL'
      WHEN COALESCE(s.confidence, 'LOW') = 'REVIEW' THEN 'MANUAL_REVIEW'
      ELSE 'INSUFFICIENT_EVIDENCE'
    END
  FROM jugador j
  LEFT JOIN scored s ON s.orphan_id = j.id;
$$;

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
  WITH orphan_stats AS (
    SELECT
      rj.id AS jugador_id,
      COUNT(jp.id)::bigint AS total_participaciones,
      COALESCE(SUM(jp.puntos_obtenidos), 0)::bigint AS total_puntos,
      string_agg(DISTINCT jp.evento_nombre, ' | ' ORDER BY jp.evento_nombre) AS eventos,
      string_agg(
        DISTINCT COALESCE(NULLIF(trim(jp.metadata->>'organizador_id'), ''), rj.organizador_id::text),
        ', '
      ) AS host_clubs
    FROM public.riviera_jugadores rj
    INNER JOIN public.jugador_participaciones jp ON jp.jugador_id = rj.id
    WHERE rj.estado = 'activo'
      AND COALESCE(jp.puntos_obtenidos, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.riviera_official_player_profile_link pl
        WHERE pl.riviera_jugador_id = rj.id
      )
    GROUP BY rj.id
  )
  SELECT
    r.jugador_id,
    r.jugador_nombre,
    r.jugador_organizador_id,
    public.get_organizador_display_name(r.jugador_organizador_id),
    os.total_participaciones,
    os.total_puntos,
    os.eventos,
    os.host_clubs,
    EXISTS (
      SELECT 1 FROM public.get_public_career_jugador_ids(r.candidate_official_jugador_id) g(jugador_id)
      WHERE g.jugador_id = r.jugador_id
    ),
    r.candidate_official_jugador_id,
    r.candidate_nombre,
    r.candidate_riviera_id,
    r.candidate_official_player_key,
    r.candidate_count,
    r.confidence,
    r.reason,
    r.action_sugerida
  FROM orphan_stats os
  INNER JOIN public._riviera_profile_link_resolution(os.jugador_id) r
    ON r.jugador_id = os.jugador_id;
$$;

CREATE OR REPLACE FUNCTION public.ensure_official_profile_link_for_participacion(
  p_jugador_id uuid,
  p_organizador_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row record;
  v_link_id uuid;
BEGIN
  IF p_jugador_id IS NULL THEN
    RETURN jsonb_build_object(
      'linked', false, 'confidence', 'LOW', 'reason', 'missing_jugador_id',
      'action_sugerida', 'INSUFFICIENT_EVIDENCE'
    );
  END IF;

  SELECT * INTO v_row
  FROM public._riviera_profile_link_resolution(p_jugador_id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'linked', false, 'confidence', 'LOW', 'reason', 'jugador_no_encontrado',
      'action_sugerida', 'INSUFFICIENT_EVIDENCE', 'jugador_id', p_jugador_id
    );
  END IF;

  IF v_row.has_profile_link THEN
    RETURN jsonb_build_object(
      'linked', true, 'already_linked', true, 'confidence', 'OK',
      'reason', v_row.reason, 'action_sugerida', 'NONE',
      'official_player_key', v_row.existing_official_player_key,
      'riviera_id', v_row.existing_riviera_id, 'jugador_id', p_jugador_id
    );
  END IF;

  IF v_row.confidence IS DISTINCT FROM 'HIGH'
     OR v_row.candidate_official_player_key IS NULL THEN
    RETURN jsonb_build_object(
      'linked', false, 'confidence', v_row.confidence,
      'reason', v_row.reason, 'action_sugerida', v_row.action_sugerida,
      'jugador_id', p_jugador_id, 'jugador_nombre', v_row.jugador_nombre,
      'candidate_count', v_row.candidate_count,
      'candidate_riviera_id', v_row.candidate_riviera_id,
      'candidate_official_player_key', v_row.candidate_official_player_key,
      'grant_to_canonical', v_row.grant_to_canonical,
      'grant_to_identity', v_row.grant_to_identity,
      'same_legacy', v_row.same_legacy,
      'host_club_overlap', v_row.host_club_overlap,
      'cross_club_profile', v_row.cross_club_profile
    );
  END IF;

  IF v_actor IS NOT NULL AND p_organizador_id IS NOT NULL AND NOT public.is_master_admin() THEN
    IF v_actor IS DISTINCT FROM p_organizador_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.riviera_jugadores rj
        WHERE rj.id = p_jugador_id AND rj.organizador_id = p_organizador_id
      ) THEN
        RETURN jsonb_build_object(
          'linked', false, 'confidence', 'LOW', 'reason', 'permission_denied',
          'action_sugerida', 'INSUFFICIENT_EVIDENCE', 'jugador_id', p_jugador_id
        );
      END IF;
    END IF;
  END IF;

  INSERT INTO public.riviera_official_player_profile_link (
    official_player_key, riviera_jugador_id, organizer_id, link_source, created_by
  ) VALUES (
    v_row.candidate_official_player_key, p_jugador_id,
    v_row.jugador_organizador_id, 'manual_admin', v_actor
  )
  ON CONFLICT (riviera_jugador_id) DO NOTHING
  RETURNING id INTO v_link_id;

  RETURN jsonb_build_object(
    'linked', v_link_id IS NOT NULL OR v_row.has_profile_link,
    'link_created', v_link_id IS NOT NULL, 'confidence', 'HIGH',
    'reason', v_row.reason, 'action_sugerida', 'LINK_TO_OFFICIAL',
    'official_player_key', v_row.candidate_official_player_key,
    'riviera_id', v_row.candidate_riviera_id, 'jugador_id', p_jugador_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public._riviera_profile_link_resolution(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public._riviera_orphan_profile_audit() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_official_profile_link_for_participacion(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
