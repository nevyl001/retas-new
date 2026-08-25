-- ══════════════════════════════════════════════════════════════════════════════
-- Auditoría EJECUTABLE — UNIQUE + CHECK playoffs (migración 0030)
--
-- Pegar TODO el archivo en Supabase SQL Editor → Run.
-- Transacción única + ROLLBACK final: no deja datos permanentes.
--
-- Reutiliza un organizador_id REAL (ligas ⋈ users). No inventa UUIDs de usuario.
-- Crea liga/jornada/jugadores/parejas TEMPORALES solo dentro de la TX.
--
-- Pruebas:
--   1) SF1 con liga_id válido → OK
--   2) 2º SF1 misma liga → unique_violation
--   3) SF1 con liga_id NULL → check_violation
--   4) Coherencia liga_partidos.liga_id = liga_jornadas.liga_id (reporte)
--   5) Tras ROLLBACK no queda AUDIT_PLAYOFFS_IDEMPOTENCY_%
--
-- Si falla a mitad: ejecuta una vez  ROLLBACK;
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0) Precondiciones de esquema ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.liga_partidos') IS NULL THEN
    RAISE EXCEPTION 'FAIL: no existe public.liga_partidos';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'liga_partidos_liga_bracket_slot_uidx'
  ) THEN
    RAISE EXCEPTION
      'FAIL: falta índice UNIQUE liga_partidos_liga_bracket_slot_uidx (¿0030 aplicada?)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'liga_partidos_bracket_requires_liga_id'
  ) THEN
    RAISE EXCEPTION
      'FAIL: falta CHECK liga_partidos_bracket_requires_liga_id (¿0030 aplicada?)';
  END IF;

  RAISE NOTICE 'PASS: schema preconditions (UNIQUE index + CHECK present)';
END $$;

-- ── 1–4) Organizador real + fixture temporal + UNIQUE/CHECK/coherencia ───────
DO $$
DECLARE
  v_marker text := 'AUDIT_PLAYOFFS_IDEMPOTENCY_' || replace(gen_random_uuid()::text, '-', '');
  v_org uuid;
  v_liga_id uuid;
  v_jornada_id uuid;
  v_j1 uuid;
  v_j2 uuid;
  v_j3 uuid;
  v_j4 uuid;
  v_pareja1 uuid;
  v_pareja2 uuid;
  v_partido1 uuid;
  v_partido_liga uuid;
  v_jornada_liga uuid;
  v_dup_blocked boolean := false;
  v_null_blocked boolean := false;
  v_sf1_count integer;
