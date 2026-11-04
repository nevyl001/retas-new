-- =============================================================================
-- Sustitución de jugadores en liga individual rotativa
-- Plaza competitiva = liga_inscripciones.id (jugador_id puede cambiar)
-- Puntos heredados: continuidad de clasificación sin reescribir historial
-- =============================================================================

ALTER TABLE public.liga_inscripciones
  ADD COLUMN IF NOT EXISTS puntos_heredados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ingreso_jornada_numero integer;

COMMENT ON COLUMN public.liga_inscripciones.puntos_heredados IS
  'Puntos de plaza transferidos por sustitución; no son puntos ganados por el jugador actual.';
COMMENT ON COLUMN public.liga_inscripciones.ingreso_jornada_numero IS
  'Jornada desde la que el jugador actual ocupa la plaza (null = desde el inicio).';

CREATE TABLE IF NOT EXISTS public.liga_sustituciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES public.ligas(id) ON DELETE CASCADE,
  plaza_inscripcion_id uuid NOT NULL REFERENCES public.liga_inscripciones(id) ON DELETE CASCADE,
  from_jugador_id uuid NOT NULL REFERENCES public.liga_jugadores(id),
  to_jugador_id uuid NOT NULL REFERENCES public.liga_jugadores(id),
  jornada_efectiva_id uuid NOT NULL REFERENCES public.liga_jornadas(id),
  jornada_efectiva_numero integer NOT NULL,
  puntos_heredados integer NOT NULL CHECK (puntos_heredados >= 0),
  motivo_categoria text NOT NULL
    CHECK (motivo_categoria IN ('lesion', 'baja', 'ausencia', 'otro')),
  motivo_detalle text,
  actor_id uuid NOT NULL,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  CONSTRAINT liga_sustituciones_jugadores_distintos
    CHECK (from_jugador_id <> to_jugador_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS liga_sustituciones_idempotency_uidx
  ON public.liga_sustituciones (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS liga_sustituciones_liga_idx
  ON public.liga_sustituciones (liga_id, created_at DESC);

CREATE INDEX IF NOT EXISTS liga_sustituciones_plaza_idx
  ON public.liga_sustituciones (plaza_inscripcion_id, created_at DESC);

ALTER TABLE public.liga_sustituciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS liga_sustituciones_select_organizer ON public.liga_sustituciones;
CREATE POLICY liga_sustituciones_select_organizer
  ON public.liga_sustituciones
  FOR SELECT
  TO authenticated
  USING (
    public.is_master_admin()
    OR EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS liga_sustituciones_select_public_liga ON public.liga_sustituciones;
CREATE POLICY liga_sustituciones_select_public_liga
  ON public.liga_sustituciones
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_id AND COALESCE(l.es_publica, false) = true
    )
  );

-- Solo vía RPC SECURITY DEFINER (sin insert/update/delete directos para clientes)
REVOKE ALL ON TABLE public.liga_sustituciones FROM PUBLIC;
GRANT SELECT ON TABLE public.liga_sustituciones TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.sustituir_jugador_liga_individual_rotativo(
  p_liga_id uuid,
  p_from_jugador_id uuid,
  p_to_jugador_id uuid,
  p_jornada_efectiva_id uuid,
  p_motivo_categoria text,
  p_motivo_detalle text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_liga record;
  v_insc record;
  v_jornada record;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo_categoria, '')), '');
  v_detalle text := NULLIF(btrim(COALESCE(p_motivo_detalle, '')), '');
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_existing record;
  v_conflict_partidos integer;
  v_parejas_updated integer := 0;
  v_parejas_batch integer := 0;
  v_puntos_heredados integer;
  v_sust_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF p_from_jugador_id IS NULL OR p_to_jugador_id IS NULL OR p_from_jugador_id = p_to_jugador_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Jugadores de origen y destino inválidos.');
  END IF;

  IF v_motivo IS NULL OR v_motivo NOT IN ('lesion', 'baja', 'ausencia', 'otro') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Motivo de sustitución inválido.');
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.liga_sustituciones
    WHERE idempotency_key = v_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'sustitucion_id', v_existing.id,
        'puntos_heredados', v_existing.puntos_heredados,
        'jornada_efectiva_numero', v_existing.jornada_efectiva_numero
      );
    END IF;
  END IF;

  SELECT id, organizador_id, modalidad, estado
  INTO v_liga
  FROM public.ligas
  WHERE id = p_liga_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Liga no encontrada.');
  END IF;

  IF v_liga.organizador_id <> v_caller AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes permiso para sustituir jugadores en esta liga.');
  END IF;

  IF v_liga.modalidad IS DISTINCT FROM 'individual_rotativo' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La sustitución está disponible solo en liga individual con parejas rotativas.');
  END IF;

  IF v_liga.estado = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se puede sustituir en una liga finalizada.');
  END IF;

  SELECT *
  INTO v_insc
  FROM public.liga_inscripciones
  WHERE liga_id = p_liga_id AND jugador_id = p_from_jugador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El jugador saliente no está inscrito en esta liga.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.liga_inscripciones
    WHERE liga_id = p_liga_id AND jugador_id = p_to_jugador_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El jugador entrante ya ocupa una plaza en esta liga.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.liga_jugadores
    WHERE id = p_to_jugador_id
      AND organizador_id = v_liga.organizador_id
      AND estado = 'activo'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El jugador entrante no pertenece al registro activo del club.');
  END IF;

  SELECT id, liga_id, numero, estado
  INTO v_jornada
  FROM public.liga_jornadas
  WHERE id = p_jornada_efectiva_id AND liga_id = p_liga_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Jornada de ingreso no encontrada.');
  END IF;

  IF v_jornada.estado = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se puede sustituir desde una jornada ya finalizada.');
  END IF;

  -- Conflictos: partidos con resultado en jornadas >= ingreso donde aparece el saliente
  SELECT count(*)::integer INTO v_conflict_partidos
  FROM public.liga_partidos p
  JOIN public.liga_jornadas j ON j.id = p.jornada_id
  JOIN public.liga_jornada_parejas pr
    ON pr.id IN (p.pareja1_id, p.pareja2_id)
  WHERE j.liga_id = p_liga_id
    AND j.numero >= v_jornada.numero
    AND (pr.jugador1_id = p_from_jugador_id OR pr.jugador2_id = p_from_jugador_id)
    AND (
      p.estado = 'completed'
      OR p.score_pareja1 IS NOT NULL
      OR p.score_pareja2 IS NOT NULL
      OR p.set_scores IS NOT NULL
    );

  IF v_conflict_partidos > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error',
      'Hay partidos con resultado desde esa jornada. Elige una jornada posterior sin marcadores o espera a resolver el conflicto.'
    );
  END IF;

  v_puntos_heredados := GREATEST(0, COALESCE(v_insc.puntos, 0));

  -- Reemplazar saliente → entrante en parejas futuras (misma plaza de calendario)
  UPDATE public.liga_jornada_parejas pr
  SET jugador1_id = p_to_jugador_id
  FROM public.liga_jornadas j
  WHERE pr.jornada_id = j.id
    AND j.liga_id = p_liga_id
    AND j.numero >= v_jornada.numero
    AND pr.jugador1_id = p_from_jugador_id;

  GET DIAGNOSTICS v_parejas_batch = ROW_COUNT;
  v_parejas_updated := v_parejas_updated + v_parejas_batch;

  UPDATE public.liga_jornada_parejas pr
  SET jugador2_id = p_to_jugador_id
  FROM public.liga_jornadas j
  WHERE pr.jornada_id = j.id
    AND j.liga_id = p_liga_id
    AND j.numero >= v_jornada.numero
    AND pr.jugador2_id = p_from_jugador_id;

  GET DIAGNOSTICS v_parejas_batch = ROW_COUNT;
  v_parejas_updated := v_parejas_updated + v_parejas_batch;

  UPDATE public.liga_inscripciones
  SET
    jugador_id = p_to_jugador_id,
    puntos_heredados = v_puntos_heredados,
    puntos = v_puntos_heredados,
    ingreso_jornada_numero = v_jornada.numero,
    puntos_ajuste_motivo = NULL,
    puntos_ajuste_at = NULL
  WHERE id = v_insc.id;

  INSERT INTO public.liga_sustituciones (
    liga_id,
    plaza_inscripcion_id,
    from_jugador_id,
    to_jugador_id,
    jornada_efectiva_id,
    jornada_efectiva_numero,
    puntos_heredados,
    motivo_categoria,
    motivo_detalle,
    actor_id,
    idempotency_key
  ) VALUES (
    p_liga_id,
    v_insc.id,
    p_from_jugador_id,
    p_to_jugador_id,
    v_jornada.id,
    v_jornada.numero,
    v_puntos_heredados,
    v_motivo,
    v_detalle,
    v_caller,
    v_key
  )
  RETURNING id INTO v_sust_id;

  RETURN jsonb_build_object(
    'ok', true,
    'sustitucion_id', v_sust_id,
    'plaza_inscripcion_id', v_insc.id,
    'puntos_heredados', v_puntos_heredados,
    'jornada_efectiva_numero', v_jornada.numero,
    'parejas_actualizadas', v_parejas_updated
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Conflicto de inscripción o clave duplicada. Recarga e inténtalo de nuevo.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.sustituir_jugador_liga_individual_rotativo(
  uuid, uuid, uuid, uuid, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sustituir_jugador_liga_individual_rotativo(
  uuid, uuid, uuid, uuid, text, text, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
