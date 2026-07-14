-- ═══════════════════════════════════════════════════════════════════════════════
-- PROPUESTA — auth.uid() robusto en delete_riviera_jugador + dry-run
-- Fecha: 2026-07-13
-- ESTADO: PARA APROBACIÓN. NO EJECUTAR borrados. NO deploy automático.
--
-- DIAGNÓSTICO (evidencia del dueño)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1) SQL Editor: SELECT auth.uid() → NULL
--    NORMAL: el SQL Editor NO entrega JWT de usuario. NO prueba la app.
--
-- 2) App (delete diag): clubOrganizadorId = contextUserId = sessionAuthUid =
--    p_organizador_id = cd45cea7-…  (IDs alineados en cliente).
--
-- 3) Mensajes DIFERENTES (importante):
--    • SQL Editor → "Sin permiso para eliminar este jugador"  (= RAISE de
--      delete_riviera_jugador líneas auth)
--    • App console → "Sin permiso" (texto CORTO)
--    El RAISE corto exacto 'Sin permiso' está en
--    register_riviera_jugador_import_blocklist (jugador-import-blocklist.sql),
--    NO en delete_riviera_jugador del repo.
--    Conviene confirmar en Network → Response body el string exacto.
--
-- 4) search_path actual: SET search_path = public
--    auth.uid() está calificado como auth.uid() → search_path NO debería
--    impedir resolver la función. auth.uid() lee JWT claims del request
--    (request.jwt.claim.sub / request.jwt.claims). Si el POST llega sin
--    Authorization Bearer, auth.uid() = NULL aunque el cliente tenga user.id
--    en memoria (getUser() lee storage local).
--
-- PATRÓN QUE YA FUNCIONA EN EL REPO
-- ─────────────────────────────────────────────────────────────────────────────
-- leave_organizer_membership / _assert_rating_rpc_authenticated:
--   SECURITY DEFINER
--   SET search_path = public
--   v_uid := auth.uid(); IF v_uid IS NULL THEN RAISE ...
--   GRANT EXECUTE TO authenticated; REVOKE FROM anon
--
-- Supabase recomienda además search_path = public, pg_temp (hardening).
-- auth.uid() internamente hace COALESCE sobre JWT settings; si en algún
-- entorno auth.uid() falla, leer claims directamente es el respaldo.
--
-- FIX (sin bypassear seguridad)
-- ─────────────────────────────────────────────────────────────────────────────
-- • Helper public._request_auth_uid() = auth.uid() + fallback JWT claims
-- • delete_riviera_jugador usa _request_auth_uid() en vez de auth.uid()
-- • SET search_path = public, pg_temp
-- • GRANT authenticated + REVOKE anon
-- • Dry-run probe_delete_riviera_jugador_auth (solo lectura / jsonb)
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── Helper: identidad del request (NO bypassea; solo lee JWT con resiliencia) ──

CREATE OR REPLACE FUNCTION public._request_auth_uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    auth.uid(),
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
    NULLIF(
      (
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      ),
      ''
    )::uuid
  );
$$;

REVOKE ALL ON FUNCTION public._request_auth_uid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._request_auth_uid() FROM anon;
GRANT EXECUTE ON FUNCTION public._request_auth_uid() TO authenticated;

COMMENT ON FUNCTION public._request_auth_uid() IS
  'UID del JWT del request: auth.uid() con fallback a request.jwt.claims. '
  'Misma fuente que auth.uid() en Supabase; no inventa identidad.';


-- ── Dry-run / probe (llamar DESDE LA APP autenticada, no desde SQL Editor) ──

