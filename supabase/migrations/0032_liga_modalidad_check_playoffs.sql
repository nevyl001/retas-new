-- =============================================================================
-- 0032 — Ampliar ligas_modalidad_check con parejas_fijas_playoffs
-- =============================================================================
-- Contexto: 0030/0031 ya aplicadas. El frontend inserta modalidad
-- 'parejas_fijas_playoffs', pero el CHECK legacy de public.ligas no la admite
-- → 400 "violates check constraint ligas_modalidad_check".
--
-- Este CHECK NO está definido en migraciones 0001–0031 del repo (origen
-- pre-versionado / consola). Valores legacy confirmados por uso en app +
-- smoke Production: individual_rotativo, parejas_fijas.
--
-- Alcance:
--   - DROP + ADD del CHECK únicamente
--   - Conserva legacy + agrega solo parejas_fijas_playoffs
--   - No cambia datos, columnas, RLS ni RPCs
-- Idempotente: si el CHECK ya incluye parejas_fijas_playoffs, no-op.
-- =============================================================================

DO $$
DECLARE
  v_before text;
  v_after text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO v_before
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'ligas'
    AND c.conname = 'ligas_modalidad_check';

  RAISE NOTICE '0032 BEFORE ligas_modalidad_check: %', COALESCE(v_before, '(ausente)');

  -- Ya generalizado → no tocar
  IF v_before IS NOT NULL AND v_before ILIKE '%parejas_fijas_playoffs%' THEN
    RAISE NOTICE '0032 SKIP: CHECK ya admite parejas_fijas_playoffs';
    RETURN;
  END IF;

  -- Seguridad: si existe, debe seguir admitiendo las legacy
  IF v_before IS NOT NULL THEN
    IF v_before NOT ILIKE '%individual_rotativo%' THEN
      RAISE EXCEPTION
        '0032 ABORT: CHECK actual no menciona individual_rotativo (%). Revisar a mano.',
        v_before;
    END IF;
    IF v_before NOT ILIKE '%parejas_fijas%' THEN
      RAISE EXCEPTION
        '0032 ABORT: CHECK actual no menciona parejas_fijas (%). Revisar a mano.',
        v_before;
    END IF;
  END IF;

  ALTER TABLE public.ligas DROP CONSTRAINT IF EXISTS ligas_modalidad_check;

  ALTER TABLE public.ligas
    ADD CONSTRAINT ligas_modalidad_check
    CHECK (
      modalidad = ANY (
        ARRAY[
          'individual_rotativo'::text,
          'parejas_fijas'::text,
          'parejas_fijas_playoffs'::text
        ]
      )
    );

  SELECT pg_get_constraintdef(c.oid)
    INTO v_after
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'ligas'
    AND c.conname = 'ligas_modalidad_check';

  RAISE NOTICE '0032 AFTER ligas_modalidad_check: %', v_after;
END $$;

COMMENT ON CONSTRAINT ligas_modalidad_check ON public.ligas IS
  'Modalidades Liga: individual_rotativo | parejas_fijas | parejas_fijas_playoffs';
