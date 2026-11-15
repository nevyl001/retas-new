-- =============================================================================
-- 0135_coaching_coach_professional_profile.sql
--
-- El coach edita su perfil profesional. No cambia RIV-C, nombre ni acceso.
-- Las fuerzas quedan dentro de lo que el club ya autorizó.
-- El alumno solo lee el perfil público de SU entrenador.
-- =============================================================================

BEGIN;

ALTER TABLE public.riviera_coaches
  ADD COLUMN IF NOT EXISTS edad smallint NULL,
  ADD COLUMN IF NOT EXISTS anos_experiencia smallint NULL,
  ADD COLUMN IF NOT EXISTS posicion_juego text NULL,
  ADD COLUMN IF NOT EXISTS instagram_url text NULL,
  ADD COLUMN IF NOT EXISTS facebook_url text NULL,
  ADD COLUMN IF NOT EXISTS tiktok_url text NULL,
  ADD COLUMN IF NOT EXISTS areas_entrenamiento text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fortalezas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metodologia_ensenanza text NULL,
  ADD COLUMN IF NOT EXISTS enfoque_tecnico text NULL,
  ADD COLUMN IF NOT EXISTS objetivos_alumnos text NULL,
  ADD COLUMN IF NOT EXISTS estructura_entrenamientos text NULL,
  ADD COLUMN IF NOT EXISTS habilidades_principales text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.riviera_coaches
  DROP CONSTRAINT IF EXISTS riviera_coaches_edad_rango,
  DROP CONSTRAINT IF EXISTS riviera_coaches_anos_experiencia_rango,
  DROP CONSTRAINT IF EXISTS riviera_coaches_posicion_juego;

ALTER TABLE public.riviera_coaches
  ADD CONSTRAINT riviera_coaches_edad_rango
    CHECK (edad IS NULL OR (edad BETWEEN 18 AND 99)),
  ADD CONSTRAINT riviera_coaches_anos_experiencia_rango
    CHECK (anos_experiencia IS NULL OR (anos_experiencia BETWEEN 0 AND 60)),
  ADD CONSTRAINT riviera_coaches_posicion_juego
    CHECK (posicion_juego IS NULL OR posicion_juego IN ('reves', 'drive', 'ambas'));

-- El cliente autenticado no puede reescribir identidad ni códigos.
REVOKE UPDATE ON TABLE public.riviera_coaches FROM authenticated;
GRANT UPDATE (
  foto_url,
  bio,
  especialidades,
  fuerzas,
  certificaciones,
  edad,
  anos_experiencia,
  posicion_juego,
  instagram_url,
  facebook_url,
  tiktok_url,
  areas_entrenamiento,
  fortalezas,
  metodologia_ensenanza,
  enfoque_tecnico,
  objetivos_alumnos,
  estructura_entrenamientos,
  habilidades_principales
) ON TABLE public.riviera_coaches TO authenticated;

