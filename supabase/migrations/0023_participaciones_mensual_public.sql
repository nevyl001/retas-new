-- ══════════════════════════════════════════════════════════════════════════════
-- 0023 — Ranking → Participaciones: clasificación mensual pública por actividad
--
-- Feature nueva, 100% lectura, derivada de jugador_participaciones ya existente.
-- No modifica puntos, ranking tradicional, rating, ledger ni ningún writer del
-- career event pipeline. No crea tablas nuevas, no persiste ningún conteo -- la
-- clasificación se recalcula siempre desde jugador_participaciones.
--
-- REGLA CENTRAL: "si jugó, cuenta". 1 participación = 1 actividad deportiva
-- REALMENTE JUGADA, nunca 1 fila de career. Allowlist fail-closed abajo -- una
-- modalidad/subtipo nuevo no cuenta automáticamente hasta agregarse aquí.
--
-- Auditoría legacy (2026-08-08, producción, consulta de solo lectura del
-- usuario): 412/412 participaciones YA tienen metadata.organizador_id (0
-- huérfanas). Por eso el filtro de organizador es ESTRICTO, sin fallback
-- silencioso. Si en el futuro aparece una fila sin organizador_id, debe quedar
-- fuera de esta clasificación hasta corregirse por un mecanismo oficial
-- (enrichParticipacionesOrganizadorFromEvents / reparación manual) -- nunca
-- inferencia heurística dentro de esta función.
--
-- Histórico: NO se filtra por riviera_jugadores.estado en ningún punto. Ver
-- findWritableLocalJugadorId (src/lib/rivieraJugadores/jugadorIdResolver.ts):
-- un jugador solo puede tener participaciones ESCRITAS mientras estaba activo,
-- pero archivarlo después no borra ni mueve esas filas. Un jugador que jugó en
-- julio y se archivó en agosto sigue apareciendo correctamente al consultar
-- julio -- y esto también aplica al mes en curso (decisión de producto
-- cerrada 2026-08-08: nunca se oculta por estado, ni siquiera en el mes
-- actual).
--
-- Tres funciones:
--   1. _riviera_participaciones_canonicas_mensual (interna, con REVOKE ALL
--      explícito de PUBLIC/anon/authenticated -- Postgres otorga EXECUTE a
--      PUBLIC por defecto en toda función nueva, así que el REVOKE es
--      necesario, no solo la ausencia de GRANT. Solo la invocan las 2 RPC
--      públicas de abajo, que son SECURITY DEFINER del mismo owner y por
--      tanto ya tienen EXECUTE implícito sobre sus propios objetos sin
--      depender del grant a PUBLIC): única fuente de verdad para filtro de
--      organizador, filtro de mes, allowlist de modalidades, exclusión
--      oficial y deduplicación canónica.
--   2. riviera_ranking_participaciones_mensual_public (pública): clasificación
--      agregada por jugador para un mes, con RANK() para posición competitiva
--      real (los empates deportivos comparten posición -- nombre/UUID solo se
--      usan para un orden de presentación estable, nunca para romper un
--      empate ni decidir un "ganador").
--   3. riviera_participaciones_mensual_detalle_public (pública): detalle
--      cronológico de UN jugador en un mes -- consume la MISMA función
--      interna que la RPC 2, por lo que total_participaciones/puntos_mes de
--      la RPC 2 SIEMPRE coinciden exactamente con COUNT/SUM del detalle de la
--      RPC 3 (misma fuente canónica, estructuralmente imposible que difieran).
--
-- Deduplicación (clave canónica): (jugador_id, tipo_evento, evento_id,
-- COALESCE(metadata->>'subtipo', '')). Gana la fila con created_at más
-- reciente (id como desempate final) -- misma regla que ya usa el
-- ON CONFLICT ... DO UPDATE existente de la tabla para su grupo único
-- (jugador_id, tipo_evento, evento_id, resultado): "la escritura más
-- reciente es la autoritativa" ya es el comportamiento establecido del
-- sistema, esto solo lo extiende a los duplicados que caen fuera de ese
-- UNIQUE (mismo subtipo, resultado distinto).
--
-- Seguridad: mismo patrón ya validado por riviera_ranking_interno_por_
-- organizador / riviera_list_participaciones_for_jugador_ids -- SECURITY
-- DEFINER + search_path fijo + whitelist explícita de columnas SIN PII
-- (nunca email/teléfono/whatsapp/fecha_nacimiento, nunca metadata completo) +
-- GRANT EXECUTE a anon,authenticated en las 2 RPC públicas únicamente. El
-- commit P0 (0021_p0_career_rpc_grants_auth_guards.sql) no tocó lecturas
-- públicas de ranking/carrera -- este archivo sigue esa misma línea (solo
-- lectura nueva, mismo patrón de grants).
--
-- No se agrega ningún índice nuevo en esta fase -- sin evidencia de
-- EXPLAIN ANALYZE ni volumen que lo justifique (~412 filas en producción al
-- momento de este cambio). Documentado como optimización futura condicionada
-- a evidencia real, no especulativa.
--
-- No se ejecuta contra producción como parte de este cambio (solo migración).
-- Idempotente: CREATE OR REPLACE FUNCTION es repetible sin error.
-- Rollback:
--   DROP FUNCTION IF EXISTS public.riviera_participaciones_mensual_detalle_public(uuid, uuid, integer, integer);
--   DROP FUNCTION IF EXISTS public.riviera_ranking_participaciones_mensual_public(uuid, integer, integer, text, text);
--   DROP FUNCTION IF EXISTS public._riviera_participaciones_canonicas_mensual(uuid, integer, integer);
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Función interna: fuente canónica compartida (sin GRANT a anon) ──
CREATE OR REPLACE FUNCTION public._riviera_participaciones_canonicas_mensual(
  p_organizador_id uuid,
  p_year integer,
  p_month integer
)
RETURNS TABLE (
  participacion_id uuid,
  jugador_id uuid,
  tipo_evento text,
  evento_id uuid,
  subtipo text,
  evento_nombre text,
  fecha date,
  resultado text,
  puntos_obtenidos integer,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    -- Defensivo: nunca lanzar excepción por mes/año fuera de rango en una
    -- RPC pública -- se acota a límites válidos en vez de fallar.
    SELECT
      GREATEST(1, LEAST(12, COALESCE(p_month, 1))) AS mm,
      GREATEST(1900, LEAST(9999, COALESCE(p_year, 1900))) AS yy
  ),
  rango AS (
    SELECT
      make_date(yy, mm, 1) AS inicio,
      (make_date(yy, mm, 1) + interval '1 month')::date AS fin
    FROM params
  ),
  -- Allowlist fail-closed: única lista de qué (tipo_evento, subtipo) cuenta
  -- como actividad deportiva REALMENTE JUGADA. Una modalidad/subtipo futuro
  -- que no aparezca aquí NO cuenta hasta agregarse explícitamente.
  --
  -- Pares EXACTOS auditados en jugador_participaciones de PRODUCCIÓN
  -- (2026-08-09, consulta de solo lectura del usuario, catálogo real
  -- completo de (tipo_evento, metadata.subtipo) con conteos):
  --   reta            + reta_cierre       (171)
  --   torneo_express  + express_cierre    (139)
  --   liga            + ajuste_manual     (2)   -- NO cuenta (administrativo)
  --   liga            + liga_inscripcion  (8)   -- NO cuenta (administrativo)
  --   liga            + liga_jornada      (36)  -- SÍ cuenta (actividad jugada)
  --   americano       + americano_cierre  (16)
  --   duelo_2v2       + duelo_2v2_cierre  (40)
  -- BUG real de producción 2026-08-09: la versión anterior de este allowlist
  -- asumía subtipo='' (vacío) para reta/duelo_2v2/americano/torneo_express --
  -- por eso el INNER JOIN no matcheaba NINGUNA fila real y el ranking volvía
  -- 0 filas pese a que las RPC ejecutaban sin error. liga_podio_final no
  -- aparece hoy en el catálogo auditado, pero se documenta como
  -- explícitamente excluido por diseño fail-closed (igual que cualquier
  -- combinación futura desconocida).
  allowlist(tipo_evento, subtipo) AS (
    VALUES
      ('reta', 'reta_cierre'),
      ('duelo_2v2', 'duelo_2v2_cierre'),
      ('americano', 'americano_cierre'),
      ('torneo_express', 'express_cierre'),
      ('liga', 'liga_jornada')
  ),
  filtrado AS (
    -- jp.tipo_evento / jp.resultado son ENUM (jugador_tipo_evento /
    -- jugador_resultado), no text -- cast explícito ::text, mismo patrón ya
    -- usado en supabase/repair-career-event-host-from-manual-overrides.sql.
    SELECT
      jp.id,
      jp.jugador_id,
      jp.tipo_evento::text AS tipo_evento,
      jp.evento_id,
      COALESCE(jp.metadata->>'subtipo', '') AS subtipo,
      jp.evento_nombre,
      jp.fecha,
      jp.resultado::text AS resultado,
      jp.puntos_obtenidos,
      jp.metadata,
      jp.created_at
    FROM public.jugador_participaciones jp
    INNER JOIN allowlist al
      ON al.tipo_evento = jp.tipo_evento::text
     AND al.subtipo = COALESCE(jp.metadata->>'subtipo', '')
    CROSS JOIN rango r
    WHERE jp.metadata->>'organizador_id' = p_organizador_id::text
      AND jp.fecha >= r.inicio
      AND jp.fecha < r.fin
      AND NOT public.is_jugador_participacion_excluded(
        jp.jugador_id, jp.tipo_evento::text, jp.evento_id
      )
  )
  SELECT DISTINCT ON (jugador_id, tipo_evento, evento_id, subtipo)
    id AS participacion_id,
    jugador_id,
    tipo_evento,
    evento_id,
    subtipo,
    evento_nombre,
    fecha,
    resultado,
    puntos_obtenidos,
    metadata,
    created_at
  FROM filtrado
  ORDER BY jugador_id, tipo_evento, evento_id, subtipo, created_at DESC, id DESC;
