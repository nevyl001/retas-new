-- Directorio maestro. Solo lectura. No inserta, no actualiza y no borra identidades.
-- Club: entidad explícita (ajustes del organizador, account_type CLUB_ADMIN,
-- o titular de competencias, jugadores o membresías de coaching).
-- Una fila en public.users no basta para ser club.
-- Coach: fila en riviera_coaches. Alumno: vínculo en coach_student_account_links.
-- Una cuenta puede salir en más de una lista si tiene más de un rol real.

CREATE OR REPLACE FUNCTION public.admin_directorio_clasificacion()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coaches jsonb;
  v_clubs jsonb;
  v_students jsonb;
  v_unclassified jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.is_master_admin(), false) THEN
    RAISE EXCEPTION 'no_autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(payload ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_coaches
  FROM (
    SELECT
      c.created_at,
      jsonb_build_object(
        'auth_user_id', c.auth_user_id,
        'coach_id', c.id,
        'coach_code', c.coach_code,
        'nombre', c.nombre,
        'foto_url', c.foto_url,
        'created_at', c.created_at,
        'email', COALESCE(u.email, ''),
        'clubs', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'organizador_id', m.organizador_id,
                'nombre', COALESCE(NULLIF(btrim(cu.name), ''), NULLIF(btrim(cu.email), ''), 'Club'),
                'status', m.status
              )
              ORDER BY m.created_at
            )
            FROM public.coach_club_memberships m
            LEFT JOIN public.users cu ON cu.id = m.organizador_id
            WHERE m.coach_id = c.id
          ),
          '[]'::jsonb
        ),
        'student_count', (
          SELECT count(DISTINCT r.jugador_id)::int
          FROM public.coach_player_relationships r
          WHERE r.coach_id = c.id
            AND r.status <> 'ENDED'
        ),
        'class_count', (
          SELECT count(*)::int
          FROM public.coach_class_ledger l
          WHERE l.coach_id = c.id
            AND l.tipo = 'CLASS_DEBIT'
        ),
        'membership_status', CASE
          WHEN EXISTS (
            SELECT 1
            FROM public.coach_club_memberships m
            WHERE m.coach_id = c.id
              AND m.status = 'ACTIVE'
          ) THEN 'activo'
          WHEN EXISTS (
            SELECT 1
            FROM public.coach_club_memberships m
            WHERE m.coach_id = c.id
              AND m.status = 'PENDING'
          ) THEN 'pendiente'
          ELSE 'inactivo'
        END,
        'has_club_entity', EXISTS (
          SELECT 1
          FROM public.users club_user
          WHERE club_user.id = c.auth_user_id
            AND public.admin_directorio_es_club(club_user.id)
        )
      ) AS payload
    FROM public.riviera_coaches c
    LEFT JOIN public.users u ON u.id = c.auth_user_id
  ) AS directory_row;

  SELECT COALESCE(jsonb_agg(payload ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_clubs
  FROM (
    SELECT
      u.created_at,
      jsonb_build_object(
        'id', u.id,
        'email', COALESCE(u.email, ''),
        'name', COALESCE(NULLIF(btrim(u.name), ''), NULLIF(btrim(u.email), ''), 'Club'),
        'created_at', u.created_at
      ) AS payload
    FROM public.users u
    WHERE public.admin_directorio_es_club(u.id)
  ) AS club_row;

  SELECT COALESCE(jsonb_agg(payload ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_students
  FROM (
    SELECT
      MIN(s.created_at) AS created_at,
      jsonb_build_object(
        'auth_user_id', s.auth_user_id,
        'email', COALESCE(MAX(NULLIF(btrim(s.student_email), '')), ''),
        'riviera_id', MAX(i.riviera_id),
        'is_active', bool_or(s.is_active IS TRUE),
        'created_at', MIN(s.created_at),
        'club_count', count(DISTINCT s.organizador_id)::int
      ) AS payload
    FROM public.coach_student_account_links s
    LEFT JOIN public.riviera_official_player_identity i
      ON i.canonical_riviera_jugador_id = s.jugador_id
    WHERE s.auth_user_id IS NOT NULL
    GROUP BY s.auth_user_id
  ) AS student_row;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'email', COALESCE(u.email, ''),
        'name', COALESCE(u.name, '')
      )
      ORDER BY u.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_unclassified
  FROM public.users u
  WHERE NOT public.admin_directorio_es_club(u.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.riviera_coaches c WHERE c.auth_user_id = u.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.coach_student_account_links s
      WHERE s.auth_user_id = u.id
    );

  RETURN jsonb_build_object(
    'coaches', v_coaches,
    'clubs', v_clubs,
    'students', v_students,
    'unclassified', v_unclassified
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_directorio_es_club(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.organizador_game_modes ogm
        WHERE ogm.organizador_id = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM auth.users au
        WHERE au.id = p_user_id
          AND (
            COALESCE(au.raw_app_meta_data->>'account_type', '') = 'CLUB_ADMIN'
            OR COALESCE(au.raw_user_meta_data->>'account_type', '') = 'CLUB_ADMIN'
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.tournaments t WHERE t.user_id = p_user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.ligas l WHERE l.organizador_id = p_user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.torneo_express te WHERE te.organizador_id = p_user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.duelos_2v2 d WHERE d.organizador_id = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.riviera_jugadores j
        WHERE j.organizador_id = p_user_id
          AND COALESCE(j.estado, 'activo') <> 'archivado'
      )
      OR EXISTS (
        SELECT 1
        FROM public.coach_club_memberships m
        WHERE m.organizador_id = p_user_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.admin_directorio_clasificacion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_directorio_es_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_directorio_clasificacion() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_directorio_es_club(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_directorio_es_club(uuid) FROM anon;

COMMENT ON FUNCTION public.admin_directorio_clasificacion() IS
  'Directorio maestro. Clasifica clubes, coaches y alumnos. Solo is_master_admin(). No modifica datos.';

COMMENT ON FUNCTION public.admin_directorio_es_club(uuid) IS
  'Uso interno del directorio maestro. No está concedida a anon ni authenticated.';
