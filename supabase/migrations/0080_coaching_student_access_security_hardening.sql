-- ==============================================================================
-- 0080_coaching_student_access_security_hardening.sql
-- Riviera Coaching — Hotfix de Seguridad, Modelo Multiclub y Cuentas STUDENT_ONLY
-- ==============================================================================

-- 1. RETIRAR DEFINITIVAMENTE LA FUNCIÓN INSEGURA activate_student_invitation
DROP FUNCTION IF EXISTS public.activate_student_invitation(text, text);

-- 2. EXTENDER TABLA DE INVITACIONES CON HASH SEGURO Y PROTECCIÓN CONTRA FUERZA BRUTA
ALTER TABLE public.coach_student_invitations
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attempts_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- Permitir que invitation_token no almacene el texto claro en nuevas filas
ALTER TABLE public.coach_student_invitations
  ALTER COLUMN invitation_token DROP NOT NULL;

-- Backfill seguro de token_hash para invitaciones existentes si las hubiera
UPDATE public.coach_student_invitations
SET token_hash = encode(extensions.digest(invitation_token::bytea, 'sha256'), 'hex')
WHERE token_hash IS NULL AND invitation_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cs_invitations_token_hash
  ON public.coach_student_invitations(token_hash);

CREATE INDEX IF NOT EXISTS idx_cs_invitations_auth_user
  ON public.coach_student_invitations(auth_user_id);

-- 3. CORREGIR EL MODELO MULTICLUB EN coach_student_account_links
-- Desvincular UNIQUE(jugador_id) global para permitir que un jugador entrene en múltiples clubes
-- conservando su misma cuenta personal sin sobrescribir asociaciones administrativas de otros clubes.
ALTER TABLE public.coach_student_account_links
  DROP CONSTRAINT IF EXISTS coach_student_account_links_jugador_uq;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coach_student_account_links_org_jugador_uq'
  ) THEN
    ALTER TABLE public.coach_student_account_links
      ADD CONSTRAINT coach_student_account_links_org_jugador_uq
      UNIQUE (organizador_id, jugador_id);
  END IF;
END $$;

