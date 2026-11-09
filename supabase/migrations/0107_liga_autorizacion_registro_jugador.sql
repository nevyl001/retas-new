-- 0107 DESCARTADA. No aplicar.
-- El alta histórica no guarda versión ni alcance del aviso.
-- No inferir consentimiento desde la fecha de alta.
-- Conservar las funciones vigentes de 0106.

DO $$
BEGIN
  RAISE EXCEPTION '0107 descartada: no aplicar'
    USING ERRCODE = 'P0001';
END $$;
