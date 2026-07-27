-- Cierre del riesgo critico: authenticated (no dueno) podia leer email,
-- telefono, whatsapp y fecha_nacimiento de jugadores PUBLICOS de OTRO
-- organizador via SELECT directo sobre riviera_jugadores, porque el GRANT
-- de columnas es de tabla completa y no puede condicionarse a que fila
-- habilito la politica RLS (riviera_jugadores_public_read incluye
-- authenticated). Confirmado en vivo antes de este fix.
--
-- Un REVOKE puro de esas columnas para authenticated rompe, a su vez, a
-- listRivieraJugadoresPrivate y getRivieraJugadorPrivateById (usadas por
-- sync de Liga/Americano/Torneo Express y por el vinculo legacy de Reta),
-- porque ambas dependen hoy del mismo GRANT de tabla completa -- confirmado
-- en vivo (BEGIN...ROLLBACK) antes de este fix: "permission denied for
-- table riviera_jugadores" para el propio dueno.
--
-- Fase 1: se crean 2 RPC SECURITY DEFINER que reemplazan esos dos accesos
-- directos. Cada una valida explicitamente auth.uid() y ownership/admin
-- ANTES de tocar la tabla -- nunca confian solo en SECURITY DEFINER ni en
-- que RLS proteja la funcion (RLS no aplica dentro de SECURITY DEFINER).
--
-- riviera_jugador_privado_por_id(p_jugador_id): NO recibe organizador_id
-- como parametro -- compara el organizador_id REAL de la fila contra
-- auth.uid(), asi que no hay ningun parametro con el que un organizador
-- pueda suplantar a otro. getRivieraJugadorPrivateById(id) siempre se llama
-- hoy con un id ya resuelto a "propio o clon local propio" via
-- resolveJugadorIdForOrganizer, por lo que organizador_id = auth.uid()
-- cubre el 100% de los casos reales (ver validacion del Commit 5).
--
-- riviera_jugadores_privados_listar(p_organizador_id, ...): SI recibe
-- p_organizador_id (los 3 callers reales lo llaman con su propio id), pero
-- valida explicitamente auth.uid() = p_organizador_id (o admin) antes de
-- devolver nada -- un organizador no puede pedir jugadores privados de otro
-- pasando un id ajeno.

CREATE OR REPLACE FUNCTION public.riviera_jugador_privado_por_id(p_jugador_id uuid)
 RETURNS TABLE(
   id uuid, organizador_id uuid, nombre text, slug text, foto_url text,
   email text, telefono text, whatsapp text, nivel text, categoria text,
   edad integer, mano_dominante text, en_cancha text, pais_codigo text,
   instagram_url text, facebook_url text, tiktok_url text,
   visible_publico boolean, suma_ranking boolean, genero text,
   fecha_nacimiento date, club text, estado text, legacy_player_id uuid,
   legacy_liga_jugador_id uuid, created_at timestamp with time zone,
   updated_at timestamp with time zone, rating numeric,
   rating_partidos integer, rating_fiabilidad numeric
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  RETURN QUERY
  SELECT
    rj.id, rj.organizador_id, rj.nombre, rj.slug, rj.foto_url,
    rj.email, rj.telefono, rj.whatsapp, rj.nivel::text, rj.categoria,
    rj.edad::integer, rj.mano_dominante, rj.en_cancha, rj.pais_codigo::text,
    rj.instagram_url, rj.facebook_url, rj.tiktok_url,
    rj.visible_publico, rj.suma_ranking, rj.genero, rj.fecha_nacimiento,
    rj.club, rj.estado::text, rj.legacy_player_id, rj.legacy_liga_jugador_id,
    rj.created_at, rj.updated_at, rj.rating, rj.rating_partidos, rj.rating_fiabilidad
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_jugador_id
    AND (rj.organizador_id = auth.uid() OR public.is_master_admin());
END;
$function$;

CREATE OR REPLACE FUNCTION public.riviera_jugadores_privados_listar(
  p_organizador_id uuid,
  p_genero text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_nivel text DEFAULT NULL
)
 RETURNS TABLE(
   id uuid, organizador_id uuid, nombre text, slug text, foto_url text,
   email text, telefono text, whatsapp text, nivel text, categoria text,
   edad integer, mano_dominante text, en_cancha text, pais_codigo text,
   instagram_url text, facebook_url text, tiktok_url text,
   visible_publico boolean, suma_ranking boolean, genero text,
   fecha_nacimiento date, club text, estado text, legacy_player_id uuid,
   legacy_liga_jugador_id uuid, created_at timestamp with time zone,
   updated_at timestamp with time zone, rating numeric,
   rating_partidos integer, rating_fiabilidad numeric, stats jsonb
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  IF p_organizador_id IS DISTINCT FROM auth.uid() AND NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  RETURN QUERY
  SELECT
    rj.id, rj.organizador_id, rj.nombre, rj.slug, rj.foto_url,
    rj.email, rj.telefono, rj.whatsapp, rj.nivel::text, rj.categoria,
    rj.edad::integer, rj.mano_dominante, rj.en_cancha, rj.pais_codigo::text,
    rj.instagram_url, rj.facebook_url, rj.tiktok_url,
    rj.visible_publico, rj.suma_ranking, rj.genero, rj.fecha_nacimiento,
    rj.club, rj.estado::text, rj.legacy_player_id, rj.legacy_liga_jugador_id,
    rj.created_at, rj.updated_at, rj.rating, rj.rating_partidos, rj.rating_fiabilidad,
    CASE WHEN js.jugador_id IS NULL THEN NULL ELSE jsonb_build_object(
      'jugador_id', js.jugador_id,
      'total_partidos', js.total_partidos,
      'victorias', js.victorias,
      'derrotas', js.derrotas,
      'empates', js.empates,
      'participaciones_solo', js.participaciones_solo,
      'pct_victorias', js.pct_victorias,
      'total_retas', js.total_retas,
      'total_torneos_express', js.total_torneos_express,
      'total_ligas', js.total_ligas,
      'total_americanos', js.total_americanos,
      'sets_favor_total', js.sets_favor_total,
      'sets_contra_total', js.sets_contra_total,
      'racha_actual', js.racha_actual,
      'ultima_actividad', js.ultima_actividad,
      'puntos_totales', js.puntos_totales,
      'updated_at', js.updated_at
    ) END AS stats
  FROM public.riviera_jugadores rj
  LEFT JOIN public.jugador_stats js ON js.jugador_id = rj.id
  WHERE rj.organizador_id = p_organizador_id
    AND rj.estado <> 'archivado'
    AND (
      p_genero IS NULL OR p_genero = ''
      OR (p_genero = 'F' AND rj.genero = 'F')
      OR (p_genero = 'M' AND (rj.genero = 'M' OR rj.genero IS NULL))
    )
    AND (p_search IS NULL OR p_search = '' OR rj.nombre ILIKE '%' || p_search || '%')
    AND (p_nivel IS NULL OR p_nivel = '' OR rj.categoria = p_nivel)
  ORDER BY rj.nombre;
END;
$function$;

REVOKE ALL ON FUNCTION public.riviera_jugador_privado_por_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.riviera_jugador_privado_por_id(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.riviera_jugadores_privados_listar(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.riviera_jugadores_privados_listar(uuid, text, text, text) TO authenticated;