$$;

COMMENT ON FUNCTION public._riviera_participaciones_canonicas_mensual(uuid, integer, integer) IS
  'Fuente canónica única de "Ranking -> Participaciones" (2026-08-08; allowlist corregida 2026-08-09 con pares reales de producción). NO otorgar GRANT a anon/authenticated -- solo la invocan las 2 RPC públicas hermanas. Encapsula: filtro de organizador (metadata.organizador_id estricto, sin fallback), filtro de mes, allowlist fail-closed de PARES (tipo_evento, subtipo) que representan actividad jugada real -- reta/reta_cierre, duelo_2v2/duelo_2v2_cierre, americano/americano_cierre, torneo_express/express_cierre, liga/liga_jornada; exclusión oficial (is_jugador_participacion_excluded) y deduplicación canónica (DISTINCT ON por jugador_id+tipo_evento+evento_id+subtipo, gana created_at DESC / id DESC). No filtra por riviera_jugadores.estado -- ver header del archivo.';

-- Postgres otorga EXECUTE a PUBLIC por defecto en toda función nueva -- sin
-- este REVOKE explícito, esta función interna quedaría invocable directo por
-- anon/authenticated pese a que ningún GRANT explícito la mencione. Mismo
-- patrón de defensa en profundidad que 0021_p0_career_rpc_grants_auth_guards.sql
-- para sus helpers _riviera_orphan_profile_audit / _riviera_profile_link_resolution.
-- No rompe la invocación desde las 2 RPC públicas SECURITY DEFINER de abajo:
-- SECURITY DEFINER ejecuta con los privilegios del OWNER de la función (quien
-- corre esta migración), y el owner de una función siempre puede ejecutarla
-- independientemente de REVOKE ALL FROM PUBLIC/anon/authenticated.
REVOKE ALL ON FUNCTION public._riviera_participaciones_canonicas_mensual(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._riviera_participaciones_canonicas_mensual(uuid, integer, integer) FROM anon, authenticated;

-- ── 2. RPC pública: clasificación mensual agregada ──
CREATE OR REPLACE FUNCTION public.riviera_ranking_participaciones_mensual_public(
  p_organizador_id uuid,
  p_year integer,
  p_month integer,
  p_categoria text DEFAULT NULL,
  p_genero text DEFAULT NULL
)
RETURNS TABLE (
  jugador_id uuid,
  nombre text,
  slug text,
  foto_url text,
  riviera_id text,
  categoria text,
  genero text,
  total_participaciones integer,
  puntos_mes integer,
  ultima_participacion date,
  posicion_competitiva integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH canon AS (
    SELECT *
    FROM public._riviera_participaciones_canonicas_mensual(p_organizador_id, p_year, p_month)
  ),
  agregado AS (
    -- COUNT/SUM se calculan DESPUÉS de la deduplicación canónica (canon ya
    -- viene deduplicada por la función interna) -- nunca sobre filas crudas.
    SELECT
      c.jugador_id,
      COUNT(*)::integer AS total_participaciones,
      SUM(c.puntos_obtenidos)::integer AS puntos_mes,
      MAX(c.fecha) AS ultima_participacion
    FROM canon c
    GROUP BY c.jugador_id
  ),
  -- riviera_jugadores NO tiene columna riviera_id (era una suposición
  -- incorrecta -- error real de producción 2026-08-09: 42703 column
  -- rj.riviera_id does not exist). El Riviera ID vive en
  -- riviera_official_player_identity.riviera_id, resuelto vía
  -- riviera_official_player_profile_link (perfil local -> official_player_key)
  -- o directamente cuando el jugador ES el canonical_riviera_jugador_id --
  -- mismo patrón dual-path ya usado por la RPC pública existente
  -- get_public_riviera_ids_for_jugadores (supabase/riviera-public-ranking-read.sql).
  -- Se reimplementa aquí en vez de LLAMAR a esa RPC porque esa RPC exige
  -- rj.estado = 'activo', lo cual apagaría el Riviera ID de un jugador
  -- archivado que sigue apareciendo en un mes histórico -- decisión de
  -- producto cerrada 2026-08-08: esta pantalla nunca filtra por estado.
  -- Acotado a los jugadores de "agregado" (ya filtrados por organizador+mes+
  -- allowlist) -- una sola pasada, sin N+1.
  riviera_ids AS (
    SELECT DISTINCT ON (jugador_id) jugador_id, riviera_id
    FROM (
      SELECT
        pl.riviera_jugador_id AS jugador_id,
        ident.riviera_id::text AS riviera_id
      FROM public.riviera_official_player_profile_link pl
      JOIN public.riviera_official_player_identity ident
        ON ident.official_player_key = pl.official_player_key
      WHERE ident.riviera_id IS NOT NULL
        AND pl.riviera_jugador_id IN (SELECT jugador_id FROM agregado)
      UNION ALL
      SELECT
        ident.canonical_riviera_jugador_id AS jugador_id,
        ident.riviera_id::text AS riviera_id
      FROM public.riviera_official_player_identity ident
      WHERE ident.riviera_id IS NOT NULL
        AND ident.canonical_riviera_jugador_id IN (SELECT jugador_id FROM agregado)
    ) merged
    ORDER BY jugador_id, riviera_id
  ),
  enriquecido AS (
    -- Solo entran jugadores con >= 1 participación canónica (INNER JOIN, no
    -- LEFT JOIN contra el roster completo) -- la clasificación pública nunca
    -- muestra "0 participaciones". Sin filtro de estado: un jugador
    -- archivado después de jugar sigue apareciendo. riviera_ids es LEFT JOIN
    -- a propósito -- un jugador sin identidad oficial vinculada todavía debe
    -- seguir apareciendo en el ranking, solo sin badge de Riviera ID.
    SELECT
      a.jugador_id,
      rj.nombre,
      rj.slug,
      rj.foto_url,
      ri.riviera_id,
      rj.categoria,
      rj.genero,
      a.total_participaciones,
      a.puntos_mes,
      a.ultima_participacion
    FROM agregado a
    INNER JOIN public.riviera_jugadores rj ON rj.id = a.jugador_id
    LEFT JOIN riviera_ids ri ON ri.jugador_id = a.jugador_id
    WHERE (p_categoria IS NULL OR rj.categoria = p_categoria)
      AND (
        p_genero IS NULL
        OR (upper(p_genero) IN ('F', 'FEMENIL') AND rj.genero = 'F')
        OR (
          upper(p_genero) IN ('M', 'VARONIL')
          AND (rj.genero = 'M' OR rj.genero IS NULL)
        )
      )
  )
  SELECT
    jugador_id,
    nombre,
    slug,
    foto_url,
    riviera_id,
    categoria,
    genero,
    total_participaciones,
    puntos_mes,
    ultima_participacion,
    -- Posición COMPETITIVA real: empates deportivos comparten el mismo
    -- número. Nunca se usa nombre/jugador_id para romper este empate.
    RANK() OVER (ORDER BY total_participaciones DESC, puntos_mes DESC)::integer
      AS posicion_competitiva
  FROM enriquecido
  -- Orden de PRESENTACIÓN (para que el render no salte entre refrescos) --
  -- nombre/jugador_id son desempate puramente visual, nunca deportivo.
  ORDER BY total_participaciones DESC, puntos_mes DESC, nombre ASC, jugador_id ASC;
$$;

COMMENT ON FUNCTION public.riviera_ranking_participaciones_mensual_public(uuid, integer, integer, text, text) IS
  'Clasificación pública mensual de "Ranking -> Participaciones" (2026-08-08). Fuente: _riviera_participaciones_canonicas_mensual. posicion_competitiva = RANK() real (empates comparten posición); el ORDER BY final es solo orden de presentación estable, nunca decide un empate. Sin PII, sin metadata completo.';

GRANT EXECUTE ON FUNCTION public.riviera_ranking_participaciones_mensual_public(uuid, integer, integer, text, text)
  TO anon, authenticated;

-- ── 3. RPC pública: detalle cronológico de un jugador en el mes ──
CREATE OR REPLACE FUNCTION public.riviera_participaciones_mensual_detalle_public(
  p_organizador_id uuid,
  p_jugador_id uuid,
  p_year integer,
  p_month integer
)
RETURNS TABLE (
  participacion_id uuid,
  fecha date,
  evento_nombre text,
  tipo_evento text,
  resultado text,
  puntos_obtenidos integer,
  club_name text,
  lugar text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Misma función interna que la RPC de ranking -- por construcción,
  -- COUNT(*) y SUM(puntos_obtenidos) de este resultado SIEMPRE coinciden
  -- exactamente con total_participaciones/puntos_mes de ese jugador en
  -- riviera_ranking_participaciones_mensual_public para el mismo mes.
  SELECT
    c.participacion_id,
    c.fecha,
    c.evento_nombre,
    c.tipo_evento,
    c.resultado,
    c.puntos_obtenidos,
    -- Whitelist explícita: solo club_name/lugar de metadata, nunca el jsonb
    -- completo (evita exponer cualquier campo interno futuro sin revisar).
    c.metadata->>'club_name' AS club_name,
    c.metadata->>'lugar' AS lugar
  FROM public._riviera_participaciones_canonicas_mensual(p_organizador_id, p_year, p_month) c
  WHERE c.jugador_id = p_jugador_id
  ORDER BY c.fecha DESC, c.created_at DESC;
$$;

COMMENT ON FUNCTION public.riviera_participaciones_mensual_detalle_public(uuid, uuid, integer, integer) IS
  'Detalle cronológico público de UN jugador en un mes para "Ranking -> Participaciones" (2026-08-08). Consume la MISMA función interna que la RPC de ranking agregado -- garantiza la invariante total_participaciones=COUNT(detalle) y puntos_mes=SUM(detalle). Whitelist de columnas, sin PII, sin metadata completo.';

GRANT EXECUTE ON FUNCTION public.riviera_participaciones_mensual_detalle_public(uuid, uuid, integer, integer)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
