-- Flex: una sola vía para capturar y corregir marcadores.
--
-- 1. flex_corregir_marcador corrige UN partido ya confirmado (ronda confirmada
--    o jornada finalizada). Es atómica: el servidor recalcula games, diferencia,
--    posición y puntos con flex_rank_scores, reemplaza las posiciones de la
--    jornada (nunca suma encima) y recalcula la clasificación general con
--    flex_escribir_posiciones. Si la corrección deja un empate que cambia los
--    puntos, devuelve needs_resolution y NO escribe nada.
-- 2. Audita resultado anterior, resultado nuevo, motivo, administrador y fecha
--    en liga_flex_auditoria (accion = 'corregir_marcador').
-- 3. flex_guardar_marcador deja de aceptar cambios sobre una ronda confirmada:
--    esos cambios solo entran por la corrección con motivo.
--
-- No toca parejas, rivales, canchas ni rondas generadas. flex_corregir_jornada
-- se conserva sin cambios.

CREATE OR REPLACE FUNCTION public.flex_guardar_marcador(
  p_partido_id uuid,
  p_score_a integer,
  p_score_b integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jornada uuid;
  v_liga uuid;
  v_estado text;
  v_liga_estado text;
  v_ronda integer;
  v_prev_a integer;
  v_prev_b integer;
BEGIN
  SELECT p.jornada_id, j.liga_id, j.estado, l.estado,
         p.ronda, p.score_pareja1, p.score_pareja2
    INTO v_jornada, v_liga, v_estado, v_liga_estado,
         v_ronda, v_prev_a, v_prev_b
  FROM public.liga_partidos p
  JOIN public.liga_jornadas j ON j.id = p.jornada_id
  JOIN public.ligas l ON l.id = j.liga_id
  WHERE p.id = p_partido_id
  FOR UPDATE OF j;

  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para este marcador.');
  END IF;
  IF v_liga_estado = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La temporada está cerrada. Reábrela para una corrección.');
  END IF;
  IF v_estado = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La jornada ya tiene puntos oficiales. Usa la corrección con motivo.');
  END IF;
  IF p_score_a IS NULL OR p_score_b IS NULL OR p_score_a < 0 OR p_score_b < 0 OR p_score_a > 99 OR p_score_b > 99 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El marcador tiene que ser un entero entre 0 y 99.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('flex-jornada'), hashtext(v_jornada::text));

  IF (v_prev_a IS NOT NULL OR v_prev_b IS NOT NULL) AND EXISTS (
    SELECT 1 FROM public.liga_flex_auditoria a
    WHERE a.jornada_id = v_jornada
      AND a.accion = 'confirmar_ronda'
      AND (a.detalle->>'ronda')::int = v_ronda
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La ronda ya está confirmada. Usa Editar para corregirla con motivo.');
  END IF;

  UPDATE public.liga_partidos
     SET score_pareja1 = p_score_a,
         score_pareja2 = p_score_b,
         estado = 'completed'
   WHERE id = p_partido_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.flex_corregir_marcador(
  p_partido_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_motivo text,
  p_orden uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_motivo text;
  v_jornada uuid;
  v_liga uuid;
  v_estado text;
  v_liga_estado text;
  v_ronda integer;
  v_cancha integer;
  v_prev_a integer;
  v_prev_b integer;
  v_confirmada boolean;
  v_rank jsonb;
BEGIN
  v_motivo := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  IF v_motivo IS NULL OR char_length(v_motivo) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Escribe el motivo de la corrección (mínimo 4 caracteres).');
  END IF;
  IF char_length(v_motivo) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El motivo es demasiado largo (máximo 300 caracteres).');
  END IF;

  SELECT p.jornada_id, j.liga_id, j.estado, l.estado, p.ronda, p.cancha
    INTO v_jornada, v_liga, v_estado, v_liga_estado, v_ronda, v_cancha
  FROM public.liga_partidos p
  JOIN public.liga_jornadas j ON j.id = p.jornada_id
  JOIN public.ligas l ON l.id = j.liga_id
  WHERE p.id = p_partido_id
  FOR UPDATE OF j;

  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para corregir este marcador.');
  END IF;
  IF v_liga_estado = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La temporada ya tiene campeón. Reábrela con motivo antes de corregir.');
  END IF;
  IF p_score_a IS NULL OR p_score_b IS NULL OR p_score_a < 0 OR p_score_b < 0 OR p_score_a > 99 OR p_score_b > 99 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El marcador tiene que ser un entero entre 0 y 99.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('flex-jornada'), hashtext(v_jornada::text));

  -- Se lee de nuevo bajo el candado: el resultado anterior que se audita es el
  -- que de verdad estaba guardado, no el que el cliente tenía en pantalla.
  SELECT score_pareja1, score_pareja2
    INTO v_prev_a, v_prev_b
  FROM public.liga_partidos
  WHERE id = p_partido_id;

  IF v_prev_a IS NULL OR v_prev_b IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El partido todavía no tiene marcador. Captúralo con Guardar.');
  END IF;

  v_confirmada := v_estado = 'completed' OR EXISTS (
    SELECT 1 FROM public.liga_flex_auditoria a
    WHERE a.jornada_id = v_jornada
      AND a.accion = 'confirmar_ronda'
      AND (a.detalle->>'ronda')::int = v_ronda
  );
  IF NOT v_confirmada THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La ronda sigue abierta. Edita el marcador con Guardar.');
  END IF;

  IF v_prev_a = p_score_a AND v_prev_b = p_score_b THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true);
  END IF;

  IF v_estado = 'completed' THEN
    DROP TABLE IF EXISTS pg_temp.flex_score_override;
    CREATE TEMP TABLE flex_score_override (
      partido_id uuid PRIMARY KEY,
      score_a integer,
      score_b integer
    ) ON COMMIT DROP;
    INSERT INTO flex_score_override (partido_id, score_a, score_b)
    VALUES (p_partido_id, p_score_a, p_score_b);

    v_rank := public.flex_rank_scores(v_jornada, p_orden);
    IF COALESCE((v_rank->>'ok')::boolean, false) IS NOT TRUE THEN
      DROP TABLE IF EXISTS pg_temp.flex_score_override;
      RETURN v_rank;
    END IF;

    UPDATE public.liga_partidos
       SET score_pareja1 = p_score_a,
           score_pareja2 = p_score_b,
           estado = 'completed'
     WHERE id = p_partido_id;

    PERFORM public.flex_escribir_posiciones(v_jornada, v_rank->'rows');
    DROP TABLE IF EXISTS pg_temp.flex_score_override;
  ELSE
    UPDATE public.liga_partidos
       SET score_pareja1 = p_score_a,
           score_pareja2 = p_score_b,
           estado = 'completed'
     WHERE id = p_partido_id;
  END IF;

  INSERT INTO public.liga_flex_auditoria (liga_id, jornada_id, actor_id, accion, detalle)
  VALUES (
    v_liga, v_jornada, auth.uid(), 'corregir_marcador',
    jsonb_build_object(
      'partido_id', p_partido_id,
      'ronda', v_ronda,
      'cancha', v_cancha,
      'anterior', jsonb_build_object('a', v_prev_a, 'b', v_prev_b),
      'nuevo', jsonb_build_object('a', p_score_a, 'b', p_score_b),
      'motivo', v_motivo,
      'jornada_finalizada', v_estado = 'completed'
    )
  );

  RETURN jsonb_build_object('ok', true, 'jornada_finalizada', v_estado = 'completed');
END;
$$;

REVOKE ALL ON FUNCTION public.flex_corregir_marcador(uuid, integer, integer, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flex_corregir_marcador(uuid, integer, integer, text, uuid[]) TO authenticated;
