-- =============================================================================
-- Fase 1: Propagación de identidad origen → clones cedidos
-- =============================================================================
-- Sincroniza SOLO datos de exhibición (sin contacto personal):
-- nombre, foto_url, categoria, nivel, edad, mano_dominante, en_cancha, pais_codigo
--
-- NO sincroniza: email, telefono, whatsapp, redes sociales ni otros datos de contacto.
--
-- Precedencia:
--   nombre / categoría → local_display_name / local_category del grant si definidos
--   foto_url / nivel   → SIEMPRE origen (no hay columnas local_* en organizer_player_access)
--
-- Ejecutar en Supabase SQL Editor (staging → prod).
-- Prerrequisito: organizer-player-access.sql, ensure-granted-player-local-rating-sync.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public._apply_granted_local_identity_sync(
  p_access public.organizer_player_access,
  p_source public.riviera_jugadores
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text;
  v_categoria text;
BEGIN
  IF p_access.local_jugador_id IS NULL THEN
    RETURN;
  END IF;

  v_nombre := coalesce(nullif(trim(p_access.local_display_name), ''), p_source.nombre);
  v_categoria := coalesce(nullif(trim(p_access.local_category), ''), p_source.categoria::text);

  UPDATE public.riviera_jugadores local
  SET
    nombre = v_nombre,
    categoria = v_categoria,
    foto_url = p_source.foto_url,
    nivel = p_source.nivel,
    edad = p_source.edad,
    mano_dominante = p_source.mano_dominante,
    en_cancha = p_source.en_cancha,
    pais_codigo = p_source.pais_codigo,
    updated_at = now()
  WHERE local.id = p_access.local_jugador_id;

  UPDATE public.players p
  SET name = v_nombre
  FROM public.riviera_jugadores local
  WHERE local.id = p_access.local_jugador_id
    AND local.legacy_player_id IS NOT NULL
    AND local.legacy_player_id = p.id
    AND p.name IS DISTINCT FROM v_nombre;
END;
$$;

REVOKE ALL ON FUNCTION public._apply_granted_local_identity_sync(public.organizer_player_access, public.riviera_jugadores) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._apply_granted_local_identity_sync(public.organizer_player_access, public.riviera_jugadores) FROM anon, authenticated;

-- Propaga identidad del origen a todos los clones cedidos activos.
-- Solo el organizador dueño del jugador origen (o Admin Principal) puede invocar.
CREATE OR REPLACE FUNCTION public.sync_granted_locals_from_source(p_source_jugador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_source public.riviera_jugadores%ROWTYPE;
  v_access public.organizer_player_access%ROWTYPE;
  v_updated int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT *
  INTO v_source
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_source_jugador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador origen no encontrado';
  END IF;

  IF v_caller IS DISTINCT FROM v_source.organizador_id
     AND NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo el organizador dueño puede propagar cambios a clubes cedidos';
  END IF;

  FOR v_access IN
    SELECT *
    FROM public.organizer_player_access opa
    WHERE opa.jugador_id = p_source_jugador_id
      AND opa.is_active = true
      AND opa.local_jugador_id IS NOT NULL
  LOOP
    PERFORM public._apply_granted_local_identity_sync(v_access, v_source);
    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_granted_locals_from_source(uuid) TO authenticated;

-- ensure_granted_player_local: si el clon ya existe, sincronizar identidad (no solo RETURN).
CREATE OR REPLACE FUNCTION public.ensure_granted_player_local(p_source_jugador_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grantee uuid := auth.uid();
  v_access public.organizer_player_access%ROWTYPE;
  v_source public.riviera_jugadores%ROWTYPE;
  v_local_id uuid;
  v_nombre text;
  v_categoria text;
  v_slug text;
BEGIN
  IF v_grantee IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT *
  INTO v_access
  FROM public.organizer_player_access opa
  WHERE opa.jugador_id = p_source_jugador_id
    AND opa.grantee_organizer_id = v_grantee
    AND opa.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sin acceso concedido para este jugador';
  END IF;

  SELECT *
  INTO v_source
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_source_jugador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador origen no encontrado';
  END IF;

  IF v_access.local_jugador_id IS NOT NULL THEN
    PERFORM public._apply_granted_local_identity_sync(v_access, v_source);
    RETURN v_access.local_jugador_id;
  END IF;

  v_nombre := coalesce(nullif(trim(v_access.local_display_name), ''), v_source.nombre);
  v_categoria := coalesce(nullif(trim(v_access.local_category), ''), v_source.categoria::text);

  v_slug := public._ensure_unique_jugador_slug(
    v_grantee,
    public._slugify_jugador_nombre(v_nombre),
    coalesce(v_source.genero, 'M')
  );

  INSERT INTO public.riviera_jugadores (
    nombre,
    slug,
    email,
    telefono,
    whatsapp,
    nivel,
    categoria,
    edad,
    mano_dominante,
    en_cancha,
    pais_codigo,
    genero,
    club,
    foto_url,
    instagram_url,
    facebook_url,
    tiktok_url,
    visible_publico,
    suma_ranking,
    organizador_id,
    estado,
    legacy_player_id,
    rating,
    rating_partidos,
    rating_fiabilidad
  )
  VALUES (
    v_nombre,
    v_slug,
    NULL,
    NULL,
    NULL,
    v_source.nivel,
    v_categoria,
    v_source.edad,
    v_source.mano_dominante,
    v_source.en_cancha,
    v_source.pais_codigo,
    v_source.genero,
    NULL,
    v_source.foto_url,
    NULL,
    NULL,
    NULL,
    CASE WHEN v_access.is_public_ranking THEN true ELSE false END,
    true,
    v_grantee,
    'activo',
    v_source.legacy_player_id,
    COALESCE(v_source.rating, 3),
    COALESCE(v_source.rating_partidos, 0),
    COALESCE(v_source.rating_fiabilidad, 0.2)
  )
  RETURNING id INTO v_local_id;

  PERFORM public._create_empty_jugador_stats(v_local_id);

  UPDATE public.organizer_player_access
  SET local_jugador_id = v_local_id,
      updated_at = now()
  WHERE id = v_access.id;

  RETURN v_local_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_granted_player_local(uuid) TO authenticated;

-- Backfill one-shot: sincronizar todos los clones cedidos activos desde su origen.
DO $$
DECLARE
  v_access public.organizer_player_access%ROWTYPE;
  v_source public.riviera_jugadores%ROWTYPE;
BEGIN
  FOR v_access IN
    SELECT *
    FROM public.organizer_player_access opa
    WHERE opa.is_active = true
      AND opa.local_jugador_id IS NOT NULL
  LOOP
    SELECT *
    INTO v_source
    FROM public.riviera_jugadores rj
    WHERE rj.id = v_access.jugador_id;

    IF FOUND THEN
      PERFORM public._apply_granted_local_identity_sync(v_access, v_source);
    END IF;
  END LOOP;
END $$;

-- Privacidad: quitar contacto personal ya copiado en clones cedidos existentes.
UPDATE public.riviera_jugadores local
SET
  email = NULL,
  telefono = NULL,
  whatsapp = NULL,
  instagram_url = NULL,
  facebook_url = NULL,
  tiktok_url = NULL,
  updated_at = now()
FROM public.organizer_player_access opa
WHERE opa.local_jugador_id = local.id
  AND opa.is_active = true
  AND opa.local_jugador_id IS NOT NULL
  AND (
    local.email IS NOT NULL
    OR local.telefono IS NOT NULL
    OR local.whatsapp IS NOT NULL
    OR local.instagram_url IS NOT NULL
    OR local.facebook_url IS NOT NULL
    OR local.tiktok_url IS NOT NULL
  );
