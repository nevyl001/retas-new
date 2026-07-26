-- ══════════════════════════════════════════════════════════════════════════════
-- HOTFIX DE SEGURIDAD — registrar_participacion_jugador: bypass por NULL
--
-- Vulnerabilidad (confirmada explotable con la anon key pública, auditoría 2026-07-26):
--   El guard de ownership era: IF v_org IS NULL OR v_org <> auth.uid() THEN RAISE.
--   Para un jugador real, v_org NUNCA es NULL. Con un caller anónimo, auth.uid()
--   es NULL, y en SQL de tres valores "v_org <> NULL" evalúa a NULL (no true).
--   "false OR NULL" = NULL, y PL/pgSQL trata un IF con condición NULL como no
--   verdadero: el RAISE EXCEPTION nunca se ejecutaba y el INSERT seguía de largo.
--   Cualquier usuario anónimo podía registrar participaciones/resultados/puntos
--   falsos (o sobrescribir reales, por el ON CONFLICT) para cualquier jugador.
--
-- Fix mínimo: se reemplaza la comparación insegura por una NULL-safe. Se agrega
-- "auth.uid() IS NULL" como cláusula independiente (igual que ya hacen
-- delete_riviera_jugador y update_tournament_courts_and_unassign) y se cambia
-- "<>" por "IS DISTINCT FROM", que sí maneja NULL correctamente. Ningún otro
-- carácter del cuerpo, la firma ni el tipo de retorno cambia.
--
-- Idempotente: CREATE OR REPLACE FUNCTION es repetible sin error.
-- ══════════════════════════════════════════════════════════════════════════════

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

  IF v_org IS NULL OR auth.uid() IS NULL OR v_org IS DISTINCT FROM auth.uid() THEN
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

-- ── Defensa en profundidad (además del guard interno de arriba) ──
-- Callers verificados en TODO el repo (src/, supabase/, scripts/, docs/):
-- único caller real es src/lib/rivieraJugadores/rivieraJugadoresService.ts:1549
-- (registrarParticipacion), siempre con sesión de organizador autenticado.
-- Ningún caller PUBLIC/anon, ninguna Edge Function, ningún script. Se revoca
-- el EXECUTE implícito de PUBLIC/anon y se deja solo authenticated.
REVOKE ALL ON FUNCTION public.registrar_participacion_jugador(
  uuid, jugador_tipo_evento, uuid, text, text, jugador_resultado, integer, integer, integer, jsonb, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_participacion_jugador(
  uuid, jugador_tipo_evento, uuid, text, text, jugador_resultado, integer, integer, integer, jsonb, date
) TO authenticated;
