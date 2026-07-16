-- Rollback: volver a exigir nombres (solo si no hay filas con nombre vacío)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.duelos_2v2
    WHERE coalesce(pareja_a_j1_nombre, '') = ''
       OR coalesce(pareja_a_j2_nombre, '') = ''
       OR coalesce(pareja_b_j1_nombre, '') = ''
       OR coalesce(pareja_b_j2_nombre, '') = ''
  ) THEN
    RAISE EXCEPTION 'Rollback bloqueado: hay duelos con slots vacíos';
  END IF;

  ALTER TABLE public.duelos_2v2
    ALTER COLUMN pareja_a_j1_nombre SET NOT NULL,
    ALTER COLUMN pareja_a_j2_nombre SET NOT NULL,
    ALTER COLUMN pareja_b_j1_nombre SET NOT NULL,
    ALTER COLUMN pareja_b_j2_nombre SET NOT NULL;
END $$;
