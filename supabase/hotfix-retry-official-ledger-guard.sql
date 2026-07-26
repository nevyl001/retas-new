-- ══════════════════════════════════════════════════════════════════════════════
-- HOTFIX DE SEGURIDAD — retry_official_ledger_for_organizer sin validar al llamante
--
-- Vulnerabilidad (confirmada explotable con la anon key pública, auditoría 2026-07-26):
--   La función es SECURITY DEFINER, con EXECUTE otorgado a PUBLIC (default de
--   Postgres, nunca revocado). Solo validaba que el p_organizador_id (parámetro,
--   controlado por quien llama) fuera un "emisor oficial" registrado — nunca
--   comprobaba que quien llama fuera realmente ese organizador. Cualquier usuario
--   anónimo que conociera el id de un organizador emisor oficial podía disparar
--   el posteo anticipado de su ledger de puntos oficiales, y usar la respuesta
--   como oráculo para saber si ese organizador es emisor oficial o no.
--
-- Fix mínimo: se exige que el llamante sea ese mismo organizador o admin
-- maestro. Esta función no se invoca desde src/ (no hay ningún caller en el
-- cliente hoy), así que no hay flujo legítimo que se vea afectado.
--
-- No se cambia la firma, el nombre, el tipo de retorno, ni ninguna otra línea
-- del cuerpo original.
--
-- Idempotente: CREATE OR REPLACE FUNCTION es repetible sin error.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.retry_official_ledger_for_organizer(p_organizador_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_result jsonb;
  v_inserted int := 0;
  v_already int := 0;
  v_skipped int := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF p_organizador_id IS NULL THEN
    RAISE EXCEPTION 'organizador_id requerido';
  END IF;

  IF auth.uid() IS NULL OR NOT (public.is_master_admin() OR auth.uid() = p_organizador_id) THEN
    RAISE EXCEPTION 'Sin permiso para reintentar el ledger de este organizador';
  END IF;

  IF NOT public._is_official_ranking_emitter(p_organizador_id) THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'organizer_not_authorized',
      'organizador_id', p_organizador_id
    );
  END IF;

  FOR v_row IN
    SELECT jp.id
    FROM public.jugador_participaciones jp
    JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
    WHERE rj.organizador_id = p_organizador_id
      AND COALESCE(jp.puntos_obtenidos, 0) > 0
      AND coalesce(jp.metadata->>'subtipo', '') <> 'ajuste_manual'
      AND NOT EXISTS (
        SELECT 1
        FROM public.riviera_official_points_ledger l
        WHERE l.participacion_id = jp.id
      )
    ORDER BY jp.created_at ASC
  LOOP
    v_result := public.try_write_riviera_official_ledger(v_row.id);
    v_results := v_results || jsonb_build_array(v_result);

    IF v_result->>'status' = 'inserted' THEN
      v_inserted := v_inserted + 1;
    ELSIF v_result->>'status' = 'already_exists' THEN
      v_already := v_already + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'organizador_id', p_organizador_id,
    'inserted', v_inserted,
    'already_exists', v_already,
    'skipped', v_skipped,
    'results', v_results
  );
END;
$function$;

-- ── Defensa en profundidad (además del guard interno de arriba) ──
-- Callers verificados en TODO el repo (src/, supabase/, scripts/, docs/):
-- ninguno. Esta función no se invoca desde ningún lugar hoy (ni cliente, ni
-- Edge Function, ni script, ni internamente desde otra función SQL). Se
-- revoca el EXECUTE implícito de PUBLIC/anon; se deja authenticated
-- (consistente con el guard interno, que ya exige auth.uid() = p_organizador_id
-- o is_master_admin()) para no bloquear un futuro caller legítimo de admin.
REVOKE ALL ON FUNCTION public.retry_official_ledger_for_organizer(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_official_ledger_for_organizer(uuid)
  TO authenticated;
