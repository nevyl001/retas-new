-- ==============================================================================
-- 0068_coaching_student_identity_hardening.sql
-- Riviera Coaching — Endurecimiento Definitivo de Identidad y Seguridad del Alumno
-- ==============================================================================

-- 1. TABLA DEDICADA PARA VÍNCULOS DE IDENTIDAD DE COACHING (Aislamiento de Rewards)
-- Evita mutar o reutilizar rewards_player_links para operaciones de Coaching.
CREATE TABLE IF NOT EXISTS public.coach_student_account_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organizador_id uuid NOT NULL,
  verification_method text NOT NULL CHECK (verification_method IN ('CLUB_ADMIN', 'VERIFIED_EMAIL_MATCH')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_student_account_links_jugador_uq UNIQUE (jugador_id),
  CONSTRAINT coach_student_account_links_auth_org_uq UNIQUE (organizador_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_student_links_auth_user
  ON public.coach_student_account_links(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_coach_student_links_org
  ON public.coach_student_account_links(organizador_id);

-- RLS en coach_student_account_links
ALTER TABLE public.coach_student_account_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS csal_select ON public.coach_student_account_links;
CREATE POLICY csal_select ON public.coach_student_account_links
  FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  );

GRANT SELECT ON public.coach_student_account_links TO authenticated;
GRANT ALL ON public.coach_student_account_links TO service_role;

-- 2. POLÍTICAS RLS ACTUALIZADAS EN BALANCES Y LEDGER (Alumnos con titularidad verificada)
DROP POLICY IF EXISTS cpcb_student_select ON public.coach_player_class_balances;
CREATE POLICY cpcb_student_select ON public.coach_player_class_balances
  FOR SELECT
  TO authenticated
  USING (
    jugador_id IN (
      SELECT csl.jugador_id FROM public.coach_student_account_links csl WHERE csl.auth_user_id = auth.uid()
      UNION
      SELECT rpl.jugador_id FROM public.rewards_player_links rpl WHERE rpl.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ccl_student_select ON public.coach_class_ledger;
CREATE POLICY ccl_student_select ON public.coach_class_ledger
  FOR SELECT
  TO authenticated
  USING (
    jugador_id IN (
      SELECT csl.jugador_id FROM public.coach_student_account_links csl WHERE csl.auth_user_id = auth.uid()
      UNION
      SELECT rpl.jugador_id FROM public.rewards_player_links rpl WHERE rpl.auth_user_id = auth.uid()
    )
  );

-- 3. VINCULACIÓN AUTORIZADA POR EL ADMINISTRADOR DEL CLUB
-- Permite al club vincular a un alumno que no tiene correo registrado o cuyo correo requiera validación directa.
CREATE OR REPLACE FUNCTION public.link_coach_student_by_club(
  p_organizador_id uuid,
  p_jugador_id uuid,
  p_student_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_target_user record;
  v_jugador record;
  v_existing_link record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el administrador del club puede autorizar la vinculación de alumnos.');
  END IF;

  -- Verificar que el jugador pertenezca al club
  SELECT id, nombre, email, organizador_id INTO v_jugador
  FROM public.riviera_jugadores
  WHERE id = p_jugador_id AND organizador_id = p_organizador_id;

  IF v_jugador.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El alumno no pertenece a este club.');
  END IF;

  -- Buscar cuenta de usuario por correo verificado
  SELECT id, email, email_confirmed_at INTO v_target_user
  FROM auth.users
  WHERE lower(btrim(email)) = lower(btrim(p_student_email));

  IF v_target_user.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No existe una cuenta registrada con ese correo electrónico.');
  END IF;

  IF v_target_user.email_confirmed_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta del alumno no ha confirmado su correo electrónico.');
  END IF;

  -- Comprobar si el jugador ya está vinculado a otra cuenta en Coaching
  SELECT auth_user_id, organizador_id INTO v_existing_link
  FROM public.coach_student_account_links
  WHERE jugador_id = p_jugador_id;

  IF v_existing_link.auth_user_id IS NOT NULL THEN
    IF v_existing_link.auth_user_id = v_target_user.id THEN
      RETURN jsonb_build_object('ok', true, 'message', 'Alumno ya vinculado previamente.', 'jugador_id', p_jugador_id, 'nombre', v_jugador.nombre);
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Este perfil deportivo ya se encuentra vinculado a otra cuenta de usuario.');
    END IF;
  END IF;

  -- Comprobar si el jugador ya está asociado a otra cuenta en Rewards
  SELECT auth_user_id INTO v_existing_link
  FROM public.rewards_player_links
  WHERE jugador_id = p_jugador_id;

  IF v_existing_link.auth_user_id IS NOT NULL AND v_existing_link.auth_user_id <> v_target_user.id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este perfil deportivo ya se encuentra asociado a otra cuenta en el sistema.');
  END IF;

  -- Insertar vínculo con verificación autorizada de club
  INSERT INTO public.coach_student_account_links (
    jugador_id,
    auth_user_id,
    organizador_id,
    verification_method
  ) VALUES (
    p_jugador_id,
    v_target_user.id,
    p_organizador_id,
    'CLUB_ADMIN'
  )
  ON CONFLICT (jugador_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'jugador_id', p_jugador_id,
    'auth_user_id', v_target_user.id,
    'nombre', v_jugador.nombre,
    'message', 'Alumno vinculado exitosamente por el club.'
  );
END;
$$;

-- 4. VINCULACIÓN AUTOSERVICIO POR RIVIERA ID CON GUARDAS ESTRICTAS DE SEGURIDAD
-- Impide reclamar perfiles por simple conocimiento de ID, rechaza cuentas no verificadas,
-- y jamás sobrescribe titularidad ni muta riviera_jugadores ni rewards_player_links.
CREATE OR REPLACE FUNCTION public.link_student_by_riviera_id(
  p_riviera_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_email_confirmed_at timestamptz;
  v_norm_id text := upper(btrim(COALESCE(p_riviera_id, '')));
  v_jugador record;
  v_existing_auth uuid;
  v_email_collision_count integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_norm_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El Riviera ID es requerido.');
  END IF;

  IF v_norm_id !~ '^RIV-[0-9]{5,8}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Formato de Riviera ID inválido. Debe tener la estructura RIV-########'
    );
  END IF;

  -- Obtener correo confirmado del usuario llamante
  SELECT lower(btrim(email)), email_confirmed_at
  INTO v_caller_email, v_email_confirmed_at
  FROM auth.users
  WHERE id = v_caller;

  IF v_caller_email IS NULL OR v_caller_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tu cuenta no tiene un correo electrónico válido registrado.');
  END IF;

  IF v_email_confirmed_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Tu cuenta de correo no ha sido verificada. Confirma tu correo antes de vincular tu credencial.'
    );
  END IF;

  -- Buscar perfil deportivo canónico por Riviera ID
  SELECT rj.id, rj.nombre, rj.email, rj.organizador_id, i.riviera_id
  INTO v_jugador
  FROM public.riviera_official_player_identity i
  JOIN public.riviera_jugadores rj ON rj.id = i.canonical_riviera_jugador_id
  WHERE upper(btrim(i.riviera_id)) = v_norm_id
  LIMIT 1;

  IF v_jugador.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No se encontró un perfil deportivo oficial con ese Riviera ID.'
    );
  END IF;

  -- REGLA DE SEGURIDAD 1: Si ya está vinculado a otro usuario, NUNCA reemplazar propietario (Anti-hijack)
  SELECT auth_user_id INTO v_existing_auth
  FROM public.coach_student_account_links
  WHERE jugador_id = v_jugador.id;

  IF v_existing_auth IS NOT NULL THEN
    IF v_existing_auth = v_caller THEN
      RETURN jsonb_build_object(
        'ok', true,
        'jugador_id', v_jugador.id,
        'nombre', v_jugador.nombre,
        'riviera_id', v_jugador.riviera_id,
        'message', 'Perfil ya vinculado previamente.'
      );
    ELSE
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Este perfil ya se encuentra vinculado a otra cuenta de usuario. No se puede transferir sin autorización del club.'
      );
    END IF;
  END IF;

  -- Comprobar si está asociado a otro usuario en Rewards
  SELECT auth_user_id INTO v_existing_auth
  FROM public.rewards_player_links
  WHERE jugador_id = v_jugador.id;

  IF v_existing_auth IS NOT NULL AND v_existing_auth <> v_caller THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Este perfil ya se encuentra asociado a otra cuenta en el sistema.'
    );
  END IF;

  -- REGLA DE SEGURIDAD 2: Si el perfil deportivo NO tiene correo registrado en el club,
  -- NO se puede reclamar por el cliente; exige vinculación autorizada del club.
  IF v_jugador.email IS NULL OR btrim(v_jugador.email) = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Este perfil no cuenta con correo registrado por el club. Por seguridad, solicita a la administración de tu club la vinculación autorizada de tu cuenta.'
    );
  END IF;

  -- REGLA DE SEGURIDAD 3: El correo registrado en el club DEBE coincidir con el correo verificado del usuario
  IF lower(btrim(v_jugador.email)) <> v_caller_email THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El correo de tu cuenta no coincide con el registrado en el club para este Riviera ID.'
    );
  END IF;

  -- REGLA DE SEGURIDAD 4: Colisión de correos en el mismo club (dos personas con mismo correo)
  SELECT count(*) INTO v_email_collision_count
  FROM public.riviera_jugadores
  WHERE organizador_id = v_jugador.organizador_id
    AND lower(btrim(email)) = v_caller_email
    AND estado = 'activo';

  IF v_email_collision_count > 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Existen múltiples perfiles con este correo en el club. Solicita a tu club una vinculación autorizada individual para evitar ambigüedades.'
    );
  END IF;

  -- Registrar vínculo EXCLUSIVAMENTE en coach_student_account_links (sin tocar rewards_player_links)
  INSERT INTO public.coach_student_account_links (
    jugador_id, auth_user_id, organizador_id, verification_method
  ) VALUES (
    v_jugador.id, v_caller, v_jugador.organizador_id, 'VERIFIED_EMAIL_MATCH'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'jugador_id', v_jugador.id,
    'nombre', v_jugador.nombre,
    'riviera_id', v_jugador.riviera_id,
    'message', 'Perfil deportivo vinculado exitosamente.'
  );
