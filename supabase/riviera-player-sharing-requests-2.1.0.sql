-- ══════════════════════════════════════════════════════════════════════════════
-- SPRINT 2.1.0 — Player Sharing Requests
-- Solicitudes para compartir jugadores (sin crear organizer_player_access).
--
-- Prerrequisitos: riviera_jugadores, auth.users, ROMC identity (opcional)
-- NO modifica: organizer_player_access, ensure_riviera_identity, ROMC ledger
--
-- Idempotente: sí | Reversible: bloque ROLLBACK al final
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Tabla de solicitudes ──

CREATE TABLE IF NOT EXISTS public.riviera_player_sharing_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  riviera_jugador_id uuid NOT NULL
    REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  registration_jugador_id uuid NOT NULL
    REFERENCES public.riviera_jugadores(id) ON DELETE RESTRICT,
  requester_organizer_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  registration_organizer_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  request_message text,
  decision_note text,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CONSTRAINT rpsr_not_self_request
    CHECK (requester_organizer_id <> registration_organizer_id),
  CONSTRAINT rpsr_decision_pair_chk
    CHECK (
      (status = 'pending' AND decided_at IS NULL)
      OR (status IN ('accepted', 'rejected') AND decided_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.riviera_player_sharing_request IS
  'Sprint 2.1.0 — Solicitudes entre organizadores para usar un jugador. '
  'No crea organizer_player_access; solo registra la decisión del Organizador de Registro.';

COMMENT ON COLUMN public.riviera_player_sharing_request.riviera_jugador_id IS
  'Perfil riviera_jugadores referenciado en la solicitud (puede ser perfil local o de registro).';

COMMENT ON COLUMN public.riviera_player_sharing_request.registration_jugador_id IS
  'Perfil de registro (canonical) resuelto al crear la solicitud.';

COMMENT ON COLUMN public.riviera_player_sharing_request.requester_organizer_id IS
  'Organizador solicitante que desea utilizar al jugador.';

COMMENT ON COLUMN public.riviera_player_sharing_request.registration_organizer_id IS
  'Organizador de Registro (Debut Riviera) que aprueba o rechaza.';

CREATE INDEX IF NOT EXISTS rpsr_requester_created_idx
  ON public.riviera_player_sharing_request (requester_organizer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rpsr_registration_inbox_idx
  ON public.riviera_player_sharing_request (registration_organizer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS rpsr_registration_jugador_idx
  ON public.riviera_player_sharing_request (registration_jugador_id);

CREATE UNIQUE INDEX IF NOT EXISTS rpsr_one_pending_per_pair_idx
  ON public.riviera_player_sharing_request (requester_organizer_id, registration_jugador_id)
  WHERE status = 'pending';

-- ── 2. RLS ──

ALTER TABLE public.riviera_player_sharing_request ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rpsr_admin_all ON public.riviera_player_sharing_request;
CREATE POLICY rpsr_admin_all ON public.riviera_player_sharing_request
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS rpsr_select_requester ON public.riviera_player_sharing_request;
CREATE POLICY rpsr_select_requester ON public.riviera_player_sharing_request
  FOR SELECT TO authenticated
  USING (requester_organizer_id = auth.uid());

DROP POLICY IF EXISTS rpsr_select_registration ON public.riviera_player_sharing_request;
CREATE POLICY rpsr_select_registration ON public.riviera_player_sharing_request
  FOR SELECT TO authenticated
  USING (registration_organizer_id = auth.uid());

-- Escritura solo vía RPC SECURITY DEFINER

-- ── 3. Helper interno: contexto de registro ──

CREATE OR REPLACE FUNCTION public._resolve_player_registration_context(
  p_riviera_jugador_id uuid
)
RETURNS TABLE (
  registration_jugador_id uuid,
  registration_organizer_id uuid,
  jugador_nombre text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key uuid;
  v_canonical uuid;
  v_debut_org uuid;
  v_nombre text;
BEGIN
  IF p_riviera_jugador_id IS NULL THEN
    RETURN;
  END IF;

  v_key := public._resolve_official_player_key(p_riviera_jugador_id);

  IF v_key IS NOT NULL THEN
    SELECT
      i.canonical_riviera_jugador_id,
      coalesce(i.debut_organizer_id, rj.organizador_id),
      rj.nombre
    INTO v_canonical, v_debut_org, v_nombre
    FROM public.riviera_official_player_identity i
    JOIN public.riviera_jugadores rj
      ON rj.id = i.canonical_riviera_jugador_id
    WHERE i.official_player_key = v_key;

    IF FOUND THEN
      registration_jugador_id := v_canonical;
      registration_organizer_id := v_debut_org;
      jugador_nombre := v_nombre;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  SELECT rj.id, rj.organizador_id, rj.nombre
  INTO v_canonical, v_debut_org, v_nombre
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_riviera_jugador_id;

  IF FOUND THEN
    registration_jugador_id := v_canonical;
    registration_organizer_id := v_debut_org;
    jugador_nombre := v_nombre;
    RETURN NEXT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_player_registration_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._resolve_player_registration_context(uuid) FROM anon, authenticated;

-- ── 4. Serializar fila solicitud ──

CREATE OR REPLACE FUNCTION public._player_sharing_request_to_json(p_row public.riviera_player_sharing_request)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'riviera_jugador_id', p_row.riviera_jugador_id,
    'registration_jugador_id', p_row.registration_jugador_id,
    'requester_organizer_id', p_row.requester_organizer_id,
    'registration_organizer_id', p_row.registration_organizer_id,
    'status', p_row.status,
    'request_message', p_row.request_message,
    'decision_note', p_row.decision_note,
    'decided_by', p_row.decided_by,
    'created_at', p_row.created_at,
    'decided_at', p_row.decided_at,
    'jugador_nombre', (
      SELECT rj.nombre
      FROM public.riviera_jugadores rj
      WHERE rj.id = p_row.registration_jugador_id
    ),
    'riviera_id', (
      SELECT i.riviera_id
      FROM public.riviera_official_player_profile_link l
      JOIN public.riviera_official_player_identity i
        ON i.official_player_key = l.official_player_key
      WHERE l.riviera_jugador_id = p_row.registration_jugador_id
      LIMIT 1
    )
  );
$$;

REVOKE ALL ON FUNCTION public._player_sharing_request_to_json(public.riviera_player_sharing_request) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._player_sharing_request_to_json(public.riviera_player_sharing_request) FROM anon, authenticated;

-- ── 5. RPC: crear solicitud ──

CREATE OR REPLACE FUNCTION public.create_player_sharing_request(
  p_riviera_jugador_id uuid,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_ctx record;
  v_row public.riviera_player_sharing_request;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  IF p_riviera_jugador_id IS NULL THEN
    RAISE EXCEPTION 'Jugador requerido';
  END IF;

  SELECT *
  INTO v_ctx
  FROM public._resolve_player_registration_context(p_riviera_jugador_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado';
  END IF;

  IF v_ctx.registration_organizer_id = v_actor THEN
    RAISE EXCEPTION 'No puedes solicitar un jugador de tu propio Organizador de Registro';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = v_actor
      AND opa.jugador_id = v_ctx.registration_jugador_id
      AND opa.is_active = true
  ) THEN
    RAISE EXCEPTION 'Ya existe acceso activo a este jugador';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.riviera_player_sharing_request r
    WHERE r.requester_organizer_id = v_actor
      AND r.registration_jugador_id = v_ctx.registration_jugador_id
      AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Ya existe una solicitud pendiente para este jugador';
  END IF;

  INSERT INTO public.riviera_player_sharing_request (
    riviera_jugador_id,
    registration_jugador_id,
    requester_organizer_id,
    registration_organizer_id,
    request_message
  )
  VALUES (
    p_riviera_jugador_id,
    v_ctx.registration_jugador_id,
    v_actor,
    v_ctx.registration_organizer_id,
    nullif(trim(p_message), '')
  )
  RETURNING * INTO v_row;

  RETURN public._player_sharing_request_to_json(v_row);
END;
$$;

COMMENT ON FUNCTION public.create_player_sharing_request(uuid, text) IS
  'Sprint 2.1.0 — Organizador solicitante pide usar un jugador. No crea acceso.';

GRANT EXECUTE ON FUNCTION public.create_player_sharing_request(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_player_sharing_request(uuid, text) FROM anon;

-- ── 6. RPC: listar solicitudes enviadas ──

CREATE OR REPLACE FUNCTION public.list_outgoing_player_sharing_requests(
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  v_status := nullif(lower(trim(p_status)), '');
  IF v_status IS NOT NULL AND v_status NOT IN ('pending', 'accepted', 'rejected') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(
        public._player_sharing_request_to_json(r)
        ORDER BY r.created_at DESC
      )
      FROM public.riviera_player_sharing_request r
      WHERE r.requester_organizer_id = v_actor
        AND (v_status IS NULL OR r.status = v_status)
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_outgoing_player_sharing_requests(text) TO authenticated;
REVOKE ALL ON FUNCTION public.list_outgoing_player_sharing_requests(text) FROM anon;

-- ── 7. RPC: listar solicitudes recibidas (Organizador de Registro) ──

CREATE OR REPLACE FUNCTION public.list_incoming_player_sharing_requests(
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  v_status := nullif(lower(trim(p_status)), '');
  IF v_status IS NOT NULL AND v_status NOT IN ('pending', 'accepted', 'rejected') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(
        public._player_sharing_request_to_json(r)
        ORDER BY r.created_at DESC
      )
      FROM public.riviera_player_sharing_request r
      WHERE r.registration_organizer_id = v_actor
        AND (v_status IS NULL OR r.status = v_status)
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_incoming_player_sharing_requests(text) TO authenticated;
REVOKE ALL ON FUNCTION public.list_incoming_player_sharing_requests(text) FROM anon;

-- ── 8. RPC: responder solicitud (aceptar / rechazar) ──

CREATE OR REPLACE FUNCTION public.respond_player_sharing_request(
  p_request_id uuid,
  p_accept boolean,
  p_decision_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.riviera_player_sharing_request;
  v_new_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Solicitud requerida';
  END IF;

  SELECT *
  INTO v_row
  FROM public.riviera_player_sharing_request r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'La solicitud ya fue decidida';
  END IF;

  IF NOT public.is_master_admin()
     AND v_row.registration_organizer_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Solo el Organizador de Registro puede decidir esta solicitud';
  END IF;

  v_new_status := CASE WHEN coalesce(p_accept, false) THEN 'accepted' ELSE 'rejected' END;

  UPDATE public.riviera_player_sharing_request r
  SET
    status = v_new_status,
    decision_note = nullif(trim(p_decision_note), ''),
    decided_by = v_actor,
    decided_at = now()
  WHERE r.id = p_request_id
  RETURNING * INTO v_row;

  RETURN public._player_sharing_request_to_json(v_row);
END;
$$;

COMMENT ON FUNCTION public.respond_player_sharing_request(uuid, boolean, text) IS
  'Sprint 2.1.0 — Organizador de Registro acepta o rechaza. NO crea organizer_player_access.';

GRANT EXECUTE ON FUNCTION public.respond_player_sharing_request(uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.respond_player_sharing_request(uuid, boolean, text) FROM anon;

-- ── 9. Validación ──

DO $$
BEGIN
  IF to_regclass('public.riviera_player_sharing_request') IS NULL THEN
    RAISE EXCEPTION 'Sprint 2.1.0: tabla no creada';
  END IF;
  RAISE NOTICE 'Sprint 2.1.0 OK — riviera_player_sharing_request + 4 RPCs';
END $$;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK Sprint 2.1.0
-- ══════════════════════════════════════════════════════════════════════════════
--
-- REVOKE EXECUTE ON FUNCTION public.respond_player_sharing_request(uuid, boolean, text) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION public.list_incoming_player_sharing_requests(text) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION public.list_outgoing_player_sharing_requests(text) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION public.create_player_sharing_request(uuid, text) FROM authenticated;
-- DROP FUNCTION IF EXISTS public.respond_player_sharing_request(uuid, boolean, text);
-- DROP FUNCTION IF EXISTS public.list_incoming_player_sharing_requests(text);
-- DROP FUNCTION IF EXISTS public.list_outgoing_player_sharing_requests(text);
-- DROP FUNCTION IF EXISTS public.create_player_sharing_request(uuid, text);
-- DROP FUNCTION IF EXISTS public._player_sharing_request_to_json(public.riviera_player_sharing_request);
-- DROP FUNCTION IF EXISTS public._resolve_player_registration_context(uuid);
-- DROP TABLE IF EXISTS public.riviera_player_sharing_request CASCADE;
-- NOTIFY pgrst, 'reload schema';
--
-- ══════════════════════════════════════════════════════════════════════════════
