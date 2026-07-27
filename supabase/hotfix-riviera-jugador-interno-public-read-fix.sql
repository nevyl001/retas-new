-- Correccion al hotfix urgente #6 (riviera_jugador_interno_por_id/_por_slug).
--
-- El guard "solo dueno o Admin Maestro" del hotfix #6 era correcto contra la
-- fuga de PII, pero era mas amplio de lo necesario: estas dos RPC tambien
-- son la ruta principal de fetchInternalClubJugadorRow, que a su vez
-- alimenta getRivieraJugadorPublicBySlug cuando la ficha publica de un
-- jugador se ve en el contexto de un club especifico (viewingOrgId). Un
-- visitante anonimo o autenticado de otro club, viendo la ficha PUBLICA de
-- un jugador que SI es publico, ahora recibia "permission denied" (o, tras
-- la clasificacion de errores del cliente, un falso "jugador no
-- encontrado") en vez de su ficha.
--
-- Confirmado en codigo: isMissingRpcError/isMissingTableError en
-- rivieraJugadoresService.ts clasifican por texto del mensaje
-- ("riviera_jugador_interno", "riviera_jugadores"), y el mensaje de
-- "permission denied" contiene esas cadenas por coincidencia -- el fallback
-- a la tabla cruda tambien fallaba por el mismo motivo (esa tabla ya tiene
-- las 4 columnas privadas revocadas para anon), y fetchInternalClubJugadorRow
-- terminaba devolviendo null en vez de la ficha.
--
-- Fix: la funcion ahora distingue dueno/admin de no-dueno en vez de
-- rechazar a cualquier no-dueno.
--   - Si el llamador ES el organizador dueno o Admin Maestro: comportamiento
--     identico al hotfix #6 (fila completa, incluidas las 4 columnas
--     privadas).
--   - Si el llamador NO es el dueno: solo puede ver la fila si
--     visible_publico = true (misma condicion que ya rige el acceso publico
--     en la tabla base), y en ese caso las 4 columnas privadas se devuelven
--     como NULL -- nunca se exponen a un no-dueno, sea anonimo o
--     autenticado de otro club.
--   - La rama de acceso concedido (organizer_player_access) sigue
--     exigiendo que el llamador sea el organizador receptor real o Admin
--     Maestro -- eso no es un caso "publico", es el roster interno de ese
--     club, sin cambios respecto al hotfix #6.
--
-- Se revierte el REVOKE EXECUTE a anon del hotfix #6 (se vuelve a otorgar)
-- porque la lectura publica debe funcionar sin sesion; la proteccion real
-- ahora vive en el enmascarado de columnas de adentro, no en bloquear la
-- ejecucion por completo.