BEGIN
  -- Organizador REAL ya válido en el dominio Liga (no inventar UUID / no tocar auth.users)
  SELECT l.organizador_id
  INTO v_org
  FROM public.ligas l
  JOIN public.users u ON u.id = l.organizador_id
  WHERE l.organizador_id IS NOT NULL
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'AUDIT ABORTED: no valid organizer exists in public.users';
  END IF;

  RAISE NOTICE 'PASS: using existing organizer_id=%', v_org;

  -- Jugadores temporales del mismo organizador (FK liga_jugadores_organizador_id_fkey)
  INSERT INTO public.liga_jugadores (nombre, estado, organizador_id)
  VALUES (v_marker || '_J1', 'activo', v_org)
  RETURNING id INTO v_j1;

  INSERT INTO public.liga_jugadores (nombre, estado, organizador_id)
  VALUES (v_marker || '_J2', 'activo', v_org)
  RETURNING id INTO v_j2;

  INSERT INTO public.liga_jugadores (nombre, estado, organizador_id)
  VALUES (v_marker || '_J3', 'activo', v_org)
  RETURNING id INTO v_j3;

  INSERT INTO public.liga_jugadores (nombre, estado, organizador_id)
  VALUES (v_marker || '_J4', 'activo', v_org)
  RETURNING id INTO v_j4;

  -- Liga TEMPORAL (no reutilizar una liga real para meter SF1)
  INSERT INTO public.ligas (
    nombre, estado, modalidad, vueltas, organizador_id, canchas_disponibles
  ) VALUES (
    v_marker,
    'upcoming',
    'parejas_fijas',
    1,
    v_org,
    2
  )
  RETURNING id INTO v_liga_id;

  INSERT INTO public.liga_jornadas (liga_id, numero, estado)
  VALUES (v_liga_id, 9, 'upcoming')
  RETURNING id INTO v_jornada_id;

  INSERT INTO public.liga_jornada_parejas (jornada_id, jugador1_id, jugador2_id)
  VALUES (v_jornada_id, v_j1, v_j2)
  RETURNING id INTO v_pareja1;

  INSERT INTO public.liga_jornada_parejas (jornada_id, jugador1_id, jugador2_id)
  VALUES (v_jornada_id, v_j3, v_j4)
  RETURNING id INTO v_pareja2;

  -- Primer SF1 con liga_id válido
  INSERT INTO public.liga_partidos (
    jornada_id, pareja1_id, pareja2_id, ronda, cancha, estado,
    score_pareja1, score_pareja2, fase, bracket_slot, liga_id
  ) VALUES (
    v_jornada_id, v_pareja1, v_pareja2, 1, 1, 'upcoming',
    NULL, NULL, 'semifinal', 'SF1', v_liga_id
  )
  RETURNING id INTO v_partido1;

  IF v_partido1 IS NULL THEN
    RAISE EXCEPTION 'FAIL: no se insertó el primer SF1 con liga_id válido';
  END IF;

  RAISE NOTICE 'PASS: first SF1 insert with liga_id succeeded';

  -- Coherencia denormalizada (solo reporte; sin trigger/constraint nuevos)
  SELECT lp.liga_id, j.liga_id
  INTO v_partido_liga, v_jornada_liga
  FROM public.liga_partidos lp
  JOIN public.liga_jornadas j ON j.id = lp.jornada_id
  WHERE lp.id = v_partido1;

  IF v_partido_liga IS DISTINCT FROM v_jornada_liga THEN
    RAISE NOTICE
      'REPORT: liga_id denormalizado NO coincide con jornada (partido.liga_id=%, jornada.liga_id=%) — BD no garantiza coherencia automáticamente',
      v_partido_liga, v_jornada_liga;
  ELSE
    RAISE NOTICE 'PASS: partido.liga_id matches jornada.liga_id';
  END IF;

  -- Prueba 1 — UNIQUE: segundo SF1 misma liga
  BEGIN
    INSERT INTO public.liga_partidos (
      jornada_id, pareja1_id, pareja2_id, ronda, cancha, estado,
      score_pareja1, score_pareja2, fase, bracket_slot, liga_id
    ) VALUES (
      v_jornada_id, v_pareja1, v_pareja2, 1, 2, 'upcoming',
      NULL, NULL, 'semifinal', 'SF1', v_liga_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_dup_blocked := true;
      RAISE NOTICE 'PASS: duplicate bracket_slot blocked';
  END;

  IF NOT v_dup_blocked THEN
    RAISE EXCEPTION 'FAIL: duplicate bracket_slot was accepted';
  END IF;

  SELECT COUNT(*)::integer INTO v_sf1_count
  FROM public.liga_partidos
  WHERE liga_id = v_liga_id AND bracket_slot = 'SF1';

  IF v_sf1_count <> 1 THEN
    RAISE EXCEPTION
      'FAIL: se esperaba 1 SF1 tras el duplicado, hay %', v_sf1_count;
  END IF;

  -- Prueba 2 — CHECK: SF1 sin liga_id
  BEGIN
    INSERT INTO public.liga_partidos (
      jornada_id, pareja1_id, pareja2_id, ronda, cancha, estado,
      score_pareja1, score_pareja2, fase, bracket_slot, liga_id
    ) VALUES (
      v_jornada_id, v_pareja1, v_pareja2, 1, 1, 'upcoming',
      NULL, NULL, 'semifinal', 'SF1', NULL
    );
  EXCEPTION
    WHEN check_violation THEN
      v_null_blocked := true;
      RAISE NOTICE 'PASS: bracket_slot without liga_id blocked';
    WHEN not_null_violation THEN
      v_null_blocked := true;
      RAISE NOTICE 'PASS: bracket_slot without liga_id blocked';
  END;

  IF NOT v_null_blocked THEN
    RAISE EXCEPTION 'FAIL: bracket_slot without liga_id was accepted';
  END IF;

  RAISE NOTICE 'PASS: in-tx fixture ready (marker=%)', v_marker;
END $$;

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.ligas
  WHERE nombre LIKE 'AUDIT_PLAYOFFS_IDEMPOTENCY_%';

  IF n < 1 THEN
    RAISE EXCEPTION 'FAIL: liga de auditoría no visible dentro de la TX';
  END IF;

  RAISE NOTICE 'PASS: fixture visible inside transaction (count=%)', n;
END $$;

ROLLBACK;

-- ── 5) Post-ROLLBACK: cero residuos del marker ───────────────────────────────
DO $$
DECLARE
  n_ligas bigint;
  n_partidos bigint;
  n_jugadores bigint;
BEGIN
  SELECT COUNT(*) INTO n_ligas
  FROM public.ligas
  WHERE nombre LIKE 'AUDIT_PLAYOFFS_IDEMPOTENCY_%';

  SELECT COUNT(*) INTO n_partidos
  FROM public.liga_partidos lp
  WHERE lp.liga_id IN (
    SELECT id FROM public.ligas WHERE nombre LIKE 'AUDIT_PLAYOFFS_IDEMPOTENCY_%'
  );

  SELECT COUNT(*) INTO n_jugadores
  FROM public.liga_jugadores
  WHERE nombre LIKE 'AUDIT_PLAYOFFS_IDEMPOTENCY_%';

  IF n_ligas <> 0 OR n_partidos <> 0 OR n_jugadores <> 0 THEN
    RAISE EXCEPTION
      'FAIL: quedaron datos tras ROLLBACK (ligas=%, partidos=%, jugadores=%)',
      n_ligas, n_partidos, n_jugadores;
  END IF;

  RAISE NOTICE 'PASS: transaction rolled back';
END $$;
