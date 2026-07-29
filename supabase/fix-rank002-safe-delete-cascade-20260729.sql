-- =============================================================================
-- FIX RANK-002 -- eliminar un Torneo Express (categoría) o una Liga cerrados
-- dejaba residuos huérfanos en jugador_participaciones, rating_historial,
-- riviera_official_points_ledger y riviera_official_player_totals (auditoría
-- 2026-07-29). Confirmado por lectura de código: deleteTorneoExpress()/
-- deleteEvento() (torneoExpressService.ts) y deleteLiga() (ligaService.ts)
-- borran el árbol de partidos/grupos/jornadas propio del modo, pero nunca
-- tocan participaciones/rating/ledger ya escritos.
--
-- Camino elegido (de los dos que ofrece la auditoría): se mantiene la
-- eliminación física (no se convierte a soft-archive como Duelo 2v2 -- eso
-- cambiaría la UX de "Eliminar" a "Archivar" en dos módulos completos, fuera
-- de alcance de un fix acotado), pero implementada como RPC transaccional
-- que cumple los 8 requisitos de la ruta de eliminación física:
--   1) RPC transaccional (todo el cuerpo de una función PL/pgSQL es una
--      transacción implícita -- si algo falla, Postgres revierte todo).
--   2) Valida ownership (organizador_id = auth.uid() o is_master_admin()).
--   3) Revierte rating -- reutiliza el mismo patrón de reversión ya probado
--      en fix-rank001-rating-ledger-reconciliation-20260729.sql (restaura
--      rating_antes, decrementa rating_partidos, recalcula fiabilidad) para
--      cada fila de rating_historial cuyo partido_ref pertenece al árbol
--      que se está borrando.
--   4) Revierte ledger -- reutiliza _reverse_ledger_for_participacion_safe(),
--      ya usada por _purge_riviera_jugador_scoped() para el mismo propósito.
--   5) Ajusta totales -- lo hace automáticamente
--      reverse_riviera_official_ledger_for_participacion() (llamada por el
--      helper del punto 4), que ya recalcula
--      riviera_official_player_totals.
--   6) Elimina participaciones -- después de revertir su efecto.
--   7) Elimina el árbol del evento -- verificado vía pg_constraint que todas
--      las tablas hijas (grupos/partidos/parejas/notificaciones para Torneo
--      Express; jornadas/partidos/parejas/inscripciones/equipos para Liga)
--      ya tienen ON DELETE CASCADE hacia el padre, así que un solo DELETE
--      en la tabla raíz basta y no hay que replicar el orden a mano.
--   8) Aborta todo si falla un paso -- RAISE EXCEPTION revierte la
--      transacción completa (nada de esto se ejecuta parcialmente).
--
-- El frontend (torneoExpressService.ts / ligaService.ts) se actualiza en un
-- commit separado para llamar a estas RPCs en vez de hacer los DELETE
-- multi-paso directamente desde el cliente.
--
-- Rollback: rollback-rank002-safe-delete-cascade-20260729.sql
-- Verificación: verify-rank002-safe-delete-cascade-20260729.sql
-- =============================================================================

BEGIN;

-- ── Helper compartido: revertir rating de UN partido_ref ────────────────────
-- Mismo patrón que aplicar_rating_partido() usa para reconciliar (RANK-001).
CREATE OR REPLACE FUNCTION public._revert_rating_for_partido_ref(p_partido_ref text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
BEGIN
  IF p_partido_ref IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT rh.jugador_id, rh.rating_antes
    FROM rating_historial rh
    WHERE rh.partido_ref = p_partido_ref
  LOOP
    UPDATE riviera_jugadores
    SET
      rating = r.rating_antes,
      rating_partidos = GREATEST(0, COALESCE(rating_partidos, 1) - 1),
      rating_fiabilidad = LEAST(1.0, 0.2 + GREATEST(0, COALESCE(rating_partidos, 1) - 1) * 0.04),
      updated_at = now()
    WHERE id = r.jugador_id;
  END LOOP;
  DELETE FROM rating_historial WHERE partido_ref = p_partido_ref;
END;
$function$;

-- ── Torneo Express (una categoría / fila de torneo_express) ────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_torneo_express_categoria_cascade(p_organizador_id uuid, p_torneo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_partido_id uuid;
  v_participacion_id uuid;
  v_participaciones_revertidas int := 0;
  v_rating_revertido int := 0;
BEGIN
  IF p_organizador_id IS NULL OR p_torneo_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos';
  END IF;

  SELECT organizador_id INTO v_owner FROM torneo_express WHERE id = p_torneo_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found', 'torneo_id', p_torneo_id);
  END IF;

  IF auth.uid() IS NULL OR (v_owner IS DISTINCT FROM auth.uid() AND NOT public.is_master_admin()) THEN
    RAISE EXCEPTION 'Sin permiso para eliminar este torneo' USING ERRCODE = '42501';
  END IF;
  IF v_owner IS DISTINCT FROM p_organizador_id THEN
    RAISE EXCEPTION 'p_organizador_id no coincide con el dueño real del torneo' USING ERRCODE = '42501';
  END IF;

  -- 1) Revertir rating de cada partido de grupo.
  FOR v_partido_id IN
    SELECT tep.id
    FROM torneo_express_partidos tep
    JOIN torneo_express_grupos g ON g.id = tep.grupo_id
    WHERE g.torneo_id = p_torneo_id
  LOOP
    PERFORM public._revert_rating_for_partido_ref('te-grupo:' || v_partido_id::text);
    v_rating_revertido := v_rating_revertido + 1;
  END LOOP;

  -- 2) Revertir rating de cada partido de eliminatoria.
  FOR v_partido_id IN
    SELECT teep.id
    FROM torneo_express_eliminatoria_partidos teep
    WHERE teep.torneo_id = p_torneo_id
  LOOP
    PERFORM public._revert_rating_for_partido_ref('te-elim:' || v_partido_id::text);
    v_rating_revertido := v_rating_revertido + 1;
  END LOOP;

  -- 3) Revertir ledger y borrar participaciones de este torneo.
  FOR v_participacion_id IN
    SELECT id FROM jugador_participaciones
    WHERE tipo_evento = 'torneo_express' AND evento_id = p_torneo_id
  LOOP
    PERFORM public._reverse_ledger_for_participacion_safe(v_participacion_id);
    DELETE FROM jugador_participaciones WHERE id = v_participacion_id;
    v_participaciones_revertidas := v_participaciones_revertidas + 1;
  END LOOP;

  -- 4) Borrar el torneo. Verificado vía pg_constraint (2026-07-29): todo el
  --    árbol (torneo_express_grupos, torneo_express_partidos,
  --    torneo_express_grupo_parejas, torneo_express_eliminatoria_partidos,
  --    notificaciones_log, notificaciones_eventos_queue) ya tiene
  --    ON DELETE CASCADE hacia torneo_express -- no hace falta borrarlo a
  --    mano ni replicar ese orden aquí.
  DELETE FROM torneo_express WHERE id = p_torneo_id;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'torneo_id', p_torneo_id,
    'participaciones_revertidas', v_participaciones_revertidas,
    'partidos_rating_revertido', v_rating_revertido
  );
