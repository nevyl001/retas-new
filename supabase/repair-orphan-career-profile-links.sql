-- Reparación idempotente: enlazar perfiles huérfanos HIGH al official_player_key correcto.
--
-- SOLO crea filas en riviera_official_player_profile_link.
-- NO mueve/borra participaciones, jugadores, puntos, rating, metadata ni Riviera ID.
--
-- Ejecutar en Supabase SQL Editor:
--   1) diagnose-orphan-career-profiles.sql
--   2) Este script
--   3) diagnose de nuevo (0 HIGH pendientes)
--   4) repair-career-event-host-organizer.sql si aplica + refresh stats

CREATE OR REPLACE FUNCTION public._riviera_normalize_player_name(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(regexp_replace(COALESCE(p_nombre, ''), '\s+', ' ', 'g')));
$$;

-- Reutiliza la misma auditoría que diagnose (CREATE OR REPLACE idempotente)
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
      (ob.organizador_id IS DISTINCT FROM op.organizador_id) AS cross_club_profile
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
      cr.orphan_org,
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
    ob.jugador_id,
    ob.nombre,
    ob.organizador_id,
    public.get_organizador_display_name(ob.organizador_id),
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
    ),
    s.candidate_id,
    s.candidate_nombre,
    s.candidate_riviera_id,
    s.candidate_key,
    COALESCE(s.candidate_count, 0),
    COALESCE(s.confidence, 'LOW'),
    COALESCE(s.reason, 'sin candidato oficial con Riviera ID'),
    CASE COALESCE(s.confidence, 'LOW')
      WHEN 'HIGH' THEN 'LINK_TO_OFFICIAL'
      WHEN 'REVIEW' THEN 'MANUAL_REVIEW'
      ELSE 'INSUFFICIENT_EVIDENCE'
    END
  FROM orphan_base ob
  INNER JOIN orphan_stats os ON os.jugador_id = ob.jugador_id
  LEFT JOIN scored s ON s.orphan_id = ob.jugador_id;
$$;

-- ── Reparación batch HIGH (idempotente) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.riviera_repair_orphan_profile_links_high()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_detected integer := 0;
  v_repaired integer := 0;
  v_review integer := 0;
  v_low integer := 0;
  v_row record;
  v_link_id uuid;
  v_repaired_names text[] := '{}';
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE confidence = 'REVIEW'),
    COUNT(*) FILTER (WHERE confidence = 'LOW')
  INTO v_detected, v_review, v_low
  FROM public._riviera_orphan_profile_audit();

  FOR v_row IN
    SELECT *
    FROM public._riviera_orphan_profile_audit()
    WHERE confidence = 'HIGH'
      AND candidate_official_player_key IS NOT NULL
      AND action_sugerida = 'LINK_TO_OFFICIAL'
  LOOP
    INSERT INTO public.riviera_official_player_profile_link (
      official_player_key,
      riviera_jugador_id,
      organizer_id,
      link_source,
      created_by
    )
    VALUES (
      v_row.candidate_official_player_key,
      v_row.orphan_jugador_id,
      v_row.orphan_organizador_id,
      'manual_admin',
      auth.uid()
    )
    ON CONFLICT (riviera_jugador_id) DO NOTHING
    RETURNING id INTO v_link_id;

    IF v_link_id IS NOT NULL THEN
      v_repaired := v_repaired + 1;
      v_repaired_names := array_append(
        v_repaired_names,
        v_row.orphan_nombre || ' → ' || COALESCE(v_row.candidate_riviera_id, '?')
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'detected_orphans', v_detected,
    'repaired', v_repaired,
    'left_review', v_review,
    'left_low', v_low,
    'repaired_players', v_repaired_names
  );
END;
$$;

COMMENT ON FUNCTION public.riviera_repair_orphan_profile_links_high() IS
  'Crea profile_link para huérfanos HIGH confidence. Idempotente.';

GRANT EXECUTE ON FUNCTION public.riviera_repair_orphan_profile_links_high() TO authenticated;

