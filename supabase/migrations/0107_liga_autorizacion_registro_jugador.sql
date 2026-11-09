-- 0107: reutiliza el alta del Riviera ID como autorización de contacto deportivo.
--
-- NO APLICAR en producción hasta autorización explícita.
-- No inserta filas, no marca correos como consentimiento y no toca resultados.
-- Una revocación en liga_notificaciones_preferencias sigue ganando.
-- Un correo solo en el roster de la liga, sin Riviera ID, no autoriza.

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
  registro_autorizado_at timestamptz
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
    END
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

CREATE OR REPLACE FUNCTION public.liga_notificacion_elegible_manual(
  p_liga_id uuid,
  p_liga_jugador_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pref public.liga_notificaciones_preferencias%ROWTYPE;
  v_found boolean;
  v_correo text;
  v_origen text;
  v_identidad uuid;
  v_riviera uuid;
  v_registro timestamptz;
BEGIN
  SELECT * INTO v_pref
  FROM public.liga_notificaciones_preferencias
  WHERE liga_id = p_liga_id AND liga_jugador_id = p_liga_jugador_id;
  v_found := FOUND;

  IF v_found AND v_pref.consentimiento_estado = 'revocado' THEN
    RETURN 'excluido';
  END IF;

  IF NOT v_found OR NOT v_pref.admin_habilitado THEN
    RETURN 'deshabilitado';
  END IF;

  IF NOT (
    v_pref.consentimiento_estado = 'autorizado'
    AND v_pref.consentimiento_registrado_at IS NOT NULL
    AND v_pref.consentimiento_origen IS NOT NULL
    AND lower(btrim(v_pref.consentimiento_origen)) NOT IN (
      'inscripcion', 'confirmacion_inscripcion', 'tiene_correo', 'email'
    )
  ) THEN
    SELECT c.origen, c.identidad_global_id, c.riviera_jugador_id
      INTO v_origen, v_identidad, v_riviera
    FROM public.liga_jugador_resolver_contacto(p_liga_jugador_id) c
    LIMIT 1;

    IF v_origen IN ('global_source', 'global_local') THEN
      SELECT rj.created_at INTO v_registro
      FROM public.riviera_jugadores rj
      WHERE rj.id = COALESCE(v_identidad, v_riviera)
        AND rj.estado IS DISTINCT FROM 'archivado';
    END IF;

    IF v_registro IS NULL THEN
      RETURN 'sin_autorizacion';
    END IF;
  END IF;

  v_correo := public.liga_notificacion_evaluar_correo(p_liga_jugador_id);
  IF v_correo IS DISTINCT FROM 'ok' THEN
    RETURN v_correo;
  END IF;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.liga_notificacion_elegible_manual(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liga_notificacion_elegible_manual(uuid, uuid)
  TO authenticated;
