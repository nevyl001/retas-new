-- =============================================================================
-- Propagación de borrado: origen → clones cedidos
-- =============================================================================
--
-- Extiende delete_riviera_jugador para que, al borrar un jugador en su club
-- de registro, se purguen automáticamente todos los clones locales concedidos.
--
-- Garantías (no negociables):
--   • Una sola transacción atómica (todo el RPC; fallo = ROLLBACK total).
--   • Orden FK: ledger → participaciones → stats/rating → ROMC → duelos → riviera.
--   • Solo toca filas del clon (jugador_id = local_jugador_id).
--   • NO toca matches, pairs, games, tournaments ni datos de compañeros.
--
-- Prerrequisitos (ya desplegados en prod):
--   • supabase/delete-riviera-jugador.sql (versión base)
--   • supabase/organizer-player-access.sql
--   • supabase/riviera-official-multi-club-romc1.sql (+ romc2 si aplica)
--   • reverse_riviera_official_ledger_for_participacion (prod; opcional)
--
-- CÓMO EJECUTAR (otro día, con respaldo):
--   1. Respaldo completo de Supabase.
--   2. Correr sección PRE (sustituir :source_jugador_id).
--   3. Pegar y ejecutar TODO este archivo en SQL Editor (staging → prod).
--   4. Probar primero con jugador de prueba SIN partidos en club anfitrión.
--   5. Correr sección POST con el mismo :source_jugador_id.
--
-- Rollback de código: re-ejecutar supabase/delete-riviera-jugador.sql anterior.
-- Los datos borrados NO se recuperan sin respaldo.
-- =============================================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN A — VERIFICACIÓN PRE (read-only; ejecutar ANTES del deploy)
-- Sustituye :source_jugador_id por el UUID del jugador ORIGEN a borrar.
-- ══════════════════════════════════════════════════════════════════════════════

/*
-- A1) Grants y clones que serán purgados
SELECT
  opa.id AS grant_id,
  opa.is_active,
  opa.jugador_id AS source_jugador_id,
  opa.local_jugador_id,
  opa.grantee_organizador_id,
  opa.owner_organizador_id,
  src.nombre AS source_nombre,
  local.nombre AS local_nombre,
  local.estado AS local_estado
FROM public.organizer_player_access opa
JOIN public.riviera_jugadores src ON src.id = opa.jugador_id
LEFT JOIN public.riviera_jugadores local ON local.id = opa.local_jugador_id
WHERE opa.jugador_id = :'source_jugador_id'::uuid
ORDER BY opa.grantee_organizador_id;

-- A2) Participaciones SOLO del clon (serán eliminadas)
SELECT
  opa.local_jugador_id,
  opa.grantee_organizador_id,
  COUNT(jp.id) AS participaciones_del_clon
FROM public.organizer_player_access opa
LEFT JOIN public.jugador_participaciones jp
  ON jp.jugador_id = opa.local_jugador_id
WHERE opa.jugador_id = :'source_jugador_id'::uuid
  AND opa.local_jugador_id IS NOT NULL
GROUP BY opa.local_jugador_id, opa.grantee_organizador_id;

-- A3) BASELINE compañeros — participaciones en mismos eventos que el clon
--     (estas filas NO deben cambiar tras el borrado)
WITH clon_parts AS (
  SELECT
    jp.id AS clon_part_id,
    jp.jugador_id AS clon_jugador_id,
    jp.tipo_evento,
    jp.evento_id,
    opa.grantee_organizador_id
  FROM public.organizer_player_access opa
  JOIN public.jugador_participaciones jp ON jp.jugador_id = opa.local_jugador_id
  WHERE opa.jugador_id = :'source_jugador_id'::uuid
    AND opa.local_jugador_id IS NOT NULL
),
companero_parts AS (
  SELECT
    cp.clon_part_id,
    cp.clon_jugador_id,
    cp.tipo_evento,
    cp.evento_id,
    jp.id AS companero_part_id,
    jp.jugador_id AS companero_jugador_id,
    jp.puntos_obtenidos AS companero_puntos
  FROM clon_parts cp
  JOIN public.jugador_participaciones jp
    ON jp.tipo_evento = cp.tipo_evento
   AND jp.evento_id = cp.evento_id
   AND jp.jugador_id <> cp.clon_jugador_id
)
SELECT
  COUNT(*) AS companero_participaciones_en_mismos_eventos,
  COUNT(DISTINCT companero_jugador_id) AS companeros_distintos,
  COALESCE(SUM(companero_puntos), 0) AS suma_puntos_companeros
FROM companero_parts;

-- A4) BASELINE artefactos de reta (NO deben cambiar)
WITH clon_ids AS (
  SELECT opa.local_jugador_id AS id
  FROM public.organizer_player_access opa
  WHERE opa.jugador_id = :'source_jugador_id'::uuid
    AND opa.local_jugador_id IS NOT NULL
),
clon_legacy AS (
  SELECT rj.legacy_player_id AS id
  FROM public.riviera_jugadores rj
  JOIN clon_ids c ON c.id = rj.id
  WHERE rj.legacy_player_id IS NOT NULL
)
SELECT
  (SELECT COUNT(*) FROM public.tournaments) AS tournaments_total,
  (SELECT COUNT(*) FROM public.pairs) AS pairs_total,
  (SELECT COUNT(*) FROM public.matches) AS matches_total,
  (SELECT COUNT(*) FROM public.games) AS games_total,
  (SELECT COUNT(*)
   FROM public.pairs p
   WHERE p.player1_id IN (SELECT id FROM clon_legacy)
      OR p.player2_id IN (SELECT id FROM clon_legacy)) AS pairs_con_legacy_del_clon;

-- A5) Fantasmas actuales (debe ser 0 según tu conteo)
SELECT COUNT(*) AS fantasmas_activos_sin_grant
FROM public.riviera_jugadores local
WHERE local.estado <> 'archivado'
  AND NOT EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.local_jugador_id = local.id
      AND opa.is_active = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa2
    WHERE opa2.local_jugador_id = local.id
  );
*/


