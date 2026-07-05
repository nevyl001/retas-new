-- ══════════════════════════════════════════════════════════════════════════════
-- RIVIERA PLATFORM 2.1.1 — Player Membership Engine — Fase 1
-- Evolución de organizer_player_access (sin tablas paralelas)
--
-- Alcance: columnas + constraints + comentarios + backfill legacy
-- NO implementa: RPCs add/leave, búsqueda, QR, UI, TypeScript
--
-- Prerrequisito: organizer-player-access.sql
-- Idempotente: sí | Reversible: bloque ROLLBACK al final
--
-- Filosofía: Player Membership — la Carrera pertenece al jugador.
-- owner_organizador_id = Organizador de Registro (no propiedad).
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.organizer_player_access') IS NULL THEN
    RAISE EXCEPTION 'Prerrequisito: ejecutar organizer-player-access.sql antes de 2.1.1';
  END IF;
END $$;

-- ── 1. Columnas nuevas (aditivas) ──

ALTER TABLE public.organizer_player_access
  ADD COLUMN IF NOT EXISTS joined_at timestamptz,
  ADD COLUMN IF NOT EXISTS left_at timestamptz,
  ADD COLUMN IF NOT EXISTS joined_via text;

-- ── 2. Backfill filas legacy (idempotente) ──

UPDATE public.organizer_player_access opa
SET joined_at = opa.created_at
WHERE opa.joined_at IS NULL;

UPDATE public.organizer_player_access opa
SET joined_via = CASE
  WHEN opa.access_type = 'owner' THEN 'registration'
  ELSE 'admin_legacy'
END
WHERE opa.joined_via IS NULL;

UPDATE public.organizer_player_access opa
SET left_at = opa.updated_at
WHERE opa.is_active = false
  AND opa.left_at IS NULL;

-- ── 3. Defaults y NOT NULL en joined_at (post-backfill) ──

ALTER TABLE public.organizer_player_access
  ALTER COLUMN joined_at SET DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.organizer_player_access
    WHERE joined_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Backfill incompleto: joined_at NULL en organizer_player_access';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizer_player_access'
      AND column_name = 'joined_at'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.organizer_player_access
      ALTER COLUMN joined_at SET NOT NULL;
  END IF;
END $$;

-- ── 4. Comentarios (filosofía Player Membership) ──

COMMENT ON TABLE public.organizer_player_access IS
  'Player Membership — relación operativa entre un jugador (Carrera Deportiva) y un organizador. '
  'La Carrera pertenece al jugador; el organizador administra eventos. '
  'is_active=true: membresía activa; is_active=false: salió del organizador (historial intacto). '
  'Evolución de Fase 1 acceso concedido; sin tablas paralelas.';

COMMENT ON COLUMN public.organizer_player_access.jugador_id IS
  'Perfil de registro (referencia a la Carrera): riviera_jugadores.id del jugador en su contexto canonical. '
  'Mismo jugador puede tener membresías en múltiples organizadores (filas distintas por grantee).';

COMMENT ON COLUMN public.organizer_player_access.owner_organizador_id IS
  'Organizador de Registro (Debut Riviera) — dónde inició la Carrera Deportiva. '
  'NO representa propiedad del jugador. Columna legacy; no renombrada físicamente en 2.1.1.';

COMMENT ON COLUMN public.organizer_player_access.grantee_organizer_id IS
  'Organizador donde existe esta membresía (club que opera al jugador localmente).';

COMMENT ON COLUMN public.organizer_player_access.local_jugador_id IS
  'Perfil operativo local riviera_jugadores en grantee_organizer_id (stats/rating del club).';

COMMENT ON COLUMN public.organizer_player_access.is_active IS
  'Membresía activa. false = salió del organizador; no elimina Carrera ni participaciones.';

COMMENT ON COLUMN public.organizer_player_access.access_type IS
  'Legacy Fase 1: owner | granted_by_admin. Valores futuros en Fase 2.1.2+.';

COMMENT ON COLUMN public.organizer_player_access.granted_by_admin_id IS
  'Legacy: admin que otorgó acceso Fase 1. Futuro: joined_by_user_id en RPC membership.';

COMMENT ON COLUMN public.organizer_player_access.joined_at IS
  'Fecha en que el jugador se unió a este organizador (inicio de membresía).';

