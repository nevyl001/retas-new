-- Correctiva. Ambigüedad de correo por identidad canónica.
--
-- No toca cola, cron, secretos, rankings, jornadas, resultados ni identidades.
--
-- Problema: liga_notificacion_evaluar_correo trataba un roster sin Riviera ID
-- (identidad_global_id NULL) como una segunda identidad distinta al hacer
-- COALESCE(identidad_global_id, liga_jugador_id). Eso bloqueaba con
-- correo_ambiguo a jugadores inequívocos (p. ej. Daniel Nuñez en Liga 4ta)
-- cuando existía un liga_jugadores huérfano del mismo organizador con el
-- mismo correo y sin ficha Riviera.
--
-- Regla corregida (roster del mismo organizador, mismo correo):
--   * >1 identidad_global_id distinta  → correo_ambiguo (personas distintas)
--   * 0 identidades globales y >1 roster → correo_ambiguo (no se puede decidir)
--   * exactamente 1 identidad global   → ok (rosters sin global no inventan otra)
--
-- La comprobación global en riviera_jugadores (con cesiones) se conserva.
--
-- Contacto RPC: Production ya expone registro_autorizado_at. Se conserva y se
-- añade eval_correo. Postgres no permite cambiar RETURNS TABLE con
-- CREATE OR REPLACE, así que se hace DROP FUNCTION sin CASCADE tras verificar
-- que no hay dependientes de catálogo.

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
  v_globals integer;
  v_roster integer;
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

  SELECT organizador_id INTO v_org
  FROM public.liga_jugadores
  WHERE id = p_liga_jugador_id;

  -- Ambigüedad real: el mismo correo en DOS identidades globales distintas.
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

  -- Roster del mismo club: no inventar una segunda identidad con el id local
  -- cuando el correo ya resuelve a una sola identidad global.
  SELECT
    count(DISTINCT c.identidad_global_id)
      FILTER (WHERE c.identidad_global_id IS NOT NULL),
    count(DISTINCT c.liga_jugador_id)
  INTO v_globals, v_roster
  FROM public.liga_jugadores lj
  CROSS JOIN LATERAL public.liga_jugador_resolver_contacto(lj.id) c
  WHERE lj.organizador_id IS NOT DISTINCT FROM v_org
    AND c.email IS NOT NULL
    AND c.email = v_norm;

  IF v_globals > 1 THEN
    RETURN 'correo_ambiguo';
  END IF;
  IF v_globals = 0 AND v_roster > 1 THEN
    RETURN 'correo_ambiguo';
  END IF;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.liga_notificacion_evaluar_correo(uuid) IS
  'Evalúa el correo canónico del roster. Ambigüedad solo entre identidades globales distintas o entre varios rosters sin identidad.';

-- Fail closed si aparecieran dependientes inesperados (sin CASCADE).
DO $$
DECLARE
  v_deps integer;
BEGIN
  SELECT count(*)::integer INTO v_deps
  FROM pg_depend d
  JOIN pg_proc p ON p.oid = d.refobjid
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'liga_inscritos_contacto_autorizado'
    AND p.pronargs = 1
    AND d.deptype <> 'i'
    AND d.objid <> p.oid;

  IF v_deps > 0 THEN
    RAISE EXCEPTION
      'liga_inscritos_contacto_autorizado tiene % dependientes; abortar sin DROP CASCADE',
      v_deps;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.liga_inscritos_contacto_autorizado(uuid);

CREATE FUNCTION public.liga_inscritos_contacto_autorizado(
  p_liga_id uuid
)
RETURNS TABLE (
  liga_jugador_id uuid,
  email text,
  telefono text,
  riviera_jugador_id uuid,
  identidad_global_id uuid,
  origen text,
  registro_autorizado_at timestamp with time zone,
  eval_correo text
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
  SELECT
    c.liga_jugador_id,
    c.email,
    c.telefono,
    c.riviera_jugador_id,
    c.identidad_global_id,
    c.origen,
    CASE
      WHEN c.origen IN ('global_source', 'global_local') THEN (
        SELECT rj.created_at
        FROM public.riviera_jugadores rj
        WHERE rj.id = COALESCE(c.identidad_global_id, c.riviera_jugador_id)
          AND rj.estado IS DISTINCT FROM 'archivado'
      )
      ELSE NULL
    END,
    public.liga_notificacion_evaluar_correo(insc.jid) AS eval_correo
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

COMMENT ON FUNCTION public.liga_inscritos_contacto_autorizado(uuid) IS
  'Contacto de inscritos para el organizador, con evaluación canónica de correo.';

REVOKE ALL ON FUNCTION public.liga_inscritos_contacto_autorizado(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liga_inscritos_contacto_autorizado(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.liga_inscritos_contacto_autorizado(uuid)
  TO service_role;
