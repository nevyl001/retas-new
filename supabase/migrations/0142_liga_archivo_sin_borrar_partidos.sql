-- Una liga con jornadas, partidos o participación oficial no se borra.
-- liga_partidos.liga_id (playoffs y fase regular de parejas con playoffs)
-- apunta a ligas sin ON DELETE CASCADE. DELETE FROM ligas chocaba con
-- liga_partidos_liga_id_fkey. No se cambia esa llave: el borrado físico
-- solo procede si no hay historial, y el resto se archiva.

ALTER TABLE public.ligas DROP CONSTRAINT IF EXISTS ligas_estado_check;
ALTER TABLE public.ligas
  ADD CONSTRAINT ligas_estado_check
  CHECK (estado = ANY (ARRAY['upcoming'::text, 'in_progress'::text, 'completed'::text, 'archived'::text]));

COMMENT ON CONSTRAINT ligas_estado_check ON public.ligas IS
  'archived conserva jornadas, partidos, resultados y puntos. No es una competencia activa.';

CREATE OR REPLACE FUNCTION public.is_liga_public(p_liga_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p_liga_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.ligas l
      WHERE l.id = p_liga_id
        AND l.estado IS DISTINCT FROM 'archived'
        AND COALESCE(l.es_publica, true) = true
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_liga_cascade(
  p_organizador_id uuid,
  p_liga_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_partido_id uuid;
  v_participacion_id uuid;
  v_participaciones_revertidas int := 0;
  v_rating_revertido int := 0;
BEGIN
  IF p_organizador_id IS NULL OR p_liga_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos';
  END IF;

  SELECT organizador_id INTO v_owner FROM ligas WHERE id = p_liga_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found', 'liga_id', p_liga_id);
  END IF;

  IF auth.uid() IS NULL OR (v_owner IS DISTINCT FROM auth.uid() AND NOT public.is_master_admin()) THEN
    RAISE EXCEPTION 'Sin permiso para eliminar esta liga' USING ERRCODE = '42501';
  END IF;
  IF v_owner IS DISTINCT FROM p_organizador_id THEN
    RAISE EXCEPTION 'p_organizador_id no coincide con el dueño real de la liga' USING ERRCODE = '42501';
  END IF;

  -- Historial deportivo: no borrar y no tocar rating ni ledger.
  IF EXISTS (SELECT 1 FROM public.liga_jornadas WHERE liga_id = p_liga_id)
     OR EXISTS (SELECT 1 FROM public.liga_partidos WHERE liga_id = p_liga_id)
     OR EXISTS (
       SELECT 1
       FROM public.jugador_participaciones
       WHERE tipo_evento = 'liga'
         AND evento_id = p_liga_id
     )
  THEN
    RETURN jsonb_build_object(
      'status', 'has_activity',
      'liga_id', p_liga_id
    );
  END IF;

  FOR v_partido_id IN
    SELECT lp.id
    FROM liga_partidos lp
    JOIN liga_jornadas lj ON lj.id = lp.jornada_id
    WHERE lj.liga_id = p_liga_id
  LOOP
    PERFORM public._revert_rating_for_partido_ref('liga:' || v_partido_id::text);
    v_rating_revertido := v_rating_revertido + 1;
  END LOOP;

  FOR v_participacion_id IN
    SELECT id FROM jugador_participaciones
    WHERE tipo_evento = 'liga'
      AND (
        evento_id = p_liga_id
        OR evento_id IN (SELECT id FROM liga_jornadas WHERE liga_id = p_liga_id)
      )
  LOOP
    PERFORM public._reverse_ledger_for_participacion_safe(v_participacion_id);
    DELETE FROM jugador_participaciones WHERE id = v_participacion_id;
    v_participaciones_revertidas := v_participaciones_revertidas + 1;
  END LOOP;

  DELETE FROM ligas WHERE id = p_liga_id;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'liga_id', p_liga_id,
    'participaciones_revertidas', v_participaciones_revertidas,
    'partidos_rating_revertido', v_rating_revertido
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_archive_liga(
  p_organizador_id uuid,
  p_liga_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_organizador_id IS NULL OR p_liga_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos';
  END IF;

  SELECT organizador_id INTO v_owner FROM public.ligas WHERE id = p_liga_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found', 'liga_id', p_liga_id);
  END IF;

  IF auth.uid() IS NULL OR (v_owner IS DISTINCT FROM auth.uid() AND NOT public.is_master_admin()) THEN
    RAISE EXCEPTION 'Sin permiso para archivar esta liga' USING ERRCODE = '42501';
  END IF;
  IF v_owner IS DISTINCT FROM p_organizador_id THEN
    RAISE EXCEPTION 'p_organizador_id no coincide con el dueño real de la liga' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ligas
  SET estado = 'archived',
      es_publica = false
  WHERE id = p_liga_id;

  IF to_regclass('public.liga_notificaciones_queue') IS NOT NULL THEN
    UPDATE public.liga_notificaciones_queue
    SET estado = 'omitido'
    WHERE liga_id = p_liga_id
      AND estado IN ('pendiente', 'pausado');
  END IF;

  RETURN jsonb_build_object('status', 'archived', 'liga_id', p_liga_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_archive_liga(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_archive_liga(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_archive_liga(uuid, uuid) IS
  'Oculta la liga de la competencia activa. No borra partidos, resultados, puntos ni el ledger.';
