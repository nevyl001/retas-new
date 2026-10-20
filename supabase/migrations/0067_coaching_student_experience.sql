-- ══════════════════════════════════════════════════════════════════════════════
-- 0067 — Riviera Coaching: Experiencia del Alumno ("Mi Coaching") y Piloto Hack Pádel
--
-- 1. Activación de coaching_enabled para el club piloto Hack Pádel
-- 2. Políticas RLS SELECT para alumnos autenticados en balances y ledger
-- 3. RPC SECURITY DEFINER get_student_coaching_overview() para consulta unificada
-- 4. RPC SECURITY DEFINER link_student_by_riviera_id(text) para auto-vinculación protegida
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Activación de Coaching en Hack Pádel ──────────────────────────────────
UPDATE public.organizador_game_modes
SET coaching_enabled = true, updated_at = now()
WHERE organizador_id = 'e724de97-3552-4a01-a269-f621e6f1ed26';

-- ── 2) Políticas RLS para Alumnos Autenticados ───────────────────────────────
-- Permitir al alumno consultar su propio saldo de clases
DROP POLICY IF EXISTS cpcb_student_select ON public.coach_player_class_balances;
CREATE POLICY cpcb_student_select ON public.coach_player_class_balances
  FOR SELECT
  TO authenticated
  USING (
    jugador_id IN (
      SELECT l.jugador_id FROM public.rewards_player_links l WHERE l.auth_user_id = auth.uid()
    )
  );

-- Permitir al alumno consultar su propio historial de movimientos (ledger)
DROP POLICY IF EXISTS ccl_student_select ON public.coach_class_ledger;
CREATE POLICY ccl_student_select ON public.coach_class_ledger
  FOR SELECT
  TO authenticated
  USING (
    jugador_id IN (
      SELECT l.jugador_id FROM public.rewards_player_links l WHERE l.auth_user_id = auth.uid()
    )
  );

-- ── 3) RPC get_student_coaching_overview ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_student_coaching_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_jugador_ids uuid[];
  v_official_keys uuid[];
  v_user_riviera_id text;
  v_results jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- Correo verificado del usuario autenticado
  SELECT lower(btrim(email)) INTO v_caller_email
  FROM auth.users
  WHERE id = v_caller;

  -- 1. Resolver jugador_ids candidatos asociados a este usuario
  --    a) Directamente por rewards_player_links
  --    b) Por coincidencia de correo verificado con riviera_jugadores
  SELECT COALESCE(array_agg(DISTINCT cand.j_id), '{}'::uuid[])
  INTO v_jugador_ids
  FROM (
    SELECT l.jugador_id AS j_id
    FROM public.rewards_player_links l
    WHERE l.auth_user_id = v_caller
    UNION
    SELECT rj.id AS j_id
    FROM public.riviera_jugadores rj
    WHERE v_caller_email IS NOT NULL
      AND lower(btrim(COALESCE(rj.email, ''))) = v_caller_email
      AND rj.estado = 'activo'
  ) cand;

  -- Auto-vincular en rewards_player_links si se identificó por correo
  IF array_length(v_jugador_ids, 1) > 0 THEN
    INSERT INTO public.rewards_player_links (jugador_id, organizador_id, auth_user_id)
    SELECT rj.id, rj.organizador_id, v_caller
    FROM public.riviera_jugadores rj
    WHERE rj.id = ANY(v_jugador_ids)
    ON CONFLICT (jugador_id) DO NOTHING;
  END IF;

  -- 2. Expandir a través de identidad oficial multiclub
  SELECT COALESCE(array_agg(DISTINCT k.official_key), '{}'::uuid[])
  INTO v_official_keys
  FROM (
    SELECT public._resolve_official_player_key(j_id) AS official_key
    FROM unnest(v_jugador_ids) AS j_id
    WHERE public._resolve_official_player_key(j_id) IS NOT NULL
  ) k;

  IF array_length(v_official_keys, 1) > 0 THEN
    SELECT COALESCE(array_agg(DISTINCT exp_id), v_jugador_ids)
    INTO v_jugador_ids
    FROM (
      SELECT unnest(v_jugador_ids) AS exp_id
      UNION
      SELECT i.canonical_riviera_jugador_id AS exp_id
      FROM public.riviera_official_player_identity i
      WHERE i.official_player_key = ANY(v_official_keys)
      UNION
      SELECT l.riviera_jugador_id AS exp_id
      FROM public.riviera_official_player_profile_link l
      WHERE l.official_player_key = ANY(v_official_keys)
    ) exp;
  END IF;

  -- 3. Resolver Riviera ID del alumno para la credencial
  SELECT i.riviera_id INTO v_user_riviera_id
  FROM public.riviera_official_player_identity i
  WHERE i.canonical_riviera_jugador_id = ANY(v_jugador_ids)
     OR i.official_player_key = ANY(v_official_keys)
  ORDER BY i.created_at ASC
  LIMIT 1;

  -- Si no tiene perfiles vinculados, retornar estado limpio
  IF array_length(v_jugador_ids, 1) IS NULL OR array_length(v_jugador_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'linked', false,
      'riviera_id', NULL,
      'relationships', '[]'::jsonb
    );
  END IF;

  -- 4. Construir resultado multi-relación de coaching con su ledger inmutable
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
        FROM public.coach_class_ledger l
        LEFT JOIN public.coach_sessions s ON s.id = l.session_id
        WHERE l.relationship_id = r.id
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
  WHERE r.jugador_id = ANY(v_jugador_ids);

  RETURN jsonb_build_object(
    'ok', true,
    'linked', true,
    'riviera_id', v_user_riviera_id,
    'relationships', v_results
  );
