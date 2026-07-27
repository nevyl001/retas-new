-- Hotfix: habilitar RLS en tablas de respaldo huérfanas de la limpieza de
-- jugadores del 2026-07-13/14. Tenían RLS deshabilitado y GRANT completo
-- (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) a anon y authenticated, exponiendo
-- PII (email, teléfono, whatsapp, fecha de nacimiento) de jugadores
-- eliminados sin ninguna autenticación. Ninguna de estas tablas es
-- consultada por código de la aplicación.
--
-- Sin políticas agregadas: RLS habilitado sin políticas deniega todo acceso
-- a anon/authenticated por defecto. service_role sigue con acceso total.

ALTER TABLE public.jugador_delete_backup_ledger_20260714_014743 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_delete_backup_ledger_20260714_045947 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_delete_backup_opa_20260714_014743 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_delete_backup_opa_20260714_045947 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_delete_backup_participaciones_20260714_014743 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_delete_backup_participaciones_20260714_045947 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_delete_backup_riviera_jugadores_20260714_014743 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_delete_backup_riviera_jugadores_20260714_045947 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_participaciones_historical_orphan_backup_20260713_16253 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_participaciones_orphan_backup_20260713_160744 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riviera_official_points_ledger_orphan_backup_20260713_160744 ENABLE ROW LEVEL SECURITY;