COMMENT ON COLUMN public.organizer_player_access.left_at IS
  'Fecha en que el jugador salió de este organizador. NULL mientras is_active=true.';

COMMENT ON COLUMN public.organizer_player_access.joined_via IS
  'Canal de alta: admin_legacy | riviera_id | registration | qr (futuro).';

-- ── 5. Constraints de integridad (idempotentes) ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'opa_joined_via_chk'
      AND conrelid = 'public.organizer_player_access'::regclass
  ) THEN
    ALTER TABLE public.organizer_player_access
      ADD CONSTRAINT opa_joined_via_chk
      CHECK (
        joined_via IS NULL
        OR joined_via IN ('admin_legacy', 'riviera_id', 'registration', 'qr')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'opa_active_left_at_chk'
      AND conrelid = 'public.organizer_player_access'::regclass
  ) THEN
    ALTER TABLE public.organizer_player_access
      ADD CONSTRAINT opa_active_left_at_chk
      CHECK (
        is_active = true AND left_at IS NULL
        OR is_active = false
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'opa_left_after_joined_chk'
      AND conrelid = 'public.organizer_player_access'::regclass
  ) THEN
    ALTER TABLE public.organizer_player_access
      ADD CONSTRAINT opa_left_after_joined_chk
      CHECK (
        left_at IS NULL
        OR left_at >= joined_at
      );
  END IF;
END $$;

-- ── 6. Índice de soporte membresía activa (complementa UNIQUE existente) ──
-- UNIQUE (grantee_organizer_id, jugador_id) ya garantiza una fila por par org+jugador.
-- Índice parcial acelera consultas de membresías activas por organizador.

CREATE INDEX IF NOT EXISTS opa_grantee_jugador_active_idx
  ON public.organizer_player_access (grantee_organizer_id, jugador_id)
  WHERE is_active = true;

-- ── 7. Validación post-migración ──

DO $$
DECLARE
  v_total bigint;
  v_null_joined bigint;
  v_active_with_left bigint;
  v_dup_active bigint;
BEGIN
  SELECT count(*) INTO v_total FROM public.organizer_player_access;

  SELECT count(*) INTO v_null_joined
  FROM public.organizer_player_access
  WHERE joined_at IS NULL;

  SELECT count(*) INTO v_active_with_left
  FROM public.organizer_player_access
  WHERE is_active = true AND left_at IS NOT NULL;

  SELECT count(*) INTO v_dup_active
  FROM (
    SELECT grantee_organizer_id, jugador_id
    FROM public.organizer_player_access
    WHERE is_active = true
    GROUP BY grantee_organizer_id, jugador_id
    HAVING count(*) > 1
  ) d;

  IF v_null_joined > 0 THEN
    RAISE EXCEPTION '2.1.1 FAIL: % filas sin joined_at', v_null_joined;
  END IF;

  IF v_active_with_left > 0 THEN
    RAISE EXCEPTION '2.1.1 FAIL: % membresías activas con left_at', v_active_with_left;
  END IF;

  IF v_dup_active > 0 THEN
    RAISE EXCEPTION '2.1.1 FAIL: % pares org+jugador con múltiples activas', v_dup_active;
  END IF;

  RAISE NOTICE 'Sprint 2.1.1 OK — organizer_player_access: total=%, membresías activas=%',
    v_total,
    (SELECT count(*) FROM public.organizer_player_access WHERE is_active = true);
END $$;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK 2.1.1
-- ══════════════════════════════════════════════════════════════════════════════
--
-- DROP INDEX IF EXISTS public.opa_grantee_jugador_active_idx;
--
-- ALTER TABLE public.organizer_player_access
--   DROP CONSTRAINT IF EXISTS opa_left_after_joined_chk,
--   DROP CONSTRAINT IF EXISTS opa_active_left_at_chk,
--   DROP CONSTRAINT IF EXISTS opa_joined_via_chk;
--
-- ALTER TABLE public.organizer_player_access
--   DROP COLUMN IF EXISTS joined_via,
--   DROP COLUMN IF EXISTS left_at,
--   DROP COLUMN IF EXISTS joined_at;
--
-- COMMENT ON TABLE public.organizer_player_access IS
--   'Acceso concedido por Admin Principal: un organizador puede usar jugadores de otra cuenta sin fusionar historial.';
--
-- NOTIFY pgrst, 'reload schema';
--
-- ══════════════════════════════════════════════════════════════════════════════
