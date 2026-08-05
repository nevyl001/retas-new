-- ══════════════════════════════════════════════════════════════════════════════
-- 0014 — Restaurar RPCs BLK-04 en producción
--
-- Causa (2026-08-04, reta Batalla RO 05653586-e720-45b1-ba0e-8710e05a3809):
--   El frontend llama registrar_participacion_jugador_con_ledger /
--   actualizar_participacion_jugador_con_ledger (src/lib/rivieraJugadores/
--   rivieraJugadoresService.ts). PostgREST responde PGRST202: la función no
--   está en el schema cache. Producción solo tiene
--   registrar_participacion_jugador. resultSaved=true, careerSynced=false.
--
-- Origen: la definición vive en 0005_participacion_con_ledger.sql pero no
-- llegó a este proyecto linked (migración no aplicada / entorno desalineado).
--
-- Esta migración es idempotente (CREATE OR REPLACE + REVOKE/GRANT) y NO
-- reescribe la lógica de negocio: wrappers que invocan en la misma
-- transacción registrar_participacion_jugador + try_write_riviera_official_ledger
-- (y el UPDATE ownership-safe en la rama de actualización).
--
-- Firma exacta que PostgREST busca (PGRST202 / payload FE):
--   registrar_participacion_jugador_con_ledger(
--     p_jugador_id uuid,
--     p_tipo_evento jugador_tipo_evento,
--     p_evento_id uuid,
--     p_evento_nombre text,
--     p_pareja_con text,
--     p_resultado jugador_resultado,
--     p_sets_favor integer,
--     p_sets_contra integer,
--     p_puntos_obtenidos integer,
--     p_metadata jsonb,
--     p_fecha date
--   ) RETURNS jsonb
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.registrar_participacion_jugador_con_ledger(
  p_jugador_id uuid,
  p_tipo_evento jugador_tipo_evento,
  p_evento_id uuid,
  p_evento_nombre text,
  p_pareja_con text DEFAULT NULL::text,
  p_resultado jugador_resultado DEFAULT 'participación'::jugador_resultado,
  p_sets_favor integer DEFAULT 0,
  p_sets_contra integer DEFAULT 0,
  p_puntos_obtenidos integer DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_fecha date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participacion_id uuid;
  v_ledger_result jsonb;
BEGIN
  -- Ownership/auth ya validados dentro de registrar_participacion_jugador.
  v_participacion_id := public.registrar_participacion_jugador(
    p_jugador_id, p_tipo_evento, p_evento_id, p_evento_nombre,
    p_pareja_con, p_resultado, p_sets_favor, p_sets_contra,
    p_puntos_obtenidos, p_metadata, p_fecha
  );

  -- try_write es idempotente por participacion_id; si el org no es emisor
  -- oficial, status 'skipped' (no error).
  v_ledger_result := public.try_write_riviera_official_ledger(v_participacion_id);

  RETURN jsonb_build_object(
    'ok', true,
    'participacion_id', v_participacion_id,
    'ledger', v_ledger_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_participacion_jugador_con_ledger(
  uuid, jugador_tipo_evento, uuid, text, text, jugador_resultado, integer, integer, integer, jsonb, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_participacion_jugador_con_ledger(
  uuid, jugador_tipo_evento, uuid, text, text, jugador_resultado, integer, integer, integer, jsonb, date
) TO authenticated;

CREATE OR REPLACE FUNCTION public.actualizar_participacion_jugador_con_ledger(
  p_participacion_id uuid,
  p_evento_nombre text,
  p_resultado jugador_resultado,
  p_sets_favor integer,
  p_sets_contra integer,
  p_puntos_obtenidos integer,
  p_pareja_con text,
  p_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jugador_organizador uuid;
  v_rows int;
  v_ledger_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT rj.organizador_id INTO v_jugador_organizador
  FROM public.jugador_participaciones jp
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  WHERE jp.id = p_participacion_id;

  IF v_jugador_organizador IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_jugador_organizador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para actualizar esta participación';
  END IF;

  UPDATE public.jugador_participaciones
  SET evento_nombre = p_evento_nombre,
      resultado = p_resultado,
      sets_favor = p_sets_favor,
      sets_contra = p_sets_contra,
      puntos_obtenidos = p_puntos_obtenidos,
      pareja_con = coalesce(p_pareja_con, pareja_con),
      metadata = p_metadata
  WHERE id = p_participacion_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_ledger_result := public.try_write_riviera_official_ledger(p_participacion_id);

  RETURN jsonb_build_object(
    'ok', true,
    'participacion_id', p_participacion_id,
    'ledger', v_ledger_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_participacion_jugador_con_ledger(
  uuid, text, jugador_resultado, integer, integer, integer, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_participacion_jugador_con_ledger(
  uuid, text, jugador_resultado, integer, integer, integer, text, jsonb
) TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.registrar_participacion_jugador_con_ledger(uuid,jugador_tipo_evento,uuid,text,text,jugador_resultado,integer,integer,integer,jsonb,date)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: registrar_participacion_jugador_con_ledger no existe tras el CREATE';
  END IF;
  IF to_regprocedure('public.actualizar_participacion_jugador_con_ledger(uuid,text,jugador_resultado,integer,integer,integer,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: actualizar_participacion_jugador_con_ledger no existe tras el CREATE';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
