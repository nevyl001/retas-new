-- ══════════════════════════════════════════════════════════════════════════════
-- 0059 — Riviera Rewards: snapshot multiclub por identidad global
--
-- PROBLEMA: rewards_player_snapshot(p_jugador_id) exigía un vínculo exacto
-- (jugador_id = p_jugador_id). Un jugador registrado en Hack Padel pero vinculado
-- por Padelito (otro jugador_id local) veía "Acceso restringido".
--
-- DISEÑO (mínimo y fail-closed):
--  * Solo se redefine rewards_player_snapshot. rewards_balance,
--    rewards_assert_can_request y rewards_request_redemption NO cambian: siguen
--    exigiendo el vínculo exacto (club, jugador local, auth.uid()).
--  * La identidad de quien llama es SIEMPRE auth.uid(); ningún parámetro del cliente
--    permite indicar otra cuenta.
--  * El snapshot solo devuelve datos de clubes donde auth.uid() tiene un vínculo
--    propio en rewards_player_links Y ese jugador local es la MISMA PERSONA que
--    p_jugador_id (mismo id, misma official_player_key o par origen/clon activo
--    en organizer_player_access).
--  * Saldos, premios y canjes se consultan con el jugador local del vínculo, de
--    modo que nunca se mezclan saldos entre clubes.
--  * Una única firma (uuid, uuid DEFAULT NULL): se elimina la sobrecarga de un
--    parámetro para evitar ambigüedad en PostgreSQL/PostgREST (PGRST203).
--  * No toca ranking, rating, historial ni reglas de acreditación.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Limpieza de la sobrecarga previa (evita funciones ambiguas con PostgREST).
DROP FUNCTION IF EXISTS public.rewards_player_snapshot(uuid);
DROP FUNCTION IF EXISTS public.rewards_is_account_linked_to_player(uuid, uuid);

-- ── Helper interno: ¿dos perfiles locales son la misma persona? ─────────────
-- No recibe ni evalúa ninguna cuenta: solo relaciona perfiles. Uso interno.

CREATE OR REPLACE FUNCTION public.rewards_same_player(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key_a uuid;
  v_key_b uuid;
BEGIN
  IF p_a IS NULL OR p_b IS NULL THEN
    RETURN false;
  END IF;
  IF p_a = p_b THEN
    RETURN true;
  END IF;

  -- Misma identidad oficial global (Riviera ID / official_player_key).
  v_key_a := public._resolve_official_player_key(p_a);
  IF v_key_a IS NOT NULL THEN
    v_key_b := public._resolve_official_player_key(p_b);
    IF v_key_b IS NOT NULL AND v_key_a = v_key_b THEN
      RETURN true;
    END IF;
  END IF;

  -- Par origen/clon de un acceso cedido activo.
  RETURN EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.is_active = true
      AND (
        (opa.jugador_id = p_a AND opa.local_jugador_id = p_b)
        OR (opa.jugador_id = p_b AND opa.local_jugador_id = p_a)
      )
  );
END;
$$;

-- ── Snapshot multiclub ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rewards_player_snapshot(
  p_jugador_id uuid,
  p_organizador_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_local uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sin sesión';
  END IF;

  -- Vínculo PROPIO de quien llama, en un club, hacia la misma persona.
  SELECT l.organizador_id, l.jugador_id
  INTO v_org, v_local
  FROM public.rewards_player_links l
  WHERE l.auth_user_id = v_uid
    AND (p_organizador_id IS NULL OR l.organizador_id = p_organizador_id)
    AND public.rewards_same_player(l.jugador_id, p_jugador_id)
  ORDER BY (l.jugador_id = p_jugador_id) DESC, l.created_at ASC, l.organizador_id ASC
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Esta cuenta no está vinculada a este jugador';
  END IF;

  RETURN jsonb_build_object(
    'organizador_id', v_org,
    'jugador_id', v_local,
    'clubes_autorizados', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('organizador_id', l.organizador_id, 'jugador_id', l.jugador_id)
        ORDER BY l.created_at, l.organizador_id
      )
      FROM public.rewards_player_links l
      WHERE l.auth_user_id = v_uid
        AND public.rewards_same_player(l.jugador_id, p_jugador_id)
    ), '[]'::jsonb),
    -- rewards_balance exige a su vez el vínculo exacto (club, jugador local, auth.uid()).
    'saldos', public.rewards_balance(v_org, v_local),
    'premios', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', w.id,
        'nombre', w.nombre,
        'descripcion', w.descripcion,
        'costo_puntos', w.costo_puntos,
        'tipo', w.tipo,
        'condiciones', w.condiciones,
        'inventario_restante', w.inventario_restante,
        'limite_por_jugador', w.limite_por_jugador,
        'campaign_id', c.id,
        'campana', c.nombre,
        'canje_hasta', c.canje_hasta
      ) ORDER BY w.costo_puntos)
      FROM public.rewards_rewards w
      JOIN public.rewards_campaigns c ON c.id = w.campaign_id
      WHERE w.organizador_id = v_org
        AND w.estado = 'activo'
        AND c.estado = 'activa'
        AND c.visible_jugadores
        AND now() >= c.canje_desde
        AND now() < c.canje_hasta
    ), '[]'::jsonb),
    'canjes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'estado', r.estado,
        'costo_puntos', r.costo_puntos,
        'nombre', r.snapshot->>'nombre',
        'created_at', r.created_at,
        'reserva_hasta', r.reserva_hasta
      ) ORDER BY r.created_at DESC)
      FROM public.rewards_redemptions r
      WHERE r.organizador_id = v_org AND r.jugador_id = v_local
    ), '[]'::jsonb)
  );
END;
$$;

-- ── Permisos mínimos ────────────────────────────────────────────────────────
-- Las funciones nuevas nacen con EXECUTE para PUBLIC: se revoca explícitamente.

REVOKE ALL ON FUNCTION public.rewards_same_player(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rewards_player_snapshot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rewards_player_snapshot(uuid, uuid) TO authenticated;

COMMIT;
