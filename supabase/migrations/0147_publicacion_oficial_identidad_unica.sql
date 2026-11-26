-- Una identidad global (official_player_key / Riviera ID) admite como máximo
-- una ficha en el sitio oficial.
--
-- Causa: visible_publico vive en cada riviera_jugadores. La cesión crea un
-- clon local con visible_publico = false (o true si is_public_ranking). El
-- directorio del administrador leía ese booleano local, así que un jugador
-- ya publicado en su cuenta de origen aparecía como no publicado y se podía
-- activar una segunda ficha.
--
-- Esta migración no modifica jugadores, puntos, ledger, rating, cesiones ni
-- publicaciones históricas. Si una identidad ya tiene más de una ficha
-- publicada, no elige un ganador: la auditoría la reporta y el trigger
-- impide crear otra.

CREATE TABLE IF NOT EXISTS public.riviera_official_publication (
  official_player_key uuid PRIMARY KEY
    REFERENCES public.riviera_official_player_identity (official_player_key) ON DELETE CASCADE,
  riviera_jugador_id uuid NOT NULL
    REFERENCES public.riviera_jugadores (id) ON DELETE CASCADE,
  organizador_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT riviera_official_publication_jugador_unique UNIQUE (riviera_jugador_id)
);

COMMENT ON TABLE public.riviera_official_publication IS
  'Cupo único de publicación en el sitio oficial por identidad global. No sustituye el ledger ni el ranking.';

ALTER TABLE public.riviera_official_publication ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.riviera_official_publication FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.riviera_jugador_esta_publicado(p_jugador_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.riviera_jugadores rj
    WHERE rj.id = p_jugador_id
      AND rj.estado = 'activo'
      AND rj.visible_publico IS TRUE
      AND COALESCE(rj.suma_ranking, true)
  );
$$;