CREATE OR REPLACE FUNCTION public.riviera_jugador_interno_por_id(p_organizador_id uuid, p_jugador_id uuid)
 RETURNS TABLE(id uuid, organizador_id uuid, nombre text, slug text, foto_url text, email text, telefono text, whatsapp text, nivel text, categoria text, edad integer, mano_dominante text, en_cancha text, pais_codigo text, instagram_url text, facebook_url text, tiktok_url text, visible_publico boolean, suma_ranking boolean, genero text, fecha_nacimiento date, club text, estado text, legacy_player_id uuid, legacy_liga_jugador_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, rating numeric, rating_partidos integer, rating_fiabilidad numeric, puntos_totales integer, total_partidos integer, victorias integer, derrotas integer, empates integer, participaciones_solo integer, pct_victorias numeric, total_retas integer, total_torneos_express integer, total_ligas integer, total_americanos integer, sets_favor_total integer, sets_contra_total integer, racha_actual text, ultima_actividad timestamp with time zone, stats_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_owner_or_admin boolean;
BEGIN
  v_is_owner_or_admin :=
    auth.uid() IS NOT NULL
    AND (auth.uid() = p_organizador_id OR public.is_master_admin());

  RETURN QUERY
  SELECT
    rj.id, rj.organizador_id, rj.nombre, rj.slug, rj.foto_url,
    CASE WHEN v_is_owner_or_admin THEN rj.email ELSE NULL END,
    CASE WHEN v_is_owner_or_admin THEN rj.telefono ELSE NULL END,
    CASE WHEN v_is_owner_or_admin THEN rj.whatsapp ELSE NULL END,
    rj.nivel::text, rj.categoria, rj.edad::integer, rj.mano_dominante,
    rj.en_cancha, rj.pais_codigo::text, rj.instagram_url, rj.facebook_url, rj.tiktok_url,
    rj.visible_publico, rj.suma_ranking, rj.genero,
    CASE WHEN v_is_owner_or_admin THEN rj.fecha_nacimiento ELSE NULL END,
    rj.club,
    rj.estado::text, rj.legacy_player_id, rj.legacy_liga_jugador_id, rj.created_at,
    rj.updated_at, rj.rating, rj.rating_partidos, rj.rating_fiabilidad,
    COALESCE(js.puntos_totales, 0)::integer,
    COALESCE(js.total_partidos, 0)::integer,
    COALESCE(js.victorias, 0)::integer,
    COALESCE(js.derrotas, 0)::integer,
    COALESCE(js.empates, 0)::integer,
    COALESCE(js.participaciones_solo, 0)::integer,
    COALESCE(js.pct_victorias, 0)::numeric,
    COALESCE(js.total_retas, 0)::integer,
    COALESCE(js.total_torneos_express, 0)::integer,
    COALESCE(js.total_ligas, 0)::integer,
    COALESCE(js.total_americanos, 0)::integer,
    COALESCE(js.sets_favor_total, 0)::integer,
    COALESCE(js.sets_contra_total, 0)::integer,
    COALESCE(js.racha_actual, '')::text,
    js.ultima_actividad::timestamptz, js.updated_at
  FROM public.riviera_jugadores rj
  LEFT JOIN public.jugador_stats js ON js.jugador_id = rj.id
  WHERE rj.organizador_id = p_organizador_id
    AND rj.id = p_jugador_id
    AND rj.estado = 'activo'
    AND (v_is_owner_or_admin OR rj.visible_publico = true)

  UNION ALL

  SELECT
    src.id, p_organizador_id,
    coalesce(nullif(trim(opa.local_display_name), ''), src.nombre),
    src.slug, src.foto_url,
    CASE WHEN v_is_owner_or_admin THEN src.email ELSE NULL END,
    CASE WHEN v_is_owner_or_admin THEN src.telefono ELSE NULL END,
    CASE WHEN v_is_owner_or_admin THEN src.whatsapp ELSE NULL END,
    src.nivel::text,
    coalesce(nullif(trim(opa.local_category), ''), src.categoria),
    src.edad::integer, src.mano_dominante, src.en_cancha, src.pais_codigo::text,
    src.instagram_url, src.facebook_url, src.tiktok_url,
    src.visible_publico, src.suma_ranking, src.genero,
    CASE WHEN v_is_owner_or_admin THEN src.fecha_nacimiento ELSE NULL END,
    src.club, src.estado::text, src.legacy_player_id, src.legacy_liga_jugador_id,
    src.created_at, src.updated_at, src.rating, src.rating_partidos,
    src.rating_fiabilidad,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '', null::timestamptz, null::timestamptz
  FROM public.organizer_player_access opa
  INNER JOIN public.riviera_jugadores src ON src.id = opa.jugador_id
  WHERE opa.grantee_organizer_id = p_organizador_id
    AND v_is_owner_or_admin
    AND opa.is_active = true
    AND opa.jugador_id = p_jugador_id
    AND opa.local_jugador_id IS NULL
    AND src.estado = 'activo'
    AND NOT EXISTS (
      SELECT 1 FROM public.riviera_jugadores local_rj
      WHERE local_rj.organizador_id = p_organizador_id
        AND local_rj.id = p_jugador_id
        AND local_rj.estado = 'activo'
    )
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.riviera_jugador_interno_por_slug(p_organizador_id uuid, p_slug text)
 RETURNS TABLE(id uuid, organizador_id uuid, nombre text, slug text, foto_url text, email text, telefono text, whatsapp text, nivel text, categoria text, edad integer, mano_dominante text, en_cancha text, pais_codigo text, instagram_url text, facebook_url text, tiktok_url text, visible_publico boolean, suma_ranking boolean, genero text, fecha_nacimiento date, club text, estado text, legacy_player_id uuid, legacy_liga_jugador_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, rating numeric, rating_partidos integer, rating_fiabilidad numeric, puntos_totales integer, total_partidos integer, victorias integer, derrotas integer, empates integer, participaciones_solo integer, pct_victorias numeric, total_retas integer, total_torneos_express integer, total_ligas integer, total_americanos integer, sets_favor_total integer, sets_contra_total integer, racha_actual text, ultima_actividad timestamp with time zone, stats_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_owner_or_admin boolean;
BEGIN
  v_is_owner_or_admin :=
    auth.uid() IS NOT NULL
    AND (auth.uid() = p_organizador_id OR public.is_master_admin());

  RETURN QUERY
  SELECT
    rj.id,
    rj.organizador_id,
    rj.nombre,
    rj.slug,
    rj.foto_url,
    CASE WHEN v_is_owner_or_admin THEN rj.email ELSE NULL END,
    CASE WHEN v_is_owner_or_admin THEN rj.telefono ELSE NULL END,
    CASE WHEN v_is_owner_or_admin THEN rj.whatsapp ELSE NULL END,
    rj.nivel::text,
    rj.categoria,
    rj.edad::integer,
    rj.mano_dominante,
    rj.en_cancha,
    rj.pais_codigo::text,
    rj.instagram_url,
    rj.facebook_url,
    rj.tiktok_url,
    rj.visible_publico,
    rj.suma_ranking,
    rj.genero,
    CASE WHEN v_is_owner_or_admin THEN rj.fecha_nacimiento ELSE NULL END,
    rj.club,
    rj.estado::text,
    rj.legacy_player_id,
    rj.legacy_liga_jugador_id,
    rj.created_at,
    rj.updated_at,
    rj.rating,
    rj.rating_partidos,
    rj.rating_fiabilidad,
    COALESCE(js.puntos_totales, 0)::integer,
    COALESCE(js.total_partidos, 0)::integer,
    COALESCE(js.victorias, 0)::integer,
    COALESCE(js.derrotas, 0)::integer,
    COALESCE(js.empates, 0)::integer,
    COALESCE(js.participaciones_solo, 0)::integer,
    COALESCE(js.pct_victorias, 0)::numeric,
    COALESCE(js.total_retas, 0)::integer,
    COALESCE(js.total_torneos_express, 0)::integer,
    COALESCE(js.total_ligas, 0)::integer,
    COALESCE(js.total_americanos, 0)::integer,
    COALESCE(js.sets_favor_total, 0)::integer,
    COALESCE(js.sets_contra_total, 0)::integer,
    COALESCE(js.racha_actual, '')::text,
    js.ultima_actividad::timestamptz,
    js.updated_at
  FROM public.riviera_jugadores rj
  LEFT JOIN public.jugador_stats js ON js.jugador_id = rj.id
  WHERE rj.organizador_id = p_organizador_id
    AND lower(rj.slug) = lower(trim(p_slug))
    AND rj.estado = 'activo'
    AND (v_is_owner_or_admin OR rj.visible_publico = true)
  LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.riviera_jugador_interno_por_id(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.riviera_jugador_interno_por_slug(uuid, text) TO anon;
