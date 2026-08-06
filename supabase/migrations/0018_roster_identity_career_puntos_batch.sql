-- ══════════════════════════════════════════════════════════════════════════════
-- 0018 — RPCs batch para el cálculo de ranking/roster (Part C, incidente 2026-08-05)
--
-- Contexto: la ficha pública de un jugador con roster grande generaba 900+
-- requests. Las dos primeras fuentes (grants/organizer_player_access
-- re-pedidos por jugador, y riviera_jugador_interno_por_id re-pedida cuando
-- el llamador ya tenía la fila) ya se cerraron sin SQL nueva (verificado en
-- vivo: 221→58 requests). Las 2 restantes (identidad global + puntos ROMC)
-- SÍ necesitan una versión batch: sus RPC actuales solo aceptan un
-- jugador_id a la vez, y enrichJugadoresOrganizerScopedStats las llama una
-- vez POR CADA jugador del roster (Promise.all).
--
-- CORRECCIÓN 2026-08-05 (post-revisión): la primera versión de esta
-- migración se basó en el archivo versionado
-- supabase/riviera-player-identity-public-read.sql, que estaba DESACTUALIZADO
-- respecto a lo que corre hoy en producción -- alguien lo modificó
-- directamente vía SQL Editor sin actualizar el repo. Se re-extrajo el
-- cuerpo real de producción con `supabase db dump --linked -s public`
-- (solo lectura, sin tocar nada) antes de reescribir esta migración. Cambios
-- respecto al primer intento:
--   1. get_public_career_jugador_ids en producción tiene una 6ª rama UNION
--      que el archivo versionado no tenía (perfil ancla como ORIGEN directo
--      de un grant, sin pasar por identidad oficial) -- capturada abajo.
--   2. resolve_public_player_identity en producción ya NO reimplementa la
--      lógica de carrera inline: delega a get_public_career_jugador_ids vía
--      CROSS JOIN LATERAL. Esta migración replica esa misma delegación en
--      forma batched (una función batch nueva que la otra reusa), en vez de
--      duplicar la lógica de 6 ramas dos veces.
--   3. riviera_list_career_participaciones_public en producción YA NO
--      reimplementa el filtro/enriquecimiento de participaciones: es un
--      wrapper de una línea sobre riviera_list_participaciones_for_jugador_ids
--      (que YA acepta array) + get_public_career_jugador_ids. Por eso esta
--      migración NO incluye una tercera RPC "_batch" para historial: el
--      cliente arma la unión de ids de carrera desde
--      resolve_public_player_identity_batch (columna linked_jugador_id, que
--      es exactamente el mismo conjunto que get_public_career_jugador_ids
--      devuelve) y llama UNA vez a riviera_list_participaciones_for_jugador_ids
--      (ya batched, sin RPC nueva) -- mismo patrón que produce hoy
--      riviera_list_career_participaciones_public, solo que para N jugadores
--      en vez de 1.
--
-- Las 2 funciones nuevas de abajo son EXACTAMENTE la misma lógica/predicado
-- que sus versiones de un solo id (get_public_career_jugador_ids,
-- resolve_public_player_identity), verificada contra el cuerpo real desplegado
-- en producción, no contra una copia versionada. riviera_official_display_puntos_for_jugador
-- SÍ coincidía con el archivo versionado (sin drift) -- su batch se mantiene.
-- Ninguna función existente se toca ni se elimina -- siguen siendo el camino
-- que usa la ficha de UN jugador. Estas son ADITIVAS: solo las usa el nuevo
-- código de ranking-batch en el cliente (resolveRosterCareerIdentityBatch,
-- organizerScopedStats.ts). Si un jugador del roster no resuelve completo
-- por acá (caso raro), el cliente cae al camino individual existente sin
-- cambios.
--
-- IMPORTANTE antes de otorgar EXECUTE a anon/authenticated en producción:
-- correr las queries de verificación al final de este archivo (comparan,
-- para varios jugador_id reales, que el resultado batch sea idéntico al de
-- llamar la función singular N veces) y confirmar que coinciden. No hacer
-- push del cliente que las consume hasta confirmar esto.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1) Carrera batch: mismo cuerpo que get_public_career_jugador_ids (producción
--      actual, con su 6ª rama), parametrizado por anchor múltiple ──

