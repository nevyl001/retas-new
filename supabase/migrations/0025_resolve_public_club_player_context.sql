-- 0025 — Resolución pública contextual club + jugador (ficha desde ranking).
--
-- Si un jugador aparece en el ranking público del club, su ficha pública
-- desde ese club debe abrirse (nativo / grant / clon / visible_publico=false
-- listado legítimamente). NO cambia visible_publico global. PII siempre NULL.
-- Aditivo. NO toca 0024 / puntos / rating / ledger / career.

CREATE OR REPLACE FUNCTION public.resolve_public_club_player_context(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS TABLE (
  id uuid,
  organizador_id uuid,
  nombre text,
  slug text,
  foto_url text,
  email text,
  telefono text,
  whatsapp text,
  nivel text,
  categoria text,
  edad integer,
  mano_dominante text,
  en_cancha text,
  pais_codigo text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  visible_publico boolean,
  suma_ranking boolean,
  genero text,
  fecha_nacimiento date,
  club text,
  estado text,
  legacy_player_id uuid,
  legacy_liga_jugador_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  rating numeric,
  rating_partidos integer,
  rating_fiabilidad numeric,
  puntos_totales integer,
  total_partidos integer,
  victorias integer,
  derrotas integer,
  empates integer,
  participaciones_solo integer,
  pct_victorias numeric,
  total_retas integer,
  total_torneos_express integer,
  total_ligas integer,
  total_americanos integer,
  sets_favor_total integer,
  sets_contra_total integer,
  racha_actual text,
  ultima_actividad timestamptz,
  stats_updated_at timestamptz,
  concedido boolean,
  source_jugador_id uuid,
  owner_organizador_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_roster_id uuid;
  v_concedido boolean := false;
  v_source_id uuid := null;
  v_owner_org uuid := null;
  v_display_name text := null;
  v_display_cat text := null;
BEGIN
  -- Revocado: no resoluble en ranking público.
  IF EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = p_organizador_id
      AND opa.is_active = false
      AND opa.local_jugador_id = p_jugador_id
  ) THEN
    RETURN;
  END IF;

  -- 1) Nativo activo del club (incluye visible_publico=false).
  SELECT rj.id
  INTO v_roster_id
  FROM public.riviera_jugadores rj
  WHERE rj.organizador_id = p_organizador_id
    AND rj.id = p_jugador_id
    AND rj.estado = 'activo'
  LIMIT 1;

  IF v_roster_id IS NOT NULL THEN
    SELECT
      true,
      opa.jugador_id,
      opa.owner_organizador_id,
      opa.local_display_name,
      opa.local_category
    INTO v_concedido, v_source_id, v_owner_org, v_display_name, v_display_cat
    FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = p_organizador_id
      AND opa.is_active = true
      AND opa.local_jugador_id = v_roster_id
    LIMIT 1;
    IF NOT FOUND THEN
      v_concedido := false;
      v_source_id := null;
      v_owner_org := null;
    END IF;
  END IF;

  -- 2) Lookup por source → clon local.
  IF v_roster_id IS NULL THEN
    SELECT
      opa.local_jugador_id,
      true,
      opa.jugador_id,
      opa.owner_organizador_id,
      opa.local_display_name,
      opa.local_category
    INTO v_roster_id, v_concedido, v_source_id, v_owner_org, v_display_name, v_display_cat
    FROM public.organizer_player_access opa
    JOIN public.riviera_jugadores local_rj
      ON local_rj.id = opa.local_jugador_id
     AND local_rj.organizador_id = p_organizador_id
     AND local_rj.estado = 'activo'
    WHERE opa.grantee_organizer_id = p_organizador_id
      AND opa.is_active = true
      AND opa.jugador_id = p_jugador_id
      AND opa.local_jugador_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.organizer_player_access rev
        WHERE rev.grantee_organizer_id = p_organizador_id
          AND rev.is_active = false
          AND rev.local_jugador_id = opa.local_jugador_id
      )
    LIMIT 1;
  END IF;

  -- 3) Grant sintético (sin clon): roster = source.
  IF v_roster_id IS NULL THEN
    SELECT
      opa.jugador_id,
      true,
      opa.jugador_id,
      opa.owner_organizador_id,
      opa.local_display_name,
      opa.local_category
    INTO v_roster_id, v_concedido, v_source_id, v_owner_org, v_display_name, v_display_cat
    FROM public.organizer_player_access opa
    JOIN public.riviera_jugadores src
      ON src.id = opa.jugador_id
     AND src.estado = 'activo'
    WHERE opa.grantee_organizer_id = p_organizador_id
      AND opa.is_active = true
      AND opa.local_jugador_id IS NULL
      AND opa.jugador_id = p_jugador_id
    LIMIT 1;
  END IF;

  IF v_roster_id IS NULL THEN
    RETURN;
  END IF;

  -- Fila local del club si existe; si no, source (sintético).
  RETURN QUERY
  SELECT
    COALESCE(local_rj.id, src.id) AS id,
    p_organizador_id AS organizador_id,
    COALESCE(
      NULLIF(TRIM(v_display_name), ''),
      local_rj.nombre,
      src.nombre,
      'Jugador'
    ) AS nombre,
    COALESCE(local_rj.slug, src.slug) AS slug,
    COALESCE(local_rj.foto_url, src.foto_url) AS foto_url,
    NULL::text AS email,
    NULL::text AS telefono,
    NULL::text AS whatsapp,
    COALESCE(local_rj.nivel::text, src.nivel::text) AS nivel,
    COALESCE(
      NULLIF(TRIM(v_display_cat), ''),
      local_rj.categoria,
      src.categoria
    ) AS categoria,
    COALESCE(local_rj.edad, src.edad)::integer AS edad,
    COALESCE(local_rj.mano_dominante, src.mano_dominante) AS mano_dominante,
    COALESCE(local_rj.en_cancha, src.en_cancha) AS en_cancha,
    COALESCE(local_rj.pais_codigo::text, src.pais_codigo::text) AS pais_codigo,
    COALESCE(local_rj.instagram_url, src.instagram_url) AS instagram_url,
    COALESCE(local_rj.facebook_url, src.facebook_url) AS facebook_url,
    COALESCE(local_rj.tiktok_url, src.tiktok_url) AS tiktok_url,
    COALESCE(local_rj.visible_publico, src.visible_publico) AS visible_publico,
    COALESCE(local_rj.suma_ranking, src.suma_ranking) AS suma_ranking,
    COALESCE(local_rj.genero, src.genero) AS genero,
    NULL::date AS fecha_nacimiento,
    COALESCE(local_rj.club, src.club) AS club,
    COALESCE(local_rj.estado::text, src.estado::text) AS estado,
    COALESCE(local_rj.legacy_player_id, src.legacy_player_id) AS legacy_player_id,
    COALESCE(local_rj.legacy_liga_jugador_id, src.legacy_liga_jugador_id) AS legacy_liga_jugador_id,
    COALESCE(local_rj.created_at, src.created_at) AS created_at,
    COALESCE(local_rj.updated_at, src.updated_at) AS updated_at,
    COALESCE(local_rj.rating, src.rating) AS rating,
    COALESCE(local_rj.rating_partidos, src.rating_partidos) AS rating_partidos,
    COALESCE(local_rj.rating_fiabilidad, src.rating_fiabilidad) AS rating_fiabilidad,
    COALESCE(js.puntos_totales, 0)::integer AS puntos_totales,
    COALESCE(js.total_partidos, 0)::integer AS total_partidos,
    COALESCE(js.victorias, 0)::integer AS victorias,
    COALESCE(js.derrotas, 0)::integer AS derrotas,
    COALESCE(js.empates, 0)::integer AS empates,
    COALESCE(js.participaciones_solo, 0)::integer AS participaciones_solo,
    COALESCE(js.pct_victorias, 0)::numeric AS pct_victorias,
    COALESCE(js.total_retas, 0)::integer AS total_retas,
    COALESCE(js.total_torneos_express, 0)::integer AS total_torneos_express,
    COALESCE(js.total_ligas, 0)::integer AS total_ligas,
    COALESCE(js.total_americanos, 0)::integer AS total_americanos,
    COALESCE(js.sets_favor_total, 0)::integer AS sets_favor_total,
    COALESCE(js.sets_contra_total, 0)::integer AS sets_contra_total,
    COALESCE(js.racha_actual, '')::text AS racha_actual,
    js.ultima_actividad::timestamptz AS ultima_actividad,
    js.updated_at AS stats_updated_at,
    COALESCE(v_concedido, false) AS concedido,
    v_source_id AS source_jugador_id,
    v_owner_org AS owner_organizador_id
  FROM (SELECT v_roster_id AS rid) r
  LEFT JOIN public.riviera_jugadores local_rj
    ON local_rj.id = r.rid
   AND local_rj.organizador_id = p_organizador_id
  LEFT JOIN public.riviera_jugadores src
    ON src.id = r.rid
   AND local_rj.id IS NULL
  LEFT JOIN public.jugador_stats js
    ON js.jugador_id = COALESCE(local_rj.id, src.id)
  WHERE COALESCE(local_rj.id, src.id) IS NOT NULL
  LIMIT 1;
END;
$function$;

COMMENT ON FUNCTION public.resolve_public_club_player_context(uuid, uuid) IS
  'Ficha pública contextual del ranking del club. PII siempre NULL. No exige visible_publico=true.';

REVOKE ALL ON FUNCTION public.resolve_public_club_player_context(uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_public_club_player_context(uuid, uuid)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
