-- =============================================================================
-- VERIFY get_organizador_branding_public (solo lectura)
-- Sustituir los UUID de ejemplo por IDs reales de producción.
-- =============================================================================

-- 0) Firma y columnas DTO
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_function_result(p.oid) AS result_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_organizador_branding_public';

-- Esperado result_type contiene solo:
--   organizador_id uuid, premium_branding_enabled boolean, branding_key text

-- 1a) Organizador PREMIUM (rellenar UUID)
-- SELECT * FROM public.get_organizador_branding_public('<UUID_PREMIUM>'::uuid);
-- Esperado: premium_branding_enabled = true, branding_key no null

-- 1b) Organizador BÁSICO (rellenar UUID)
-- SELECT * FROM public.get_organizador_branding_public('<UUID_BASICO>'::uuid);
-- Esperado: premium_branding_enabled = false, branding_key = null
--   (aunque branding_key esté poblado en fila, la función lo anula)

-- 1c) Organizador INEXISTENTE
SELECT * FROM public.get_organizador_branding_public(
  '00000000-0000-4000-8000-000000000000'::uuid
);
-- Esperado: 0 filas

-- 2) Sanity: DTO no puede devolver columnas privadas (inspección del cuerpo)
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_organizador_branding_public';
-- Esperado: NO aparece email, plan, stripe, billing, password, etc.