REVOKE ALL ON FUNCTION public.riviera_jugador_esta_publicado(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.riviera_ids_misma_identidad(p_jugador_id uuid)
RETURNS TABLE (jugador_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT p_jugador_id AS id
    UNION
    SELECT opa.jugador_id
    FROM public.organizer_player_access opa
    WHERE opa.is_active
      AND opa.local_jugador_id = p_jugador_id
    UNION
    SELECT opa.local_jugador_id
    FROM public.organizer_player_access opa
    WHERE opa.is_active
      AND opa.jugador_id = p_jugador_id
      AND opa.local_jugador_id IS NOT NULL
  ),
  clave AS (
    SELECT COALESCE(
      (
        SELECT l.official_player_key
        FROM public.riviera_official_player_profile_link l
        WHERE l.riviera_jugador_id = p_jugador_id
        LIMIT 1
      ),
      (
        SELECT l.official_player_key
        FROM public.riviera_official_player_profile_link l
        JOIN base b ON b.id = l.riviera_jugador_id
        LIMIT 1
      ),
      (
        SELECT i.official_player_key
        FROM public.riviera_official_player_identity i
        WHERE i.canonical_riviera_jugador_id IN (SELECT b.id FROM base b)
        LIMIT 1
      )
    ) AS key
  )
  SELECT DISTINCT x.id AS jugador_id
  FROM (
    SELECT b.id FROM base b
    UNION
    SELECT l.riviera_jugador_id
    FROM public.riviera_official_player_profile_link l
    WHERE l.official_player_key = (SELECT c.key FROM clave c)
      AND (SELECT c.key FROM clave c) IS NOT NULL
    UNION
    SELECT i.canonical_riviera_jugador_id
    FROM public.riviera_official_player_identity i
    WHERE i.official_player_key = (SELECT c.key FROM clave c)
      AND (SELECT c.key FROM clave c) IS NOT NULL
    UNION
    SELECT opa.local_jugador_id
    FROM public.riviera_official_player_identity i
    JOIN public.organizer_player_access opa
      ON opa.jugador_id = i.canonical_riviera_jugador_id
     AND opa.is_active
     AND opa.local_jugador_id IS NOT NULL
    WHERE i.official_player_key = (SELECT c.key FROM clave c)
      AND (SELECT c.key FROM clave c) IS NOT NULL
  ) x
  WHERE x.id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.riviera_ids_misma_identidad(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.riviera_estado_publicacion_oficial(p_jugador_id uuid)
RETURNS TABLE (
  jugador_id uuid,
  riviera_id text,
  official_player_key uuid,
  es_cedido boolean,
  publicado_global boolean,
  publicacion_propia boolean,
  perfil_publicado_id uuid,
  origen_organizador_id uuid,
  origen_nombre text,
  conflicto boolean,
  puede_publicar boolean,
  puede_retirar boolean,
  motivo_bloqueo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.riviera_jugadores%ROWTYPE;
  v_origen uuid;
  v_origen_org uuid;
  v_key uuid;
  v_riviera text;
  v_n_pub integer := 0;
  v_n_keys integer := 0;
  v_propia boolean := false;
  v_perfil uuid;
  v_es_cedido boolean := false;
  v_conflicto boolean := false;
  v_master boolean := public.is_master_admin();
  v_owner boolean := false;
BEGIN
  SELECT * INTO v_row
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_jugador_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_owner := auth.uid() IS NOT NULL AND auth.uid() = v_row.organizador_id;

  SELECT opa.jugador_id, src.organizador_id
  INTO v_origen, v_origen_org
  FROM public.organizer_player_access opa
  JOIN public.riviera_jugadores src ON src.id = opa.jugador_id
  WHERE opa.is_active
    AND opa.local_jugador_id = p_jugador_id
  ORDER BY opa.updated_at DESC NULLS LAST
  LIMIT 1;

  v_es_cedido := v_origen IS NOT NULL;

  SELECT COALESCE(
    (
      SELECT l.official_player_key
      FROM public.riviera_official_player_profile_link l
      WHERE l.riviera_jugador_id = p_jugador_id
      LIMIT 1
    ),
    (
      SELECT l.official_player_key
      FROM public.riviera_official_player_profile_link l
      WHERE l.riviera_jugador_id = v_origen
      LIMIT 1
    ),
    (
      SELECT i.official_player_key
      FROM public.riviera_official_player_identity i
      WHERE i.canonical_riviera_jugador_id = COALESCE(v_origen, p_jugador_id)
      LIMIT 1
    )
  )
  INTO v_key;

  IF v_key IS NOT NULL THEN
    SELECT i.riviera_id INTO v_riviera
    FROM public.riviera_official_player_identity i
    WHERE i.official_player_key = v_key;
  END IF;

  SELECT
    count(*) FILTER (WHERE public.riviera_jugador_esta_publicado(f.jugador_id)),
    count(DISTINCT l.official_player_key)
  INTO v_n_pub, v_n_keys
  FROM public.riviera_ids_misma_identidad(p_jugador_id) f
  LEFT JOIN public.riviera_official_player_profile_link l
    ON l.riviera_jugador_id = f.jugador_id;

  v_propia := public.riviera_jugador_esta_publicado(p_jugador_id);
  v_conflicto := v_n_pub > 1 OR v_n_keys > 1;

  SELECT f.jugador_id
  INTO v_perfil
  FROM public.riviera_ids_misma_identidad(p_jugador_id) f
  JOIN public.riviera_jugadores rj ON rj.id = f.jugador_id
  LEFT JOIN public.riviera_official_player_identity i
    ON i.official_player_key = v_key
  WHERE public.riviera_jugador_esta_publicado(f.jugador_id)
  ORDER BY (rj.id = i.canonical_riviera_jugador_id) DESC NULLS LAST, rj.created_at
  LIMIT 1;

  jugador_id := p_jugador_id;
  riviera_id := v_riviera;
  official_player_key := v_key;
  es_cedido := v_es_cedido;
  publicado_global := v_n_pub > 0;
  publicacion_propia := v_propia;
  perfil_publicado_id := v_perfil;
  origen_organizador_id := CASE WHEN v_es_cedido THEN v_origen_org ELSE NULL END;
  origen_nombre := CASE
    WHEN v_es_cedido THEN public.get_organizador_display_name(v_origen_org)
    ELSE NULL
  END;
  conflicto := v_conflicto;
  puede_publicar := v_row.estado = 'activo'
    AND NOT v_conflicto
    AND v_n_pub = 0
    AND (
      (v_es_cedido AND v_master)
      OR (NOT v_es_cedido AND (v_master OR v_owner))
    );
  puede_retirar := v_row.estado = 'activo'
    AND NOT v_conflicto
    AND v_propia
    AND NOT v_es_cedido
    AND (v_master OR v_owner);
  motivo_bloqueo := CASE
    WHEN v_row.estado <> 'activo' THEN 'El jugador está archivado.'
    WHEN v_conflicto THEN 'Hay más de una publicación o más de una identidad enlazada. No se fusionó ningún registro.'
    WHEN v_es_cedido AND v_n_pub > 0 THEN 'Ya publicado en sitio oficial.'
    WHEN v_es_cedido AND NOT v_master THEN 'La cuenta propietaria publica esta identidad.'
    ELSE NULL
  END;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.riviera_estado_publicacion_oficial(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_directorio_publicacion_oficial(p_organizador_id uuid)
RETURNS TABLE (
  jugador_id uuid,
  riviera_id text,
  official_player_key uuid,
  es_cedido boolean,
  publicado_global boolean,
  publicacion_propia boolean,
  perfil_publicado_id uuid,
  origen_organizador_id uuid,
  origen_nombre text,
  conflicto boolean,
  puede_publicar boolean,
  puede_retirar boolean,
  motivo_bloqueo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_organizador_id IS NULL
     OR (NOT public.is_master_admin() AND auth.uid() IS DISTINCT FROM p_organizador_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH jugadores AS (
    SELECT rj.id, rj.organizador_id, rj.estado, rj.visible_publico, rj.suma_ranking, rj.created_at
    FROM public.riviera_jugadores rj
    WHERE rj.organizador_id = p_organizador_id
  ),
  cesion AS (
    SELECT DISTINCT ON (opa.local_jugador_id)
      opa.local_jugador_id,
      opa.jugador_id AS origen_id,
      src.organizador_id AS origen_organizador_id
    FROM public.organizer_player_access opa
    JOIN public.riviera_jugadores src ON src.id = opa.jugador_id
    WHERE opa.is_active
      AND opa.local_jugador_id IN (SELECT j.id FROM jugadores j)
    ORDER BY opa.local_jugador_id, opa.updated_at DESC NULLS LAST
  ),
  clave AS (
    SELECT
      j.id AS jugador_id,
      j.organizador_id,
      j.estado,
      j.created_at,
      (
        j.estado = 'activo'
        AND j.visible_publico IS TRUE
        AND COALESCE(j.suma_ranking, true)
      ) AS propia,
      c.origen_id,
      c.origen_organizador_id,
      (c.local_jugador_id IS NOT NULL) AS es_cedido,
      COALESCE(lp.official_player_key, lo.official_player_key, ic.official_player_key, io.official_player_key) AS official_player_key
    FROM jugadores j
    LEFT JOIN cesion c ON c.local_jugador_id = j.id
    LEFT JOIN public.riviera_official_player_profile_link lp ON lp.riviera_jugador_id = j.id
    LEFT JOIN public.riviera_official_player_profile_link lo ON lo.riviera_jugador_id = c.origen_id
    LEFT JOIN public.riviera_official_player_identity ic ON ic.canonical_riviera_jugador_id = j.id
    LEFT JOIN public.riviera_official_player_identity io ON io.canonical_riviera_jugador_id = c.origen_id
  ),
  familia AS (
    SELECT c.jugador_id, c.jugador_id AS perfil_id
    FROM clave c
    UNION
    SELECT c.jugador_id, c.origen_id
    FROM clave c
    WHERE c.origen_id IS NOT NULL
    UNION
    SELECT c.jugador_id, l.riviera_jugador_id
    FROM clave c
    JOIN public.riviera_official_player_profile_link l
      ON l.official_player_key = c.official_player_key
    WHERE c.official_player_key IS NOT NULL
    UNION
    SELECT c.jugador_id, i.canonical_riviera_jugador_id
    FROM clave c
    JOIN public.riviera_official_player_identity i
      ON i.official_player_key = c.official_player_key
    WHERE c.official_player_key IS NOT NULL
    UNION
    SELECT c.jugador_id, opa.local_jugador_id
    FROM clave c
    JOIN public.organizer_player_access opa
      ON opa.jugador_id = COALESCE(c.origen_id, c.jugador_id)
     AND opa.is_active
     AND opa.local_jugador_id IS NOT NULL
  ),
  familia_unica AS (
    SELECT DISTINCT f.jugador_id, f.perfil_id
    FROM familia f
    WHERE f.perfil_id IS NOT NULL
  ),
  stats AS (
    SELECT
      f.jugador_id,
      count(*) FILTER (
        WHERE rj.estado = 'activo'
          AND rj.visible_publico IS TRUE
          AND COALESCE(rj.suma_ranking, true)
      )::integer AS n_pub,
      count(DISTINCT l.official_player_key)::integer AS n_keys
    FROM familia_unica f
    JOIN public.riviera_jugadores rj ON rj.id = f.perfil_id
    LEFT JOIN public.riviera_official_player_profile_link l
      ON l.riviera_jugador_id = f.perfil_id
    GROUP BY f.jugador_id
  ),
  perfil AS (
    SELECT DISTINCT ON (f.jugador_id)
      f.jugador_id,
      f.perfil_id
    FROM familia_unica f
    JOIN public.riviera_jugadores rj ON rj.id = f.perfil_id
    JOIN clave c ON c.jugador_id = f.jugador_id
    LEFT JOIN public.riviera_official_player_identity i
      ON i.official_player_key = c.official_player_key
    WHERE rj.estado = 'activo'
      AND rj.visible_publico IS TRUE
      AND COALESCE(rj.suma_ranking, true)
    ORDER BY f.jugador_id, (rj.id = i.canonical_riviera_jugador_id) DESC NULLS LAST, rj.created_at
  )
  SELECT
    c.jugador_id,
    ident.riviera_id,
    c.official_player_key,
    c.es_cedido,
    COALESCE(s.n_pub, 0) > 0,
    c.propia,
    p.perfil_id,
    CASE WHEN c.es_cedido THEN c.origen_organizador_id ELSE NULL END,
    CASE
      WHEN c.es_cedido THEN public.get_organizador_display_name(c.origen_organizador_id)
      ELSE NULL
    END,
    (COALESCE(s.n_pub, 0) > 1 OR COALESCE(s.n_keys, 0) > 1),
    (
      c.estado = 'activo'
      AND NOT (COALESCE(s.n_pub, 0) > 1 OR COALESCE(s.n_keys, 0) > 1)
      AND COALESCE(s.n_pub, 0) = 0
      AND (
        (c.es_cedido AND public.is_master_admin())
        OR (
          NOT c.es_cedido
          AND (public.is_master_admin() OR auth.uid() = c.organizador_id)
        )
      )
    ),
    (
      c.estado = 'activo'
      AND NOT (COALESCE(s.n_pub, 0) > 1 OR COALESCE(s.n_keys, 0) > 1)
      AND c.propia
      AND NOT c.es_cedido
      AND (public.is_master_admin() OR auth.uid() = c.organizador_id)
    ),
    CASE
      WHEN c.estado <> 'activo' THEN 'El jugador está archivado.'
      WHEN COALESCE(s.n_pub, 0) > 1 OR COALESCE(s.n_keys, 0) > 1
        THEN 'Hay más de una publicación o más de una identidad enlazada. No se fusionó ningún registro.'
      WHEN c.es_cedido AND COALESCE(s.n_pub, 0) > 0 THEN 'Ya publicado en sitio oficial.'
      WHEN c.es_cedido AND NOT public.is_master_admin()
        THEN 'La cuenta propietaria publica esta identidad.'
      ELSE NULL
    END
  FROM clave c
  LEFT JOIN stats s ON s.jugador_id = c.jugador_id
  LEFT JOIN perfil p ON p.jugador_id = c.jugador_id
  LEFT JOIN public.riviera_official_player_identity ident
    ON ident.official_player_key = c.official_player_key;
END;
$$;

COMMENT ON FUNCTION public.admin_directorio_publicacion_oficial(uuid) IS
  'Estado de publicación oficial del directorio de una cuenta, resuelto por identidad global en una sola llamada.';

REVOKE ALL ON FUNCTION public.admin_directorio_publicacion_oficial(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_directorio_publicacion_oficial(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.riviera_guard_publicacion_oficial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_was boolean := false;
  v_now boolean;
  v_cedido boolean;
  v_key uuid;
  v_otros integer := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.visible_publico IS NOT DISTINCT FROM OLD.visible_publico
       AND NEW.estado IS NOT DISTINCT FROM OLD.estado
       AND NEW.suma_ranking IS NOT DISTINCT FROM OLD.suma_ranking THEN
      RETURN NEW;
    END IF;

    v_was := OLD.estado = 'activo'
      AND OLD.visible_publico IS TRUE
      AND COALESCE(OLD.suma_ranking, true);
  END IF;

  v_cedido := EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.is_active
      AND opa.local_jugador_id = NEW.id
  );

  -- Un clon cedido no puede convertirse en una segunda ficha oficial.
  -- Se corrige el valor en lugar de abortar la cesión que lo está creando.
  IF v_cedido AND NOT v_was AND NEW.visible_publico IS TRUE AND NEW.estado = 'activo' THEN
    NEW.visible_publico := false;
  END IF;

  v_now := NEW.estado = 'activo'
    AND NEW.visible_publico IS TRUE
    AND COALESCE(NEW.suma_ranking, true);

  IF NOT v_now THEN
    DELETE FROM public.riviera_official_publication p
    WHERE p.riviera_jugador_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Una ficha que ya estaba publicada se conserva, también si es un duplicado histórico.
  IF v_was THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO v_otros
  FROM public.riviera_ids_misma_identidad(NEW.id) f
  WHERE f.jugador_id IS DISTINCT FROM NEW.id
    AND public.riviera_jugador_esta_publicado(f.jugador_id);

  IF v_otros > 0 THEN
    RAISE EXCEPTION 'ya_publicado'
      USING ERRCODE = '23505',
            MESSAGE = 'Ya publicado en sitio oficial';
  END IF;

  SELECT COALESCE(
    public._resolve_official_player_key(NEW.id),
    (
      SELECT i.official_player_key
      FROM public.riviera_official_player_identity i
      WHERE i.canonical_riviera_jugador_id = NEW.id
      LIMIT 1
    )
  )
  INTO v_key;

  IF v_key IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.riviera_official_publication (
    official_player_key, riviera_jugador_id, organizador_id
  )
  VALUES (v_key, NEW.id, NEW.organizador_id)
  ON CONFLICT (official_player_key) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
    FROM public.riviera_official_publication p
    WHERE p.official_player_key = v_key
      AND p.riviera_jugador_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'ya_publicado'
      USING ERRCODE = '23505',
            MESSAGE = 'Ya publicado en sitio oficial';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.riviera_guard_publicacion_oficial() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_riviera_jugadores_publicacion_unica ON public.riviera_jugadores;
CREATE TRIGGER trg_riviera_jugadores_publicacion_unica
  BEFORE INSERT OR UPDATE OF visible_publico, estado, suma_ranking
  ON public.riviera_jugadores
  FOR EACH ROW
  EXECUTE FUNCTION public.riviera_guard_publicacion_oficial();

CREATE OR REPLACE FUNCTION public.riviera_clon_sin_publicacion_propia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.local_jugador_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.local_jugador_id IS NOT DISTINCT FROM NEW.local_jugador_id THEN
    RETURN NEW;
  END IF;

  UPDATE public.riviera_jugadores rj
  SET visible_publico = false,
      updated_at = now()
  WHERE rj.id = NEW.local_jugador_id
    AND rj.visible_publico IS TRUE;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.riviera_clon_sin_publicacion_propia() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_opa_clon_sin_publicacion_propia ON public.organizer_player_access;
CREATE TRIGGER trg_opa_clon_sin_publicacion_propia
  AFTER INSERT OR UPDATE OF local_jugador_id
  ON public.organizer_player_access
  FOR EACH ROW
  EXECUTE FUNCTION public.riviera_clon_sin_publicacion_propia();

CREATE OR REPLACE FUNCTION public.admin_set_publicacion_oficial(
  p_organizador_id uuid,
  p_jugador_id uuid,
  p_publicar boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_est record;
  v_objetivo uuid;
  v_org uuid;
  v_key uuid;
  v_visible boolean;
BEGIN
  IF p_organizador_id IS NULL OR p_jugador_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_autorizado', 'publicado', false);
  END IF;

  IF NOT public.is_master_admin() AND auth.uid() IS DISTINCT FROM p_organizador_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_autorizado', 'publicado', false);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.riviera_jugadores rj
    WHERE rj.id = p_jugador_id
      AND rj.organizador_id = p_organizador_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_autorizado', 'publicado', false);
  END IF;

  SELECT * INTO v_est
  FROM public.riviera_estado_publicacion_oficial(p_jugador_id);

  v_key := v_est.official_player_key;
  PERFORM pg_advisory_xact_lock(
    hashtext('riviera-pub:' || COALESCE(v_key::text, p_jugador_id::text))
  );

  SELECT * INTO v_est
  FROM public.riviera_estado_publicacion_oficial(p_jugador_id);

  IF v_est.conflicto THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'conflicto',
      'publicado', v_est.publicado_global,
      'perfil_publicado_id', v_est.perfil_publicado_id,
      'origen_nombre', v_est.origen_nombre,
      'organizador_publicado_id', NULL
    );
  END IF;

  IF NOT p_publicar THEN
    IF NOT v_est.puede_retirar THEN
      RETURN jsonb_build_object(
        'ok', true,
        'code', CASE WHEN v_est.publicado_global THEN 'ya_publicado' ELSE 'sin_cambio' END,
        'publicado', v_est.publicado_global,
        'perfil_publicado_id', v_est.perfil_publicado_id,
        'origen_nombre', v_est.origen_nombre,
        'organizador_publicado_id', NULL
      );
    END IF;

    UPDATE public.riviera_jugadores rj
    SET visible_publico = false,
        updated_at = now()
    WHERE rj.id = p_jugador_id;

    RETURN jsonb_build_object(
      'ok', true,
      'code', 'retirado',
      'publicado', false,
      'perfil_publicado_id', NULL,
      'origen_nombre', NULL,
      'organizador_publicado_id', p_organizador_id
    );
  END IF;

  IF v_est.publicado_global THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'ya_publicado',
      'publicado', true,
      'perfil_publicado_id', v_est.perfil_publicado_id,
      'origen_nombre', v_est.origen_nombre,
      'organizador_publicado_id', v_est.origen_organizador_id
    );
  END IF;

  IF NOT v_est.puede_publicar THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', CASE WHEN v_est.es_cedido THEN 'prohibido' ELSE 'no_autorizado' END,
      'publicado', false,
      'perfil_publicado_id', NULL,
      'origen_nombre', v_est.origen_nombre,
      'organizador_publicado_id', NULL
    );
  END IF;

  IF v_est.es_cedido THEN
    SELECT opa.jugador_id, src.organizador_id
    INTO v_objetivo, v_org
    FROM public.organizer_player_access opa
    JOIN public.riviera_jugadores src ON src.id = opa.jugador_id
    WHERE opa.is_active
      AND opa.local_jugador_id = p_jugador_id
    ORDER BY opa.updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_objetivo IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'prohibido',
        'publicado', false,
        'perfil_publicado_id', NULL,
        'origen_nombre', v_est.origen_nombre,
        'organizador_publicado_id', NULL
      );
    END IF;
  ELSE
    v_objetivo := p_jugador_id;
    v_org := p_organizador_id;
  END IF;

  BEGIN
    UPDATE public.riviera_jugadores rj
    SET visible_publico = true,
        updated_at = now()
    WHERE rj.id = v_objetivo
    RETURNING rj.visible_publico INTO v_visible;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE = '23505' OR SQLERRM ILIKE '%ya_publicado%' THEN
        RETURN jsonb_build_object(
          'ok', true,
          'code', 'ya_publicado',
          'publicado', true,
          'perfil_publicado_id', v_objetivo,
          'origen_nombre', v_est.origen_nombre,
          'organizador_publicado_id', v_org
        );
      END IF;
      RAISE;
  END;

  IF v_visible IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'prohibido',
      'publicado', false,
      'perfil_publicado_id', NULL,
      'origen_nombre', v_est.origen_nombre,
      'organizador_publicado_id', NULL
    );
  END IF;

  INSERT INTO public.organizador_game_modes (organizador_id, visible_ranking_oficial)
  VALUES (v_org, true)
  ON CONFLICT (organizador_id) DO UPDATE
  SET visible_ranking_oficial = true,
      updated_at = now()
  WHERE public.organizador_game_modes.visible_ranking_oficial IS DISTINCT FROM true;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'publicado',
    'publicado', true,
    'perfil_publicado_id', v_objetivo,
    'origen_nombre', v_est.origen_nombre,
    'organizador_publicado_id', v_org
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_publicacion_oficial(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_publicacion_oficial(uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_publicacion_oficial_masiva(
  p_organizador_id uuid,
  p_jugador_ids uuid[],
  p_publicar boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_result jsonb;
  v_code text;
  v_publicados integer := 0;
  v_ya integer := 0;
  v_retirados integer := 0;
  v_conflictos integer := 0;
  v_bloqueados integer := 0;
  v_no_autorizados integer := 0;
BEGIN
  IF NOT public.is_master_admin() AND auth.uid() IS DISTINCT FROM p_organizador_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_autorizado');
  END IF;

  IF p_jugador_ids IS NULL OR cardinality(p_jugador_ids) = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'publicados', 0,
      'ya_publicados', 0,
      'retirados', 0,
      'conflictos', 0,
      'bloqueados', 0,
      'no_autorizados', 0
    );
  END IF;

  IF cardinality(p_jugador_ids) > 5000 THEN
    RAISE EXCEPTION 'demasiados_jugadores';
  END IF;

  FOREACH v_id IN ARRAY p_jugador_ids LOOP
    v_result := public.admin_set_publicacion_oficial(p_organizador_id, v_id, p_publicar);
    v_code := v_result->>'code';
    IF v_code = 'publicado' THEN
      v_publicados := v_publicados + 1;
    ELSIF v_code = 'ya_publicado' THEN
      v_ya := v_ya + 1;
    ELSIF v_code = 'retirado' THEN
      v_retirados := v_retirados + 1;
    ELSIF v_code = 'conflicto' THEN
      v_conflictos := v_conflictos + 1;
    ELSIF v_code = 'no_autorizado' THEN
      v_no_autorizados := v_no_autorizados + 1;
    ELSIF v_code IN ('prohibido', 'sin_cambio') THEN
      v_bloqueados := v_bloqueados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'publicados', v_publicados,
    'ya_publicados', v_ya,
    'retirados', v_retirados,
    'conflictos', v_conflictos,
    'bloqueados', v_bloqueados,
    'no_autorizados', v_no_autorizados
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_publicacion_oficial_masiva(uuid, uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_publicacion_oficial_masiva(uuid, uuid[], boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.riviera_auditar_publicacion_oficial()
RETURNS TABLE (
  tipo text,
  official_player_key uuid,
  riviera_id text,
  jugador_id uuid,
  organizador_id uuid,
  nombre text,
  visible_publico boolean,
  detalle text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'no_autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH publicados AS (
    SELECT
      COALESCE(l.official_player_key, i.official_player_key) AS official_player_key,
      rj.id AS jugador_id,
      rj.organizador_id,
      rj.nombre,
      rj.visible_publico
    FROM public.riviera_jugadores rj
    LEFT JOIN public.riviera_official_player_profile_link l
      ON l.riviera_jugador_id = rj.id
    LEFT JOIN public.organizer_player_access opa
      ON opa.is_active
     AND opa.local_jugador_id = rj.id
    LEFT JOIN public.riviera_official_player_identity i
      ON i.canonical_riviera_jugador_id = COALESCE(opa.jugador_id, rj.id)
    WHERE rj.estado = 'activo'
      AND rj.visible_publico IS TRUE
      AND COALESCE(rj.suma_ranking, true)
      AND COALESCE(l.official_player_key, i.official_player_key) IS NOT NULL
  ),
  multi AS (
    SELECT p.official_player_key
    FROM publicados p
    GROUP BY p.official_player_key
    HAVING count(DISTINCT p.jugador_id) > 1
  )
  SELECT
    'publicacion_multiple'::text,
    p.official_player_key,
    ident.riviera_id,
    p.jugador_id,
    p.organizador_id,
    p.nombre,
    p.visible_publico,
    'La misma identidad global tiene más de una ficha publicada.'::text
  FROM publicados p
  JOIN multi m ON m.official_player_key = p.official_player_key
  LEFT JOIN public.riviera_official_player_identity ident
    ON ident.official_player_key = p.official_player_key

  UNION ALL

  SELECT
    'cedido_publicado_local'::text,
    COALESCE(ll.official_player_key, ident.official_player_key),
    ident.riviera_id,
    local_rj.id,
    local_rj.organizador_id,
    local_rj.nombre,
    local_rj.visible_publico,
    'El clon cedido está publicado por su cuenta.'::text
  FROM public.organizer_player_access opa
  JOIN public.riviera_jugadores local_rj ON local_rj.id = opa.local_jugador_id
  LEFT JOIN public.riviera_official_player_profile_link ll
    ON ll.riviera_jugador_id = local_rj.id
  LEFT JOIN public.riviera_official_player_identity ident
    ON ident.canonical_riviera_jugador_id = opa.jugador_id
  WHERE opa.is_active
    AND local_rj.estado = 'activo'
    AND local_rj.visible_publico IS TRUE
    AND COALESCE(local_rj.suma_ranking, true)

  UNION ALL

  SELECT
    'cedido_estado_local_distinto'::text,
    ident.official_player_key,
    ident.riviera_id,
    local_rj.id,
    local_rj.organizador_id,
    local_rj.nombre,
    local_rj.visible_publico,
    'La ficha local no está publicada, pero la identidad global sí.'::text
  FROM public.organizer_player_access opa
  JOIN public.riviera_jugadores local_rj ON local_rj.id = opa.local_jugador_id
  JOIN public.riviera_jugadores src ON src.id = opa.jugador_id
  LEFT JOIN public.riviera_official_player_identity ident
    ON ident.canonical_riviera_jugador_id = opa.jugador_id
  WHERE opa.is_active
    AND local_rj.visible_publico IS NOT TRUE
    AND src.estado = 'activo'
    AND src.visible_publico IS TRUE
    AND COALESCE(src.suma_ranking, true)

  UNION ALL

  SELECT
    'identidad_multiple'::text,
    ll.official_player_key,
    ident.riviera_id,
    local_rj.id,
    local_rj.organizador_id,
    local_rj.nombre,
    local_rj.visible_publico,
    'El clon y el origen apuntan a official_player_key distintos.'::text
  FROM public.organizer_player_access opa
  JOIN public.riviera_jugadores local_rj ON local_rj.id = opa.local_jugador_id
  JOIN public.riviera_official_player_profile_link ll
    ON ll.riviera_jugador_id = opa.local_jugador_id
  JOIN public.riviera_official_player_profile_link ls
    ON ls.riviera_jugador_id = opa.jugador_id
  LEFT JOIN public.riviera_official_player_identity ident
    ON ident.official_player_key = ll.official_player_key
  WHERE opa.is_active
    AND ll.official_player_key IS DISTINCT FROM ls.official_player_key

  UNION ALL

  SELECT
    'riviera_id_duplicado'::text,
    NULL::uuid,
    i.riviera_id,
    i.canonical_riviera_jugador_id,
    NULL::uuid,
    NULL::text,
    NULL::boolean,
    'Más de una identidad comparte el mismo Riviera ID.'::text
  FROM public.riviera_official_player_identity i
  JOIN (
    SELECT riviera_id
    FROM public.riviera_official_player_identity
    WHERE riviera_id IS NOT NULL
    GROUP BY riviera_id
    HAVING count(*) > 1
  ) d ON d.riviera_id = i.riviera_id;
END;
$$;

COMMENT ON FUNCTION public.riviera_auditar_publicacion_oficial() IS
  'Auditoría de solo lectura. No modifica jugadores, cesiones, puntos ni publicaciones.';

REVOKE ALL ON FUNCTION public.riviera_auditar_publicacion_oficial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.riviera_auditar_publicacion_oficial() TO authenticated;

-- Cupo solo para identidades que hoy tienen exactamente una ficha publicada.
-- Las que tienen más de una quedan fuera a propósito: no se elige un ganador.
INSERT INTO public.riviera_official_publication (
  official_player_key, riviera_jugador_id, organizador_id
)
SELECT s.official_player_key, s.jugador_id, s.organizador_id
FROM (
  SELECT
    p.official_player_key,
    p.jugador_id,
    p.organizador_id,
    count(*) OVER (PARTITION BY p.official_player_key) AS n,
    row_number() OVER (
      PARTITION BY p.official_player_key
      ORDER BY (p.jugador_id = ident.canonical_riviera_jugador_id) DESC, p.jugador_id
    ) AS rn
  FROM (
    SELECT DISTINCT
      COALESCE(l.official_player_key, i.official_player_key) AS official_player_key,
      rj.id AS jugador_id,
      rj.organizador_id
    FROM public.riviera_jugadores rj
    LEFT JOIN public.riviera_official_player_profile_link l
      ON l.riviera_jugador_id = rj.id
    LEFT JOIN public.organizer_player_access opa
      ON opa.is_active AND opa.local_jugador_id = rj.id
    LEFT JOIN public.riviera_official_player_identity i
      ON i.canonical_riviera_jugador_id = COALESCE(opa.jugador_id, rj.id)
    WHERE rj.estado = 'activo'
      AND rj.visible_publico IS TRUE
      AND COALESCE(rj.suma_ranking, true)
      AND COALESCE(l.official_player_key, i.official_player_key) IS NOT NULL
  ) p
  LEFT JOIN public.riviera_official_player_identity ident
    ON ident.official_player_key = p.official_player_key
) s
WHERE s.n = 1
  AND s.rn = 1
ON CONFLICT (official_player_key) DO NOTHING;
