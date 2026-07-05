-- =============================================================================
-- Clones cedidos: copiar legacy_player_id + rating del origen al crear local
-- + backfill de clones existentes con 3.0 por defecto
-- =============================================================================
-- Raíz del problema: ensure_granted_player_local creaba filas sin rating ni
-- legacy_player_id → cada vista tenía que "adivinar" el rating canónico.
-- Ejecutar en Supabase SQL Editor (staging → prod).
-- Prerrequisito: organizer-player-access.sql
-- =============================================================================

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

  IF v_access.local_jugador_id IS NOT NULL THEN
    RETURN v_access.local_jugador_id;
  END IF;

  SELECT *
  INTO v_source
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_source_jugador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador origen no encontrado';
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
    v_source.email,
    v_source.telefono,
    v_source.whatsapp,
    v_source.nivel,
    v_categoria,
    v_source.edad,
    v_source.mano_dominante,
    v_source.en_cancha,
    v_source.pais_codigo,
    v_source.genero,
    v_source.club,
    v_source.foto_url,
    v_source.instagram_url,
    v_source.facebook_url,
    v_source.tiktok_url,
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

-- Backfill: clones existentes sin legacy o con rating por defecto sin partidos locales
UPDATE public.riviera_jugadores local
SET
  legacy_player_id = COALESCE(local.legacy_player_id, src.legacy_player_id),
  rating = CASE
    WHEN COALESCE(local.rating_partidos, 0) = 0
      AND COALESCE(src.rating_partidos, 0) > 0
    THEN src.rating
    ELSE local.rating
  END,
  rating_partidos = CASE
    WHEN COALESCE(local.rating_partidos, 0) = 0
      AND COALESCE(src.rating_partidos, 0) > 0
    THEN src.rating_partidos
    ELSE local.rating_partidos
  END,
  rating_fiabilidad = CASE
    WHEN COALESCE(local.rating_partidos, 0) = 0
      AND COALESCE(src.rating_partidos, 0) > 0
    THEN src.rating_fiabilidad
    ELSE local.rating_fiabilidad
  END
FROM public.organizer_player_access opa
JOIN public.riviera_jugadores src ON src.id = opa.jugador_id
WHERE opa.local_jugador_id = local.id
  AND opa.is_active = true
  AND (
    local.legacy_player_id IS NULL
    OR (
      COALESCE(local.rating, 3) = 3
      AND COALESCE(local.rating_partidos, 0) = 0
      AND COALESCE(src.rating_partidos, 0) > 0
    )
  );

NOTIFY pgrst, 'reload schema';
