-- =============================================================================
-- 0126_coaching_student_self_profile_update.sql
--
-- Riviera Coaching — Perfil personal/deportivo editable por el alumno en Mi Coaching
--
-- Verificado en producción (solo lectura, 2026-11-11):
--   * public.users NO tiene avatar_url (columnas: id, email, name, created_at, updated_at).
--   * riviera_jugadores.en_cancha: CHECK (NULL | 'reves' | 'drive').
--   * riviera_jugadores.edad: smallint, CHECK (NULL | 5..99).
--   * Storage jugadores-avatars ya tiene políticas authenticated INSERT/UPDATE/DELETE
--     restringidas a la carpeta auth.uid() -> esta migración NO toca Storage.
--   * get_student_coaching_overview() vivo == definición de 0084.
--
-- Propósito:
-- 1. get_student_coaching_overview(): agrega `student_profile` de nivel superior
--    (foto, edad, posición, redes) aunque el alumno no tenga entrenador, y datos
--    equivalentes dentro de cada `player`. Misma autorización que 0084.
-- 2. update_student_coaching_profile(): único punto de escritura del alumno.
--    NO recibe identificadores de jugador: el destino se deriva de auth.uid()
--    mediante coach_student_account_links activos. Solo toca foto_url, edad,
--    en_cancha, instagram_url, facebook_url y tiktok_url. Nunca email ni datos
--    competitivos.
--
-- APLICACIÓN: ejecutar a mano, solo este archivo. No usar db push.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.update_student_coaching_profile(
  p_foto_url text DEFAULT NULL,
  p_update_foto boolean DEFAULT false,
  p_edad integer DEFAULT NULL,
  p_update_edad boolean DEFAULT false,
  p_en_cancha text DEFAULT NULL,
  p_update_en_cancha boolean DEFAULT false,
  p_instagram_url text DEFAULT NULL,
  p_update_instagram boolean DEFAULT false,
  p_facebook_url text DEFAULT NULL,
  p_update_facebook boolean DEFAULT false,
  p_tiktok_url text DEFAULT NULL,
  p_update_tiktok boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_direct_ids uuid[] := '{}';
  v_official_keys uuid[] := '{}';
  v_target_ids uuid[] := '{}';
  v_clean_en_cancha text := NULLIF(lower(btrim(COALESCE(p_en_cancha, ''))), '');
  v_clean_foto text := NULLIF(btrim(COALESCE(p_foto_url, '')), '');
  v_clean_ig text := NULLIF(btrim(COALESCE(p_instagram_url, '')), '');
  v_clean_fb text := NULLIF(btrim(COALESCE(p_facebook_url, '')), '');
  v_clean_tt text := NULLIF(btrim(COALESCE(p_tiktok_url, '')), '');
  v_social_re constant text := '^https?://[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(/[^[:space:]]*)?$';
  v_profile jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autenticado.');
  END IF;

  IF p_update_edad AND p_edad IS NOT NULL AND (p_edad < 5 OR p_edad > 99) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La edad debe estar entre 5 y 99 años.');
  END IF;

  IF p_update_en_cancha AND v_clean_en_cancha IS NOT NULL
     AND v_clean_en_cancha NOT IN ('reves', 'drive') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Posición en la cancha no válida.');
  END IF;

  -- La foto solo puede apuntar a la carpeta propia del bucket público de avatares.
  IF p_update_foto AND v_clean_foto IS NOT NULL AND (
       length(v_clean_foto) > 500
       OR position('/storage/v1/object/public/jugadores-avatars/' || v_caller::text || '/' IN v_clean_foto) = 0
       OR v_clean_foto !~* '^https://[^[:space:]]+$'
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La fotografía no es válida.');
  END IF;

  IF p_update_instagram AND v_clean_ig IS NOT NULL
     AND (length(v_clean_ig) > 200 OR v_clean_ig !~* v_social_re) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El enlace de Instagram no es válido.');
  END IF;
  IF p_update_facebook AND v_clean_fb IS NOT NULL
     AND (length(v_clean_fb) > 200 OR v_clean_fb !~* v_social_re) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El enlace de Facebook no es válido.');
  END IF;
  IF p_update_tiktok AND v_clean_tt IS NOT NULL
     AND (length(v_clean_tt) > 200 OR v_clean_tt !~* v_social_re) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El enlace de TikTok no es válido.');
  END IF;

  -- Perfiles vinculados activamente a ESTA cuenta (única fuente del destino).
  SELECT COALESCE(array_agg(DISTINCT al.jugador_id), '{}')
  INTO v_direct_ids
  FROM public.coach_student_account_links al
  WHERE al.auth_user_id = v_caller
    AND al.is_active = true;

  IF array_length(v_direct_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No se encontró un perfil de jugador vinculado a tu cuenta.'
    );
  END IF;

  -- Registros hermanos de la MISMA identidad oficial (mismo Riviera ID), para que
  -- la foto y los datos no diverjan entre clubes. Se excluyen los vinculados a
  -- otra cuenta de alumno.
  SELECT COALESCE(array_agg(DISTINCT i.official_player_key), '{}')
  INTO v_official_keys
  FROM public.riviera_official_player_identity i
  WHERE i.canonical_riviera_jugador_id = ANY(v_direct_ids);

  SELECT COALESCE(array_agg(DISTINCT cand.id), v_direct_ids)
  INTO v_target_ids
  FROM (
    SELECT unnest(v_direct_ids) AS id
    UNION
    SELECT i.canonical_riviera_jugador_id
    FROM public.riviera_official_player_identity i
    WHERE array_length(v_official_keys, 1) > 0
      AND i.official_player_key = ANY(v_official_keys)
    UNION
    SELECT l.riviera_jugador_id
    FROM public.riviera_official_player_profile_link l
    WHERE array_length(v_official_keys, 1) > 0
      AND l.official_player_key = ANY(v_official_keys)
  ) cand
  WHERE cand.id IS NOT NULL
    AND (
      cand.id = ANY(v_direct_ids)
      OR NOT EXISTS (
        SELECT 1 FROM public.coach_student_account_links o
        WHERE o.jugador_id = cand.id AND o.auth_user_id <> v_caller
      )
    );

  UPDATE public.riviera_jugadores rj
  SET
    foto_url = CASE WHEN p_update_foto THEN v_clean_foto ELSE rj.foto_url END,
    edad = CASE WHEN p_update_edad THEN p_edad::smallint ELSE rj.edad END,
    en_cancha = CASE WHEN p_update_en_cancha THEN v_clean_en_cancha ELSE rj.en_cancha END,
    instagram_url = CASE WHEN p_update_instagram THEN v_clean_ig ELSE rj.instagram_url END,
    facebook_url = CASE WHEN p_update_facebook THEN v_clean_fb ELSE rj.facebook_url END,
    tiktok_url = CASE WHEN p_update_tiktok THEN v_clean_tt ELSE rj.tiktok_url END
  WHERE rj.id = ANY(v_target_ids);

  SELECT jsonb_build_object(
    'id', rj.id,
    'organizador_id', rj.organizador_id,
    'nombre', rj.nombre,
    'foto_url', rj.foto_url,
    'riviera_id', i.riviera_id,
    'edad', rj.edad,
    'en_cancha', rj.en_cancha,
    'instagram_url', rj.instagram_url,
    'facebook_url', rj.facebook_url,
    'tiktok_url', rj.tiktok_url
  )
  INTO v_profile
  FROM public.coach_student_account_links al
  JOIN public.riviera_jugadores rj ON rj.id = al.jugador_id
  LEFT JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = rj.id
  WHERE al.auth_user_id = v_caller AND al.is_active = true
  ORDER BY (rj.foto_url IS NOT NULL) DESC, al.updated_at DESC NULLS LAST, rj.id
  LIMIT 1;

  RETURN jsonb_build_object('ok', true, 'profile', v_profile);
END;
$$;

REVOKE ALL ON FUNCTION public.update_student_coaching_profile(text, boolean, integer, boolean, text, boolean, text, boolean, text, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_student_coaching_profile(text, boolean, integer, boolean, text, boolean, text, boolean, text, boolean, text, boolean) TO authenticated, service_role;


-- ── get_student_coaching_overview: 0084 + student_profile + campos de perfil ──
CREATE OR REPLACE FUNCTION public.get_student_coaching_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_user_riviera_id text;
  v_results jsonb;
  v_student_profile jsonb;
  v_authorized_count integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autenticado.');
  END IF;

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

  SELECT count(*)
  INTO v_authorized_count
  FROM public.coach_student_account_links
  WHERE auth_user_id = v_caller AND is_active = true;

  IF v_authorized_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'linked', false,
      'message', 'Tu cuenta no tiene una credencial oficial de alumno vinculada a ningún club.',
      'relationships', '[]'::jsonb
    );
  END IF;

  SELECT i.riviera_id
  INTO v_user_riviera_id
  FROM public.coach_student_account_links al
  JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = al.jugador_id
  WHERE al.auth_user_id = v_caller AND al.is_active = true
  LIMIT 1;

  -- Perfil propio (misma ordenación que update_student_coaching_profile).
  SELECT jsonb_build_object(
    'id', rj.id,
    'organizador_id', rj.organizador_id,
    'nombre', rj.nombre,
    'foto_url', rj.foto_url,
    'riviera_id', COALESCE(i.riviera_id, v_user_riviera_id),
    'edad', rj.edad,
    'en_cancha', rj.en_cancha,
    'instagram_url', rj.instagram_url,
    'facebook_url', rj.facebook_url,
    'tiktok_url', rj.tiktok_url
  )
  INTO v_student_profile
  FROM public.coach_student_account_links al
  JOIN public.riviera_jugadores rj ON rj.id = al.jugador_id
  LEFT JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = rj.id
  WHERE al.auth_user_id = v_caller AND al.is_active = true
  ORDER BY (rj.foto_url IS NOT NULL) DESC, al.updated_at DESC NULLS LAST, rj.id
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relationship_id', r.id,
      'status', r.status,
      'is_primary', (r.status = 'ACTIVE' AND r.is_primary),
      'started_at', r.started_at,
      'ended_at', r.ended_at,
      'club', jsonb_build_object(
        'organizador_id', r.organizador_id,
        'nombre', public.get_organizador_display_name(r.organizador_id),
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
  LEFT JOIN public.organizador_game_modes ogm ON ogm.organizador_id = r.organizador_id
  LEFT JOIN public.coach_player_class_balances b ON b.relationship_id = r.id
  JOIN public.coach_student_account_links al
    ON al.organizador_id = r.organizador_id
   AND al.jugador_id = r.jugador_id
   AND al.auth_user_id = v_caller
   AND al.is_active = true
  WHERE r.status IN ('ACTIVE', 'PAUSED', 'ENDED');

  RETURN jsonb_build_object(
    'ok', true,
    'linked', true,
    'riviera_id', v_user_riviera_id,
    'rivieraId', v_user_riviera_id,
    'student_profile', v_student_profile,
    'relationships', COALESCE(v_results, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_coaching_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_coaching_overview() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