CREATE OR REPLACE FUNCTION public.probe_delete_riviera_jugador_auth(
  p_organizador_id uuid,
  p_jugador_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth uuid := public._request_auth_uid();
  v_auth_raw uuid := auth.uid();
  v_jwt_sub text := current_setting('request.jwt.claim.sub', true);
  v_claims_sub text :=
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  v_row_org uuid;
BEGIN
  IF p_jugador_id IS NOT NULL THEN
    SELECT rj.organizador_id INTO v_row_org
    FROM public.riviera_jugadores rj
    WHERE rj.id = p_jugador_id;
  END IF;

  RETURN jsonb_build_object(
    'auth_uid_visto', v_auth,
    'auth_uid_raw', v_auth_raw,
    'jwt_claim_sub', NULLIF(v_jwt_sub, ''),
    'jwt_claims_sub', NULLIF(v_claims_sub, ''),
    'p_organizador_recibido', p_organizador_id,
    'coinciden', (v_auth IS NOT NULL AND v_auth = p_organizador_id),
    'jugador_id', p_jugador_id,
    'jugador_organizador_id', v_row_org,
    'jugador_org_coincide_auth',
      (v_auth IS NOT NULL AND v_row_org IS NOT NULL AND v_auth = v_row_org),
    'role', NULLIF(current_setting('request.jwt.claim.role', true), ''),
    'nota',
      'Si auth_uid_visto es null desde la app, el Authorization Bearer no llega al PostgREST. '
      'Si SQL Editor da null, es normal.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.probe_delete_riviera_jugador_auth(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.probe_delete_riviera_jugador_auth(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.probe_delete_riviera_jugador_auth(uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.probe_delete_riviera_jugador_auth(uuid, uuid) IS
  'Dry-run: qué auth.uid()/JWT ve la RPC. No borra nada. Llamar desde la app autenticada.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE — parche de identidad sobre delete_riviera_jugador (prod)
-- Basado en supabase/delete-riviera-jugador.sql + gate cedido de cascade-x.
-- Validación de permiso CONSERVADA (exige JWT = p_organizador_id).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_riviera_jugador(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_official_key uuid;
  v_part_id uuid;
  v_new_canonical uuid;
  v_liga_jugador_id uuid;
  v_deleted_participaciones integer := 0;
  v_actor uuid := public._request_auth_uid();
BEGIN
  IF p_organizador_id IS NULL OR p_jugador_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos';
  END IF;

  -- Identidad real del request (JWT). NO se elimina la validación.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'Sin sesión autenticada (auth.uid/JWT null). Reintenta tras iniciar sesión.';
  END IF;

  IF v_actor IS DISTINCT FROM p_organizador_id THEN
    RAISE EXCEPTION
      'Sin permiso para eliminar este jugador (auth=% organizador=%)',
      v_actor, p_organizador_id;
  END IF;

  SELECT rj.id, rj.nombre, rj.legacy_player_id, rj.legacy_liga_jugador_id
  INTO v_row
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_jugador_id
    AND rj.organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado o sin permiso para eliminarlo';
  END IF;

  -- Cedido receptor (clon): bloquear. Misma lógica que cascade-x.
  IF EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = p_organizador_id
      AND opa.local_jugador_id = p_jugador_id
      AND opa.is_active = true
      AND (
        opa.access_type = 'granted_by_admin'
        OR opa.jugador_id IS DISTINCT FROM p_jugador_id
      )
  ) THEN
    RAISE EXCEPTION
      'No eres el club de origen; usa «Quitar de mi club»';
  END IF;

  BEGIN
    v_official_key := public.resolve_official_player_key_for_jugador(p_jugador_id);
  EXCEPTION
    WHEN undefined_function THEN
      v_official_key := NULL;
  END;

  FOR v_part_id IN
    SELECT jp.id
    FROM public.jugador_participaciones jp
    WHERE jp.jugador_id = p_jugador_id
  LOOP
    BEGIN
      PERFORM public.reverse_riviera_official_ledger_for_participacion(v_part_id);
    EXCEPTION
      WHEN undefined_function THEN
        NULL;
    END;
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
    BEGIN
      PERFORM public.register_riviera_jugador_import_blocklist(
        p_organizador_id,
        v_row.nombre,
        v_row.legacy_player_id,
        v_liga_jugador_id
      );
    EXCEPTION
      WHEN undefined_function THEN
        NULL;
    END;
  END IF;

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
    'actor_uid', v_actor
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_riviera_jugador(uuid, uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.delete_riviera_jugador(uuid, uuid) FROM anon;

COMMENT ON FUNCTION public.delete_riviera_jugador(uuid, uuid) IS
  'Elimina jugador del organizador autenticado. Identidad vía _request_auth_uid() '
  '(JWT). Validación de permiso intacta.';

NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════════════
-- Cómo probar DESDE LA APP (sin borrar)
-- ─────────────────────────────────────────────────────────────────────────────
-- En consola del navegador (logueado como cd45cea7-…), con supabase del app:
--
--   const { data, error } = await supabase.rpc(
--     'probe_delete_riviera_jugador_auth',
--     {
--       p_organizador_id: 'cd45cea7-a8ac-4596-b0ee-24959b4cbb5d',
--       p_jugador_id: '86fa1102-7157-4808-a741-7c9d1e3d1151',
--     }
--   );
--   console.log({ data, error });
--
-- Esperado OK:
--   auth_uid_visto = cd45cea7-…
--   coinciden = true
--   jugador_org_coincide_auth = true
--
-- Si auth_uid_visto = null → el Authorization Bearer no llega a PostgREST.
-- Revisa Network en el POST: header Authorization: Bearer eyJ…
--
-- También: en el POST delete_riviera_jugador fallido, copia el `message`
-- exacto del JSON. Si es exactamente "Sin permiso" (corto) apunta a
-- register_riviera_jugador_import_blocklist, no al RAISE largo de delete.
--
-- Parche para cascade-x (cuando se apruebe):
--   v_actor := public._request_auth_uid();
--   SET search_path = public, pg_temp;
--   IF v_actor IS NULL / IS DISTINCT FROM p_organizador_id THEN …
-- ═══════════════════════════════════════════════════════════════════════════════
