-- ==============================================================================
-- 0072_coaching_student_identity_and_role_hardening.sql
-- Riviera Coaching • Hotfix de Identidad del Alumno y Blindaje RLS de Sub-Cuentas
--
-- 1. Restaura en get_student_coaching_overview() el mecanismo probado de 0068:
--    - coach_student_account_links
--    - rewards_player_links (lectura compatibilidad)
--    - match de correo verificado sin colisiones
--    - expansión multiclub con _resolve_official_player_key
--    - ELIMINA dependencias inexistentes de jugador_auth_links y auth_user_id en riviera_jugadores
--    - CONSERVA todos los campos de seguimiento deportivo (worked_on, improvements, next_goals, motivational_message)
--    - Incluye foto_url del alumno en player
--
-- 2. Protege coach_club_membership_audit_log ante borrado en cascada (ON DELETE SET NULL / RESTRICT)
--
-- 3. Blindaje de roles de empleados/sub-cuentas (COACH_ONLY / STUDENT_ONLY):
--    - Funciones helper de verificación de raw_app_meta_data
--    - Políticas RLS en tournaments, torneo_express y ligas que impiden a estas cuentas
--      crear o modificar eventos deportivos ajenos a su alcance operativo.
-- ==============================================================================

-- ── 1. SEGURIDAD DE AUDITORÍA: PROTEGER AUDIT LOG ANTE CASCADE DELETION ─────────
ALTER TABLE public.coach_club_membership_audit_log
  DROP CONSTRAINT IF EXISTS coach_club_membership_audit_log_membership_id_fkey;

ALTER TABLE public.coach_club_membership_audit_log
  ADD CONSTRAINT coach_club_membership_audit_log_membership_id_fkey
  FOREIGN KEY (membership_id) REFERENCES public.coach_club_memberships(id) ON DELETE SET NULL;

ALTER TABLE public.coach_club_membership_audit_log
  DROP CONSTRAINT IF EXISTS coach_club_membership_audit_log_coach_id_fkey;

ALTER TABLE public.coach_club_membership_audit_log
  ADD CONSTRAINT coach_club_membership_audit_log_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES public.riviera_coaches(id) ON DELETE RESTRICT;

-- ── 2. FUNCIONES DE VALIDACIÓN DE ROL VÍA raw_app_meta_data ───────────────────
-- raw_app_meta_data solo puede ser escrito por service_role (Edge Functions / Admin API),
-- por lo que el cliente nunca puede auto-escalar privilegios ni modificarse el rol.

CREATE OR REPLACE FUNCTION public.is_coach_only_account(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT (
        COALESCE(u.raw_app_meta_data->>'account_type', '') = 'COACH_ONLY'
        OR (
          COALESCE(u.raw_app_meta_data->>'role', '') = 'coach'
          AND COALESCE(u.raw_app_meta_data->>'account_type', '') <> 'CLUB_ADMIN'
          AND NOT COALESCE(public.is_master_admin(), false)
        )
      )
      FROM auth.users u
      WHERE u.id = COALESCE(p_user_id, auth.uid())
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_student_only_account(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT (
        COALESCE(u.raw_app_meta_data->>'account_type', '') = 'STUDENT_ONLY'
        OR (
          COALESCE(u.raw_app_meta_data->>'role', '') = 'student'
          AND COALESCE(u.raw_app_meta_data->>'account_type', '') <> 'CLUB_ADMIN'
          AND NOT COALESCE(public.is_master_admin(), false)
        )
      )
      FROM auth.users u
      WHERE u.id = COALESCE(p_user_id, auth.uid())
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_restricted_sub_account(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (public.is_coach_only_account(p_user_id) OR public.is_student_only_account(p_user_id));
$$;

REVOKE ALL ON FUNCTION public.is_coach_only_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_coach_only_account(uuid) TO authenticated, service_role, anon;

REVOKE ALL ON FUNCTION public.is_student_only_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_student_only_account(uuid) TO authenticated, service_role, anon;

REVOKE ALL ON FUNCTION public.is_restricted_sub_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_restricted_sub_account(uuid) TO authenticated, service_role, anon;

-- ── 3. BLINDAJE RLS: IMPEDIR QUE CUENTAS COACH_ONLY / STUDENT_ONLY MUTEN TORNEOS Y LIGAS ─

-- A. tournaments
DROP POLICY IF EXISTS "tournaments_insert_auth" ON public.tournaments;
CREATE POLICY "tournaments_insert_auth"
  ON public.tournaments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  );

DROP POLICY IF EXISTS "tournaments_update_auth" ON public.tournaments;
CREATE POLICY "tournaments_update_auth"
  ON public.tournaments
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  );

DROP POLICY IF EXISTS "tournaments_delete_auth" ON public.tournaments;
CREATE POLICY "tournaments_delete_auth"
  ON public.tournaments
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  );

