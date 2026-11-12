-- ARCHIVO HISTÓRICO. Fuera de supabase/migrations a propósito.
-- El CLI no debe ejecutar este archivo. No registrarlo como applied:
-- nunca se aplicó, y su único efecto es abortar.
-- 0107 DESCARTADA. No aplicar.
-- El alta histórica no guarda versión ni alcance del aviso.
-- No inferir consentimiento desde la fecha de alta.
-- Conservar las funciones vigentes de 0106.

DO $$
BEGIN
  RAISE EXCEPTION '0107 descartada: no aplicar'
    USING ERRCODE = 'P0001';
END $$;
