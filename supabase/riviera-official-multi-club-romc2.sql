-- ROMC-2: Escritura automática al ledger oficial Riviera (solo participaciones nuevas).
-- Ejecutar en Supabase SQL Editor después de riviera-official-multi-club-romc1.sql
--
-- NO backfill, NO modifica jugador_stats, NO toca rankings internos.
-- Diseño: docs/RANKING-OFICIAL-MULTI-CLUB.md

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Organizadores autorizados para emitir puntos al ranking oficial Riviera
--    Default: vacío (nadie emite). Admin habilita club por club.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.riviera_official_ranking_emitters (
  organizador_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.riviera_official_ranking_emitters IS
  'Organizadores cuyas participaciones locales pueden sumar al ranking oficial Riviera. Default: no listado = no autorizado.';

ALTER TABLE public.riviera_official_ranking_emitters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rore_admin_all ON public.riviera_official_ranking_emitters;
CREATE POLICY rore_admin_all ON public.riviera_official_ranking_emitters
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Helpers internos
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._is_official_ranking_emitter(p_organizador_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.riviera_official_ranking_emitters e
    WHERE e.organizador_id = p_organizador_id
      AND e.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public._is_official_ranking_emitter(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._is_official_ranking_emitter(uuid) FROM anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. RPC admin: habilitar / deshabilitar emisor oficial
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_set_official_ranking_emitter(
  p_organizador_id uuid,
  p_active boolean DEFAULT true,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede configurar emisores oficiales';
  END IF;

  IF p_organizador_id IS NULL THEN
    RAISE EXCEPTION 'organizador_id requerido';
  END IF;

  INSERT INTO public.riviera_official_ranking_emitters (
    organizador_id,
    is_active,
    notes,
    created_by,
    updated_at
  ) VALUES (
    p_organizador_id,
    COALESCE(p_active, true),
    NULLIF(trim(p_notes), ''),
    v_admin,
    now()
  )
  ON CONFLICT (organizador_id) DO UPDATE
  SET
    is_active = COALESCE(p_active, true),
    notes = COALESCE(NULLIF(trim(p_notes), ''), riviera_official_ranking_emitters.notes),
    updated_at = now();

  RETURN jsonb_build_object(
    'organizador_id', p_organizador_id,
    'is_active', COALESCE(p_active, true)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_official_ranking_emitter(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_official_ranking_emitters()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede listar emisores oficiales';
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'organizador_id', e.organizador_id,
          'organizador_name', coalesce(u.name, u.email, 'Organizador'),
          'is_active', e.is_active,
          'notes', e.notes,
          'created_at', e.created_at,
          'updated_at', e.updated_at
        )
        ORDER BY coalesce(u.name, u.email)
      )
      FROM public.riviera_official_ranking_emitters e
      LEFT JOIN public.users u ON u.id = e.organizador_id
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_official_ranking_emitters() TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. RPC principal: escribir al ledger (idempotente, sin puntos negativos)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.try_write_riviera_official_ledger(p_participacion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p record;
  v_organizador_id uuid;
  v_key uuid;
  v_points integer;
  v_subtipo text;
  v_club_name text;
  v_ledger_id uuid;
  v_valid_types text[] := ARRAY[
    'reta',
    'torneo_express',
    'liga',
    'americano',
    'duelo_2v2'
  ];
BEGIN
  IF p_participacion_id IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'null_participacion_id');
  END IF;

  SELECT
    jp.id,
    jp.jugador_id,
    jp.tipo_evento,
    jp.evento_id,
    jp.evento_nombre,
    jp.puntos_obtenidos,
    jp.metadata,
    jp.created_at
  INTO v_p
  FROM public.jugador_participaciones jp
  WHERE jp.id = p_participacion_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'participacion_not_found');
  END IF;

  v_subtipo := v_p.metadata->>'subtipo';
  IF v_subtipo = 'ajuste_manual' THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'ajuste_manual');
  END IF;

  IF NOT (v_p.tipo_evento = ANY (v_valid_types)) THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'invalid_event_type',
      'tipo_evento', v_p.tipo_evento
    );
  END IF;

  v_points := GREATEST(0, COALESCE(v_p.puntos_obtenidos, 0));
  IF v_points <= 0 THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'no_positive_points');
  END IF;

  SELECT rj.organizador_id
  INTO v_organizador_id
  FROM public.riviera_jugadores rj
  WHERE rj.id = v_p.jugador_id;

  IF v_organizador_id IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'jugador_not_found');
  END IF;

  IF NOT public._is_official_ranking_emitter(v_organizador_id) THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'organizer_not_authorized');
  END IF;

  v_key := public._resolve_official_player_key(v_p.jugador_id);
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'no_official_identity');
  END IF;

  SELECT coalesce(u.name, u.email, 'Club')
  INTO v_club_name
  FROM public.users u
  WHERE u.id = v_organizador_id;

  INSERT INTO public.riviera_official_points_ledger (
    official_player_key,
    source_organizer_id,
    source_local_jugador_id,
    participacion_id,
    event_type,
    event_id,
    event_name,
    points,
    source_club_name,
    created_at
  ) VALUES (
    v_key,
    v_organizador_id,
    v_p.jugador_id,
    p_participacion_id,
    v_p.tipo_evento,
    v_p.evento_id,
    v_p.evento_nombre,
    v_points,
    v_club_name,
    COALESCE(v_p.created_at, now())
  )
  ON CONFLICT (participacion_id) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_exists',
      'participacion_id', p_participacion_id
    );
  END IF;

  INSERT INTO public.riviera_official_player_totals (
    official_player_key,
    points_total,
    last_activity_at
  ) VALUES (
    v_key,
    v_points,
    now()
  )
  ON CONFLICT (official_player_key) DO UPDATE
  SET
    points_total = riviera_official_player_totals.points_total + EXCLUDED.points_total,
    last_activity_at = EXCLUDED.last_activity_at,
    updated_at = now();

  RETURN jsonb_build_object(
    'status', 'inserted',
    'ledger_id', v_ledger_id,
    'official_player_key', v_key,
    'points', v_points,
    'participacion_id', p_participacion_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_write_riviera_official_ledger(uuid) TO authenticated;

COMMENT ON FUNCTION public.try_write_riviera_official_ledger(uuid) IS
  'ROMC-2: intenta registrar puntos oficiales desde una participación local. Idempotente (UNIQUE participacion_id). Sin puntos negativos ni ajustes manuales.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Habilitar emisores (SEGUNDA query, tras aplicar TODO este archivo)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Verificar ROMC-2:
-- SELECT proname FROM pg_proc
-- WHERE proname IN ('admin_set_official_ranking_emitter', 'try_write_riviera_official_ledger');
--
-- ── Opción A (SQL Editor / postgres): INSERT directo ─────────────────────────
-- El RPC admin exige auth.uid() en admin_users; en SQL Editor no hay JWT.
-- Usa esto para el seed inicial:
--
-- INSERT INTO public.riviera_official_ranking_emitters (organizador_id, is_active, notes)
-- VALUES
--   ('2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid, true, 'Riviera Open'),
--   ('e724de97-3552-4a01-a269-f621e6f1ed26'::uuid, true, 'Hack Pádel')
-- ON CONFLICT (organizador_id) DO UPDATE
-- SET is_active = EXCLUDED.is_active,
--     notes = EXCLUDED.notes,
--     updated_at = now();
--
-- ── Opción B (app, sesión Admin Principal): RPC ───────────────────────────────
--
-- SELECT public.admin_set_official_ranking_emitter(
--   '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid,
--   true::boolean,
--   'Riviera Open'::text
-- );
-- SELECT public.admin_set_official_ranking_emitter(
--   'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid,
--   true::boolean,
--   'Hack Pádel'::text
-- );