CREATE OR REPLACE FUNCTION public.update_own_coach_profile(p_profile jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_coach public.riviera_coaches%ROWTYPE;
  v_foto text := NULLIF(btrim(COALESCE(p_profile->>'foto_url', '')), '');
  v_bio text := NULLIF(btrim(COALESCE(p_profile->>'bio', '')), '');
  v_certs text := NULLIF(btrim(COALESCE(p_profile->>'certificaciones', '')), '');
  v_pos text := NULLIF(lower(btrim(COALESCE(p_profile->>'posicion_juego', ''))), '');
  v_ig text := NULLIF(btrim(COALESCE(p_profile->>'instagram_url', '')), '');
  v_fb text := NULLIF(btrim(COALESCE(p_profile->>'facebook_url', '')), '');
  v_tt text := NULLIF(btrim(COALESCE(p_profile->>'tiktok_url', '')), '');
  v_met text := NULLIF(btrim(COALESCE(p_profile->>'metodologia_ensenanza', '')), '');
  v_enf text := NULLIF(btrim(COALESCE(p_profile->>'enfoque_tecnico', '')), '');
  v_obj text := NULLIF(btrim(COALESCE(p_profile->>'objetivos_alumnos', '')), '');
  v_est text := NULLIF(btrim(COALESCE(p_profile->>'estructura_entrenamientos', '')), '');
  v_edad int;
  v_anos int;
  v_social constant text := '^https?://[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(/[^[:space:]]*)?$';
  v_allowed text[] := '{}';
  v_fuerzas text[] := '{}';
  v_item text;
  v_clean text;
  v_especialidades text[] := '{}';
  v_areas text[] := '{}';
  v_fortalezas text[] := '{}';
  v_habilidades text[] := '{}';
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil no válido.');
  END IF;

  SELECT * INTO v_coach
  FROM public.riviera_coaches
  WHERE auth_user_id = v_caller
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes un perfil de entrenador.');
  END IF;

  IF v_bio IS NOT NULL AND length(v_bio) > 280 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La presentación puede tener hasta 280 caracteres.');
  END IF;
  IF v_certs IS NOT NULL AND length(v_certs) > 400 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Las certificaciones pueden tener hasta 400 caracteres.');
  END IF;
  IF v_met IS NOT NULL AND length(v_met) > 400 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La metodología puede tener hasta 400 caracteres.');
  END IF;
  IF v_enf IS NOT NULL AND length(v_enf) > 400 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El enfoque puede tener hasta 400 caracteres.');
  END IF;
  IF v_obj IS NOT NULL AND length(v_obj) > 400 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Los objetivos pueden tener hasta 400 caracteres.');
  END IF;
  IF v_est IS NOT NULL AND length(v_est) > 400 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La estructura puede tener hasta 400 caracteres.');
  END IF;

  IF v_pos IS NOT NULL AND v_pos NOT IN ('reves', 'drive', 'ambas') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La posición habitual no es válida.');
  END IF;

  BEGIN
    v_edad := NULLIF(p_profile->>'edad', '')::int;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La edad no es válida.');
  END;
  IF v_edad IS NOT NULL AND (v_edad < 18 OR v_edad > 99) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La edad debe estar entre 18 y 99 años.');
  END IF;

  BEGIN
    v_anos := NULLIF(p_profile->>'anos_experiencia', '')::int;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Los años de experiencia no son válidos.');
  END;
  IF v_anos IS NOT NULL AND (v_anos < 0 OR v_anos > 60) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Los años de experiencia deben estar entre 0 y 60.');
  END IF;

  IF v_foto IS NOT NULL AND (
       length(v_foto) > 500
       OR v_foto !~* '^https://[^[:space:]]+$'
       OR position('/storage/v1/object/public/jugadores-avatars/' || v_caller::text || '/' IN v_foto) = 0
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La fotografía no es válida.');
  END IF;

  IF v_ig IS NOT NULL AND (length(v_ig) > 200 OR v_ig !~* v_social) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El enlace de Instagram no es válido.');
  END IF;
  IF v_fb IS NOT NULL AND (length(v_fb) > 200 OR v_fb !~* v_social) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El enlace de Facebook no es válido.');
  END IF;
  IF v_tt IS NOT NULL AND (length(v_tt) > 200 OR v_tt !~* v_social) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El enlace de TikTok no es válido.');
  END IF;

  IF jsonb_typeof(p_profile->'especialidades') = 'array' THEN
    FOR v_item IN SELECT jsonb_array_elements_text(p_profile->'especialidades') LOOP
      v_clean := left(btrim(v_item), 60);
      IF v_clean <> '' AND NOT v_clean = ANY (v_especialidades) AND cardinality(v_especialidades) < 12 THEN
        v_especialidades := v_especialidades || v_clean;
      END IF;
    END LOOP;
  END IF;
  IF jsonb_typeof(p_profile->'areas_entrenamiento') = 'array' THEN
    FOR v_item IN SELECT jsonb_array_elements_text(p_profile->'areas_entrenamiento') LOOP
      v_clean := left(btrim(v_item), 60);
      IF v_clean <> '' AND NOT v_clean = ANY (v_areas) AND cardinality(v_areas) < 12 THEN
        v_areas := v_areas || v_clean;
      END IF;
    END LOOP;
  END IF;
  IF jsonb_typeof(p_profile->'fortalezas') = 'array' THEN
    FOR v_item IN SELECT jsonb_array_elements_text(p_profile->'fortalezas') LOOP
      v_clean := left(btrim(v_item), 60);
      IF v_clean <> '' AND NOT v_clean = ANY (v_fortalezas) AND cardinality(v_fortalezas) < 12 THEN
        v_fortalezas := v_fortalezas || v_clean;
      END IF;
    END LOOP;
  END IF;
  IF jsonb_typeof(p_profile->'habilidades_principales') = 'array' THEN
    FOR v_item IN SELECT jsonb_array_elements_text(p_profile->'habilidades_principales') LOOP
      v_clean := left(btrim(v_item), 60);
      IF v_clean <> '' AND NOT v_clean = ANY (v_habilidades) AND cardinality(v_habilidades) < 12 THEN
        v_habilidades := v_habilidades || v_clean;
      END IF;
    END LOOP;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT f), '{}')
  INTO v_allowed
  FROM public.coach_club_memberships m
  CROSS JOIN LATERAL unnest(COALESCE(m.club_fuerzas, '{}'::text[])) AS f
  WHERE m.coach_id = v_coach.id
    AND m.status IN ('ACTIVE', 'PENDING')
    AND btrim(f) <> '';

  IF COALESCE(cardinality(v_allowed), 0) = 0 THEN
    v_allowed := COALESCE(v_coach.fuerzas, '{}'::text[]);
  END IF;

  IF jsonb_typeof(p_profile->'fuerzas') = 'array' THEN
    FOR v_item IN SELECT jsonb_array_elements_text(p_profile->'fuerzas') LOOP
      v_clean := btrim(v_item);
      IF v_clean = ANY (v_allowed)
         AND v_clean IN ('open', '1ra_fuerza', '2da_fuerza', '3ra_fuerza', '4ta_fuerza', '5ta_fuerza', '6ta_fuerza')
         AND NOT v_clean = ANY (v_fuerzas) THEN
        v_fuerzas := v_fuerzas || v_clean;
      END IF;
    END LOOP;
  ELSE
    v_fuerzas := COALESCE(v_coach.fuerzas, '{}'::text[]);
  END IF;

  UPDATE public.riviera_coaches
  SET
    foto_url = v_foto,
    bio = v_bio,
    certificaciones = v_certs,
    edad = v_edad,
    anos_experiencia = v_anos,
    posicion_juego = v_pos,
    instagram_url = v_ig,
    facebook_url = v_fb,
    tiktok_url = v_tt,
    especialidades = v_especialidades,
    areas_entrenamiento = v_areas,
    fortalezas = v_fortalezas,
    metodologia_ensenanza = v_met,
    enfoque_tecnico = v_enf,
    objetivos_alumnos = v_obj,
    estructura_entrenamientos = v_est,
    habilidades_principales = v_habilidades,
    fuerzas = v_fuerzas,
    updated_at = now()
  WHERE id = v_coach.id
    AND auth_user_id = v_caller;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_coach.id,
    'coach_code', v_coach.coach_code,
    'foto_url', v_foto,
    'bio', v_bio,
    'certificaciones', v_certs,
    'edad', v_edad,
    'anos_experiencia', v_anos,
    'posicion_juego', v_pos,
    'instagram_url', v_ig,
    'facebook_url', v_fb,
    'tiktok_url', v_tt,
    'especialidades', to_jsonb(v_especialidades),
    'areas_entrenamiento', to_jsonb(v_areas),
    'fortalezas', to_jsonb(v_fortalezas),
    'metodologia_ensenanza', v_met,
    'enfoque_tecnico', v_enf,
    'objetivos_alumnos', v_obj,
    'estructura_entrenamientos', v_est,
    'habilidades_principales', to_jsonb(v_habilidades),
    'fuerzas', to_jsonb(v_fuerzas)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_coach_profile(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_coach_profile(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_coach_public_profile(p_coach_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_coach public.riviera_coaches%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.coach_player_relationships r
    JOIN public.coach_student_account_links al
      ON al.jugador_id = r.jugador_id
     AND al.organizador_id = r.organizador_id
     AND al.auth_user_id = v_caller
     AND al.is_active = true
    WHERE r.coach_id = p_coach_id
      AND r.status IN ('ACTIVE', 'PAUSED')
  ) AND NOT EXISTS (
    SELECT 1 FROM public.riviera_coaches c
    WHERE c.id = p_coach_id AND c.auth_user_id = v_caller
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes consultar este perfil.');
  END IF;

  SELECT * INTO v_coach FROM public.riviera_coaches WHERE id = p_coach_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Entrenador no encontrado.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_coach.id,
    'nombre', v_coach.nombre,
    'coach_code', v_coach.coach_code,
    'foto_url', v_coach.foto_url,
    'bio', v_coach.bio,
    'edad', v_coach.edad,
    'anos_experiencia', v_coach.anos_experiencia,
    'posicion_juego', v_coach.posicion_juego,
    'instagram_url', v_coach.instagram_url,
    'facebook_url', v_coach.facebook_url,
    'tiktok_url', v_coach.tiktok_url,
    'especialidades', to_jsonb(COALESCE(v_coach.especialidades, '{}'::text[])),
    'areas_entrenamiento', to_jsonb(COALESCE(v_coach.areas_entrenamiento, '{}'::text[])),
    'fortalezas', to_jsonb(COALESCE(v_coach.fortalezas, '{}'::text[])),
    'certificaciones', v_coach.certificaciones,
    'metodologia_ensenanza', v_coach.metodologia_ensenanza,
    'enfoque_tecnico', v_coach.enfoque_tecnico,
    'objetivos_alumnos', v_coach.objetivos_alumnos,
    'estructura_entrenamientos', v_coach.estructura_entrenamientos,
    'habilidades_principales', to_jsonb(COALESCE(v_coach.habilidades_principales, '{}'::text[])),
    'fuerzas', to_jsonb(COALESCE(v_coach.fuerzas, '{}'::text[]))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_coach_public_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_public_profile(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