-- ══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN B — HELPERS INTERNOS (no expuestos a authenticated)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._safe_resolve_official_player_key(p_jugador_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key uuid;
BEGIN
  IF p_jugador_id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_key := public.resolve_official_player_key_for_jugador(p_jugador_id);
    IF v_key IS NOT NULL THEN
      RETURN v_key;
    END IF;
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  RETURN public._resolve_official_player_key(p_jugador_id);
END;
$$;

REVOKE ALL ON FUNCTION public._safe_resolve_official_player_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._safe_resolve_official_player_key(uuid) FROM anon, authenticated;


CREATE OR REPLACE FUNCTION public._reverse_ledger_for_participacion_safe(p_participacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_participacion_id IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM public.reverse_riviera_official_ledger_for_participacion(p_participacion_id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public._reverse_ledger_for_participacion_safe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._reverse_ledger_for_participacion_safe(uuid) FROM anon, authenticated;


CREATE OR REPLACE FUNCTION public._insert_jugador_import_blocklist_internal(
  p_organizador_id uuid,
  p_nombre text,
  p_legacy_player_id uuid DEFAULT NULL,
  p_legacy_liga_jugador_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_organizador_id IS NULL OR to_regclass('public.riviera_jugador_import_blocklist') IS NULL THEN
    RETURN;
  END IF;

  v_key := public._riviera_jugador_nombre_key(p_nombre);
  IF v_key = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.riviera_jugador_import_blocklist (
    organizador_id,
    nombre,
    nombre_key,
    legacy_player_id,
    legacy_liga_jugador_id
  )
  VALUES (
    p_organizador_id,
    trim(p_nombre),
    v_key,
    p_legacy_player_id,
    p_legacy_liga_jugador_id
  )
  ON CONFLICT (organizador_id, nombre_key) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      legacy_player_id = coalesce(
        EXCLUDED.legacy_player_id,
        riviera_jugador_import_blocklist.legacy_player_id
      ),
      legacy_liga_jugador_id = coalesce(
        EXCLUDED.legacy_liga_jugador_id,
        riviera_jugador_import_blocklist.legacy_liga_jugador_id
      ),
      deleted_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public._insert_jugador_import_blocklist_internal(uuid, text, uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public._insert_jugador_import_blocklist_internal(uuid, text, uuid, uuid)
  FROM anon, authenticated;


-- Purga un clon cedido en el club anfitrión.
-- Solo toca filas scoped a p_local_jugador_id / p_grantee_organizador_id.
CREATE OR REPLACE FUNCTION public._purge_granted_local_jugador(
  p_local_jugador_id uuid,
  p_grantee_organizador_id uuid,
  p_source_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_official_key uuid;
  v_part_id uuid;
  v_new_canonical uuid;
  v_liga_jugador_id uuid;
  v_deleted_participaciones integer := 0;
BEGIN
  IF p_local_jugador_id IS NULL OR p_grantee_organizador_id IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'missing_params');
  END IF;

  SELECT
    rj.id,
    rj.nombre,
    rj.legacy_player_id,
    rj.legacy_liga_jugador_id,
    rj.organizador_id
  INTO v_row
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_local_jugador_id
    AND rj.organizador_id = p_grantee_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'local_clone_not_found',
      'local_jugador_id', p_local_jugador_id
    );
  END IF;

  v_official_key := public._safe_resolve_official_player_key(p_local_jugador_id);

  -- 1) Ledger ANTES que participaciones (FK RESTRICT en ledger.participacion_id).
  FOR v_part_id IN
    SELECT jp.id
    FROM public.jugador_participaciones jp
    WHERE jp.jugador_id = p_local_jugador_id
  LOOP
    PERFORM public._reverse_ledger_for_participacion_safe(v_part_id);
  END LOOP;

  -- 2) Participaciones del clon únicamente.
  DELETE FROM public.jugador_participaciones
  WHERE jugador_id = p_local_jugador_id;
  GET DIAGNOSTICS v_deleted_participaciones = ROW_COUNT;

  -- 3) Ledger huérfano del clon.
  IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
    DELETE FROM public.riviera_official_points_ledger
    WHERE source_local_jugador_id = p_local_jugador_id;
  END IF;

  -- 4) Exclusiones scoped al clon.
  IF to_regclass('public.jugador_participacion_exclusiones') IS NOT NULL THEN
    DELETE FROM public.jugador_participacion_exclusiones
    WHERE scope_jugador_id = p_local_jugador_id;
  END IF;

  -- 5) Rating / stats del clon únicamente.
  IF to_regclass('public.rating_historial') IS NOT NULL THEN
    DELETE FROM public.rating_historial
    WHERE jugador_id = p_local_jugador_id;
  END IF;

  DELETE FROM public.jugador_stats
  WHERE jugador_id = p_local_jugador_id;

  -- 6) ROMC: desvincular perfil del clon (origen puede seguir vivo).
  IF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
    SELECT l.official_player_key
    INTO v_official_key
    FROM public.riviera_official_player_profile_link l
    WHERE l.riviera_jugador_id = p_local_jugador_id;

    IF v_official_key IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.riviera_official_player_identity i
        WHERE i.official_player_key = v_official_key
          AND i.canonical_riviera_jugador_id = p_local_jugador_id
      ) THEN
        -- Preferir reasignar canonical al origen si aún está enlazado.
        SELECT l.riviera_jugador_id
        INTO v_new_canonical
        FROM public.riviera_official_player_profile_link l
        WHERE l.official_player_key = v_official_key
          AND l.riviera_jugador_id = p_source_jugador_id
        LIMIT 1;

        IF v_new_canonical IS NULL THEN
          SELECT l.riviera_jugador_id
          INTO v_new_canonical
          FROM public.riviera_official_player_profile_link l
          WHERE l.official_player_key = v_official_key
            AND l.riviera_jugador_id <> p_local_jugador_id
          ORDER BY l.created_at
          LIMIT 1;
        END IF;

        IF v_new_canonical IS NOT NULL THEN
          UPDATE public.riviera_official_player_identity
          SET canonical_riviera_jugador_id = v_new_canonical
          WHERE official_player_key = v_official_key;
        END IF;
      END IF;

      DELETE FROM public.riviera_official_player_profile_link
      WHERE riviera_jugador_id = p_local_jugador_id;

      IF v_new_canonical IS NULL AND NOT EXISTS (
        SELECT 1
        FROM public.riviera_official_player_profile_link l
        WHERE l.official_player_key = v_official_key
      ) THEN
        IF to_regclass('public.riviera_official_player_totals') IS NOT NULL THEN
          DELETE FROM public.riviera_official_player_totals
          WHERE official_player_key = v_official_key;
        END IF;
        IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
          DELETE FROM public.riviera_official_points_ledger
          WHERE official_player_key = v_official_key;
        END IF;
        DELETE FROM public.riviera_official_player_identity
        WHERE official_player_key = v_official_key;
      END IF;
    END IF;
  END IF;

  -- 7) Duelos del anfitrión: conservar encuentro, quitar referencia al clon.
  IF to_regclass('public.duelos_2v2') IS NOT NULL THEN
    UPDATE public.duelos_2v2
    SET
      pareja_a_j1_id = CASE
        WHEN pareja_a_j1_id = p_local_jugador_id THEN NULL ELSE pareja_a_j1_id
      END,
      pareja_a_j2_id = CASE
        WHEN pareja_a_j2_id = p_local_jugador_id THEN NULL ELSE pareja_a_j2_id
      END,
      pareja_b_j1_id = CASE
        WHEN pareja_b_j1_id = p_local_jugador_id THEN NULL ELSE pareja_b_j1_id
      END,
      pareja_b_j2_id = CASE
        WHEN pareja_b_j2_id = p_local_jugador_id THEN NULL ELSE pareja_b_j2_id
      END,
      updated_at = now()
    WHERE organizador_id = p_grantee_organizador_id
      AND (
        pareja_a_j1_id = p_local_jugador_id
        OR pareja_a_j2_id = p_local_jugador_id
        OR pareja_b_j1_id = p_local_jugador_id
        OR pareja_b_j2_id = p_local_jugador_id
      );
  END IF;

  -- 8) Liga local del clon (scoped al anfitrión).
  v_liga_jugador_id := NULLIF(trim(v_row.legacy_liga_jugador_id::text), '')::uuid;

  IF v_liga_jugador_id IS NOT NULL THEN
    IF to_regclass('public.liga_inscripciones') IS NOT NULL THEN
      DELETE FROM public.liga_inscripciones
      WHERE jugador_id = v_liga_jugador_id;
    END IF;

    IF to_regclass('public.liga_jugadores') IS NOT NULL THEN
      UPDATE public.liga_jugadores
      SET estado = 'inactivo'
      WHERE id = v_liga_jugador_id
        AND organizador_id = p_grantee_organizador_id;
    END IF;
  END IF;

  -- 9) Blocklist en el club anfitrión (evita re-import del clon).
  PERFORM public._insert_jugador_import_blocklist_internal(
    p_grantee_organizador_id,
    v_row.nombre,
    v_row.legacy_player_id,
    v_liga_jugador_id
  );

  -- 10) Borrar clon (NO toca players / pairs / matches / games / tournaments).
  DELETE FROM public.riviera_jugadores
  WHERE id = p_local_jugador_id
    AND organizador_id = p_grantee_organizador_id;

  RETURN jsonb_build_object(
    'status', 'purged',
    'local_jugador_id', p_local_jugador_id,
    'grantee_organizador_id', p_grantee_organizador_id,
    'participaciones_deleted', v_deleted_participaciones
  );
