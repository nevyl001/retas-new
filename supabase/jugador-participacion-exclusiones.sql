-- Exclusiones permanentes de participaciones eliminadas por el organizador.
-- Evita que «Importar historial» vuelva a crear eventos ya borrados.
-- Ejecutar después de delete-jugador-participacion-linked.sql y romc2b.

CREATE TABLE IF NOT EXISTS public.jugador_participacion_exclusiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_player_key uuid,
  scope_jugador_id uuid,
  tipo_evento text NOT NULL,
  evento_id uuid NOT NULL,
  evento_nombre text,
  deleted_by_organizador_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jugador_participacion_exclusiones_scope_chk CHECK (
    official_player_key IS NOT NULL OR scope_jugador_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS jugador_participacion_exclusiones_romc_uidx
  ON public.jugador_participacion_exclusiones (official_player_key, tipo_evento, evento_id)
  WHERE official_player_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS jugador_participacion_exclusiones_local_uidx
  ON public.jugador_participacion_exclusiones (scope_jugador_id, tipo_evento, evento_id)
  WHERE official_player_key IS NULL AND scope_jugador_id IS NOT NULL;

COMMENT ON TABLE public.jugador_participacion_exclusiones IS
  'Tombstones de participaciones borradas manualmente. Bloquea re-import/sync del mismo evento.';

GRANT SELECT ON public.jugador_participacion_exclusiones TO authenticated;

CREATE OR REPLACE FUNCTION public.is_jugador_participacion_excluded(
  p_jugador_id uuid,
  p_tipo_evento text,
  p_evento_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    SELECT public.resolve_official_player_key_for_jugador(p_jugador_id) AS official_key
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.jugador_participacion_exclusiones e, ctx
    WHERE e.tipo_evento = p_tipo_evento
      AND e.evento_id = p_evento_id
      AND (
        (ctx.official_key IS NOT NULL AND e.official_player_key = ctx.official_key)
        OR (ctx.official_key IS NULL AND e.scope_jugador_id = p_jugador_id)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_jugador_participacion_excluded(uuid, text, uuid)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_jugador_participacion_linked(
  p_organizador_id uuid,
  p_view_jugador_id uuid,
  p_participacion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_part record;
  v_official_key uuid;
  v_deleted_count integer := 0;
  v_jid uuid;
  v_rebuilt uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_organizador_id IS NULL OR p_view_jugador_id IS NULL OR p_participacion_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_organizador_id THEN
    RAISE EXCEPTION 'Sin permiso para gestionar este registro';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.riviera_jugadores rj
    WHERE rj.id = p_view_jugador_id
      AND rj.organizador_id = p_organizador_id
  ) THEN
    RAISE EXCEPTION 'Jugador no encontrado o sin permiso';
  END IF;

  SELECT
    jp.id,
    jp.jugador_id,
    jp.evento_nombre,
    jp.tipo_evento::text AS tipo_evento,
    jp.evento_id
  INTO v_part
  FROM public.jugador_participaciones jp
  WHERE jp.id = p_participacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de historial no encontrado';
  END IF;

  v_official_key := public.resolve_official_player_key_for_jugador(p_view_jugador_id);

  IF v_official_key IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public._riviera_official_jugador_ids_for_key(v_official_key) linked
      WHERE linked.riviera_jugador_id = v_part.jugador_id
    ) THEN
      RAISE EXCEPTION 'La participación no pertenece a este jugador enlazado';
    END IF;

    INSERT INTO public.jugador_participacion_exclusiones (
      official_player_key,
      tipo_evento,
      evento_id,
      evento_nombre,
      deleted_by_organizador_id
    ) VALUES (
      v_official_key,
      v_part.tipo_evento,
      v_part.evento_id,
      v_part.evento_nombre,
      p_organizador_id
    )
    ON CONFLICT DO NOTHING;

    DELETE FROM public.jugador_participaciones jp
    WHERE jp.tipo_evento::text = v_part.tipo_evento
      AND jp.evento_id = v_part.evento_id
      AND jp.jugador_id IN (
        SELECT linked.riviera_jugador_id
        FROM public._riviera_official_jugador_ids_for_key(v_official_key) linked
      );

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    FOR v_jid IN
      SELECT linked.riviera_jugador_id
      FROM public._riviera_official_jugador_ids_for_key(v_official_key) linked
    LOOP
      BEGIN
        PERFORM public.refresh_jugador_stats(v_jid);
        v_rebuilt := array_append(v_rebuilt, v_jid);
      EXCEPTION
        WHEN undefined_function THEN
          NULL;
      END;
    END LOOP;
  ELSE
    IF v_part.jugador_id IS DISTINCT FROM p_view_jugador_id THEN
      RAISE EXCEPTION 'La participación no pertenece a este jugador';
    END IF;

    INSERT INTO public.jugador_participacion_exclusiones (
      scope_jugador_id,
      tipo_evento,
      evento_id,
      evento_nombre,
      deleted_by_organizador_id
    ) VALUES (
      p_view_jugador_id,
      v_part.tipo_evento,
      v_part.evento_id,
      v_part.evento_nombre,
      p_organizador_id
    )
    ON CONFLICT DO NOTHING;

    DELETE FROM public.jugador_participaciones
    WHERE id = p_participacion_id;

    v_deleted_count := 1;

    BEGIN
      PERFORM public.refresh_jugador_stats(v_part.jugador_id);
      v_rebuilt := array_append(v_rebuilt, v_part.jugador_id);
    EXCEPTION
      WHEN undefined_function THEN
        NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'participacion_id', p_participacion_id,
    'source_jugador_id', v_part.jugador_id,
    'view_jugador_id', p_view_jugador_id,
    'evento_nombre', v_part.evento_nombre,
    'tipo_evento', v_part.tipo_evento,
    'evento_id', v_part.evento_id,
    'deleted_count', v_deleted_count,
    'rebuilt_jugador_ids', to_jsonb(v_rebuilt)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid) IS
  'Elimina un evento del historial en TODOS los perfiles ROMC enlazados, registra exclusión y recalcula stats.';

NOTIFY pgrst, 'reload schema';
