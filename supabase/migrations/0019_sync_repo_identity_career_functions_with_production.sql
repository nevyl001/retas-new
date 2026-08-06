-- ══════════════════════════════════════════════════════════════════════════════
-- 0019 — Sincronización repo ↔ producción: funciones de identidad/carrera (auditoría 2026-08-05)
--
-- Contexto: al preparar la migración 0018 se detectó que el cuerpo real de
-- resolve_public_player_identity y get_public_career_jugador_ids en
-- producción ya NO coincidía con el archivo versionado que se leyó primero
-- (supabase/riviera-player-identity-public-read.sql). Esto disparó una
-- auditoría completa: se descargó el esquema real de producción con
-- `supabase db dump --linked -s public` (SOLO LECTURA, sin escribir nada) y
-- se comparó, función por función, contra TODO lo versionado en supabase/*.sql
-- y supabase/migrations/*.sql.
--
-- Resultado de la auditoría (23 funciones del dominio identidad/carrera
-- revisadas; ver tabla completa entregada aparte):
--   - 22 de 23 SÍ tenían una versión versionada semánticamente idéntica a
--     producción -- las diferencias de texto encontradas al inicio (formato
--     de search_path, casts explícitos en DEFAULT, "timestamptz" vs
--     "timestamp with time zone", espacios) eran cosméticas, no funcionales
--     (verificado normalizando ambos cuerpos y comparando carácter por
--     carácter). NINGUNA diferencia semántica real sobrevivió esa
--     normalización.
--   - El problema real para esas 22 no era que el repo estuviera
--     desactualizado: es que varias tienen DOS archivos versionados con el
--     mismo nombre de función (uno viejo, superado por un archivo posterior
--     que sí quedó correcto) y no había ninguna marca de cuál es el vigente
--     -- ver los headers "SUPERSEDIDO" agregados a esos archivos en este
--     mismo commit.
--   - 6 funciones NO tenían NINGÚN archivo versionado (ni el viejo ni uno
--     nuevo): get_public_jugador_id_for_riviera_id,
--     resolve_official_player_key_for_jugador,
--     riviera_official_ledger_points_for_jugador,
--     riviera_official_legacy_points_for_jugador,
--     riviera_official_ranking_posicion_for_jugador,
--     riviera_ranking_interno_por_organizador -- probablemente creadas
--     directo en el SQL Editor de Supabase sin nunca commitear el archivo.
--     Esta migración captura esas 6, exactamente como están hoy en
--     producción (mismo cuerpo, mismos GRANT).
--
-- Esta migración es un NO-OP funcional en producción: CREATE OR REPLACE
-- FUNCTION con el mismo cuerpo que ya existe no cambia comportamiento, solo
-- hace que el repositorio vuelva a representar exactamente lo desplegado.
-- No se toca ninguna otra función. No se modifica ranking, ROMC, puntos,
-- identidad, grants, ledger ni multiclub -- estas 6 funciones ya calculan
-- exactamente esto hoy; acá solo se registra su definición en git.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_public_jugador_id_for_riviera_id(p_riviera_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rj.id
  FROM public.riviera_official_player_identity i
  JOIN public.riviera_jugadores rj
    ON rj.id = i.canonical_riviera_jugador_id
  WHERE upper(trim(i.riviera_id)) = upper(trim(p_riviera_id))
    AND rj.estado = 'activo'
    AND rj.visible_publico IS TRUE
    AND COALESCE(rj.suma_ranking, true) = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_public_jugador_id_for_riviera_id(text) IS
  'Resuelve jugador_id público desde un Riviera ID. Sincronizada con producción 2026-08-05 (nunca había sido versionada).';

GRANT EXECUTE ON FUNCTION public.get_public_jugador_id_for_riviera_id(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_official_player_key_for_jugador(p_riviera_jugador_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key uuid;
BEGIN
  IF p_riviera_jugador_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_key := public._resolve_official_player_key(p_riviera_jugador_id);

  IF v_key IS NOT NULL THEN
    RETURN v_key;
  END IF;

  RETURN public._ensure_official_identity_for_participation_jugador(p_riviera_jugador_id);
END;
$$;

COMMENT ON FUNCTION public.resolve_official_player_key_for_jugador(uuid) IS
  'Como _resolve_official_player_key pero crea la identidad oficial si falta. Sincronizada con producción 2026-08-05 (nunca había sido versionada).';

GRANT EXECUTE ON FUNCTION public.resolve_official_player_key_for_jugador(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.riviera_official_ledger_points_for_jugador(p_riviera_jugador_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT SUM(l.points)::integer
      FROM public.riviera_official_points_ledger l
      WHERE l.official_player_key = public.resolve_official_player_key_for_jugador(p_riviera_jugador_id)
        AND l.points > 0
    ),
    0
  );
$$;

COMMENT ON FUNCTION public.riviera_official_ledger_points_for_jugador(uuid) IS
  'Puntos ROMC acumulados en el ledger para un jugador. Sincronizada con producción 2026-08-05 (nunca había sido versionada).';

GRANT EXECUTE ON FUNCTION public.riviera_official_ledger_points_for_jugador(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.riviera_official_legacy_points_for_jugador(p_riviera_jugador_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT SUM(jp.puntos_obtenidos)::integer
      FROM public.jugador_participaciones jp
      WHERE jp.jugador_id IN (
        SELECT ids.riviera_jugador_id
        FROM public._riviera_official_jugador_ids_for_key(
          public.resolve_official_player_key_for_jugador(p_riviera_jugador_id)
        ) ids
      )
        AND COALESCE(jp.puntos_obtenidos, 0) > 0
        AND COALESCE(jp.metadata->>'subtipo', '') <> 'ajuste_manual'
        AND NOT EXISTS (
          SELECT 1
          FROM public.riviera_official_points_ledger l
          WHERE l.participacion_id = jp.id
        )
    ),
    0
  );
$$;

COMMENT ON FUNCTION public.riviera_official_legacy_points_for_jugador(uuid) IS
  'Puntos legacy (previos al ledger) para un jugador. Sincronizada con producción 2026-08-05 (nunca había sido versionada).';

GRANT EXECUTE ON FUNCTION public.riviera_official_legacy_points_for_jugador(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.riviera_official_ranking_posicion_for_jugador(
  p_jugador_id uuid,
  p_organizador_id uuid DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_genero text DEFAULT 'M'
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      v.id,
      v.nombre,
      public.riviera_official_display_puntos_for_jugador(v.id) AS pts
    FROM public.riviera_jugadores_sitio_oficial v
    WHERE v.organizador_id = COALESCE(
      p_organizador_id,
      (SELECT rj.organizador_id FROM public.riviera_jugadores rj WHERE rj.id = p_jugador_id)
    )
      AND (p_categoria IS NULL OR v.categoria = p_categoria)
      AND (
        p_genero IS NULL
        OR (upper(p_genero) IN ('F', 'FEMENIL') AND v.genero = 'F')
        OR (
          upper(p_genero) IN ('M', 'VARONIL')
          AND (v.genero = 'M' OR v.genero IS NULL)
        )
      )
  ),
  ranked AS (
    SELECT
      id,
      RANK() OVER (ORDER BY pts DESC, nombre ASC) AS pos
    FROM scoped
  )
  SELECT pos::integer FROM ranked WHERE id = p_jugador_id;
$$;

COMMENT ON FUNCTION public.riviera_official_ranking_posicion_for_jugador(uuid, uuid, text, text) IS
  'Posición ROMC de un jugador dentro de su club/categoría/género. Sincronizada con producción 2026-08-05 (nunca había sido versionada).';

GRANT EXECUTE ON FUNCTION public.riviera_official_ranking_posicion_for_jugador(uuid, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.riviera_ranking_interno_por_organizador(
  p_organizador_id uuid,
  p_categoria text DEFAULT NULL,
  p_genero text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  organizador_id uuid,
  nombre text,
  slug text,
  foto_url text,
  categoria text,
  genero text,
  pais_codigo text,
  club text,
  estado text,
  visible_publico boolean,
  suma_ranking boolean,
  rating numeric,
  rating_partidos integer,
  rating_fiabilidad numeric,
  created_at timestamptz,
  updated_at timestamptz,
  puntos_totales integer,
  total_partidos integer,
  victorias integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rj.id,
    rj.organizador_id,
    rj.nombre,
    rj.slug,
    rj.foto_url,
    rj.categoria,
    rj.genero,
    rj.pais_codigo,
    rj.club,
    rj.estado,
    rj.visible_publico,
    rj.suma_ranking,
    rj.rating,
    rj.rating_partidos,
    rj.rating_fiabilidad,
    rj.created_at,
    rj.updated_at,
    COALESCE(js.puntos_totales, 0)::integer,
    COALESCE(js.total_partidos, 0)::integer,
    COALESCE(js.victorias, 0)::integer
  FROM public.riviera_jugadores rj
  LEFT JOIN public.jugador_stats js ON js.jugador_id = rj.id
  WHERE rj.organizador_id = p_organizador_id
    AND rj.estado = 'activo'
    AND (p_categoria IS NULL OR rj.categoria = p_categoria)
    AND (
      p_genero IS NULL
      OR (upper(p_genero) IN ('F', 'FEMENIL') AND rj.genero = 'F')
      OR (
        upper(p_genero) IN ('M', 'VARONIL')
        AND (rj.genero = 'M' OR rj.genero IS NULL)
      )
    )
  ORDER BY puntos_totales DESC, rj.nombre ASC;
$$;

COMMENT ON FUNCTION public.riviera_ranking_interno_por_organizador(uuid, text, text) IS
  'Roster/ranking interno de un club por categoría/género -- alimenta listInternalClubJugadoresRanking. Sincronizada con producción 2026-08-05 (nunca había sido versionada).';

GRANT EXECUTE ON FUNCTION public.riviera_ranking_interno_por_organizador(uuid, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- Verificación de no-op (correr en el SQL Editor, ANTES y DESPUÉS de aplicar
-- esta migración, y diffear el resultado -- debe ser idéntico carácter por
-- carácter si esta migración es realmente un no-op):
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT proname, pg_get_functiondef(oid) AS def
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN (
--     'get_public_jugador_id_for_riviera_id',
--     'resolve_official_player_key_for_jugador',
--     'riviera_official_ledger_points_for_jugador',
--     'riviera_official_legacy_points_for_jugador',
--     'riviera_official_ranking_posicion_for_jugador',
--     'riviera_ranking_interno_por_organizador'
--   )
-- ORDER BY proname;
