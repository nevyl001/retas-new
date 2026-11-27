-- Directorio maestro: la clasificación de club / coach / alumno sale del servidor.
-- Un perfil en public.users no convierte a un coach en club.
-- Idempotente. No modifica filas existentes.

CREATE OR REPLACE FUNCTION public.admin_directorio_clasificacion()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coaches jsonb;
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
        END
      ) AS payload
    FROM public.riviera_coaches c
    LEFT JOIN public.users u ON u.id = c.auth_user_id
  ) AS directory_row;

  RETURN jsonb_build_object('coaches', v_coaches);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_directorio_clasificacion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_directorio_clasificacion() TO authenticated;

COMMENT ON FUNCTION public.admin_directorio_clasificacion() IS
  'Directorio maestro. Lista coaches reales desde riviera_coaches. Solo is_master_admin(). No crea ni borra cuentas.';