CREATE OR REPLACE FUNCTION public.get_public_career_jugador_ids_batch(
  p_jugador_ids uuid[]
)
RETURNS TABLE (
  anchor_jugador_id uuid,
  jugador_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH anchors AS (
    SELECT DISTINCT unnest(COALESCE(p_jugador_ids, ARRAY[]::uuid[])) AS anchor_id
  ),
  ctx AS (
    SELECT a.anchor_id, public._resolve_official_player_key(a.anchor_id) AS official_key
    FROM anchors a
  ),
  career_seed AS (
    SELECT a.anchor_id, a.anchor_id AS jugador_id
    FROM anchors a
    UNION
    SELECT c.anchor_id, l.riviera_jugador_id
    FROM ctx c
    JOIN public.riviera_official_player_profile_link l
      ON l.official_player_key = c.official_key
    WHERE c.official_key IS NOT NULL
    UNION
    SELECT c.anchor_id, i.canonical_riviera_jugador_id
    FROM ctx c
    JOIN public.riviera_official_player_identity i
      ON i.official_player_key = c.official_key
    WHERE c.official_key IS NOT NULL
      AND i.canonical_riviera_jugador_id IS NOT NULL
    UNION
    SELECT c.anchor_id, opa.local_jugador_id
    FROM ctx c
    JOIN public.riviera_official_player_identity i
      ON i.official_player_key = c.official_key
    JOIN public.organizer_player_access opa
      ON opa.jugador_id = i.canonical_riviera_jugador_id
     AND opa.is_active = true
    WHERE c.official_key IS NOT NULL
      AND opa.local_jugador_id IS NOT NULL
    UNION
    -- Grant: anchor ES el clon local -> agrega el origen (misma rama que la
    -- versión de un solo id: FROM organizer_player_access WHERE local_jugador_id = p_jugador_id).
    SELECT a.anchor_id, opa.jugador_id
    FROM anchors a
    JOIN public.organizer_player_access opa
      ON opa.is_active = true
     AND opa.local_jugador_id = a.anchor_id
    WHERE opa.jugador_id IS NOT NULL
    UNION
    -- Grant inverso: anchor ES el origen directo de un grant (sin pasar por
    -- identidad oficial) -- 6ª rama presente en la producción actual, ausente
    -- en la copia versionada del repo usada en el primer intento de esta migración.
    SELECT a.anchor_id, opa.local_jugador_id
    FROM anchors a
    JOIN public.organizer_player_access opa
      ON opa.is_active = true
     AND opa.jugador_id = a.anchor_id
    WHERE opa.local_jugador_id IS NOT NULL
  ),
  career AS (
    SELECT DISTINCT cs.anchor_id, cs.jugador_id
    FROM career_seed cs
    WHERE cs.jugador_id IS NOT NULL
  )
  SELECT DISTINCT c.anchor_id AS anchor_jugador_id, c.jugador_id
  FROM career c
  JOIN public.riviera_jugadores rj ON rj.id = c.jugador_id
  WHERE rj.estado = 'activo';
$$;

COMMENT ON FUNCTION public.get_public_career_jugador_ids_batch(uuid[]) IS
  'Versión batch de get_public_career_jugador_ids (cuerpo verificado contra producción real, no contra copia versionada). Un jugador_id sin fila = fuera de carrera pública para ese anchor.';

GRANT EXECUTE ON FUNCTION public.get_public_career_jugador_ids_batch(uuid[])
  TO anon, authenticated;

-- ── 2) Identidad global batch: mismo cuerpo que resolve_public_player_identity
--      (producción actual), delegando a get_public_career_jugador_ids_batch
--      para el conjunto de carrera en vez de reimplementarlo ──

CREATE OR REPLACE FUNCTION public.resolve_public_player_identity_batch(
  p_jugador_ids uuid[]
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
    SELECT DISTINCT unnest(COALESCE(p_jugador_ids, ARRAY[]::uuid[])) AS jugador_id
  ),
  official AS (
    SELECT
      a.jugador_id AS anchor_jugador_id,
      public._resolve_official_player_key(a.jugador_id) AS official_key
    FROM anchor a
  ),
  linked AS (
    SELECT DISTINCT g.anchor_jugador_id, g.jugador_id
    FROM public.get_public_career_jugador_ids_batch(p_jugador_ids) g
    WHERE g.jugador_id IS NOT NULL
  ),
  identity_row AS (
    SELECT DISTINCT ON (o.anchor_jugador_id)
      o.anchor_jugador_id,
      i.riviera_id::text AS riviera_id,
      i.official_player_key::text AS official_player_key,
      i.canonical_riviera_jugador_id AS canonical_jugador_id
    FROM official o
    JOIN public.riviera_official_player_identity i
      ON i.official_player_key = o.official_key
    WHERE o.official_key IS NOT NULL
    ORDER BY o.anchor_jugador_id
  ),
  home AS (
    SELECT DISTINCT ON (a.jugador_id)
      a.jugador_id AS anchor_jugador_id,
      rj.organizador_id
    FROM anchor a
    JOIN public.riviera_jugadores rj ON rj.id = a.jugador_id
    WHERE rj.estado = 'activo'
    ORDER BY a.jugador_id
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
  JOIN linked l ON l.anchor_jugador_id = a.jugador_id
  LEFT JOIN identity_row ir ON ir.anchor_jugador_id = a.jugador_id
  LEFT JOIN home h ON h.anchor_jugador_id = a.jugador_id
  LEFT JOIN public.riviera_jugadores rj
    ON rj.id = l.jugador_id
   AND rj.estado = 'activo';
$$;

COMMENT ON FUNCTION public.resolve_public_player_identity_batch(uuid[]) IS
  'Versión batch de resolve_public_player_identity (cuerpo verificado contra producción real). Identidad global para N jugadores en 1 llamada, agrupado por anchor_jugador_id. Solo la usa el cálculo de ranking/roster.';

GRANT EXECUTE ON FUNCTION public.resolve_public_player_identity_batch(uuid[])
  TO anon, authenticated;

-- ── 3) Puntos ROMC batch (mismo join que riviera_official_display_puntos_for_jugador
--      -- verificado sin drift contra producción) ──