-- B. torneo_express
DROP POLICY IF EXISTS "te_mutate_auth" ON public.torneo_express;
CREATE POLICY "te_mutate_auth"
  ON public.torneo_express
  FOR ALL
  TO authenticated
  USING (
    organizador_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  )
  WITH CHECK (
    organizador_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  );

DROP POLICY IF EXISTS "escritura_organizador_te" ON public.torneo_express;
CREATE POLICY "escritura_organizador_te"
  ON public.torneo_express
  FOR ALL
  TO authenticated
  USING (
    organizador_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  )
  WITH CHECK (
    organizador_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  );

-- C. ligas
DROP POLICY IF EXISTS "ligas_insert" ON public.ligas;
CREATE POLICY "ligas_insert"
  ON public.ligas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organizador_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  );

DROP POLICY IF EXISTS "ligas_mutate_auth" ON public.ligas;
CREATE POLICY "ligas_mutate_auth"
  ON public.ligas
  FOR ALL
  TO authenticated
  USING (
    organizador_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  )
  WITH CHECK (
    organizador_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  );

DROP POLICY IF EXISTS "ligas_update" ON public.ligas;
CREATE POLICY "ligas_update"
  ON public.ligas
  FOR UPDATE
  TO authenticated
  USING (
    organizador_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  )
  WITH CHECK (
    organizador_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  );

DROP POLICY IF EXISTS "ligas_delete" ON public.ligas;
CREATE POLICY "ligas_delete"
  ON public.ligas
  FOR DELETE
  TO authenticated
  USING (
    organizador_id = auth.uid()
    AND NOT public.is_restricted_sub_account(auth.uid())
  );

-- ── 4. RESTAURACIÓN DE get_student_coaching_overview ───────────────────────────
-- Restaura el mecanismo de 0068 (coach_student_account_links, rewards_player_links,
-- email estricto y resolución canónica) e incluye los campos de seguimiento de 0071.

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
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Usuario no autenticado.'
    );
  END IF;

  -- Obtener email verificado del usuario autenticado
  SELECT lower(btrim(email)), email_confirmed_at
  INTO v_caller_email, v_email_confirmed_at
  FROM auth.users
  WHERE id = v_caller;

  -- 1. Perfiles vinculados expresamente en Coaching o Rewards, o match seguro por correo verificado
  SELECT COALESCE(array_agg(DISTINCT cand.j_id), '{}'::uuid[])
  INTO v_verified_jugador_ids
  FROM (
    -- 1.a. Enlaces directos en Coaching
    SELECT jugador_id AS j_id
    FROM public.coach_student_account_links
    WHERE auth_user_id = v_caller

    UNION

    -- 1.b. Enlaces directos en Rewards (compatibilidad)
    SELECT jugador_id AS j_id
    FROM public.rewards_player_links
    WHERE auth_user_id = v_caller

    UNION

    -- 1.c. Coincidencia estricta de correo electrónico verificado (sin colisiones y sin conflicto)
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
      AND (
        SELECT count(*) FROM public.riviera_jugadores dup
        WHERE dup.organizador_id = rj.organizador_id
          AND lower(btrim(dup.email)) = v_caller_email
          AND dup.estado = 'activo'
      ) = 1
  ) cand;

  -- 2. Expansión multiclub: perfiles hermanos NO vinculados a otro usuario
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

  -- 3. Resolver Riviera ID del alumno
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

  -- 4. Construir resumen con detalle completo de sesiones, balances y seguimiento deportivo
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
        'foto_url', rj.foto_url,
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
              'improvements', s.improvements,
              'next_goals', s.next_goals,
              'motivational_message', s.motivational_message,
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
    'relationships', COALESCE(v_results, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_coaching_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_coaching_overview() TO authenticated, service_role;

