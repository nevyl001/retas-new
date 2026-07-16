-- Verify slots vacíos duelo (staging)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'duelos_2v2'
      AND column_name = 'pareja_a_j1_nombre'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'VERIFY FAIL: pareja_a_j1_nombre sigue NOT NULL';
  END IF;
  RAISE NOTICE 'VERIFY OK: duelo open draft slots';
END $$;