END;
$$;

-- ── 4) RPC link_student_by_riviera_id ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_student_by_riviera_id(p_riviera_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_norm_id text;
  v_jugador record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  v_norm_id := upper(btrim(COALESCE(p_riviera_id, '')));
  IF v_norm_id !~ '^RIV-[0-9]{5,8}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Formato de Riviera ID inválido. Debe tener la estructura RIV-########'
    );
  END IF;

  SELECT lower(btrim(email)) INTO v_caller_email
  FROM auth.users
  WHERE id = v_caller;

  -- Resolver perfil deportivo oficial
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

  -- Guard de seguridad: si el perfil ya tiene correo, debe coincidir con el correo verificado del usuario
  IF v_jugador.email IS NOT NULL AND btrim(v_jugador.email) <> '' THEN
    IF lower(btrim(v_jugador.email)) <> v_caller_email THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'El correo de tu cuenta no coincide con el registrado en el club para este Riviera ID.'
      );
    END IF;
  ELSE
    -- Asignar el correo verificado de quien lo reclama
    UPDATE public.riviera_jugadores
    SET email = v_caller_email, updated_at = now()
    WHERE id = v_jugador.id;
  END IF;

  -- Registrar vínculo en rewards_player_links
  INSERT INTO public.rewards_player_links (jugador_id, organizador_id, auth_user_id)
  VALUES (v_jugador.id, v_jugador.organizador_id, v_caller)
  ON CONFLICT (jugador_id) DO UPDATE
  SET auth_user_id = EXCLUDED.auth_user_id,
      organizador_id = EXCLUDED.organizador_id;

  RETURN jsonb_build_object(
    'ok', true,
    'jugador_id', v_jugador.id,
    'nombre', v_jugador.nombre,
    'riviera_id', v_jugador.riviera_id
  );
END;
$$;

-- ── 5) Permisos y Privilegios ────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_student_coaching_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_coaching_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_coaching_overview() TO service_role;

REVOKE ALL ON FUNCTION public.link_student_by_riviera_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_student_by_riviera_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_student_by_riviera_id(text) TO service_role;

COMMIT;