CREATE OR REPLACE FUNCTION public.riviera_official_display_puntos_for_jugador_batch(
  p_riviera_jugador_ids uuid[]
)
RETURNS TABLE (
  jugador_id uuid,
  puntos integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT unnest(COALESCE(p_riviera_jugador_ids, ARRAY[]::uuid[])) AS jugador_id
  ),
  keyed AS (
    SELECT i.jugador_id, public._resolve_official_player_key(i.jugador_id) AS official_key
    FROM ids i
  )
  SELECT
    k.jugador_id,
    COALESCE(t.points_total, 0)::integer AS puntos
  FROM keyed k
  JOIN public.riviera_official_player_totals t
    ON t.official_player_key = k.official_key
  WHERE k.official_key IS NOT NULL;
$$;

COMMENT ON FUNCTION public.riviera_official_display_puntos_for_jugador_batch(uuid[]) IS
  'Versión batch de riviera_official_display_puntos_for_jugador. Un jugador_id sin fila en el resultado = sin official_player_key (equivalente a NULL en la versión singular).';

GRANT EXECUTE ON FUNCTION public.riviera_official_display_puntos_for_jugador_batch(uuid[])
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- Verificación manual antes de usarla desde el cliente (correr en el SQL Editor,
-- staging/local primero): comparar, para 3-5 jugador_id reales del roster de un
-- club grande (incluir al menos un jugador cedido y uno con identidad oficial
-- ROMC si existe), que el resultado batch coincide EXACTO con N llamadas
-- individuales a las funciones vigentes.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1) Carrera: reemplazar los uuids de ejemplo por ids reales.
-- SELECT * FROM public.get_public_career_jugador_ids_batch(ARRAY['<id1>','<id2>','<id3>']::uuid[]) ORDER BY anchor_jugador_id, jugador_id;
-- SELECT '<id1>'::uuid AS anchor_jugador_id, jugador_id FROM public.get_public_career_jugador_ids('<id1>'::uuid) AS jugador_id;
-- SELECT '<id2>'::uuid AS anchor_jugador_id, jugador_id FROM public.get_public_career_jugador_ids('<id2>'::uuid) AS jugador_id;
-- (el set de jugador_id por anchor debe coincidir exacto, sin importar el orden)

-- 2) Identidad: mismos ids.
-- SELECT * FROM public.resolve_public_player_identity_batch(ARRAY['<id1>','<id2>','<id3>']::uuid[]) ORDER BY anchor_jugador_id, linked_jugador_id;
-- SELECT '<id1>'::uuid AS anchor_jugador_id, * FROM public.resolve_public_player_identity('<id1>'::uuid, NULL) ORDER BY linked_jugador_id;
-- SELECT '<id2>'::uuid AS anchor_jugador_id, * FROM public.resolve_public_player_identity('<id2>'::uuid, NULL) ORDER BY linked_jugador_id;
-- (comparar fila por fila, agrupado por anchor_jugador_id)

-- 3) Puntos ROMC:
-- SELECT * FROM public.riviera_official_display_puntos_for_jugador_batch(ARRAY['<id1>','<id2>']::uuid[]);
-- SELECT public.riviera_official_display_puntos_for_jugador('<id1>'::uuid);
-- SELECT public.riviera_official_display_puntos_for_jugador('<id2>'::uuid);

-- 4) Historial de carrera (ya no necesita RPC nueva -- ver comentario arriba):
-- el conjunto de ids que usaría el cliente (linked_jugador_id de la consulta 2)
-- debe producir el MISMO historial que riviera_list_career_participaciones_public
-- al pasarlo por riviera_list_participaciones_for_jugador_ids:
-- SELECT * FROM public.riviera_list_participaciones_for_jugador_ids(
--   ARRAY(SELECT linked_jugador_id FROM public.resolve_public_player_identity_batch(ARRAY['<id1>']::uuid[])),
--   100
-- ) ORDER BY id;
-- SELECT * FROM public.riviera_list_career_participaciones_public('<id1>'::uuid, 100) ORDER BY id;