-- 4. RPC DE CONSULTA DE ESTADO CON VALIDACIÓN DE RELACIÓN LEGÍTIMA
DROP FUNCTION IF EXISTS public.get_club_student_access_status(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_club_student_access_status(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_authorized boolean;
  v_has_relationship boolean;
  v_link record;
  v_invitation record;
  v_user record;
  v_jugador record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- Alumnos nunca pueden consultar estados de acceso del club
  PERFORM public.check_student_only_restriction();

  v_is_authorized := public.is_master_admin() OR (p_organizador_id = v_caller);
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado para consultar este club');
  END IF;

  -- Validar que el club tiene relación con este jugador
  SELECT EXISTS (
    SELECT 1 FROM public.coach_player_relationships
    WHERE organizador_id = p_organizador_id
      AND jugador_id = p_jugador_id
      AND status IN ('ACTIVE', 'PAUSED')
  ) INTO v_has_relationship;

  IF NOT v_has_relationship AND NOT public.is_master_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no administra este perfil deportivo.');
  END IF;

  SELECT id, nombre, email INTO v_jugador
  FROM public.riviera_jugadores
  WHERE id = p_jugador_id;

  IF v_jugador.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Alumno no encontrado');
  END IF;

  -- 1. Comprobar vínculo exclusivo de este club
  SELECT * INTO v_link
  FROM public.coach_student_account_links
  WHERE organizador_id = p_organizador_id
    AND jugador_id = p_jugador_id;

  IF v_link.id IS NOT NULL THEN
    SELECT id, email, created_at, raw_app_meta_data INTO v_user
    FROM auth.users
    WHERE id = v_link.auth_user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', CASE WHEN v_link.is_active THEN 'ACTIVE' ELSE 'DEACTIVATED' END,
      'email', COALESCE(v_link.student_email, v_user.email, v_jugador.email),
      'auth_user_id', v_link.auth_user_id,
      'is_active', v_link.is_active,
      'deactivated_at', v_link.deactivated_at,
      'created_at', v_link.created_at,
      'account_type', COALESCE(v_user.raw_app_meta_data->>'account_type', 'STUDENT_ONLY'),
      'verification_method', v_link.verification_method
    );
  END IF;

  -- 2. Comprobar si hay una invitación pendiente válida para este club
  SELECT * INTO v_invitation
  FROM public.coach_student_invitations
  WHERE organizador_id = p_organizador_id
    AND jugador_id = p_jugador_id
    AND status = 'PENDING'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invitation.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'INVITATION_PENDING',
      'email', v_invitation.email,
      'invited_at', v_invitation.invited_at,
      'expires_at', v_invitation.expires_at,
      'attempts_count', v_invitation.attempts_count
    );
  END IF;

  -- 3. Sin acceso en este club
  RETURN jsonb_build_object(
    'ok', true,
    'status', 'NO_ACCESS',
    'email', v_jugador.email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_student_access_status(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_student_access_status(uuid, uuid) TO authenticated, service_role;

-- 5. DESACTIVAR ACCESO EN UN CLUB SIN AFECTAR OTROS CLUBES
DROP FUNCTION IF EXISTS public.deactivate_student_access(uuid, uuid);

CREATE OR REPLACE FUNCTION public.deactivate_student_access(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_authorized boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  v_is_authorized := public.is_master_admin() OR (p_organizador_id = v_caller);
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  -- Desactivar únicamente el vínculo de ESTE club
  UPDATE public.coach_student_account_links
  SET is_active = false,
      deactivated_at = now(),
      deactivated_by = v_caller,
      updated_at = now()
  WHERE organizador_id = p_organizador_id
    AND jugador_id = p_jugador_id;

  -- Revocar invitaciones pendientes de ESTE club
  UPDATE public.coach_student_invitations
  SET status = 'REVOKED', revoked_at = now(), revoked_by = v_caller, updated_at = now()
  WHERE organizador_id = p_organizador_id
    AND jugador_id = p_jugador_id
    AND status = 'PENDING';

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'DEACTIVATED',
    'message', 'El acceso en este club ha sido pausado. El Riviera ID, saldos y accesos a otros clubes permanecen intactos.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_student_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_student_access(uuid, uuid) TO authenticated, service_role;

-- 6. REACTIVAR ACCESO EN UN CLUB
DROP FUNCTION IF EXISTS public.reactivate_student_access(uuid, uuid);

CREATE OR REPLACE FUNCTION public.reactivate_student_access(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_authorized boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  v_is_authorized := public.is_master_admin() OR (p_organizador_id = v_caller);
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  UPDATE public.coach_student_account_links
  SET is_active = true,
      deactivated_at = NULL,
      deactivated_by = NULL,
      updated_at = now()
  WHERE organizador_id = p_organizador_id
    AND jugador_id = p_jugador_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ACTIVE',
    'message', 'Acceso de alumno reactivado exitosamente en este club.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_student_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_student_access(uuid, uuid) TO authenticated, service_role;

-- 7. VALIDACIÓN PÚBLICA DE INVITACIÓN POR HASH
DROP FUNCTION IF EXISTS public.verify_student_invitation(text);

CREATE OR REPLACE FUNCTION public.verify_student_invitation(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clean_token text := btrim(COALESCE(p_token, ''));
  v_hash text;
  v_invitation record;
  v_jugador record;
  v_org_user record;
  v_coach record;
  v_is_existing_account boolean := false;
BEGIN
  IF v_clean_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token de invitación no proporcionado.');
  END IF;

  v_hash := encode(extensions.digest(v_clean_token::bytea, 'sha256'), 'hex');

  -- Buscar por token_hash (o fallback a invitation_token para transicional)
  SELECT * INTO v_invitation
  FROM public.coach_student_invitations
  WHERE token_hash = v_hash OR invitation_token = v_clean_token
  LIMIT 1;

  IF v_invitation.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitación no válida.');
  END IF;

  IF v_invitation.status = 'ACCEPTED' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Esta invitación ya fue activada previamente. Inicia sesión con tu correo y contraseña.'
    );
  END IF;

  IF v_invitation.status = 'REVOKED' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Esta invitación fue cancelada por el club. Solicita una nueva invitación.'
    );
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.coach_student_invitations SET status = 'EXPIRED', updated_at = now() WHERE id = v_invitation.id;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'La invitación ha expirado. Solicita a tu club que te reenvíe la invitación.'
    );
  END IF;

  -- Comprobar reintentos contra fuerza bruta
  IF v_invitation.attempts_count >= 5 THEN
    UPDATE public.coach_student_invitations SET status = 'REVOKED', updated_at = now() WHERE id = v_invitation.id;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Demasiados intentos fallidos. Por seguridad, la invitación fue bloqueada. Solicita una nueva.'
    );
  END IF;

  -- Resolver datos de jugador
  SELECT rj.id, rj.nombre, rj.email, i.riviera_id INTO v_jugador
  FROM public.riviera_jugadores rj
  LEFT JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = rj.id
  WHERE rj.id = v_invitation.jugador_id;

  SELECT COALESCE(raw_user_meta_data->>'nombre', email) as nombre INTO v_org_user
  FROM auth.users
  WHERE id = v_invitation.organizador_id;

  SELECT nombre INTO v_coach
  FROM public.riviera_coaches
  WHERE id = v_invitation.coach_id;

  -- Comprobar si ya existe una cuenta Auth activa previa para este correo
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(btrim(email)) = lower(btrim(v_invitation.email))
      AND encrypted_password IS NOT NULL
      AND encrypted_password <> ''
  ) INTO v_is_existing_account;

  RETURN jsonb_build_object(
    'ok', true,
    'invitation_id', v_invitation.id,
    'email', v_invitation.email,
    'student_name', v_jugador.nombre,
    'riviera_id', v_jugador.riviera_id,
    'club_name', v_org_user.nombre,
    'coach_name', v_coach.nombre,
    'expires_at', v_invitation.expires_at,
    'is_existing_account', v_is_existing_account
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_student_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_student_invitation(text) TO anon, authenticated, service_role;

-- 8. RECLAMAR VÍNCULO PARA USUARIOS AUTH EXISTENTES CON AUTENTICACIÓN EXPRESA
DROP FUNCTION IF EXISTS public.claim_student_invitation(text);

CREATE OR REPLACE FUNCTION public.claim_student_invitation(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_clean_token text := btrim(COALESCE(p_token, ''));
  v_hash text;
  v_invitation record;
  v_jugador record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Debes iniciar sesión con tu cuenta para vincular tu perfil.');
  END IF;

  SELECT lower(btrim(email)) INTO v_caller_email
  FROM auth.users
  WHERE id = v_caller;

  IF v_clean_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token de invitación no proporcionado.');
  END IF;

  v_hash := encode(extensions.digest(v_clean_token::bytea, 'sha256'), 'hex');

  SELECT * INTO v_invitation
  FROM public.coach_student_invitations
  WHERE (token_hash = v_hash OR invitation_token = v_clean_token)
  FOR UPDATE;

  IF v_invitation.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitación no encontrada.');
  END IF;

  IF v_invitation.status <> 'PENDING' OR v_invitation.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta invitación ya no está activa o ha expirado.');
  END IF;

  -- Comprobar que el usuario autenticado coincide con el correo invitado
  IF lower(btrim(v_invitation.email)) <> v_caller_email THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'La cuenta autenticada (' || v_caller_email || ') no coincide con el correo de la invitación (' || v_invitation.email || ').'
    );
  END IF;

  -- Comprobar que el club mantiene relación con el alumno
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_player_relationships
    WHERE organizador_id = v_invitation.organizador_id
      AND jugador_id = v_invitation.jugador_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no administra este perfil deportivo.');
  END IF;

  -- Vincular multiclub de forma segura
  INSERT INTO public.coach_student_account_links (
    organizador_id,
    jugador_id,
    auth_user_id,
    verification_method,
    is_active,
    student_email
  ) VALUES (
    v_invitation.organizador_id,
    v_invitation.jugador_id,
    v_caller,
    'CLUB_ADMIN',
    true,
    v_caller_email
  ) ON CONFLICT (organizador_id, jugador_id) DO UPDATE
  SET auth_user_id = v_caller,
      is_active = true,
      student_email = v_caller_email,
      deactivated_at = NULL,
      deactivated_by = NULL,
      updated_at = now();

  -- Marcar invitación como aceptada
  UPDATE public.coach_student_invitations
  SET status = 'ACCEPTED',
      accepted_at = now(),
      accepted_by = v_caller,
      updated_at = now()
  WHERE id = v_invitation.id;

  SELECT rj.nombre, i.riviera_id INTO v_jugador
  FROM public.riviera_jugadores rj
  LEFT JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = rj.id
  WHERE rj.id = v_invitation.jugador_id;

  RETURN jsonb_build_object(
    'ok', true,
    'student_name', v_jugador.nombre,
    'riviera_id', v_jugador.riviera_id,
    'message', '¡Perfil deportivo vinculado exitosamente a tu cuenta de AppRiviera!'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_student_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_student_invitation(text) TO authenticated, service_role;

-- 9. ENDURECER TODAS LAS RPCS ADMINISTRATIVAS CONTRA CUENTAS STUDENT_ONLY
-- A) assign_student_to_club_coach
DROP FUNCTION IF EXISTS public.assign_student_to_club_coach(uuid, uuid, text, integer, text, text);
DROP FUNCTION IF EXISTS public.assign_student_to_club_coach(uuid, uuid, text, integer, text);
DROP FUNCTION IF EXISTS public.assign_student_to_club_coach(uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS public.assign_student_to_club_coach(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.assign_student_to_club_coach(
  p_organizador_id uuid,
  p_coach_id uuid,
  p_riviera_id text,
  p_initial_classes integer DEFAULT 0,
  p_idempotency_key text DEFAULT NULL,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_membership record;
  v_norm_riviera_id text;
  v_jugador record;
  v_relationship_id uuid;
  v_initial_classes integer := COALESCE(p_initial_classes, 0);
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_existing_ledger record;
  v_new_balance integer := 0;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- PROTECCIÓN: Cuentas STUDENT_ONLY no pueden administrar asignaciones
  PERFORM public.check_student_only_restriction();

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado: solo el club propietario puede asignar alumnos a sus entrenadores');
  END IF;

  SELECT * INTO v_membership
  FROM public.coach_club_memberships
  WHERE organizador_id = p_organizador_id
    AND coach_id = p_coach_id;

  IF v_membership.coach_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador no pertenece a este club');
  END IF;

  IF v_membership.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se pueden asignar alumnos a un entrenador con estatus ' || v_membership.status);
  END IF;

  v_norm_riviera_id := upper(btrim(COALESCE(p_riviera_id, '')));
  IF v_norm_riviera_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El Riviera ID del alumno es obligatorio');
  END IF;

  SELECT rj.id, rj.nombre, idn.riviera_id INTO v_jugador
  FROM public.riviera_official_player_identity idn
  JOIN public.riviera_jugadores rj ON rj.id = idn.canonical_riviera_jugador_id
  WHERE idn.riviera_id = v_norm_riviera_id
  LIMIT 1;

  IF v_jugador.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se encontró ningún alumno con el Riviera ID ' || v_norm_riviera_id);
  END IF;

  IF v_initial_classes < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cantidad inicial de clases no puede ser negativa');
  END IF;

  IF v_trimmed_key IS NOT NULL THEN
    SELECT l.*, b.balance_classes AS current_balance INTO v_existing_ledger
    FROM public.coach_class_ledger l
    LEFT JOIN public.coach_player_class_balances b ON b.relationship_id = l.relationship_id
    WHERE l.idempotency_key = v_trimmed_key
    LIMIT 1;

    IF v_existing_ledger.id IS NOT NULL THEN
      IF v_existing_ledger.organizador_id <> p_organizador_id
         OR v_existing_ledger.coach_id <> p_coach_id
         OR v_existing_ledger.jugador_id <> v_jugador.id
         OR v_existing_ledger.delta <> v_initial_classes THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de clave de idempotencia: los parámetros no coinciden con la operación original.',
          'code', 'IDEMPOTENCY_MISMATCH'
        );
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'relationship_id', v_existing_ledger.relationship_id,
        'coach_id', p_coach_id,
        'jugador_id', v_jugador.id,
        'jugador_nombre', v_jugador.nombre,
        'riviera_id', v_norm_riviera_id,
        'balance_classes', COALESCE(v_existing_ledger.current_balance, v_initial_classes),
        'ledger_id', v_existing_ledger.id,
        'idempotent', true,
        'message', 'Operación completada previamente (idempotente)'
      );
    END IF;
  END IF;

  INSERT INTO public.coach_player_relationships (
    organizador_id,
    coach_id,
    jugador_id,
    status,
    is_primary,
    created_at,
    updated_at
  ) VALUES (
    p_organizador_id,
    p_coach_id,
    v_jugador.id,
    'ACTIVE',
    true,
    v_now,
    v_now
  )
  ON CONFLICT (organizador_id, coach_id, jugador_id)
  DO UPDATE SET
    status = 'ACTIVE',
    ended_at = NULL,
    updated_at = v_now
  RETURNING id INTO v_relationship_id;

  INSERT INTO public.coach_player_class_balances (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    balance_classes,
    total_classes_given,
    updated_at
  ) VALUES (
    v_relationship_id,
    p_organizador_id,
    p_coach_id,
    v_jugador.id,
    v_initial_classes,
    0,
    v_now
  )
  ON CONFLICT (relationship_id)
  DO UPDATE SET
    balance_classes = public.coach_player_class_balances.balance_classes + v_initial_classes,
    updated_at = v_now
  RETURNING balance_classes INTO v_new_balance;

  IF v_initial_classes > 0 THEN
    INSERT INTO public.coach_class_ledger (
      relationship_id,
      organizador_id,
      coach_id,
      jugador_id,
      delta,
      tipo,
      notas,
      idempotency_key,
      recorded_by,
      created_at
    ) VALUES (
      v_relationship_id,
      p_organizador_id,
      p_coach_id,
      v_jugador.id,
      v_initial_classes,
      'PACKAGE_CREDIT',
      COALESCE(p_reference, 'Asignación inicial de ' || v_initial_classes || ' clases contratadas'),
      v_trimmed_key,
      v_caller,
      v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'relationship_id', v_relationship_id,
    'coach_id', p_coach_id,
    'jugador_id', v_jugador.id,
    'jugador_nombre', v_jugador.nombre,
    'riviera_id', v_norm_riviera_id,
    'balance_classes', v_new_balance,
    'idempotent', false,
    'message', 'Alumno asignado exitosamente con ' || v_initial_classes || ' clases'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_student_to_club_coach(uuid, uuid, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_student_to_club_coach(uuid, uuid, text, integer, text, text) TO authenticated, service_role;

-- B) assign_coach_classes
DROP FUNCTION IF EXISTS public.assign_coach_classes(uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.assign_coach_classes(uuid, integer, text);
DROP FUNCTION IF EXISTS public.assign_coach_classes(uuid, integer);

CREATE OR REPLACE FUNCTION public.assign_coach_classes(
  p_relationship_id uuid,
  p_class_count integer,
  p_notas text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_rel record;
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_new_balance integer;
  v_trimmed_key text := NULLIF(trim(p_idempotency_key), '');
  v_existing_op record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  IF p_class_count <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cantidad de clases debe ser mayor a 0');
  END IF;

  SELECT * INTO v_rel
  FROM public.coach_player_relationships
  WHERE id = p_relationship_id;

  IF v_rel.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Relación no encontrada');
  END IF;

  IF v_caller <> v_rel.organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede asignar clases');
  END IF;

  IF v_trimmed_key IS NOT NULL THEN
    SELECT id, relationship_id, delta INTO v_existing_op
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_trimmed_key
    LIMIT 1;

    IF v_existing_op.id IS NOT NULL THEN
      SELECT balance_classes INTO v_new_balance
      FROM public.coach_player_class_balances
      WHERE relationship_id = p_relationship_id;

      RETURN jsonb_build_object(
        'ok', true,
        'relationship_id', p_relationship_id,
        'balance_classes', v_new_balance,
        'delta', v_existing_op.delta,
        'idempotent', true,
        'message', 'Operación completada previamente (idempotente)'
      );
    END IF;
  END IF;

  INSERT INTO public.coach_player_class_balances (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    balance_classes,
    total_classes_given
  ) VALUES (
    v_rel.id,
    v_rel.organizador_id,
    v_rel.coach_id,
    v_rel.jugador_id,
    p_class_count,
    0
  ) ON CONFLICT (relationship_id) DO UPDATE
  SET balance_classes = public.coach_player_class_balances.balance_classes + p_class_count,
      updated_at = now()
  RETURNING balance_classes INTO v_new_balance;

  INSERT INTO public.coach_class_ledger (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    delta,
    tipo,
    notas,
    idempotency_key,
    recorded_by
  ) VALUES (
    v_rel.id,
    v_rel.organizador_id,
    v_rel.coach_id,
    v_rel.jugador_id,
    p_class_count,
    'PACKAGE_CREDIT',
    COALESCE(p_notas, 'Abono de clases por administración del club'),
    v_trimmed_key,
    v_caller
  );

  RETURN jsonb_build_object(
    'ok', true,
    'relationship_id', v_rel.id,
    'balance_classes', v_new_balance,
    'delta', p_class_count,
    'message', 'Clases asignadas exitosamente'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_coach_classes(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_coach_classes(uuid, integer, text, text) TO authenticated, service_role;

-- C) reassign_student_coach
DROP FUNCTION IF EXISTS public.reassign_student_coach(uuid, uuid, uuid, uuid, boolean, text, text, integer);
DROP FUNCTION IF EXISTS public.reassign_student_coach(uuid, uuid, uuid, uuid, boolean, text, text);
DROP FUNCTION IF EXISTS public.reassign_student_coach(uuid, uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.reassign_student_coach(uuid, uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.reassign_student_coach(
  p_organizador_id uuid,
  p_student_id uuid,
  p_from_coach_id uuid,
  p_to_coach_id uuid,
  p_transfer_balance boolean DEFAULT true,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_expected_balance integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_existing_op record;
  v_to_membership record;
  v_source_rel record;
  v_source_bal record;
  v_target_rel record;
  v_transfer_amount integer := 0;
  v_target_new_balance integer := 0;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado: solo el club puede reasignar alumnos');
  END IF;

  IF p_from_coach_id = p_to_coach_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El coach destino debe ser diferente al actual');
  END IF;

  IF v_trimmed_key IS NOT NULL THEN
    SELECT * INTO v_existing_op
    FROM public.coach_reassignment_operations
    WHERE idempotency_key = v_trimmed_key
    LIMIT 1;

    IF v_existing_op.id IS NOT NULL THEN
      IF v_existing_op.organizador_id <> p_organizador_id
         OR v_existing_op.student_id <> p_student_id
         OR v_existing_op.from_coach_id <> p_from_coach_id
         OR v_existing_op.to_coach_id <> p_to_coach_id
         OR v_existing_op.authorized_by <> v_caller THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de clave de idempotencia: los parámetros no coinciden con la operación original.',
          'code', 'IDEMPOTENCY_MISMATCH'
        );
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'from_coach_id', p_from_coach_id,
        'to_coach_id', p_to_coach_id,
        'student_id', p_student_id,
        'target_relationship_id', v_existing_op.target_relationship_id,
        'transferred_classes', v_existing_op.transferred_classes,
        'target_new_balance', v_existing_op.target_new_balance,
        'idempotent', true,
        'message', 'Reasignación completada previamente (idempotente)'
      );
    END IF;
  END IF;

  SELECT * INTO v_to_membership
  FROM public.coach_club_memberships
  WHERE organizador_id = p_organizador_id
    AND coach_id = p_to_coach_id;

  IF v_to_membership.coach_id IS NULL OR v_to_membership.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El coach de destino no tiene una membresía activa en este club');
  END IF;

  SELECT * INTO v_source_rel
  FROM public.coach_player_relationships
  WHERE organizador_id = p_organizador_id
    AND coach_id = p_from_coach_id
    AND jugador_id = p_student_id
  FOR UPDATE;

  IF v_source_rel.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No existe relación activa con el coach de origen');
  END IF;

  SELECT * INTO v_source_bal
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_source_rel.id
  FOR UPDATE;

  IF p_transfer_balance AND v_source_bal.relationship_id IS NOT NULL THEN
    v_transfer_amount := GREATEST(0, COALESCE(v_source_bal.balance_classes, 0));
  END IF;

  UPDATE public.coach_player_relationships
  SET status = 'ENDED', ended_at = v_now, updated_at = v_now, is_primary = false
  WHERE id = v_source_rel.id;

  IF v_transfer_amount > 0 THEN
    UPDATE public.coach_player_class_balances
    SET balance_classes = 0, updated_at = v_now
    WHERE relationship_id = v_source_rel.id;

    INSERT INTO public.coach_class_ledger (
      relationship_id, organizador_id, coach_id, jugador_id, delta, tipo, notas, idempotency_key, recorded_by, created_at
    ) VALUES (
      v_source_rel.id, p_organizador_id, p_from_coach_id, p_student_id, -v_transfer_amount, 'TRANSFER_OUT',
      'Transferencia por cambio de coach', v_trimmed_key, v_caller, v_now
    );
  END IF;

  INSERT INTO public.coach_player_relationships (
    organizador_id, coach_id, jugador_id, status, is_primary, created_at, updated_at
  ) VALUES (
    p_organizador_id, p_to_coach_id, p_student_id, 'ACTIVE', true, v_now, v_now
  ) ON CONFLICT (organizador_id, coach_id, jugador_id) DO UPDATE
  SET status = 'ACTIVE', ended_at = NULL, is_primary = true, updated_at = v_now
  RETURNING * INTO v_target_rel;

  INSERT INTO public.coach_player_class_balances (
    relationship_id, organizador_id, coach_id, jugador_id, balance_classes, total_classes_given, updated_at
  ) VALUES (
    v_target_rel.id, p_organizador_id, p_to_coach_id, p_student_id, v_transfer_amount, 0, v_now
  ) ON CONFLICT (relationship_id) DO UPDATE
  SET balance_classes = public.coach_player_class_balances.balance_classes + v_transfer_amount, updated_at = v_now
  RETURNING balance_classes INTO v_target_new_balance;

  IF v_transfer_amount > 0 THEN
    INSERT INTO public.coach_class_ledger (
      relationship_id, organizador_id, coach_id, jugador_id, delta, tipo, notas, idempotency_key, recorded_by, created_at
    ) VALUES (
      v_target_rel.id, p_organizador_id, p_to_coach_id, p_student_id, v_transfer_amount, 'TRANSFER_IN',
      'Recepción de saldo por cambio de coach', v_trimmed_key, v_caller, v_now
    );
  END IF;

  IF v_trimmed_key IS NOT NULL THEN
    INSERT INTO public.coach_reassignment_operations (
      idempotency_key, organizador_id, student_id, from_coach_id, to_coach_id, authorized_by,
      source_relationship_id, target_relationship_id, transferred_classes, target_new_balance, created_at
    ) VALUES (
      v_trimmed_key, p_organizador_id, p_student_id, p_from_coach_id, p_to_coach_id, v_caller,
      v_source_rel.id, v_target_rel.id, v_transfer_amount, v_target_new_balance, v_now
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'from_coach_id', p_from_coach_id,
    'to_coach_id', p_to_coach_id,
    'student_id', p_student_id,
    'target_relationship_id', v_target_rel.id,
    'transferred_classes', v_transfer_amount,
    'target_new_balance', v_target_new_balance,
    'idempotent', false,
    'message', 'Alumno reasignado exitosamente con transferencia de ' || v_transfer_amount || ' clases'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_student_coach(uuid, uuid, uuid, uuid, boolean, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_student_coach(uuid, uuid, uuid, uuid, boolean, text, text, integer) TO authenticated, service_role;

-- D) adjust_coach_student_classes
DROP FUNCTION IF EXISTS public.adjust_coach_student_classes(uuid, uuid, uuid, integer, text, uuid, text, integer);
DROP FUNCTION IF EXISTS public.adjust_coach_student_classes(uuid, uuid, uuid, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.adjust_coach_student_classes(uuid, uuid, integer, text, text);

CREATE OR REPLACE FUNCTION public.adjust_coach_student_classes(
  p_organizador_id uuid,
  p_coach_id uuid,
  p_student_id uuid,
  p_delta integer,
  p_motivo text,
  p_reference_ledger_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_expected_current_balance integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_trimmed_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_orig record;
  v_rel record;
  v_bal record;
  v_relationship_id uuid;
  v_cur_balance integer;
  v_new_balance integer;
  v_scheduled_count integer;
  v_existing_adj record;
  v_adj_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el administrador del club puede corregir saldos de clases.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = p_organizador_id AND coaching_enabled = true
  ) AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no tiene habilitado el módulo de Coaching.');
  END IF;

  IF v_trimmed_motivo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El motivo de la corrección es obligatorio.');
  END IF;

  IF p_delta IS NULL OR p_delta = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El ajuste debe ser una cantidad distinta de cero.');
  END IF;

  IF p_reference_ledger_id IS NOT NULL THEN
    SELECT *
    INTO v_orig
    FROM public.coach_class_ledger
    WHERE id = p_reference_ledger_id AND organizador_id = p_organizador_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Movimiento original referenciado no encontrado o no pertenece a este club.');
    END IF;

    IF v_orig.coach_id <> p_coach_id OR v_orig.jugador_id <> p_student_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'El movimiento referenciado no coincide con el entrenador y alumno especificados.');
    END IF;

    v_relationship_id := v_orig.relationship_id;
  ELSE
    SELECT id, status, coach_id, jugador_id
    INTO v_rel
    FROM public.coach_player_relationships
    WHERE organizador_id = p_organizador_id
      AND coach_id = p_coach_id
      AND jugador_id = p_student_id
    ORDER BY (status = 'ACTIVE') DESC, created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'No se encontró la asignación entre este alumno y el entrenador en el club.');
    END IF;

    v_relationship_id := v_rel.id;
  END IF;

  SELECT id, status, coach_id, jugador_id
  INTO v_rel
  FROM public.coach_player_relationships
  WHERE id = v_relationship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Relación coach-alumno no encontrada.');
  END IF;

  IF v_trimmed_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_adj
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
      IF v_existing_adj.recorded_by <> v_caller
         OR v_existing_adj.organizador_id <> p_organizador_id
         OR v_existing_adj.relationship_id <> v_relationship_id
         OR v_existing_adj.coach_id <> p_coach_id
         OR v_existing_adj.jugador_id <> p_student_id
         OR COALESCE(v_existing_adj.reference_ledger_id, '00000000-0000-0000-0000-000000000000'::uuid) <> COALESCE(p_reference_ledger_id, '00000000-0000-0000-0000-000000000000'::uuid)
         OR v_existing_adj.delta <> p_delta
         OR v_existing_adj.tipo <> 'ADJUSTMENT' THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de idempotencia: la clave ya fue utilizada en otra operación o con parámetros distintos.'
        );
      END IF;

      SELECT balance_classes INTO v_cur_balance
      FROM public.coach_player_class_balances
      WHERE relationship_id = v_relationship_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'adjustment_id', v_existing_adj.id,
        'delta', v_existing_adj.delta,
        'previous_balance', COALESCE(v_cur_balance, 0) - v_existing_adj.delta,
        'new_balance', COALESCE(v_cur_balance, 0),
        'message', 'Operación idempotente: la corrección ya fue registrada previamente.'
      );
    END IF;
  END IF;

  SELECT id, balance_classes, total_classes_given
  INTO v_bal
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_relationship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.coach_player_class_balances (
      relationship_id,
      organizador_id,
      coach_id,
      jugador_id,
      balance_classes,
      total_classes_given,
      updated_at
    ) VALUES (
      v_relationship_id,
      p_organizador_id,
      p_coach_id,
      p_student_id,
      0,
      0,
      v_now
    )
    RETURNING id, balance_classes, total_classes_given INTO v_bal;
  END IF;

  v_cur_balance := COALESCE(v_bal.balance_classes, 0);

  IF p_expected_current_balance IS NOT NULL AND p_expected_current_balance <> v_cur_balance THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El saldo actual en el servidor (' || v_cur_balance || ') difiere del saldo esperado (' || p_expected_current_balance || '). Por favor recarga e intenta de nuevo.',
      'current_balance', v_cur_balance
    );
  END IF;

  v_new_balance := v_cur_balance + p_delta;

  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No es posible aplicar esta corrección porque provocaría un saldo negativo (' || v_new_balance || '). Saldo actual disponible: ' || v_cur_balance || '.'
    );
  END IF;

  SELECT COUNT(*) INTO v_scheduled_count
  FROM public.coach_sessions
  WHERE relationship_id = v_relationship_id
    AND status = 'SCHEDULED';

  IF v_new_balance < v_scheduled_count THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No es posible aplicar esta corrección: el alumno tiene ' || v_scheduled_count || ' clase(s) agendada(s) pendiente(s). El nuevo saldo (' || v_new_balance || ') no puede ser menor que las reservas activas.'
    );
  END IF;

  UPDATE public.coach_player_class_balances
  SET balance_classes = v_new_balance,
      updated_at = v_now
  WHERE id = v_bal.id;

  INSERT INTO public.coach_class_ledger (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    delta,
    tipo,
    notas,
    idempotency_key,
    reference_ledger_id,
    recorded_by,
    created_at
  )
  VALUES (
    v_relationship_id,
    p_organizador_id,
    p_coach_id,
    p_student_id,
    p_delta,
    'ADJUSTMENT',
    'Corrección administrativa: ' || v_trimmed_motivo,
    v_trimmed_key,
    p_reference_ledger_id,
    v_caller,
    v_now
  )
  RETURNING id INTO v_adj_id;

  INSERT INTO public.coach_audit_log (
    actor_auth_user_id,
    action,
    entity_type,
    entity_id,
    payload,
    created_at
  )
  VALUES (
    v_caller,
    'CLASS_BALANCE_ADJUSTMENT',
    'coach_player_class_balances',
    v_relationship_id,
    jsonb_build_object(
      'coach_id', p_coach_id,
      'student_id', p_student_id,
      'reference_ledger_id', p_reference_ledger_id,
      'delta', p_delta,
      'previous_balance', v_cur_balance,
      'new_balance', v_new_balance,
      'pending_scheduled_classes', v_scheduled_count,
      'reason', v_trimmed_motivo
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'adjustment_id', v_adj_id,
    'delta', p_delta,
    'previous_balance', v_cur_balance,
    'new_balance', v_new_balance,
    'message', 'Saldo corregido exitosamente. Saldo anterior: ' || v_cur_balance || ' clases. Ajuste: ' || (CASE WHEN p_delta > 0 THEN '+' || p_delta ELSE p_delta::text END) || ' clases. Saldo actual: ' || v_new_balance || ' clases.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_coach_student_classes(uuid, uuid, uuid, integer, text, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_coach_student_classes(uuid, uuid, uuid, integer, text, uuid, text, integer) TO authenticated, service_role;

-- E) revert_coach_class_session
DROP FUNCTION IF EXISTS public.revert_coach_class_session(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.revert_coach_class_session(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.revert_coach_class_session(
  p_organizador_id uuid,
  p_session_id uuid,
  p_motivo text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_sess record;
  v_debit_ledger record;
  v_existing_adj record;
  v_bal record;
  v_new_balance integer;
  v_new_given integer;
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_trimmed_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_adj_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede revertir clases registradas por error.');
  END IF;

  IF v_trimmed_motivo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El motivo de la reversión es obligatorio.');
  END IF;

  SELECT *
  INTO v_sess
  FROM public.coach_sessions
  WHERE id = p_session_id AND organizador_id = p_organizador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no encontrada o no pertenece a este club.');
  END IF;

  IF v_sess.status <> 'COMPLETED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se pueden revertir sesiones que hayan sido marcadas como impartidas (COMPLETED).');
  END IF;

  SELECT *
  INTO v_debit_ledger
  FROM public.coach_class_ledger
  WHERE session_id = p_session_id AND tipo = 'CLASS_DEBIT'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se encontró el descuento de clase asociado a esta sesión en el ledger.');
  END IF;

  IF v_trimmed_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_adj
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
      IF v_existing_adj.recorded_by <> v_caller
         OR v_existing_adj.organizador_id <> p_organizador_id
         OR v_existing_adj.relationship_id <> v_sess.relationship_id
         OR v_existing_adj.reference_ledger_id <> v_debit_ledger.id
         OR v_existing_adj.tipo <> 'ADJUSTMENT'
         OR v_existing_adj.delta <> 1 THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de idempotencia: la clave ya fue utilizada en otra operación o con parámetros distintos.'
        );
      END IF;

      SELECT balance_classes, total_classes_given
      INTO v_bal
      FROM public.coach_player_class_balances
      WHERE relationship_id = v_sess.relationship_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'adjustment_id', v_existing_adj.id,
        'new_balance', COALESCE(v_bal.balance_classes, 0),
        'total_classes_given', COALESCE(v_bal.total_classes_given, 0),
        'message', 'Operación idempotente: la clase ya fue revertida previamente.'
      );
    END IF;
  END IF;

  IF v_sess.reverted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta clase ya fue revertida previamente el ' || to_char(v_sess.reverted_at, 'DD/MM/YYYY HH24:MI') || '. No se puede revertir dos veces.');
  END IF;

  SELECT *
  INTO v_bal
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_sess.relationship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo de clases no encontrado para esta relación.');
  END IF;

  v_new_balance := COALESCE(v_bal.balance_classes, 0) + 1;
  v_new_given := GREATEST(0, COALESCE(v_bal.total_classes_given, 0) - 1);

  UPDATE public.coach_player_class_balances
  SET balance_classes = v_new_balance,
      total_classes_given = v_new_given,
      updated_at = v_now
  WHERE id = v_bal.id;

  INSERT INTO public.coach_class_ledger (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    delta,
    tipo,
    notas,
    reference_ledger_id,
    idempotency_key,
    recorded_by,
    created_at
  )
  VALUES (
    v_sess.relationship_id,
    p_organizador_id,
    v_sess.coach_id,
    v_sess.jugador_id,
    1,
    'ADJUSTMENT',
    'Reversión de clase impartida: ' || v_trimmed_motivo,
    v_debit_ledger.id,
    v_trimmed_key,
    v_caller,
    v_now
  )
  RETURNING id INTO v_adj_id;

  UPDATE public.coach_sessions
  SET reverted_at = v_now,
      cancellation_reason = 'Revertida: ' || v_trimmed_motivo,
      updated_at = v_now
  WHERE id = p_session_id;

  INSERT INTO public.coach_audit_log (
    actor_auth_user_id,
    action,
    entity_type,
    entity_id,
    payload,
    created_at
  )
  VALUES (
    v_caller,
    'CLASS_SESSION_REVERTED',
    'coach_sessions',
    p_session_id,
    jsonb_build_object(
      'debit_ledger_id', v_debit_ledger.id,
      'adjustment_ledger_id', v_adj_id,
      'previous_balance', v_bal.balance_classes,
      'new_balance', v_new_balance,
      'previous_given', v_bal.total_classes_given,
      'new_given', v_new_given,
      'reason', v_trimmed_motivo
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'adjustment_id', v_adj_id,
    'new_balance', v_new_balance,
    'total_classes_given', v_new_given,
    'message', 'Clase impartida revertida correctamente. Se restauró 1 clase disponible al alumno.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revert_coach_class_session(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_coach_class_session(uuid, uuid, text, text) TO authenticated, service_role;

-- F) schedule_coach_class
DROP FUNCTION IF EXISTS public.schedule_coach_class(uuid, uuid, uuid, timestamptz, integer, text, text, text, text);
DROP FUNCTION IF EXISTS public.schedule_coach_class(uuid, uuid, uuid, timestamptz, integer, text, text, text);

CREATE OR REPLACE FUNCTION public.schedule_coach_class(
  p_organizador_id uuid,
  p_coach_id uuid,
  p_student_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer DEFAULT 60,
  p_court text DEFAULT NULL,
  p_focus text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_rel record;
  v_membership record;
  v_bal record;
  v_existing_session record;
  v_session_id uuid;
  v_duration integer;
  v_ends_at timestamptz;
  v_scheduled_count integer;
  v_available_to_schedule integer;
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_trimmed_court text := NULLIF(btrim(COALESCE(p_court, '')), '');
  v_trimmed_focus text := NULLIF(btrim(COALESCE(p_focus, '')), '');
  v_trimmed_notes text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede agendar clases.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = p_organizador_id AND coaching_enabled = true
  ) AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no tiene habilitado el módulo de Coaching.');
  END IF;

  IF p_starts_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La fecha y hora de inicio son requeridas.');
  END IF;

  v_duration := COALESCE(p_duration_minutes, 60);
  IF v_duration < 15 OR v_duration > 360 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La duración debe estar entre 15 y 360 minutos.');
  END IF;

  v_ends_at := p_starts_at + (v_duration || ' minutes')::interval;

  SELECT *
  INTO v_membership
  FROM public.coach_club_memberships
  WHERE organizador_id = p_organizador_id AND coach_id = p_coach_id;

  IF NOT FOUND OR v_membership.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El coach no tiene una membresía activa en este club.');
  END IF;

  SELECT *
  INTO v_rel
  FROM public.coach_player_relationships
  WHERE organizador_id = p_organizador_id
    AND coach_id = p_coach_id
    AND jugador_id = p_student_id
  ORDER BY (status = 'ACTIVE') DESC, created_at DESC
  LIMIT 1;

  IF NOT FOUND OR v_rel.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No existe una relación activa entre el coach y el alumno en este club.');
  END IF;

  IF v_trimmed_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_session
    FROM public.coach_sessions
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
      IF v_existing_session.organizador_id <> p_organizador_id
         OR v_existing_session.coach_id <> p_coach_id
         OR v_existing_session.jugador_id <> p_student_id
         OR v_existing_session.starts_at <> p_starts_at
         OR v_existing_session.duration_minutes <> v_duration THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de idempotencia: la clave ya fue utilizada con parámetros distintos.'
        );
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'session_id', v_existing_session.id,
        'starts_at', v_existing_session.starts_at,
        'ends_at', v_existing_session.ends_at,
        'duration_minutes', v_existing_session.duration_minutes,
        'court', v_existing_session.court,
        'message', 'Operación idempotente: la clase ya fue agendada previamente.'
      );
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('coach_schedule:' || p_coach_id::text)::bigint);
  PERFORM pg_advisory_xact_lock(hashtext('student_schedule:' || p_student_id::text)::bigint);
  IF v_trimmed_court IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('court_schedule:' || p_organizador_id::text || ':' || lower(v_trimmed_court))::bigint);
  END IF;

  SELECT id, balance_classes INTO v_bal
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_rel.id
  FOR UPDATE;

  SELECT COUNT(*) INTO v_scheduled_count
  FROM public.coach_sessions
  WHERE relationship_id = v_rel.id
    AND status = 'SCHEDULED';

  v_available_to_schedule := COALESCE(v_bal.balance_classes, 0) - v_scheduled_count;

  IF v_available_to_schedule <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El alumno no cuenta con clases disponibles suficientes para agendar. Saldo contratado: ' || COALESCE(v_bal.balance_classes, 0) || ', clases ya reservadas pendientes: ' || v_scheduled_count || '. Asigna o abona más clases antes de agendar.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_sessions
    WHERE coach_id = p_coach_id
      AND status = 'SCHEDULED'
      AND tstzrange(starts_at, ends_at) && tstzrange(p_starts_at, v_ends_at)
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El entrenador ya tiene otra clase agendada que se solapa con este horario.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_sessions
    WHERE jugador_id = p_student_id
      AND status = 'SCHEDULED'
      AND tstzrange(starts_at, ends_at) && tstzrange(p_starts_at, v_ends_at)
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El alumno ya tiene otra clase agendada que se solapa con este horario.'
    );
  END IF;

  IF v_trimmed_court IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.coach_sessions
      WHERE organizador_id = p_organizador_id
        AND lower(btrim(court)) = lower(v_trimmed_court)
        AND status = 'SCHEDULED'
        AND tstzrange(starts_at, ends_at) && tstzrange(p_starts_at, v_ends_at)
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'La cancha "' || v_trimmed_court || '" ya está reservada para otra clase en este club durante ese horario.'
      );
    END IF;
  END IF;

  INSERT INTO public.coach_sessions (
    coach_id,
    relationship_id,
    organizador_id,
    jugador_id,
    starts_at,
    ends_at,
    duration_minutes,
    court,
    focus,
    notes_summary,
    status,
    worked_on,
    idempotency_key,
    created_at,
    updated_at
  )
  VALUES (
    p_coach_id,
    v_rel.id,
    p_organizador_id,
    p_student_id,
    p_starts_at,
    v_ends_at,
    v_duration,
    v_trimmed_court,
    v_trimmed_focus,
    v_trimmed_notes,
    'SCHEDULED',
    '{}',
    v_trimmed_key,
    v_now,
    v_now
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.coach_audit_log (
    actor_auth_user_id,
    action,
    entity_type,
    entity_id,
    payload,
    created_at
  )
  VALUES (
    v_caller,
    'CLASS_SCHEDULED',
    'coach_sessions',
    v_session_id,
    jsonb_build_object(
      'coach_id', p_coach_id,
      'student_id', p_student_id,
      'starts_at', p_starts_at,
      'ends_at', v_ends_at,
      'duration_minutes', v_duration,
      'court', v_trimmed_court,
      'remaining_reservable', (v_available_to_schedule - 1)
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'session_id', v_session_id,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'duration_minutes', v_duration,
    'court', v_trimmed_court,
    'remaining_reservable', (v_available_to_schedule - 1),
    'message', 'Clase agendada exitosamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_coach_class(uuid, uuid, uuid, timestamptz, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_coach_class(uuid, uuid, uuid, timestamptz, integer, text, text, text, text) TO authenticated, service_role;

-- G) reschedule_coach_class
DROP FUNCTION IF EXISTS public.reschedule_coach_class(uuid, uuid, timestamptz, integer, text, text);

CREATE OR REPLACE FUNCTION public.reschedule_coach_class(
  p_organizador_id uuid,
  p_session_id uuid,
  p_new_starts_at timestamptz,
  p_duration_minutes integer DEFAULT NULL,
  p_court text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_sess record;
  v_duration integer;
  v_new_ends_at timestamptz;
  v_effective_court text;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede reprogramar clases.');
  END IF;

  IF p_new_starts_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La nueva fecha y hora son requeridas.');
  END IF;

  SELECT *
  INTO v_sess
  FROM public.coach_sessions
  WHERE id = p_session_id AND organizador_id = p_organizador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no encontrada o no pertenece a este club.');
  END IF;

  IF v_sess.status <> 'SCHEDULED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se pueden reprogramar clases en estado programada (SCHEDULED). Estado actual: ' || v_sess.status || '.');
  END IF;

  v_duration := COALESCE(p_duration_minutes, v_sess.duration_minutes, 60);
  v_new_ends_at := p_new_starts_at + (v_duration || ' minutes')::interval;
  v_effective_court := COALESCE(NULLIF(btrim(COALESCE(p_court, '')), ''), v_sess.court);

  PERFORM pg_advisory_xact_lock(hashtext('coach_schedule:' || v_sess.coach_id::text)::bigint);
  PERFORM pg_advisory_xact_lock(hashtext('student_schedule:' || v_sess.jugador_id::text)::bigint);
  IF v_effective_court IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('court_schedule:' || p_organizador_id::text || ':' || lower(v_effective_court))::bigint);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_sessions
    WHERE coach_id = v_sess.coach_id
      AND id <> p_session_id
      AND status = 'SCHEDULED'
      AND tstzrange(starts_at, ends_at) && tstzrange(p_new_starts_at, v_new_ends_at)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador ya tiene otra clase agendada en ese horario.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_sessions
    WHERE jugador_id = v_sess.jugador_id
      AND id <> p_session_id
      AND status = 'SCHEDULED'
      AND tstzrange(starts_at, ends_at) && tstzrange(p_new_starts_at, v_new_ends_at)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El alumno ya tiene otra clase agendada en ese horario.');
  END IF;

  IF v_effective_court IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.coach_sessions
      WHERE organizador_id = p_organizador_id
        AND id <> p_session_id
        AND lower(btrim(court)) = lower(v_effective_court)
        AND status = 'SCHEDULED'
        AND tstzrange(starts_at, ends_at) && tstzrange(p_new_starts_at, v_new_ends_at)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La cancha "' || v_effective_court || '" ya está reservada en ese horario.');
    END IF;
  END IF;

  UPDATE public.coach_sessions
  SET starts_at = p_new_starts_at,
      ends_at = v_new_ends_at,
      duration_minutes = v_duration,
      court = v_effective_court,
      notes_summary = CASE
        WHEN p_reason IS NOT NULL AND btrim(p_reason) <> ''
        THEN COALESCE(notes_summary || ' | ', '') || 'Reprogramada: ' || btrim(p_reason)
        ELSE notes_summary
      END,
      updated_at = v_now
  WHERE id = p_session_id;

  INSERT INTO public.coach_audit_log (
    actor_auth_user_id,
    action,
    entity_type,
    entity_id,
    payload,
    created_at
  )
  VALUES (
    v_caller,
    'CLASS_RESCHEDULED',
    'coach_sessions',
    p_session_id,
    jsonb_build_object(
      'previous_starts_at', v_sess.starts_at,
      'new_starts_at', p_new_starts_at,
      'duration_minutes', v_duration,
      'court', v_effective_court,
      'reason', p_reason
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'starts_at', p_new_starts_at,
    'ends_at', v_new_ends_at,
    'duration_minutes', v_duration,
    'court', v_effective_court,
    'message', 'Clase reprogramada exitosamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_coach_class(uuid, uuid, timestamptz, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_coach_class(uuid, uuid, timestamptz, integer, text, text) TO authenticated, service_role;

-- H) cancel_coach_class
DROP FUNCTION IF EXISTS public.cancel_coach_class(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.cancel_coach_class(
  p_organizador_id uuid,
  p_session_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_sess record;
  v_trimmed_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede cancelar clases.');
  END IF;

  IF v_trimmed_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El motivo de cancelación es obligatorio.');
  END IF;

  SELECT *
  INTO v_sess
  FROM public.coach_sessions
  WHERE id = p_session_id AND organizador_id = p_organizador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no encontrada o no pertenece a este club.');
  END IF;

  IF v_sess.status <> 'SCHEDULED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se pueden cancelar clases en estado programada (SCHEDULED). Estado actual: ' || v_sess.status || '.');
  END IF;

  UPDATE public.coach_sessions
  SET status = 'CANCELLED',
      cancellation_reason = v_trimmed_reason,
      updated_at = v_now
  WHERE id = p_session_id;

  INSERT INTO public.coach_audit_log (
    actor_auth_user_id,
    action,
    entity_type,
    entity_id,
    payload,
    created_at
  )
  VALUES (
    v_caller,
    'CLASS_CANCELLED',
    'coach_sessions',
    p_session_id,
    jsonb_build_object(
      'coach_id', v_sess.coach_id,
      'student_id', v_sess.jugador_id,
      'starts_at', v_sess.starts_at,
      'court', v_sess.court,
      'reason', v_trimmed_reason
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'status', 'CANCELLED',
    'message', 'Clase cancelada exitosamente. El cupo de reserva ha sido liberado.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_coach_class(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_coach_class(uuid, uuid, text) TO authenticated, service_role;

-- 10. get_student_coaching_overview CON FILTRO DE IS_ACTIVE POR CLUB (MULTICLUB RESILIENTE)
DROP FUNCTION IF EXISTS public.get_student_coaching_overview();

CREATE OR REPLACE FUNCTION public.get_student_coaching_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_email_confirmed_at timestamptz;
  v_verified_jugador_ids uuid[] := '{}';
  v_active_org_ids uuid[] := '{}';
  v_official_keys uuid[] := '{}';
  v_user_riviera_id text;
  v_results jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autenticado.');
  END IF;

  -- Comprobar si el alumno está desactivado en todos los clubes donde tiene vínculo
  IF EXISTS (
    SELECT 1 FROM public.coach_student_account_links
    WHERE auth_user_id = v_caller AND is_active = false
  ) AND NOT EXISTS (
    SELECT 1 FROM public.coach_student_account_links
    WHERE auth_user_id = v_caller AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'linked', false,
      'is_deactivated', true,
      'message', 'Tu acceso a Riviera Coaching ha sido desactivado temporalmente por tu club. Consulta con la administración de tu club.'
    );
  END IF;

  SELECT lower(btrim(email)), email_confirmed_at
  INTO v_caller_email, v_email_confirmed_at
  FROM auth.users
  WHERE id = v_caller;

  -- Identidades verificadas explícitas activas y lista de organizadores activos
  SELECT
    COALESCE(array_agg(DISTINCT jugador_id), '{}'),
    COALESCE(array_agg(DISTINCT organizador_id), '{}')
  INTO v_verified_jugador_ids, v_active_org_ids
  FROM public.coach_student_account_links
  WHERE auth_user_id = v_caller AND is_active = true;

  -- Agregar vínculos de rewards si los hubiera
  SELECT COALESCE(array_agg(DISTINCT jugador_id), '{}') || v_verified_jugador_ids
  INTO v_verified_jugador_ids
  FROM public.rewards_player_links
  WHERE auth_user_id = v_caller;

  -- Fallback de match de correo exacto (solo confirmado)
  IF (v_verified_jugador_ids IS NULL OR array_length(v_verified_jugador_ids, 1) IS NULL)
     AND v_caller_email IS NOT NULL AND v_caller_email <> ''
     AND v_email_confirmed_at IS NOT NULL THEN

    SELECT COALESCE(array_agg(id), '{}')
    INTO v_verified_jugador_ids
    FROM public.riviera_jugadores
    WHERE lower(btrim(email)) = v_caller_email;

    IF array_length(v_verified_jugador_ids, 1) > 1 THEN
      v_verified_jugador_ids := '{}';
    END IF;
  END IF;

  IF v_verified_jugador_ids IS NULL OR array_length(v_verified_jugador_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'linked', false,
      'message', 'Tu cuenta no tiene una credencial oficial de jugador vinculada.',
      'relationships', '[]'::jsonb
    );
  END IF;

  -- Expansión canónica por clave oficial
  SELECT COALESCE(array_agg(DISTINCT official_player_key), '{}')
  INTO v_official_keys
  FROM public.riviera_official_player_identity
  WHERE canonical_riviera_jugador_id = ANY(v_verified_jugador_ids);

  IF v_official_keys IS NOT NULL AND array_length(v_official_keys, 1) > 0 THEN
    SELECT COALESCE(array_agg(DISTINCT canonical_riviera_jugador_id), v_verified_jugador_ids)
    INTO v_verified_jugador_ids
    FROM public.riviera_official_player_identity
    WHERE official_player_key = ANY(v_official_keys);
  END IF;

  SELECT riviera_id INTO v_user_riviera_id
  FROM public.riviera_official_player_identity
  WHERE canonical_riviera_jugador_id = ANY(v_verified_jugador_ids)
  LIMIT 1;

  -- Construir resumen con privacidad estricta y multiclub independiente
  -- Excluye relaciones con clubes donde el acceso esté desactivado explícitamente para este usuario
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relationship_id', r.id,
      'status', r.status,
      'is_primary', (r.status = 'ACTIVE' AND r.is_primary),
      'started_at', r.started_at,
      'ended_at', r.ended_at,
      'club', jsonb_build_object(
        'organizador_id', r.organizador_id,
        'nombre', COALESCE(u.name, ogm.branding_key, 'Club Riviera'),
        'branding_key', ogm.branding_key
      ),
      'coach', jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'coach_code', c.coach_code,
        'foto_url', c.foto_url,
        'especialidades', c.especialidades
      ),
      'player', jsonb_build_object(
        'id', rj.id,
        'nombre', rj.nombre,
        'foto_url', rj.foto_url,
        'riviera_id', COALESCE(
          (SELECT i.riviera_id FROM public.riviera_official_player_identity i 
           WHERE i.canonical_riviera_jugador_id = rj.id LIMIT 1),
          v_user_riviera_id
        ),
        'rivieraId', COALESCE(
          (SELECT i.riviera_id FROM public.riviera_official_player_identity i 
           WHERE i.canonical_riviera_jugador_id = rj.id LIMIT 1),
          v_user_riviera_id
        )
      ),
      'balance', jsonb_build_object(
        'balance_classes', COALESCE(b.balance_classes, 0),
        'total_classes_given', COALESCE(b.total_classes_given, 0),
        'updated_at', b.updated_at
      ),
      'upcoming_sessions', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', sch.id,
            'starts_at', sch.starts_at,
            'ends_at', sch.ends_at,
            'duration_minutes', sch.duration_minutes,
            'court', sch.court,
            'focus', sch.focus,
            'status', sch.status
          ) ORDER BY sch.starts_at ASC
        )
        FROM public.coach_sessions sch
        WHERE sch.relationship_id = r.id
          AND sch.status = 'SCHEDULED'
          AND sch.starts_at >= now() - interval '2 hours'
      ), '[]'::jsonb),
      'ledger', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'delta', l.delta,
            'tipo', l.tipo,
            'created_at', l.created_at,
            'session', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
              'id', s.id,
              'starts_at', s.starts_at,
              'duration_minutes', s.duration_minutes,
              'court', s.court,
              'focus', s.focus,
              'worked_on', s.worked_on,
              'improvements', s.improvements,
              'next_goals', s.next_goals,
              'motivational_message', s.motivational_message
            ) ELSE NULL END
          ) ORDER BY l.created_at DESC
        )
        FROM (
          SELECT id, delta, tipo, created_at, session_id
          FROM public.coach_class_ledger
          WHERE relationship_id = r.id
          ORDER BY created_at DESC
          LIMIT 50
        ) l
        LEFT JOIN public.coach_sessions s ON s.id = l.session_id
      ), '[]'::jsonb)
    ) ORDER BY (CASE WHEN r.status = 'ACTIVE' THEN 0 WHEN r.status = 'PAUSED' THEN 1 ELSE 2 END), r.is_primary DESC, r.created_at DESC
  ), '[]'::jsonb)
  INTO v_results
  FROM public.coach_player_relationships r
  JOIN public.riviera_coaches c ON c.id = r.coach_id
  JOIN public.riviera_jugadores rj ON rj.id = r.jugador_id
  LEFT JOIN public.users u ON u.id = r.organizador_id
  LEFT JOIN public.organizador_game_modes ogm ON ogm.organizador_id = r.organizador_id
  LEFT JOIN public.coach_player_class_balances b ON b.relationship_id = r.id
  WHERE r.jugador_id = ANY(v_verified_jugador_ids)
    AND r.status IN ('ACTIVE', 'PAUSED', 'ENDED')
    -- Asegurar que el club no haya desactivado el acceso para este usuario
    AND NOT EXISTS (
      SELECT 1 FROM public.coach_student_account_links al
      WHERE al.organizador_id = r.organizador_id
        AND al.auth_user_id = v_caller
        AND al.is_active = false
    );

  RETURN jsonb_build_object(
    'ok', true,
    'linked', true,
    'riviera_id', v_user_riviera_id,
    'rivieraId', v_user_riviera_id,
    'relationships', COALESCE(v_results, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_coaching_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_coaching_overview() TO authenticated, service_role;
