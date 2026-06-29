-- Fase 1: Acceso manual seguro entre organizadores (Admin Principal).
-- Ejecutar en Supabase SQL Editor después de admin-master-controls.sql
--
-- No migra historial, no recalcula rankings, no crea global_players.

-- ── Tabla de accesos ──
CREATE TABLE IF NOT EXISTS public.organizer_player_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  owner_organizador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grantee_organizer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_type text NOT NULL DEFAULT 'granted_by_admin'
    CHECK (access_type IN ('owner', 'granted_by_admin')),
  granted_by_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_public_ranking boolean NOT NULL DEFAULT false,
  local_category text,
  local_display_name text,
  local_jugador_id uuid REFERENCES public.riviera_jugadores(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizer_player_access_unique_grant
    UNIQUE (grantee_organizer_id, jugador_id),
  CONSTRAINT organizer_player_access_not_self
    CHECK (owner_organizador_id <> grantee_organizer_id)
);

CREATE INDEX IF NOT EXISTS organizer_player_access_grantee_active_idx
  ON public.organizer_player_access (grantee_organizer_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS organizer_player_access_jugador_idx
  ON public.organizer_player_access (jugador_id);

CREATE INDEX IF NOT EXISTS organizer_player_access_local_jugador_idx
  ON public.organizer_player_access (local_jugador_id)
  WHERE local_jugador_id IS NOT NULL;

COMMENT ON TABLE public.organizer_player_access IS
  'Acceso concedido por Admin Principal: un organizador puede usar jugadores de otra cuenta sin fusionar historial.';

-- ── RLS ──
ALTER TABLE public.organizer_player_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opa_select_master_admin ON public.organizer_player_access;
CREATE POLICY opa_select_master_admin ON public.organizer_player_access
  FOR SELECT TO authenticated
  USING (public.is_master_admin());

DROP POLICY IF EXISTS opa_mutate_master_admin ON public.organizer_player_access;
CREATE POLICY opa_mutate_master_admin ON public.organizer_player_access
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS opa_select_grantee ON public.organizer_player_access;
CREATE POLICY opa_select_grantee ON public.organizer_player_access
  FOR SELECT TO authenticated
  USING (
    grantee_organizer_id = auth.uid()
    AND is_active = true
  );

-- Lectura del jugador origen para el organizador con acceso concedido
DROP POLICY IF EXISTS rj_select_granted_access ON public.riviera_jugadores;
CREATE POLICY rj_select_granted_access ON public.riviera_jugadores
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organizer_player_access opa
      WHERE opa.jugador_id = riviera_jugadores.id
        AND opa.grantee_organizer_id = auth.uid()
        AND opa.is_active = true
    )
  );

-- Historial y estadísticas del jugador origen (solo lectura para el organizador con acceso)
DROP POLICY IF EXISTS jp_select_granted_access ON public.jugador_participaciones;
CREATE POLICY jp_select_granted_access ON public.jugador_participaciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organizer_player_access opa
      WHERE opa.jugador_id = jugador_participaciones.jugador_id
        AND opa.grantee_organizer_id = auth.uid()
        AND opa.is_active = true
    )
  );

DROP POLICY IF EXISTS js_select_granted_access ON public.jugador_stats;
CREATE POLICY js_select_granted_access ON public.jugador_stats
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organizer_player_access opa
      WHERE opa.jugador_id = jugador_stats.jugador_id
        AND opa.grantee_organizer_id = auth.uid()
        AND opa.is_active = true
    )
  );