-- ── RPC app: enlace preventivo al registrar participación ───────────────────
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
  v_existing uuid;
BEGIN
  IF p_jugador_id IS NULL THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'missing_jugador_id');
  END IF;

  SELECT l.official_player_key
  INTO v_existing
  FROM public.riviera_official_player_profile_link l
  WHERE l.riviera_jugador_id = p_jugador_id;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'linked', true,
      'already_linked', true,
      'official_player_key', v_existing
    );
  END IF;

  SELECT *
  INTO v_row
  FROM public._riviera_orphan_profile_audit()
  WHERE orphan_jugador_id = p_jugador_id
    AND confidence = 'HIGH'
    AND candidate_official_player_key IS NOT NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'no_high_confidence_match');
  END IF;

  IF v_actor IS NOT NULL
     AND p_organizador_id IS NOT NULL
     AND NOT public.is_master_admin() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.id = p_jugador_id
        AND rj.organizador_id = p_organizador_id
        AND (rj.organizador_id = v_actor OR p_organizador_id = v_actor)
    ) THEN
      -- Permitir si el actor es el organizador anfitrión del evento
      IF v_actor IS DISTINCT FROM p_organizador_id THEN
        RETURN jsonb_build_object('linked', false, 'reason', 'permission_denied');
      END IF;
    END IF;
  END IF;

  INSERT INTO public.riviera_official_player_profile_link (
    official_player_key,
    riviera_jugador_id,
    organizer_id,
    link_source,
    organizer_player_access_id,
    created_by
  )
  VALUES (
    v_row.candidate_official_player_key,
    v_row.orphan_jugador_id,
    v_row.orphan_organizador_id,
    'manual_admin',
    NULL,
    v_actor
  )
  ON CONFLICT (riviera_jugador_id) DO NOTHING
  RETURNING id INTO v_link_id;

  RETURN jsonb_build_object(
    'linked', v_link_id IS NOT NULL OR v_existing IS NOT NULL,
    'link_created', v_link_id IS NOT NULL,
    'official_player_key', v_row.candidate_official_player_key,
    'riviera_id', v_row.candidate_riviera_id,
    'confidence', v_row.confidence,
    'reason', v_row.reason
  );
END;
$$;

COMMENT ON FUNCTION public.ensure_official_profile_link_for_participacion(uuid, uuid) IS
  'Enlaza perfil huérfano HIGH antes de escribir participación. Preventivo.';

GRANT EXECUTE ON FUNCTION public.ensure_official_profile_link_for_participacion(uuid, uuid)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- EJECUCIÓN
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_result jsonb;
  v_jid uuid;
BEGIN
  v_result := public.riviera_repair_orphan_profile_links_high();

  RAISE NOTICE 'orphan-profile-repair: %', v_result;

  FOR v_jid IN
    SELECT DISTINCT pl.riviera_jugador_id
    FROM public.riviera_official_player_profile_link pl
    WHERE pl.link_source = 'manual_admin'
      AND pl.created_at > now() - interval '5 minutes'
  LOOP
    BEGIN
      PERFORM public.refresh_jugador_stats(v_jid);
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'refresh_jugador_stats no disponible';
        EXIT;
      WHEN OTHERS THEN
        RAISE NOTICE 'refresh_jugador_stats %: %', v_jid, SQLERRM;
    END;
  END LOOP;
END $$;

-- Validación post-repair
SELECT
  confidence,
  COUNT(*) AS perfiles,
  COALESCE(SUM(total_puntos), 0) AS puntos
FROM public._riviera_orphan_profile_audit()
GROUP BY confidence
ORDER BY 1;

-- Casos esperados (Daniel / Sebastian)
SELECT
  orphan_nombre,
  candidate_riviera_id,
  total_puntos,
  host_clubs,
  confidence,
  in_career_rpc
FROM public._riviera_orphan_profile_audit()
WHERE orphan_nombre IN ('Daniel N', 'Sebastian')
ORDER BY orphan_nombre;

NOTIFY pgrst, 'reload schema';
