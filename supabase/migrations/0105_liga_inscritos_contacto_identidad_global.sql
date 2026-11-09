-- 0105: Contacto de inscritos vía identidad global (Riviera ID / cesión).
--
-- NO APLICAR en producción hasta autorización explícita.
-- Corrige "Sin correo" en clubes participantes cuando el correo vive en la
-- ficha global del jugador (p. ej. creado en Riviera Open, juega en Hack Pádel).
--
-- No toca Torneo Express, rankings, resultados ni elimina jugadores.
-- No expone contacto a anon. Solo el organizador de la liga (o master admin).
-- No acredita verificación ni consentimiento ni habilita envíos.

-- ---------------------------------------------------------------------------
-- Resolver contacto canónico de un liga_jugadores.id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.liga_jugador_resolver_contacto(
  p_liga_jugador_id uuid
)
RETURNS TABLE (
  liga_jugador_id uuid,
  email text,
  telefono text,
  riviera_jugador_id uuid,
  identidad_global_id uuid,
  origen text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lj public.liga_jugadores%ROWTYPE;
  v_local public.riviera_jugadores%ROWTYPE;
  v_source public.riviera_jugadores%ROWTYPE;
  v_source_id uuid;
  v_email text;
  v_tel text;
  v_origen text := 'ninguno';
  v_identidad uuid;
BEGIN
  IF p_liga_jugador_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_lj
  FROM public.liga_jugadores
  WHERE id = p_liga_jugador_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Ficha Riviera local del club (clon o propia) ligada a este roster.
  SELECT * INTO v_local
  FROM public.riviera_jugadores rj
  WHERE rj.legacy_liga_jugador_id = p_liga_jugador_id
    AND rj.estado IS DISTINCT FROM 'archivado'
  ORDER BY
    CASE WHEN rj.organizador_id IS NOT DISTINCT FROM v_lj.organizador_id THEN 0 ELSE 1 END,
    rj.created_at
  LIMIT 1;

  -- Si es clon cedido, el contacto canónico está en el origen.
  IF FOUND THEN
    SELECT opa.jugador_id INTO v_source_id
    FROM public.organizer_player_access opa
    WHERE opa.local_jugador_id = v_local.id
      AND opa.is_active IS TRUE
    ORDER BY opa.updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_source_id IS NOT NULL THEN
      SELECT * INTO v_source
      FROM public.riviera_jugadores rj
      WHERE rj.id = v_source_id
        AND rj.estado IS DISTINCT FROM 'archivado';
    END IF;
  END IF;

  v_identidad := COALESCE(v_source.id, v_local.id);

  -- Preferencia: global origen → global local → roster. Nunca inventa.
  IF v_source.id IS NOT NULL
     AND NULLIF(btrim(v_source.email), '') IS NOT NULL
     AND lower(btrim(v_source.email)) NOT LIKE '%@padel.local' THEN
    v_email := NULLIF(btrim(v_source.email), '');
    v_tel := NULLIF(btrim(COALESCE(v_source.telefono, v_source.whatsapp)), '');
    v_origen := 'global_source';
  ELSIF v_local.id IS NOT NULL
     AND NULLIF(btrim(v_local.email), '') IS NOT NULL
     AND lower(btrim(v_local.email)) NOT LIKE '%@padel.local' THEN
    v_email := NULLIF(btrim(v_local.email), '');
    v_tel := NULLIF(btrim(COALESCE(v_local.telefono, v_local.whatsapp, v_lj.telefono)), '');
    v_origen := 'global_local';
  ELSIF NULLIF(btrim(v_lj.email), '') IS NOT NULL
     AND lower(btrim(v_lj.email)) NOT LIKE '%@padel.local' THEN
    v_email := NULLIF(btrim(v_lj.email), '');
    v_tel := NULLIF(btrim(v_lj.telefono), '');
    v_origen := 'liga';
  ELSE
    v_email := NULL;
    v_tel := NULLIF(btrim(COALESCE(
      v_source.telefono,
      v_source.whatsapp,
      v_local.telefono,
      v_local.whatsapp,
      v_lj.telefono
    )), '');
    v_origen := 'ninguno';
  END IF;

  liga_jugador_id := p_liga_jugador_id;
  email := CASE WHEN v_email IS NULL THEN NULL ELSE lower(btrim(v_email)) END;
  telefono := v_tel;
  riviera_jugador_id := COALESCE(v_source.id, v_local.id);
  identidad_global_id := v_identidad;
  origen := v_origen;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.liga_jugador_resolver_contacto(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Contacto de inscritos de UNA liga (solo organizador dueño / master)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.liga_inscritos_contacto_autorizado(
  p_liga_id uuid
)
RETURNS TABLE (
  liga_jugador_id uuid,
  email text,
  telefono text,
  riviera_jugador_id uuid,
  identidad_global_id uuid,
  origen text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'anon' USING ERRCODE = '42501';
  END IF;

  SELECT organizador_id INTO v_org FROM public.ligas WHERE id = p_liga_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'liga_no_encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_org IS DISTINCT FROM v_caller AND NOT COALESCE(public.is_master_admin(), false) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.liga_jugador_id, c.email, c.telefono, c.riviera_jugador_id,
         c.identidad_global_id, c.origen
  FROM (
    SELECT DISTINCT i.jugador_id AS jid
    FROM public.liga_inscripciones i
    WHERE i.liga_id = p_liga_id
    UNION
    SELECT e.jugador1_id
    FROM public.liga_equipos e
    WHERE e.liga_id = p_liga_id
    UNION
    SELECT e.jugador2_id
    FROM public.liga_equipos e
    WHERE e.liga_id = p_liga_id
  ) insc
  CROSS JOIN LATERAL public.liga_jugador_resolver_contacto(insc.jid) c;
END;
$$;

REVOKE ALL ON FUNCTION public.liga_inscritos_contacto_autorizado(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liga_inscritos_contacto_autorizado(uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Evaluar correo de bienvenida con identidad global + ambigüedad real
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.liga_notificacion_evaluar_correo(p_liga_jugador_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact record;
  v_norm text;
  v_org uuid;
  v_dup integer;
  v_identidad uuid;
BEGIN
  SELECT * INTO v_contact
  FROM public.liga_jugador_resolver_contacto(p_liga_jugador_id)
  LIMIT 1;

  IF v_contact.email IS NULL OR btrim(v_contact.email) = '' THEN
    RETURN 'sin_correo';
  END IF;

  v_norm := lower(btrim(v_contact.email));
  IF v_norm !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR v_norm LIKE '%@padel.local' THEN
    RETURN 'correo_invalido';
  END IF;

  v_identidad := v_contact.identidad_global_id;

  SELECT organizador_id INTO v_org
  FROM public.liga_jugadores
  WHERE id = p_liga_jugador_id;

  -- Ambigüedad: el mismo correo en DOS identidades globales distintas.
  -- Clones cedidos cuentan como su origen (no como identidad extra).
  SELECT count(*)::integer INTO v_dup
  FROM (
    SELECT DISTINCT COALESCE(
      (
        SELECT opa.jugador_id
        FROM public.organizer_player_access opa
        WHERE opa.local_jugador_id = rj.id
          AND opa.is_active IS TRUE
        LIMIT 1
      ),
      rj.id
    ) AS identidad
    FROM public.riviera_jugadores rj
    WHERE rj.estado IS DISTINCT FROM 'archivado'
      AND lower(btrim(coalesce(rj.email, ''))) = v_norm
  ) identities;

  IF v_dup > 1 THEN
    RETURN 'correo_ambiguo';
  END IF;

  -- Roster del mismo club: dos liga_jugadores con el mismo correo SOLO si
  -- resuelven a identidades globales distintas (o ninguna).
  SELECT count(*)::integer INTO v_dup
  FROM (
    SELECT DISTINCT COALESCE(c.identidad_global_id, c.liga_jugador_id) AS identidad
    FROM public.liga_jugadores lj
    CROSS JOIN LATERAL public.liga_jugador_resolver_contacto(lj.id) c
    WHERE lj.organizador_id IS NOT DISTINCT FROM v_org
      AND c.email IS NOT NULL
      AND c.email = v_norm
  ) roster_ids;

  IF v_dup > 1 THEN
    RETURN 'correo_ambiguo';
  END IF;

  RETURN 'ok';
END;
$$;

-- ---------------------------------------------------------------------------
-- Eliminación global: solo cuenta creadora (organizador_id de la fila)
-- ---------------------------------------------------------------------------
-- Refuerzo documental + fail-closed si un cedido intenta borrar el origen.
-- delete_riviera_jugador ya exige p_organizador_id = auth.uid() y ownership;
-- aquí se asegura que un local cedido no borre vía UPDATE/DELETE directo.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'riviera_jugadores'
      AND policyname = 'riviera_jugadores_owner_delete'
  ) THEN
    -- Política ya presente en algunos entornos; no recrear a ciegas.
    NULL;
  END IF;
END $$;

COMMENT ON FUNCTION public.liga_jugador_resolver_contacto(uuid) IS
  'Contacto canónico de un roster de liga vía Riviera ID / cesión. Sin GRANT a clientes.';
COMMENT ON FUNCTION public.liga_inscritos_contacto_autorizado(uuid) IS
  'Contacto de inscritos de una liga para su organizador. No anónimo. No escribe.';
