-- ROMC-1: Ranking Oficial Riviera Multi-Club — esquema base (identidad + ledger vacío).
-- Ejecutar en Supabase SQL Editor después de organizer-player-access.sql
--
-- NO escribe participaciones, NO modifica jugador_stats, NO engancha syncParticipaciones.
-- Diseño: docs/RANKING-OFICIAL-MULTI-CLUB.md
--
-- Reversible: DROP estas tablas → la app sigue igual (Fase 1 + rankings actuales intactos).

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Identidad oficial del jugador (puente pre-global_players)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.riviera_official_player_identity (
  official_player_key uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_riviera_jugador_id uuid NOT NULL
    REFERENCES public.riviera_jugadores(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ropi_canonical_jugador_unique UNIQUE (canonical_riviera_jugador_id)
);

COMMENT ON TABLE public.riviera_official_player_identity IS
  'Identidad estable para ranking oficial Riviera multi-club. Una clave por deportista (canonical = perfil dueño preferido).';

COMMENT ON COLUMN public.riviera_official_player_identity.official_player_key IS
  'Clave permanente de acumulación oficial; migrable a global_players.id en el futuro.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Enlace perfil local ↔ identidad oficial
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.riviera_official_player_profile_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_player_key uuid NOT NULL
    REFERENCES public.riviera_official_player_identity(official_player_key) ON DELETE CASCADE,
  riviera_jugador_id uuid NOT NULL
    REFERENCES public.riviera_jugadores(id) ON DELETE RESTRICT,
  organizer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  link_source text NOT NULL
    CHECK (link_source IN ('owner', 'granted_origin', 'granted_local', 'manual_admin')),
  organizer_player_access_id uuid
    REFERENCES public.organizer_player_access(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roppl_riviera_jugador_unique UNIQUE (riviera_jugador_id)
);

CREATE INDEX IF NOT EXISTS roppl_official_player_key_idx
  ON public.riviera_official_player_profile_link (official_player_key);

CREATE INDEX IF NOT EXISTS roppl_organizer_id_idx
  ON public.riviera_official_player_profile_link (organizer_id);

COMMENT ON TABLE public.riviera_official_player_profile_link IS
  'Cada riviera_jugadores.id enlazado a una sola official_player_key (perfiles por club).';

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Ledger oficial (estructura; ROMC-1 no inserta movimientos automáticos)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.riviera_official_points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_player_key uuid NOT NULL
    REFERENCES public.riviera_official_player_identity(official_player_key) ON DELETE RESTRICT,
  source_organizer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_local_jugador_id uuid NOT NULL
    REFERENCES public.riviera_jugadores(id) ON DELETE RESTRICT,
  participacion_id uuid NOT NULL
    REFERENCES public.jugador_participaciones(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  event_id uuid NOT NULL,
  event_name text NOT NULL,
  points integer NOT NULL CHECK (points >= 0),
  counts_for_official_ranking boolean NOT NULL DEFAULT true,
  source_club_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ropl_participacion_unique UNIQUE (participacion_id)
);

CREATE INDEX IF NOT EXISTS ropl_official_player_key_created_idx
  ON public.riviera_official_points_ledger (official_player_key, created_at DESC);

CREATE INDEX IF NOT EXISTS ropl_source_organizer_idx
  ON public.riviera_official_points_ledger (source_organizer_id);

COMMENT ON TABLE public.riviera_official_points_ledger IS
  'Movimientos del ranking oficial Riviera multi-club. UNIQUE(participacion_id) evita doble conteo. ROMC-1: sin escritura automática.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Totales agregados (inicializados en 0 al crear identidad)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.riviera_official_player_totals (
  official_player_key uuid PRIMARY KEY
    REFERENCES public.riviera_official_player_identity(official_player_key) ON DELETE CASCADE,
  points_total integer NOT NULL DEFAULT 0 CHECK (points_total >= 0),
  last_activity_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.riviera_official_player_totals IS
  'Agregado rápido por identidad oficial. ROMC-1: solo 0; actualización en ROMC-2+.';

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS — solo Admin Principal (sin políticas públicas en ROMC-1)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.riviera_official_player_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riviera_official_player_profile_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riviera_official_points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riviera_official_player_totals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ropi_admin_all ON public.riviera_official_player_identity;
CREATE POLICY ropi_admin_all ON public.riviera_official_player_identity
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS roppl_admin_all ON public.riviera_official_player_profile_link;
CREATE POLICY roppl_admin_all ON public.riviera_official_player_profile_link
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS ropl_admin_all ON public.riviera_official_points_ledger;
CREATE POLICY ropl_admin_all ON public.riviera_official_points_ledger
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS ropt_admin_all ON public.riviera_official_player_totals;
CREATE POLICY ropt_admin_all ON public.riviera_official_player_totals
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

-- ══════════════════════════════════════════════════════════════════════════════
-- Helper interno: resolver official_player_key desde riviera_jugador_id
-- (solo para RPCs admin; no expuesto a la app en ROMC-1)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._resolve_official_player_key(p_riviera_jugador_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key uuid;
  v_source_id uuid;
BEGIN
  SELECT l.official_player_key
  INTO v_key
  FROM public.riviera_official_player_profile_link l
  WHERE l.riviera_jugador_id = p_riviera_jugador_id;

  IF v_key IS NOT NULL THEN
    RETURN v_key;
  END IF;

  SELECT opa.jugador_id
  INTO v_source_id
  FROM public.organizer_player_access opa
  WHERE opa.is_active = true
    AND opa.local_jugador_id = p_riviera_jugador_id
  LIMIT 1;

  IF v_source_id IS NOT NULL THEN
    SELECT l.official_player_key
    INTO v_key
    FROM public.riviera_official_player_profile_link l
    WHERE l.riviera_jugador_id = v_source_id;
    IF v_key IS NOT NULL THEN
      RETURN v_key;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_official_player_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._resolve_official_player_key(uuid) FROM anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: crear identidad oficial desde jugador existente
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_create_official_player_identity_from_jugador(
  p_riviera_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_jugador record;
  v_key uuid;
  v_link_id uuid;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede crear identidad oficial';
  END IF;

  IF p_riviera_jugador_id IS NULL THEN
    RAISE EXCEPTION 'Jugador requerido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.riviera_official_player_profile_link l
    WHERE l.riviera_jugador_id = p_riviera_jugador_id
  ) THEN
    RAISE EXCEPTION 'Este jugador ya está vinculado a una identidad oficial';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.riviera_official_player_identity i
    WHERE i.canonical_riviera_jugador_id = p_riviera_jugador_id
  ) THEN
    RAISE EXCEPTION 'Ya existe identidad oficial con este jugador como canonical';
  END IF;

  SELECT rj.id, rj.organizador_id, rj.nombre
  INTO v_jugador
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_riviera_jugador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado';
  END IF;

  INSERT INTO public.riviera_official_player_identity (
    canonical_riviera_jugador_id,
    created_by
  )
  VALUES (p_riviera_jugador_id, v_admin)
  RETURNING official_player_key INTO v_key;

  INSERT INTO public.riviera_official_player_profile_link (
    official_player_key,
    riviera_jugador_id,
    organizer_id,
    link_source,
    created_by
  )
  VALUES (v_key, p_riviera_jugador_id, v_jugador.organizador_id, 'owner', v_admin)
  RETURNING id INTO v_link_id;

  INSERT INTO public.riviera_official_player_totals (official_player_key, points_total)
  VALUES (v_key, 0);

  RETURN jsonb_build_object(
    'official_player_key', v_key,
    'canonical_riviera_jugador_id', p_riviera_jugador_id,
    'canonical_nombre', v_jugador.nombre,
    'profile_link_id', v_link_id,
    'points_total', 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_official_player_identity_from_jugador(uuid)
  TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: vincular perfil local a identidad existente
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_link_official_player_profile(
  p_official_player_key uuid,
  p_riviera_jugador_id uuid,
  p_link_source text DEFAULT 'manual_admin',
  p_organizer_player_access_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_jugador record;
  v_link_id uuid;
  v_source text;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede vincular perfiles oficiales';
  END IF;

  IF p_official_player_key IS NULL OR p_riviera_jugador_id IS NULL THEN
    RAISE EXCEPTION 'Identidad y jugador requeridos';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.riviera_official_player_identity i
    WHERE i.official_player_key = p_official_player_key
  ) THEN
    RAISE EXCEPTION 'Identidad oficial no encontrada';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.riviera_official_player_profile_link l
    WHERE l.riviera_jugador_id = p_riviera_jugador_id
  ) THEN
    RAISE EXCEPTION 'Este jugador ya está vinculado a otra identidad oficial';
  END IF;

  v_source := coalesce(nullif(trim(p_link_source), ''), 'manual_admin');
  IF v_source NOT IN ('owner', 'granted_origin', 'granted_local', 'manual_admin') THEN
    RAISE EXCEPTION 'link_source inválido';
  END IF;

  IF p_organizer_player_access_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organizer_player_access opa
      WHERE opa.id = p_organizer_player_access_id
        AND opa.is_active = true
        AND (
          opa.jugador_id = p_riviera_jugador_id
          OR opa.local_jugador_id = p_riviera_jugador_id
        )
    ) THEN
      RAISE EXCEPTION 'Acceso concedido no válido para este jugador';
    END IF;
  END IF;

  SELECT rj.id, rj.organizador_id, rj.nombre
  INTO v_jugador
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_riviera_jugador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado';
  END IF;

  INSERT INTO public.riviera_official_player_profile_link (
    official_player_key,
    riviera_jugador_id,
    organizer_id,
    link_source,
    organizer_player_access_id,
    created_by
  )
  VALUES (
    p_official_player_key,
    p_riviera_jugador_id,
    v_jugador.organizador_id,
    v_source,
    p_organizer_player_access_id,
    v_admin
  )
  RETURNING id INTO v_link_id;

  RETURN jsonb_build_object(
    'profile_link_id', v_link_id,
    'official_player_key', p_official_player_key,
    'riviera_jugador_id', p_riviera_jugador_id,
    'jugador_nombre', v_jugador.nombre,
    'organizer_id', v_jugador.organizador_id,
    'link_source', v_source
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_link_official_player_profile(uuid, uuid, text, uuid)
  TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: desvincular perfil (no borra jugador ni historial)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_unlink_official_player_profile(
  p_profile_link_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede desvincular perfiles oficiales';
  END IF;

  SELECT
    l.id,
    l.official_player_key,
    l.riviera_jugador_id,
    l.link_source,
    i.canonical_riviera_jugador_id
  INTO v_row
  FROM public.riviera_official_player_profile_link l
  JOIN public.riviera_official_player_identity i
    ON i.official_player_key = l.official_player_key
  WHERE l.id = p_profile_link_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vínculo no encontrado';
  END IF;

  IF v_row.riviera_jugador_id = v_row.canonical_riviera_jugador_id THEN
    RAISE EXCEPTION
      'No se puede desvincular el perfil canonical. Cree otra identidad o vincule otro canonical antes.';
  END IF;

  DELETE FROM public.riviera_official_player_profile_link
  WHERE id = p_profile_link_id;

  RETURN jsonb_build_object(
    'unlinked', true,
    'profile_link_id', p_profile_link_id,
    'riviera_jugador_id', v_row.riviera_jugador_id,
    'official_player_key', v_row.official_player_key
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unlink_official_player_profile(uuid)
  TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: obtener identidad por jugador (incluye perfiles vinculados)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_get_official_player_identity_by_jugador(
  p_riviera_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key uuid;
  v_identity record;
  v_profiles jsonb;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede consultar identidades oficiales';
  END IF;

  v_key := public._resolve_official_player_key(p_riviera_jugador_id);

  IF v_key IS NULL THEN
    SELECT l.official_player_key
    INTO v_key
    FROM public.riviera_official_player_profile_link l
    WHERE l.riviera_jugador_id = p_riviera_jugador_id;
  END IF;

  IF v_key IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    i.official_player_key,
    i.canonical_riviera_jugador_id,
    i.created_at,
    cj.nombre AS canonical_nombre,
    coalesce(t.points_total, 0) AS points_total
  INTO v_identity
  FROM public.riviera_official_player_identity i
  LEFT JOIN public.riviera_official_player_totals t
    ON t.official_player_key = i.official_player_key
  LEFT JOIN public.riviera_jugadores cj
    ON cj.id = i.canonical_riviera_jugador_id
  WHERE i.official_player_key = v_key;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'profile_link_id', l.id,
        'riviera_jugador_id', l.riviera_jugador_id,
        'jugador_nombre', rj.nombre,
        'organizer_id', l.organizer_id,
        'organizer_name', coalesce(u.name, u.email, 'Organizador'),
        'link_source', l.link_source,
        'organizer_player_access_id', l.organizer_player_access_id,
        'created_at', l.created_at
      )
      ORDER BY l.created_at
    ),
    '[]'::jsonb
  )
  INTO v_profiles
  FROM public.riviera_official_player_profile_link l
  JOIN public.riviera_jugadores rj ON rj.id = l.riviera_jugador_id
  LEFT JOIN public.users u ON u.id = l.organizer_id
  WHERE l.official_player_key = v_key;

  RETURN jsonb_build_object(
    'official_player_key', v_identity.official_player_key,
    'canonical_riviera_jugador_id', v_identity.canonical_riviera_jugador_id,
    'canonical_nombre', v_identity.canonical_nombre,
    'points_total', v_identity.points_total,
    'created_at', v_identity.created_at,
    'profiles', v_profiles
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_official_player_identity_by_jugador(uuid)
  TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: listar perfiles de una identidad
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_list_official_player_profiles(
  p_official_player_key uuid
)
RETURNS TABLE (
  profile_link_id uuid,
  riviera_jugador_id uuid,
  jugador_nombre text,
  organizer_id uuid,
  organizer_name text,
  link_source text,
  organizer_player_access_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede listar perfiles oficiales';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.riviera_official_player_identity i
    WHERE i.official_player_key = p_official_player_key
  ) THEN
    RAISE EXCEPTION 'Identidad oficial no encontrada';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.riviera_jugador_id,
    rj.nombre::text,
    l.organizer_id,
    coalesce(u.name, u.email, 'Organizador')::text,
    l.link_source,
    l.organizer_player_access_id,
    l.created_at
  FROM public.riviera_official_player_profile_link l
  JOIN public.riviera_jugadores rj ON rj.id = l.riviera_jugador_id
  LEFT JOIN public.users u ON u.id = l.organizer_id
  WHERE l.official_player_key = p_official_player_key
  ORDER BY l.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_official_player_profiles(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