END;
$function$;

-- ── Liga ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_liga_cascade(p_organizador_id uuid, p_liga_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 1) Revertir rating de cada partido de la liga.
  FOR v_partido_id IN
    SELECT lp.id
    FROM liga_partidos lp
    JOIN liga_jornadas lj ON lj.id = lp.jornada_id
    WHERE lj.liga_id = p_liga_id
  LOOP
    PERFORM public._revert_rating_for_partido_ref('liga:' || v_partido_id::text);
    v_rating_revertido := v_rating_revertido + 1;
  END LOOP;

  -- 2) Revertir ledger y borrar participaciones de esta liga -- evento_id
  --    históricamente se guardó a veces como ligas.id, a veces como
  --    liga_jornadas.id (confirmado en auditoría de solo lectura), así que
  --    se cubren ambos.
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

  -- 3) Borrar la liga. Verificado vía pg_constraint (2026-07-29): todo el
  --    árbol (liga_jornadas, liga_partidos, liga_jornada_parejas,
  --    liga_inscripciones, liga_equipos) ya tiene ON DELETE CASCADE hacia
  --    ligas -- no hace falta borrarlo a mano.
  DELETE FROM ligas WHERE id = p_liga_id;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'liga_id', p_liga_id,
    'participaciones_revertidas', v_participaciones_revertidas,
    'partidos_rating_revertido', v_rating_revertido
  );
END;
$function$;

-- Este proyecto tiene ALTER DEFAULT PRIVILEGES otorgando EXECUTE a anon Y
-- authenticated DIRECTAMENTE (no solo vía PUBLIC) en toda función nueva de
-- public -- confirmado en vivo: REVOKE ALL ... FROM PUBLIC no bastó, hubo
-- que revocar explícitamente de anon/authenticated. Se revoca todo y se
-- vuelve a otorgar solo donde corresponde.
REVOKE ALL ON FUNCTION public._revert_rating_for_partido_ref(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_torneo_express_categoria_cascade(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_liga_cascade(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_torneo_express_categoria_cascade(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_liga_cascade(uuid, uuid) TO authenticated;

-- ── Verificación final dentro de la misma transacción ─────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.admin_delete_torneo_express_categoria_cascade(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: admin_delete_torneo_express_categoria_cascade no existe';
  END IF;
  IF to_regprocedure('public.admin_delete_liga_cascade(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: admin_delete_liga_cascade no existe';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN aclexplode(p.proacl) a ON true JOIN pg_roles r ON r.oid=a.grantee
    WHERE n.nspname='public' AND p.proname='_revert_rating_for_partido_ref'
      AND r.rolname IN ('anon','authenticated')
  ) THEN
    RAISE EXCEPTION 'Fix incompleto: _revert_rating_for_partido_ref no debería ser invocable directamente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN aclexplode(p.proacl) a ON true JOIN pg_roles r ON r.oid=a.grantee
    WHERE n.nspname='public' AND p.proname IN ('admin_delete_torneo_express_categoria_cascade','admin_delete_liga_cascade')
      AND r.rolname = 'anon'
  ) THEN
    RAISE EXCEPTION 'Fix incompleto: las RPCs de borrado no deberían ser invocables por anon';
  END IF;
END $$;

-- Revisar el resultado con calma antes de aceptar. Cuando estés conforme:
--   COMMIT;
-- Si algo se ve mal:
--   ROLLBACK;