END;
$$;

REVOKE ALL ON FUNCTION public._purge_granted_local_jugador(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._purge_granted_local_jugador(uuid, uuid, uuid) FROM anon, authenticated;


CREATE OR REPLACE FUNCTION public._propagate_source_jugador_delete(p_source_jugador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant record;
  v_purge_result jsonb;
  v_purged integer := 0;
  v_skipped integer := 0;
  v_grants_removed integer := 0;
  v_details jsonb := '[]'::jsonb;
BEGIN
  IF p_source_jugador_id IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'missing_source');
  END IF;

  FOR v_grant IN
    SELECT
      opa.id,
      opa.local_jugador_id,
      opa.grantee_organizador_id,
      opa.is_active
    FROM public.organizer_player_access opa
    WHERE opa.jugador_id = p_source_jugador_id
    ORDER BY opa.grantee_organizador_id
  LOOP
    IF v_grant.local_jugador_id IS NOT NULL THEN
      v_purge_result := public._purge_granted_local_jugador(
        v_grant.local_jugador_id,
        v_grant.grantee_organizador_id,
        p_source_jugador_id
      );

      IF coalesce(v_purge_result->>'status', '') = 'purged' THEN
        v_purged := v_purged + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;

      v_details := v_details || jsonb_build_array(v_purge_result);
    END IF;

    DELETE FROM public.organizer_player_access
    WHERE id = v_grant.id;
    v_grants_removed := v_grants_removed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'propagated',
    'source_jugador_id', p_source_jugador_id,
    'locals_purged', v_purged,
    'locals_skipped', v_skipped,
    'grants_removed', v_grants_removed,
    'details', v_details
  );
