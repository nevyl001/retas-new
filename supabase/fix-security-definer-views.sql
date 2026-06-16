-- =============================================================================
-- Corregir vistas SECURITY DEFINER (Advisor Supabase)
--   • public.pairs_with_contact
--   • public.notificaciones_eventos_queue_resumen
--
-- NO afecta vistas públicas del torneo (/public/...). Esas usan tablas + RLS.
--
-- Qué hace:
--   1. security_invoker = true  → respeta RLS del usuario que consulta
--   2. Revoca acceso anon       → emails/contactos ya no expuestos sin login
--   3. Mantiene authenticated   → panel de notificaciones del organizador
--   4. Mantiene service_role    → Edge Functions (enviar-notificaciones, etc.)
--
-- Ejecutar en Supabase SQL Editor (producción). Luego probar notificaciones TE.
-- =============================================================================

-- ── 1. pairs_with_contact ──
DO $$
BEGIN
  IF to_regclass('public.pairs_with_contact') IS NULL THEN
    RAISE NOTICE 'Skip: public.pairs_with_contact no existe';
    RETURN;
  END IF;

  EXECUTE 'ALTER VIEW public.pairs_with_contact SET (security_invoker = true)';

  -- Quitar acceso público/anónimo (hoy filtra emails con permisos de admin)
  REVOKE ALL ON public.pairs_with_contact FROM anon;
  REVOKE ALL ON public.pairs_with_contact FROM PUBLIC;

  -- App organizador (sesión) + Edge Functions
  GRANT SELECT ON public.pairs_with_contact TO authenticated;
  GRANT SELECT ON public.pairs_with_contact TO service_role;
END $$;

-- ── 2. notificaciones_eventos_queue_resumen (solo servidor / dashboard SQL) ──
DO $$
BEGIN
  IF to_regclass('public.notificaciones_eventos_queue_resumen') IS NULL THEN
    RAISE NOTICE 'Skip: public.notificaciones_eventos_queue_resumen no existe';
    RETURN;
  END IF;

  EXECUTE 'ALTER VIEW public.notificaciones_eventos_queue_resumen SET (security_invoker = true)';

  REVOKE ALL ON public.notificaciones_eventos_queue_resumen FROM anon;
  REVOKE ALL ON public.notificaciones_eventos_queue_resumen FROM authenticated;
  REVOKE ALL ON public.notificaciones_eventos_queue_resumen FROM PUBLIC;

  GRANT SELECT ON public.notificaciones_eventos_queue_resumen TO service_role;
END $$;

-- ── 3. Verificación ──
SELECT
  c.relname AS view_name,
  COALESCE(
    (SELECT option_value
     FROM pg_options_to_table(c.reloptions)
     WHERE option_name = 'security_invoker'),
    'false'
  ) AS security_invoker
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname IN ('pairs_with_contact', 'notificaciones_eventos_queue_resumen')
ORDER BY c.relname;

-- Privilegios efectivos (anon no debe aparecer con SELECT)
SELECT
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('pairs_with_contact', 'notificaciones_eventos_queue_resumen')
ORDER BY table_name, grantee, privilege_type;
