-- ══════════════════════════════════════════════════════════════════════════════
-- BLK-04 — Ranking local y ledger oficial global no transaccionales
--
-- Problema (confirmado, src/lib/rivieraJugadores/syncParticipaciones.ts):
--   safeRegistrar() (líneas 365-430) llama registrarParticipacion() (RPC
--   registrar_participacion_jugador, escribe jugador_participaciones LOCAL) y
--   LUEGO, en una llamada de red SEPARADA, tryWriteRivieraOfficialLedger()
--   (RPC try_write_riviera_official_ledger, escribe el ledger GLOBAL). Son 2
--   round-trips independientes desde el navegador — si el primero completa y
--   el segundo falla (red, tab cerrado, error transitorio), el ranking local
--   queda escrito pero el ranking oficial global nunca se actualiza. Mismo
--   patrón en upsertParticipacionRanking() (líneas 472-573) para la rama de
--   actualización (UPDATE directo + tryWriteRivieraOfficialLedger separado).
--   Ya causó un incidente real documentado:
--   supabase/backup-fase35-ledger-totals-desalineados-20260729.sql.
--
-- Mapeo de consumidores (confirmado por lectura completa del pipeline en
-- syncParticipaciones.ts): safeRegistrar() y upsertParticipacionRanking() son
-- el ÚNICO pipeline de escritura en caliente usado por las 6 modalidades
-- (Reta, Reta Abierta, Americano, Duelo 2v2, Torneo Express, Liga) — todas
-- pasan por registrarPuntosRanking() -> una de estas dos funciones. Los
-- flujos de reversión/eliminación (admin_delete_liga_cascade,
-- admin_delete_torneo_express_categoria_cascade) YA revierten ledger+local
-- dentro de su propia transacción SQL — no se tocan aquí, ya cumplen el
-- patrón correcto. El reintento manual histórico
-- (retry_official_ledger_for_organizer) queda intacto como red de seguridad
-- para datos ya desalineados — fuera de alcance corregir hacia atrás aquí.
--
-- Un tercer caller de registrar_participacion_jugador
-- (adjustRankingPuntosManual, "ajuste manual") NO se toca: su
-- metadata.subtipo='ajuste_manual' ya hace que
-- try_write_riviera_official_ledger() se salte a sí mismo sin escribir nada
-- -- no tiene sentido envolverlo en la RPC combinada.
--
-- Opción elegida: RPC única compuesta (no outbox). Se descarta outbox porque
-- el "consumidor" (try_write_riviera_official_ledger) YA EXISTE y YA ES
-- IDEMPOTENTE por participacion_id (ON CONFLICT ... DO UPDATE ajustando por
-- delta, ver fix-rank001-rating-ledger-reconciliation-20260729.sql) -- el
-- problema real no es "el navegador se puede desconectar por un proceso
-- largo", es "son 2 statements HTTP separados que pueden fallar
-- independientemente". Envolver ambos en una función PL/pgSQL que se invoca
-- con UNA sola llamada RPC resuelve exactamente eso: si la segunda falla,
-- Postgres revierte automáticamente también la primera (misma transacción
-- implícita de la llamada). Un outbox añadiría una tabla de cola, un
-- consumidor server-side y reintentos propios sin resolver nada que esta
-- solución más simple no resuelva ya, dado que ambos pasos ocurren siempre
-- en el mismo request del usuario.
--
-- No se reescribe la lógica de negocio de ninguna de las dos funciones
-- (ninguna cambia una sola línea) -- solo se agregan 2 wrappers nuevos,
-- aditivos, que las invocan en secuencia dentro de su propio cuerpo.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + REVOKE/GRANT son repetibles sin
-- error. Idempotencia de negocio heredada sin cambios de
-- registrar_participacion_jugador (ON CONFLICT por jugador/tipo/evento/
-- resultado) y de try_write_riviera_official_ledger (ON CONFLICT por
-- participacion_id).
--
-- Rollback: DROP FUNCTION public.registrar_participacion_jugador_con_ledger(...);
--           DROP FUNCTION public.actualizar_participacion_jugador_con_ledger(...);
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
  -- registrar_participacion_jugador ya valida auth.uid()/ownership por su
  -- cuenta (guard NULL-safe, hotfix 2026-07-26) -- no se duplica aquí.
  v_participacion_id := public.registrar_participacion_jugador(
    p_jugador_id, p_tipo_evento, p_evento_id, p_evento_nombre,
    p_pareja_con, p_resultado, p_sets_favor, p_sets_contra,
    p_puntos_obtenidos, p_metadata, p_fecha
  );

  -- try_write_riviera_official_ledger valida internamente su propia
  -- autorización (_is_official_ranking_emitter) -- si el organizador no está
  -- habilitado como emisor oficial, simplemente se salta (status 'skipped'),
  -- no lanza error; esa es su semántica original, sin cambios.
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

-- ── Rama de actualización (upsertParticipacionRanking, existing branch) ──
-- Replica EXACTAMENTE el UPDATE que hoy hace el cliente directo sobre
-- jugador_participaciones (src/lib/rivieraJugadores/syncParticipaciones.ts,
-- líneas 533-544), con el guard de ownership explícito (esa función, al ser
-- SECURITY DEFINER, no pasa por RLS -- hoy ese UPDATE directo SÍ pasaba por
-- RLS porque lo hacía el cliente con su propia sesión; aquí se hace
-- explícito el mismo criterio: el jugador debe pertenecer al organizador
-- autenticado).
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

-- ── Verificación en la misma transacción implícita del CREATE anterior ───
DO $$
BEGIN
  IF to_regprocedure('public.registrar_participacion_jugador_con_ledger(uuid,jugador_tipo_evento,uuid,text,text,jugador_resultado,integer,integer,integer,jsonb,date)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: registrar_participacion_jugador_con_ledger no existe tras el CREATE';
  END IF;
  IF to_regprocedure('public.actualizar_participacion_jugador_con_ledger(uuid,text,jugador_resultado,integer,integer,integer,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: actualizar_participacion_jugador_con_ledger no existe tras el CREATE';
  END IF;
END $$;