END;
$$;

REVOKE ALL ON FUNCTION public._propagate_source_jugador_delete(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._propagate_source_jugador_delete(uuid) FROM anon, authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN C — delete_riviera_jugador (reemplazo con propagación)
-- Una sola transacción: cualquier RAISE EXCEPTION → ROLLBACK total.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_riviera_jugador(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_official_key uuid;
  v_part_id uuid;
  v_new_canonical uuid;
  v_liga_jugador_id uuid;
  v_deleted_participaciones integer := 0;
  v_propagation jsonb;
BEGIN
  IF p_organizador_id IS NULL OR p_jugador_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_organizador_id THEN
    RAISE EXCEPTION 'Sin permiso para eliminar este jugador';
  END IF;

  SELECT rj.id, rj.nombre, rj.legacy_player_id, rj.legacy_liga_jugador_id
  INTO v_row
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_jugador_id
    AND rj.organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado o sin permiso para eliminarlo';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.grantee_organizador_id = p_organizador_id
      AND opa.local_jugador_id = p_jugador_id
      AND opa.is_active = true
  ) THEN
    RAISE EXCEPTION
      'No se puede eliminar un jugador concedido desde este club. Revoca el acceso desde Admin Principal.';
  END IF;

  -- NUEVO: propagar borrado a todos los clones cedidos ANTES de purgar el origen.
  v_propagation := public._propagate_source_jugador_delete(p_jugador_id);

  v_official_key := public._safe_resolve_official_player_key(p_jugador_id);

  -- Revertir ledger oficial antes de borrar participaciones (FK RESTRICT).
  FOR v_part_id IN
    SELECT jp.id
    FROM public.jugador_participaciones jp
    WHERE jp.jugador_id = p_jugador_id
  LOOP
    PERFORM public._reverse_ledger_for_participacion_safe(v_part_id);
  END LOOP;

  DELETE FROM public.jugador_participaciones
  WHERE jugador_id = p_jugador_id;
  GET DIAGNOSTICS v_deleted_participaciones = ROW_COUNT;

  IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
    DELETE FROM public.riviera_official_points_ledger
    WHERE source_local_jugador_id = p_jugador_id;
  END IF;

  IF to_regclass('public.jugador_participacion_exclusiones') IS NOT NULL THEN
    DELETE FROM public.jugador_participacion_exclusiones
    WHERE scope_jugador_id = p_jugador_id
       OR (v_official_key IS NOT NULL AND official_player_key = v_official_key);
  END IF;

  IF to_regclass('public.rating_historial') IS NOT NULL THEN
    DELETE FROM public.rating_historial
    WHERE jugador_id = p_jugador_id;
  END IF;

  DELETE FROM public.jugador_stats
  WHERE jugador_id = p_jugador_id;

  IF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
    SELECT l.official_player_key
    INTO v_official_key
    FROM public.riviera_official_player_profile_link l
    WHERE l.riviera_jugador_id = p_jugador_id;

    IF v_official_key IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.riviera_official_player_identity i
        WHERE i.official_player_key = v_official_key
          AND i.canonical_riviera_jugador_id = p_jugador_id
      ) THEN
        SELECT l.riviera_jugador_id
        INTO v_new_canonical
        FROM public.riviera_official_player_profile_link l
        WHERE l.official_player_key = v_official_key
          AND l.riviera_jugador_id <> p_jugador_id
        ORDER BY l.created_at
        LIMIT 1;

        IF v_new_canonical IS NOT NULL THEN
          UPDATE public.riviera_official_player_identity
          SET canonical_riviera_jugador_id = v_new_canonical
          WHERE official_player_key = v_official_key;
        END IF;
      END IF;

      DELETE FROM public.riviera_official_player_profile_link
      WHERE riviera_jugador_id = p_jugador_id;

      IF v_new_canonical IS NULL AND NOT EXISTS (
        SELECT 1
        FROM public.riviera_official_player_profile_link l
        WHERE l.official_player_key = v_official_key
      ) THEN
        IF to_regclass('public.riviera_official_player_totals') IS NOT NULL THEN
          DELETE FROM public.riviera_official_player_totals
          WHERE official_player_key = v_official_key;
        END IF;
        IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
          DELETE FROM public.riviera_official_points_ledger
          WHERE official_player_key = v_official_key;
        END IF;
        DELETE FROM public.riviera_official_player_identity
        WHERE official_player_key = v_official_key;
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.duelos_2v2') IS NOT NULL THEN
    UPDATE public.duelos_2v2
    SET
      pareja_a_j1_id = CASE WHEN pareja_a_j1_id = p_jugador_id THEN NULL ELSE pareja_a_j1_id END,
      pareja_a_j2_id = CASE WHEN pareja_a_j2_id = p_jugador_id THEN NULL ELSE pareja_a_j2_id END,
      pareja_b_j1_id = CASE WHEN pareja_b_j1_id = p_jugador_id THEN NULL ELSE pareja_b_j1_id END,
      pareja_b_j2_id = CASE WHEN pareja_b_j2_id = p_jugador_id THEN NULL ELSE pareja_b_j2_id END,
      updated_at = now()
    WHERE organizador_id = p_organizador_id
      AND (
        pareja_a_j1_id = p_jugador_id
        OR pareja_a_j2_id = p_jugador_id
        OR pareja_b_j1_id = p_jugador_id
        OR pareja_b_j2_id = p_jugador_id
      );
  END IF;

  v_liga_jugador_id := NULLIF(trim(v_row.legacy_liga_jugador_id::text), '')::uuid;

  IF v_liga_jugador_id IS NOT NULL THEN
    IF to_regclass('public.liga_inscripciones') IS NOT NULL THEN
      DELETE FROM public.liga_inscripciones
      WHERE jugador_id = v_liga_jugador_id;
    END IF;

    IF to_regclass('public.liga_jugadores') IS NOT NULL THEN
      UPDATE public.liga_jugadores
      SET estado = 'inactivo'
      WHERE id = v_liga_jugador_id
        AND organizador_id = p_organizador_id;
    END IF;
  END IF;

  IF to_regclass('public.riviera_jugador_import_blocklist') IS NOT NULL THEN
    PERFORM public._insert_jugador_import_blocklist_internal(
      p_organizador_id,
      v_row.nombre,
      v_row.legacy_player_id,
      v_liga_jugador_id
    );
  END IF;

  -- Cinturón: grants residuales (virtual sin clon ya borrados en propagate).
  IF to_regclass('public.organizer_player_access') IS NOT NULL THEN
    DELETE FROM public.organizer_player_access
    WHERE jugador_id = p_jugador_id
       OR local_jugador_id = p_jugador_id;
  END IF;

  DELETE FROM public.riviera_jugadores
  WHERE id = p_jugador_id
    AND organizador_id = p_organizador_id;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'jugador_id', p_jugador_id,
    'participaciones_deleted', v_deleted_participaciones,
    'granted_locals_propagation', v_propagation
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_riviera_jugador(uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.delete_riviera_jugador(uuid, uuid) IS
  'Elimina jugador propio del organizador y propaga el borrado a todos los clones cedidos. '
  'Participaciones/stats solo del jugador borrado; no toca matches/pairs/games/tournaments.';

NOTIFY pgrst, 'reload schema';


-- ══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN D — VERIFICACIÓN POST (read-only; ejecutar DESPUÉS del borrado)
-- Sustituye :source_jugador_id y pega los IDs de compañeros del PRE (A3).
-- ══════════════════════════════════════════════════════════════════════════════

/*
-- D1) Origen eliminado; grants eliminados
--     Guarda en PRE (A1) los local_jugador_id y úsalos en D2/D3.
SELECT
  (SELECT COUNT(*) FROM public.riviera_jugadores WHERE id = :'source_jugador_id'::uuid) AS origen_riviera_restante,
  (SELECT COUNT(*)
   FROM public.organizer_player_access
   WHERE jugador_id = :'source_jugador_id'::uuid) AS grants_restantes;

-- D2) Clones eliminados — pega los UUID de local_jugador_id anotados en PRE (A1)
SELECT
  COUNT(*) FILTER (WHERE rj.id IS NOT NULL) AS clones_riviera_restantes,
  COUNT(*) FILTER (WHERE jp.id IS NOT NULL) AS participaciones_clon_restantes
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid)  -- reemplaza con local_jugador_id del PRE
) AS expected(local_id)
LEFT JOIN public.riviera_jugadores rj ON rj.id = expected.local_id
LEFT JOIN public.jugador_participaciones jp ON jp.jugador_id = expected.local_id;
-- Esperado: clones_riviera_restantes = 0, participaciones_clon_restantes = 0

-- D3) Compañeros intactos — comparar con baseline A3
--     (pega la lista de companero_part_id del PRE, o re-ejecuta la misma query A3:
--      debe dar 0 filas si el clon ya no existe, o mismos conteos si guardaste baseline)
WITH clon_parts AS (
  SELECT jp.tipo_evento, jp.evento_id
  FROM public.jugador_participaciones jp
  WHERE jp.jugador_id = :'source_jugador_id'::uuid  -- debe ser 0 filas
)
SELECT
  jp.id AS companero_part_id,
  jp.jugador_id,
  jp.puntos_obtenidos,
  jp.tipo_evento,
  jp.evento_id
FROM public.jugador_participaciones jp
WHERE jp.id IN (
  -- Reemplaza con IDs del baseline A3:
  '00000000-0000-0000-0000-000000000001'::uuid
);

-- D4) Artefactos de reta sin cambios (comparar con A4)
SELECT
  (SELECT COUNT(*) FROM public.tournaments) AS tournaments_total,
  (SELECT COUNT(*) FROM public.pairs) AS pairs_total,
  (SELECT COUNT(*) FROM public.matches) AS matches_total,
  (SELECT COUNT(*) FROM public.games) AS games_total;

-- D5) Sin nuevos fantasmas
SELECT COUNT(*) AS fantasmas_activos_sin_grant
FROM public.riviera_jugadores local
WHERE local.estado <> 'archivado'
  AND NOT EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.local_jugador_id = local.id
      AND opa.is_active = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa2
    WHERE opa2.local_jugador_id = local.id
  );
*/
