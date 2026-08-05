-- ══════════════════════════════════════════════════════════════════════════════
-- 0015 — finalize_reta_atomic: cierre de reta transaccional e idempotente
--
-- Incidente (2026-08-05, reta "Batalla Equipos"): el cierre de una reta hoy es
-- coordinado desde React en N llamadas RPC separadas (una
-- registrar_participacion_jugador_con_ledger por jugador distinto + una
-- aplicar_rating_partido por partido terminado + un UPDATE tournaments final),
-- sin transacción que las envuelva. Si una falla a mitad de camino (p. ej. un
-- jugador sin identidad Riviera válida), lo ya escrito queda escrito y
-- is_finished nunca se marca -- la reta queda "en curso" con carrera
-- parcialmente sincronizada. Esta migración agrega un único RPC que hace lock
-- + validación defensiva de identidad + escritura + marca de cierre dentro de
-- UNA sola transacción de Postgres, con el mismo patrón ya usado en
-- apply_reta_match_update (0009): lock de fila, ownership/admin-override,
-- camino idempotente explícito, conflicto explícito.
--
-- Deliberadamente NO recalcula standings/puntos en SQL: ese cálculo
-- (round-robin, equipos clásicos/dinámicos, fórmula de puntos) sigue viviendo
-- en TypeScript (src/lib/rivieraJugadores/syncParticipaciones.ts) sin tocarse
-- -- "el algoritmo deportivo no fue modificado". Este RPC solo hace atómica y
-- defensiva la PERSISTENCIA: recibe un payload ya calculado
-- (participaciones + ratings) y lo escribe todo o nada, revalidando identidad
-- server-side antes de escribir (no confía solo en el frontend). La
-- construcción de ese payload desde el estado real de la reta (wiring del
-- frontend) queda para una siguiente pasada -- ver plan.
--
-- Idempotencia: se apoya en las restricciones únicas YA existentes --
-- jugador_participaciones(jugador_id,tipo_evento,evento_id,resultado),
-- riviera_official_points_ledger(participacion_id) UNIQUE,
-- rating_historial(jugador_id,partido_ref) UNIQUE -- consumidas por las RPC
-- existentes registrar_participacion_jugador_con_ledger / aplicar_rating_partido
-- (ambas ON CONFLICT). Un segundo intento sobre una reta ya finalizada es un
-- no-op explícito (status: 'already_finalized'), sin repetir nada.
--
-- Idempotente de aplicar: CREATE OR REPLACE FUNCTION + ALTER TABLE ADD COLUMN
-- IF NOT EXISTS + REVOKE/GRANT son repetibles sin error.
-- Rollback:
--   DROP FUNCTION public.finalize_reta_atomic(uuid, jsonb, boolean, boolean);
--   ALTER TABLE public.tournaments DROP COLUMN IF EXISTS finished_at;
--   (registrar_participacion_jugador vuelve a su versión anterior aplicando
--    de nuevo supabase/hotfix-registrar-participacion-jugador-null-safe.sql)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── finished_at: el spec pide registrarlo; no existe hoy en tournaments ──
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- ── Companion patch: registrar_participacion_jugador no tenía bypass de
-- Admin Maestro (a diferencia de ensure_riviera_identity y
-- ensure_official_profile_link_for_participacion, que sí lo tienen). Sin este
-- patch, p_admin_override=true en finalize_reta_atomic fallaría en el primer
-- INSERT de participación de un jugador de OTRO organizador. Único cambio:
-- se agrega "OR public.is_master_admin()" al guard; el resto del cuerpo es
-- idéntico a supabase/hotfix-registrar-participacion-jugador-null-safe.sql. ──
CREATE OR REPLACE FUNCTION public.registrar_participacion_jugador(p_jugador_id uuid, p_tipo_evento jugador_tipo_evento, p_evento_id uuid, p_evento_nombre text, p_pareja_con text DEFAULT NULL::text, p_resultado jugador_resultado DEFAULT 'participación'::jugador_resultado, p_sets_favor integer DEFAULT 0, p_sets_contra integer DEFAULT 0, p_puntos_obtenidos integer DEFAULT 0, p_metadata jsonb DEFAULT '{}'::jsonb, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_org uuid;
BEGIN
  SELECT organizador_id INTO v_org
  FROM public.riviera_jugadores
  WHERE id = p_jugador_id;

  IF v_org IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado para registrar participación de este jugador';
  END IF;

  IF v_org IS DISTINCT FROM auth.uid() AND NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'No autorizado para registrar participación de este jugador';
  END IF;

  INSERT INTO public.jugador_participaciones (
    jugador_id,
    tipo_evento,
    evento_id,
    evento_nombre,
    fecha,
    pareja_con,
    resultado,
    sets_favor,
    sets_contra,
    puntos_obtenidos,
    metadata
  )
  VALUES (
    p_jugador_id,
    p_tipo_evento,
    p_evento_id,
    p_evento_nombre,
    p_fecha,
    NULLIF(trim(p_pareja_con), ''),
    p_resultado,
    COALESCE(p_sets_favor, 0),
    COALESCE(p_sets_contra, 0),
    COALESCE(p_puntos_obtenidos, 0),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (jugador_id, tipo_evento, evento_id, resultado)
  DO UPDATE SET
    evento_nombre = EXCLUDED.evento_nombre,
    fecha = EXCLUDED.fecha,
    sets_favor = EXCLUDED.sets_favor,
    sets_contra = EXCLUDED.sets_contra,
    puntos_obtenidos = EXCLUDED.puntos_obtenidos,
    metadata = EXCLUDED.metadata
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_participacion_jugador(
  uuid, jugador_tipo_evento, uuid, text, text, jugador_resultado, integer, integer, integer, jsonb, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_participacion_jugador(
  uuid, jugador_tipo_evento, uuid, text, text, jugador_resultado, integer, integer, integer, jsonb, date
) TO authenticated;

-- ── finalize_reta_atomic ──
CREATE OR REPLACE FUNCTION public.finalize_reta_atomic(
  p_tournament_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_admin_override boolean DEFAULT false,
  p_force_partial boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament record;
  v_is_admin boolean := false;
  v_pending_count int;
  v_elem jsonb;
  v_jugador_id uuid;
  v_link jsonb;
  v_ledger jsonb;
  v_metadata jsonb;
  v_participaciones jsonb := coalesce(p_payload->'participaciones', '[]'::jsonb);
  v_ratings jsonb := coalesce(p_payload->'ratings', '[]'::jsonb);
  v_participants_expected int;
  v_participants_processed int := 0;
  v_ledger_created int := 0;
  v_ratings_applied int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF jsonb_typeof(v_participaciones) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;
  v_participants_expected := jsonb_array_length(v_participaciones);

  -- Lock de fila: serializa contra otro finalize_reta_atomic concurrente
  -- (doble toque, dos pestañas) para el MISMO tournament_id.
  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF p_admin_override THEN
    SELECT public.is_master_admin() INTO v_is_admin;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Solo un Admin Maestro puede usar corrección administrativa';
    END IF;
  ELSIF v_tournament.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre esta reta';
  END IF;

  -- Idempotencia: un segundo intento (reintento tras timeout del cliente,
  -- doble pestaña que llegó tarde al lock) es un no-op explícito, nunca
  -- repite participación/ledger/rating.
  IF coalesce(v_tournament.is_finished, false) THEN
    RETURN jsonb_build_object(
      'ok', true, 'status', 'already_finalized', 'tournament_id', p_tournament_id
    );
  END IF;

  -- Partidos pendientes: bloqueo suave (no hard-fail) -- cerrar con partidos
  -- sin terminar es un flujo legítimo existente (suspensión por lluvia,
  -- no-show); requiere paso explícito (force_partial o admin_override), no
  -- queda prohibido.
  SELECT count(*) INTO v_pending_count
  FROM public.matches
  WHERE tournament_id = p_tournament_id
    AND status <> 'finished';

  IF v_pending_count > 0 AND NOT p_force_partial AND NOT p_admin_override THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'pending_matches', 'pending_count', v_pending_count
    );
  END IF;

  -- Validación defensiva de identidad DENTRO de la transacción -- no confía
  -- solo en lo que ya validó el frontend. ensure_riviera_identity lanza
  -- excepción real ante fallo (hace ROLLBACK de todo lo de abajo, incluido
  -- cualquier escritura previa en este mismo loop);
  -- ensure_official_profile_link_for_participacion nunca lanza, así que su
  -- resultado se revisa explícitamente.
  FOR v_jugador_id IN
    SELECT DISTINCT (elem->>'jugador_id')::uuid
    FROM jsonb_array_elements(v_participaciones) elem
    WHERE elem ? 'jugador_id'
  LOOP
    PERFORM public.ensure_riviera_identity(v_jugador_id);

    v_link := public.ensure_official_profile_link_for_participacion(
      v_jugador_id, v_tournament.user_id
    );
    IF NOT coalesce((v_link->>'linked')::boolean, false) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'career_integrity_blocked',
        'jugador_id', v_jugador_id,
        'detail', v_link
      );
    END IF;
  END LOOP;

  -- Escritura: una participación+ledger por jugador (RPC existente,
  -- idempotente por ON CONFLICT). organizador_id en metadata se fija al
  -- dueño real de la reta (no al valor que mande el payload) -- el ledger no
  -- debe poder atribuirse a un organizador distinto del que realmente
  -- controla esta reta.
  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_participaciones)
  LOOP
    v_metadata := coalesce(v_elem->'metadata', '{}'::jsonb)
      || jsonb_build_object('organizador_id', v_tournament.user_id::text);

    v_ledger := public.registrar_participacion_jugador_con_ledger(
      (v_elem->>'jugador_id')::uuid,
      (v_elem->>'tipo_evento')::jugador_tipo_evento,
      (v_elem->>'evento_id')::uuid,
      v_elem->>'evento_nombre',
      v_elem->>'pareja_con',
      coalesce((v_elem->>'resultado')::jugador_resultado, 'participación'::jugador_resultado),
      coalesce((v_elem->>'sets_favor')::int, 0),
      coalesce((v_elem->>'sets_contra')::int, 0),
      coalesce((v_elem->>'puntos_obtenidos')::int, 0),
      v_metadata,
      coalesce((v_elem->>'fecha')::date, CURRENT_DATE)
    );
    v_participants_processed := v_participants_processed + 1;
    IF (v_ledger->'ledger'->>'status') IN ('inserted', 'updated') THEN
      v_ledger_created := v_ledger_created + 1;
    END IF;
  END LOOP;

  -- Rating: una vez por partido (RPC existente, idempotente por
  -- ON CONFLICT (jugador_id, partido_ref) DO NOTHING).
  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_ratings)
  LOOP
    PERFORM public.aplicar_rating_partido(
      (v_elem->>'j1')::uuid,
      (v_elem->>'j2')::uuid,
      (v_elem->>'j3')::uuid,
      (v_elem->>'j4')::uuid,
      v_elem->>'ganador',
      v_elem->>'modo_juego',
      v_elem->>'partido_ref',
      v_elem->>'descripcion'
    );
    v_ratings_applied := v_ratings_applied + 1;
  END LOOP;

  UPDATE public.tournaments
  SET is_finished = true, finished_at = now()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'finalized',
    'tournament_id', p_tournament_id,
    'participants_expected', v_participants_expected,
    'participants_processed', v_participants_processed,
    'ledger_created', v_ledger_created,
    'ratings_applied', v_ratings_applied
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_reta_atomic(uuid, jsonb, boolean, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_reta_atomic(uuid, jsonb, boolean, boolean)
  TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.finalize_reta_atomic(uuid,jsonb,boolean,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: finalize_reta_atomic no existe tras el CREATE';
  END IF;
  IF to_regprocedure('public.registrar_participacion_jugador(uuid,jugador_tipo_evento,uuid,text,text,jugador_resultado,integer,integer,integer,jsonb,date)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: registrar_participacion_jugador no existe tras el CREATE';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
