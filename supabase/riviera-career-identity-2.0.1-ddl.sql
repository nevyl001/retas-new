-- ══════════════════════════════════════════════════════════════════════════════
-- SPRINT 2.0.1 — Riviera Platform 2.0 / Fase A — Riviera ID Foundation
-- DDL aditivo sobre riviera_official_player_identity (Carrera Deportiva)
--
-- Alcance: columnas nullable + constraints + índices. Sin RPCs, sin backfill,
-- sin generación de Riviera ID, sin hooks, sin cambios de comportamiento.
--
-- Prerrequisito: riviera-official-multi-club-romc1.sql (tabla debe existir)
-- Ejecutar en: Supabase SQL Editor (staging primero, luego producción)
--
-- Idempotente: sí — safe to re-run
-- Reversible: ver bloque ROLLBACK al final de este archivo
-- Filosofía: Riviera ID = identidad pública permanente; official_player_key = llave técnica
-- ══════════════════════════════════════════════════════════════════════════════

-- Guard: abortar con mensaje claro si ROMC-1 no está desplegado
DO $$
BEGIN
  IF to_regclass('public.riviera_official_player_identity') IS NULL THEN
    RAISE EXCEPTION
      'Prerrequisito faltante: ejecutar riviera-official-multi-club-romc1.sql antes de Sprint 2.0.1';
  END IF;
END $$;

-- ── 1. Columnas nuevas (todas nullable — cero impacto en filas existentes) ──

ALTER TABLE public.riviera_official_player_identity
  ADD COLUMN IF NOT EXISTS riviera_id text,
  ADD COLUMN IF NOT EXISTS riviera_id_serial bigint,
  ADD COLUMN IF NOT EXISTS debut_organizer_id uuid,
  ADD COLUMN IF NOT EXISTS debut_at timestamptz;