END;
$$;

-- 5. EXPERIENCIA DEL ALUMNO: GET_STUDENT_COACHING_OVERVIEW 100% DE LECTURA Y PROTEGIDA
-- Cero mutaciones, titularidad verificada, y expansión multiclub hermética contra filtraciones.
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
  v_official_keys uuid[] := '{}';
  v_user_riviera_id text;
  v_results jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT lower(btrim(email)), email_confirmed_at
  INTO v_caller_email, v_email_confirmed_at
  FROM auth.users
  WHERE id = v_caller;

  -- 1. Perfiles vinculados expresamente en Coaching
  SELECT COALESCE(array_agg(DISTINCT cand.j_id), '{}'::uuid[])
  INTO v_verified_jugador_ids
  FROM (
    SELECT jugador_id AS j_id
    FROM public.coach_student_account_links
    WHERE auth_user_id = v_caller

    UNION

    -- 2. Perfiles vinculados expresamente en Rewards (lectura de compatibilidad)
    SELECT jugador_id AS j_id
    FROM public.rewards_player_links
    WHERE auth_user_id = v_caller

    UNION

    -- 3. Coincidencia estricta con correo verificado (sin colisión y sin conflicto con otro usuario)
    SELECT rj.id AS j_id
    FROM public.riviera_jugadores rj
    WHERE v_email_confirmed_at IS NOT NULL
      AND v_caller_email IS NOT NULL
      AND v_caller_email <> ''
      AND lower(btrim(rj.email)) = v_caller_email
      AND rj.estado = 'activo'
      AND NOT EXISTS (
        SELECT 1 FROM public.coach_student_account_links csl
        WHERE csl.jugador_id = rj.id AND csl.auth_user_id <> v_caller
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.rewards_player_links rpl
        WHERE rpl.jugador_id = rj.id AND rpl.auth_user_id <> v_caller
      )
      -- Excluir si hay más de 1 perfil con este correo en el mismo club (colisión no resuelta)
      AND (
        SELECT count(*) FROM public.riviera_jugadores dup
        WHERE dup.organizador_id = rj.organizador_id
          AND lower(btrim(dup.email)) = v_caller_email
          AND dup.estado = 'activo'
      ) = 1
  ) cand;

  -- Expansión multiclub: perfiles hermanos NO vinculados a otro usuario
  SELECT COALESCE(array_agg(DISTINCT k.official_key), '{}'::uuid[])
  INTO v_official_keys
  FROM (
    SELECT public._resolve_official_player_key(j_id) AS official_key
    FROM unnest(v_verified_jugador_ids) AS j_id
    WHERE public._resolve_official_player_key(j_id) IS NOT NULL
  ) k;

  IF array_length(v_official_keys, 1) > 0 THEN
    SELECT COALESCE(array_agg(DISTINCT exp.j_id), v_verified_jugador_ids)
    INTO v_verified_jugador_ids
    FROM (
      SELECT unnest(v_verified_jugador_ids) AS j_id
      UNION
      SELECT i.canonical_riviera_jugador_id AS j_id
      FROM public.riviera_official_player_identity i
      WHERE i.official_player_key = ANY(v_official_keys)
        AND NOT EXISTS (
          SELECT 1 FROM public.coach_student_account_links csl
          WHERE csl.jugador_id = i.canonical_riviera_jugador_id AND csl.auth_user_id <> v_caller
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.rewards_player_links rpl
          WHERE rpl.jugador_id = i.canonical_riviera_jugador_id AND rpl.auth_user_id <> v_caller
        )
      UNION
      SELECT l.riviera_jugador_id AS j_id
      FROM public.riviera_official_player_profile_link l
      WHERE l.official_player_key = ANY(v_official_keys)
        AND NOT EXISTS (
          SELECT 1 FROM public.coach_student_account_links csl
          WHERE csl.jugador_id = l.riviera_jugador_id AND csl.auth_user_id <> v_caller
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.rewards_player_links rpl
          WHERE rpl.jugador_id = l.riviera_jugador_id AND rpl.auth_user_id <> v_caller
        )
    ) exp;
  END IF;

  -- Resolver Riviera ID del alumno
  SELECT i.riviera_id INTO v_user_riviera_id
  FROM public.riviera_official_player_identity i
  WHERE i.canonical_riviera_jugador_id = ANY(v_verified_jugador_ids)
     OR i.official_player_key = ANY(v_official_keys)
  ORDER BY i.created_at ASC
  LIMIT 1;

  -- Si no hay perfiles verificados para este usuario, retornar estado limpio
  IF array_length(v_verified_jugador_ids, 1) IS NULL OR array_length(v_verified_jugador_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'linked', false,
      'riviera_id', NULL,
      'relationships', '[]'::jsonb
    );
  END IF;

  -- Construir resumen
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relationship_id', r.id,
      'status', r.status,
      'is_primary', r.is_primary,
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
        'riviera_id', COALESCE(
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
      'ledger', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'delta', l.delta,
            'tipo', l.tipo,
            'notas', l.notas,
            'created_at', l.created_at,
            'session', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
              'id', s.id,
              'starts_at', s.starts_at,
              'duration_minutes', s.duration_minutes,
              'focus', s.focus,
              'worked_on', s.worked_on,
              'notes_summary', s.notes_summary
            ) ELSE NULL END
          ) ORDER BY l.created_at DESC
        )
        FROM (
          SELECT id, delta, tipo, notas, created_at, session_id
          FROM public.coach_class_ledger
          WHERE relationship_id = r.id
          ORDER BY created_at DESC
          LIMIT 50
        ) l
        LEFT JOIN public.coach_sessions s ON s.id = l.session_id
      ), '[]'::jsonb)
    ) ORDER BY r.is_primary DESC, r.created_at DESC
  ), '[]'::jsonb)
  INTO v_results
  FROM public.coach_player_relationships r
  JOIN public.riviera_coaches c ON c.id = r.coach_id
  JOIN public.riviera_jugadores rj ON rj.id = r.jugador_id
  LEFT JOIN public.users u ON u.id = r.organizador_id
  LEFT JOIN public.organizador_game_modes ogm ON ogm.organizador_id = r.organizador_id
  LEFT JOIN public.coach_player_class_balances b ON b.relationship_id = r.id
  WHERE r.jugador_id = ANY(v_verified_jugador_ids)
    AND r.status = 'ACTIVE';

  RETURN jsonb_build_object(
    'ok', true,
    'linked', true,
    'riviera_id', v_user_riviera_id,
    'relationships', v_results
  );
END;
$$;

-- 6. PERMISOS Y PRIVILEGIOS EXPLÍCITOS
GRANT EXECUTE ON FUNCTION public.link_coach_student_by_club(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_student_by_riviera_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_coaching_overview() TO authenticated, service_role;

