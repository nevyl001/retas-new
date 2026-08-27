-- ══════════════════════════════════════════════════════════════════════════════
-- HOTFIX DE SEGURIDAD — reverse_riviera_official_ledger_for_participacion sin ownership
--
-- Vulnerabilidad (confirmada explotable con la anon key pública, auditoría 2026-07-26):
--   La función es SECURITY DEFINER, con EXECUTE otorgado a PUBLIC (default de
--   Postgres, nunca revocado), y su cuerpo no validaba en absoluto quién llamaba:
--   dado cualquier p_participacion_id, borraba su fila en
--   riviera_official_points_ledger y recalculaba los totales oficiales del
--   jugador. jugador_participaciones tiene lectura pública para jugadores
--   visibles, así que el participacion_id es trivial de obtener — cualquier
--   usuario anónimo podía borrar los puntos oficiales de cualquier rival.
--
-- Fix mínimo: se resuelve el organizador dueño del jugador detrás de la
-- participación y se exige que el llamante sea ese organizador o admin
-- maestro — mismo patrón que ya usa delete_jugador_participacion_linked.
-- Se usa desde src/lib/rivieraJugadores/rivieraJugadoresService.ts (borrado
-- global de un jugador), siempre con un participacion_id que el organizador
-- ya validó como propio — ese flujo no se ve afectado.
--
-- CORRECCIÓN (revisión posterior al commit 5baa427d): la primera versión de
-- este fix solo exigía ownership cuando v_owner resolvía a un valor no NULO
-- (`IF v_owner IS NOT NULL AND (...)`); si v_owner quedaba NULL (participación
-- inexistente, o jugador huérfano/ya borrado), el código seguía de largo SIN
-- verificar nada y llegaba hasta el DELETE — cualquier authenticated podía
-- explotar ese caso. Ahora, cuando v_owner es NULL, se corta de inmediato con
-- 'no_participation' ANTES de tocar el ledger — nadie continúa sin ownership
-- confirmado, sea cual sea su rol. Esto es un cambio de comportamiento MENOR
-- para el caso "participación inexistente": antes devolvía 'no_ledger' (tras
-- buscar igual en el ledger), ahora devuelve 'no_participation' un paso antes.
-- El único caller directo del repo (rivieraJugadoresService.ts:2351) no
-- inspecciona el valor de retorno de este RPC. Los 7 callers internos usan
-- `PERFORM public.reverse_riviera_official_ledger_for_participacion(...)`
-- (confirmado por grep) — PERFORM en PL/pgSQL siempre descarta el valor de
-- retorno; lo único que le importaría a ese flujo es si la llamada lanza una
-- excepción. En el caso legítimo de cascada (delete_riviera_jugador, que ya
-- valida auth.uid() = p_organizador_id antes de purgar), v_owner resuelve al
-- mismo organizador y la excepción no se dispara — el trigger sigue igual.
-- No tengo el cuerpo de trg_reverse_official_ledger_on_participacion_delete
-- en sí (no se consultó), pero el razonamiento de arriba no depende de él.
--
-- No se cambia la firma ni el tipo de retorno.
--
-- Idempotente: CREATE OR REPLACE FUNCTION es repetible sin error.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reverse_riviera_official_ledger_for_participacion(p_participacion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ledger record;
  v_owner uuid;
  v_part_jugador_id uuid;
  v_home_org uuid;
BEGIN
  IF p_participacion_id IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'null_participacion_id');
  END IF;

  SELECT rj.organizador_id, jp.jugador_id
  INTO v_owner, v_part_jugador_id
  FROM public.jugador_participaciones jp
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  WHERE jp.id = p_participacion_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'no_participation',
      'participacion_id', p_participacion_id
    );
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sin permiso para revertir esta participación';
  END IF;

  v_home_org := public._resolve_home_organizador_for_jugador(v_part_jugador_id);

  IF NOT public.is_master_admin()
     AND v_owner IS DISTINCT FROM auth.uid()
     AND (v_home_org IS NULL OR v_home_org IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para revertir esta participación';
  END IF;

  SELECT
    l.id,
    l.official_player_key,
    l.points,
    l.counts_for_official_ranking
  INTO v_ledger
  FROM public.riviera_official_points_ledger l
  WHERE l.participacion_id = p_participacion_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'no_ledger',
      'participacion_id', p_participacion_id
    );
  END IF;

  DELETE FROM public.riviera_official_points_ledger
  WHERE id = v_ledger.id;

  PERFORM public._recalc_official_player_totals(v_ledger.official_player_key);

  RETURN jsonb_build_object(
    'status', 'reversed',
    'participacion_id', p_participacion_id,
    'official_player_key', v_ledger.official_player_key,
    'points_reversed', v_ledger.points
  );
END;
$function$;

-- ── Defensa en profundidad (además del guard interno de arriba) ──
-- Callers verificados en TODO el repo (src/, supabase/, scripts/, docs/):
-- (1) src/lib/rivieraJugadores/rivieraJugadoresService.ts:2351, siempre con
--     sesión de organizador autenticado; (2) llamadas internas PERFORM desde
--     7 versiones de delete_riviera_jugador (supabase/*.sql) — esa función es
--     SECURITY DEFINER con owner postgres, así que la llamada interna corre
--     como postgres (no como PUBLIC/anon) y no depende de este GRANT; además
--     auth.uid() sigue resolviendo al organizador original real dentro de esa
--     ruta (es un GUC de sesión, no cambia entre contextos SECURITY DEFINER),
--     así que el guard de ownership de arriba también la protege igual.
-- Ningún caller PUBLIC/anon. Se revoca el EXECUTE implícito de PUBLIC/anon y
-- se deja solo authenticated.
REVOKE ALL ON FUNCTION public.reverse_riviera_official_ledger_for_participacion(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_riviera_official_ledger_for_participacion(uuid)
  TO authenticated;