-- FK Organizador de Registro (Debut Riviera) — idempotente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ropi_debut_organizer_id_fkey'
      AND conrelid = 'public.riviera_official_player_identity'::regclass
  ) THEN
    ALTER TABLE public.riviera_official_player_identity
      ADD CONSTRAINT ropi_debut_organizer_id_fkey
      FOREIGN KEY (debut_organizer_id)
      REFERENCES auth.users(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ── 2. Comentarios (lenguaje de producto oficial) ──

COMMENT ON TABLE public.riviera_official_player_identity IS
  'Contenedor de Carrera Deportiva: identidad permanente del deportista en Riviera. '
  'Un official_player_key por persona; perfiles locales enlazados vía profile_link. '
  'Riviera ID (riviera_id) = identidad pública legible; official_player_key = llave técnica interna.';

COMMENT ON COLUMN public.riviera_official_player_identity.official_player_key IS
  'Llave técnica interna permanente (UUID). No se muestra al jugador. '
  'Acumula ledger, totales y futura Carrera Deportiva.';

COMMENT ON COLUMN public.riviera_official_player_identity.canonical_riviera_jugador_id IS
  'Perfil de registro: riviera_jugadores.id del Organizador de Registro (Debut Riviera). '
  'Término legacy en columna; en producto: perfil donde inició la Carrera Deportiva.';

COMMENT ON COLUMN public.riviera_official_player_identity.riviera_id IS
  'Riviera ID — identidad pública permanente del jugador. Formato congelado: RIV-00000001. '
  'Nunca cambia, nunca se reutiliza, independiente del UUID interno. Asignado en Sprint 2.0.4+.';

COMMENT ON COLUMN public.riviera_official_player_identity.riviera_id_serial IS
  'Componente numérico del Riviera ID (secuencia global). Par acoplado con riviera_id.';

COMMENT ON COLUMN public.riviera_official_player_identity.debut_organizer_id IS
  'Debut Riviera — Organizador de Registro: primer organizador donde inició la Carrera Deportiva. '
  'Inmutable una vez asignado. No implica propiedad del jugador.';

COMMENT ON COLUMN public.riviera_official_player_identity.debut_at IS
  'Debut Riviera — Fecha de Registro: momento en que se abrió la Carrera Deportiva. '
  'Inmutable una vez asignado.';

-- ── 3. Constraints de integridad (idempotentes) ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ropi_riviera_id_format_chk'
      AND conrelid = 'public.riviera_official_player_identity'::regclass
  ) THEN
    ALTER TABLE public.riviera_official_player_identity
      ADD CONSTRAINT ropi_riviera_id_format_chk
      CHECK (
        riviera_id IS NULL
        OR riviera_id ~ '^RIV-[0-9]{8}$'
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ropi_riviera_id_serial_positive_chk'
      AND conrelid = 'public.riviera_official_player_identity'::regclass
  ) THEN
    ALTER TABLE public.riviera_official_player_identity
      ADD CONSTRAINT ropi_riviera_id_serial_positive_chk
      CHECK (
        riviera_id_serial IS NULL
        OR riviera_id_serial >= 1
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ropi_riviera_id_pair_chk'
      AND conrelid = 'public.riviera_official_player_identity'::regclass
  ) THEN
    ALTER TABLE public.riviera_official_player_identity
      ADD CONSTRAINT ropi_riviera_id_pair_chk
      CHECK (
        (riviera_id IS NULL AND riviera_id_serial IS NULL)
        OR (riviera_id IS NOT NULL AND riviera_id_serial IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ropi_debut_pair_chk'
      AND conrelid = 'public.riviera_official_player_identity'::regclass
  ) THEN
    ALTER TABLE public.riviera_official_player_identity
      ADD CONSTRAINT ropi_debut_pair_chk
      CHECK (
        (debut_organizer_id IS NULL AND debut_at IS NULL)
        OR (debut_organizer_id IS NOT NULL AND debut_at IS NOT NULL)
      );
  END IF;
END $$;

-- ── 4. Índices UNIQUE parciales (solo filas con datos asignados) ──

CREATE UNIQUE INDEX IF NOT EXISTS ropi_riviera_id_unique_idx
  ON public.riviera_official_player_identity (riviera_id)
  WHERE riviera_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ropi_riviera_id_serial_unique_idx
  ON public.riviera_official_player_identity (riviera_id_serial)
  WHERE riviera_id_serial IS NOT NULL;

CREATE INDEX IF NOT EXISTS ropi_debut_organizer_id_idx
  ON public.riviera_official_player_identity (debut_organizer_id)
  WHERE debut_organizer_id IS NOT NULL;

-- ── 5. Validación post-migración (NOTICE — no modifica datos) ──

DO $$
DECLARE
  v_total bigint;
  v_with_riviera_id bigint;
  v_with_debut bigint;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.riviera_official_player_identity;

  SELECT count(*) INTO v_with_riviera_id
  FROM public.riviera_official_player_identity
  WHERE riviera_id IS NOT NULL;

  SELECT count(*) INTO v_with_debut
  FROM public.riviera_official_player_identity
  WHERE debut_organizer_id IS NOT NULL;

  RAISE NOTICE 'Sprint 2.0.1 OK — riviera_official_player_identity: total=%, con_riviera_id=%, con_debut=%',
    v_total, v_with_riviera_id, v_with_debut;

  IF v_with_riviera_id > 0 THEN
    RAISE NOTICE 'INFO: % fila(s) ya tienen riviera_id (esperado 0 hasta Sprint 2.0.4+ / backfill)',
      v_with_riviera_id;
  END IF;
END $$;

-- Recargar schema cache de PostgREST (Supabase API)
NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK Sprint 2.0.1 — ejecutar manualmente solo si hay que revertir este sprint
-- Orden inverso. No elimina filas ni datos de Carrera Deportiva en otras columnas.
-- ══════════════════════════════════════════════════════════════════════════════
--
-- DROP INDEX IF EXISTS public.ropi_debut_organizer_id_idx;
-- DROP INDEX IF EXISTS public.ropi_riviera_id_serial_unique_idx;
-- DROP INDEX IF EXISTS public.ropi_riviera_id_unique_idx;
--
-- ALTER TABLE public.riviera_official_player_identity
--   DROP CONSTRAINT IF EXISTS ropi_debut_pair_chk,
--   DROP CONSTRAINT IF EXISTS ropi_riviera_id_pair_chk,
--   DROP CONSTRAINT IF EXISTS ropi_riviera_id_serial_positive_chk,
--   DROP CONSTRAINT IF EXISTS ropi_riviera_id_format_chk,
--   DROP CONSTRAINT IF EXISTS ropi_debut_organizer_id_fkey;
--
-- ALTER TABLE public.riviera_official_player_identity
--   DROP COLUMN IF EXISTS debut_at,
--   DROP COLUMN IF EXISTS debut_organizer_id,
--   DROP COLUMN IF EXISTS riviera_id_serial,
--   DROP COLUMN IF EXISTS riviera_id;
--
-- NOTIFY pgrst, 'reload schema';
--
-- ══════════════════════════════════════════════════════════════════════════════