-- ── Helpers internos ──
CREATE OR REPLACE FUNCTION public._slugify_jugador_nombre(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' FROM regexp_replace(
    lower(coalesce(p_nombre, 'jugador')),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
$$;

CREATE OR REPLACE FUNCTION public._ensure_unique_jugador_slug(
  p_organizador_id uuid,
  p_base_slug text,
  p_genero text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_slug text := coalesce(nullif(trim(p_base_slug), ''), 'jugador');
  v_try text := v_slug;
  v_suffix int := 0;
BEGIN
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.organizador_id = p_organizador_id
        AND rj.slug = v_try
        AND (
          (p_genero = 'F' AND rj.genero = 'F')
          OR (coalesce(p_genero, 'M') <> 'F' AND (rj.genero IS NULL OR rj.genero = 'M'))
        )
    ) THEN
      RETURN v_try;
    END IF;
    v_suffix := v_suffix + 1;
    v_try := v_slug || '-' || v_suffix::text;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public._create_empty_jugador_stats(p_jugador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.jugador_stats (
    jugador_id,
    total_partidos,
    victorias,
    derrotas,
    empates,
    participaciones_solo,
    pct_victorias,
    total_retas,
    total_torneos_express,
    total_ligas,
    total_americanos,
    sets_favor_total,
    sets_contra_total,
    racha_actual,
    puntos_totales
  )
  VALUES (
    p_jugador_id,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '', 0
  )
  ON CONFLICT (jugador_id) DO NOTHING;
END;
$$;

-- ── Perfil operativo local (solo cuando el organizador lo usa) ──
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
    estado
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
    false,
    CASE WHEN v_access.is_public_ranking THEN true ELSE false END,
    v_grantee,
    'activo'
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

-- ── Admin: otorgar acceso ──
CREATE OR REPLACE FUNCTION public.admin_grant_organizer_player_access(
  p_jugador_ids uuid[],
  p_grantee_organizer_id uuid,
  p_is_public_ranking boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_jugador_id uuid;
  v_owner uuid;
  v_granted int := 0;
  v_reactivated int := 0;
  v_skipped int := 0;
  v_was_active boolean;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede otorgar acceso';
  END IF;

  IF p_grantee_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Organizador destino requerido';
  END IF;

  IF p_jugador_ids IS NULL OR array_length(p_jugador_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecciona al menos un jugador';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_grantee_organizer_id) THEN
    RAISE EXCEPTION 'Organizador destino no encontrado';
  END IF;

  FOREACH v_jugador_id IN ARRAY p_jugador_ids LOOP
    SELECT rj.organizador_id
    INTO v_owner
    FROM public.riviera_jugadores rj
    WHERE rj.id = v_jugador_id;

    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_owner = p_grantee_organizer_id THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT opa.is_active
    INTO v_was_active
    FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = p_grantee_organizer_id
      AND opa.jugador_id = v_jugador_id;

    IF FOUND THEN
      IF v_was_active THEN
        v_skipped := v_skipped + 1;
        UPDATE public.organizer_player_access
        SET is_public_ranking = coalesce(p_is_public_ranking, organizer_player_access.is_public_ranking),
            updated_at = now()
        WHERE grantee_organizer_id = p_grantee_organizer_id
          AND jugador_id = v_jugador_id;
      ELSE
        UPDATE public.organizer_player_access
        SET is_active = true,
            granted_by_admin_id = v_admin,
            is_public_ranking = coalesce(p_is_public_ranking, organizer_player_access.is_public_ranking),
            updated_at = now()
        WHERE grantee_organizer_id = p_grantee_organizer_id
          AND jugador_id = v_jugador_id;
        v_reactivated := v_reactivated + 1;
      END IF;
    ELSE
      INSERT INTO public.organizer_player_access (
        jugador_id,
        owner_organizador_id,
        grantee_organizer_id,
        access_type,
        granted_by_admin_id,
        is_active,
        is_public_ranking
      )
      VALUES (
        v_jugador_id,
        v_owner,
        p_grantee_organizer_id,
        'granted_by_admin',
        v_admin,
        true,
        coalesce(p_is_public_ranking, false)
      );
      v_granted := v_granted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'granted', v_granted,
    'reactivated', v_reactivated,
    'skipped', v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_grant_organizer_player_access(uuid[], uuid, boolean) TO authenticated;

-- ── Admin: quitar acceso (soft) ──
CREATE OR REPLACE FUNCTION public.admin_revoke_organizer_player_access(p_access_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede quitar acceso';
  END IF;

  UPDATE public.organizer_player_access
  SET is_active = false,
      updated_at = now()
  WHERE id = p_access_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acceso no encontrado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_organizer_player_access(uuid) TO authenticated;

-- ── Admin: listar accesos de un jugador ──
CREATE OR REPLACE FUNCTION public.admin_list_organizer_player_access(p_jugador_id uuid)
RETURNS TABLE (
  id uuid,
  grantee_organizer_id uuid,
  grantee_name text,
  grantee_email text,
  is_active boolean,
  is_public_ranking boolean,
  local_jugador_id uuid,
  granted_by_admin_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede ver accesos';
  END IF;

  RETURN QUERY
  SELECT
    opa.id,
    opa.grantee_organizer_id,
    coalesce(u.name, '')::text AS grantee_name,
    coalesce(u.email, '')::text AS grantee_email,
    opa.is_active,
    opa.is_public_ranking,
    opa.local_jugador_id,
    opa.granted_by_admin_id,
    opa.created_at,
    opa.updated_at
  FROM public.organizer_player_access opa
  LEFT JOIN public.users u ON u.id = opa.grantee_organizer_id
  WHERE opa.jugador_id = p_jugador_id
  ORDER BY opa.is_active DESC, u.name NULLS LAST, opa.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_organizer_player_access(uuid) TO authenticated;
