-- ══════════════════════════════════════════════════════════════════════════════
-- HISTÓRICO — NO EJECUTAR
--
-- Movido a supabase/_archive/unsafe-historical/ el 2026-08-03 (BLK-05,
-- auditoría de preproducción). Reconstruye `profiles`/`boxes` (esquema de una
-- app de gimnasio ajena — "Parabellum Cross" — que compartía el mismo
-- proyecto Supabase, ver supabase/cleanup-foreign-block-20260728.sql) con una
-- policy `profiles_insert_own ... WITH CHECK (true)`. No es RLS del modelo
-- multi-tenant de Riviera Open — es rollback de un esquema ya limpiado y sin
-- relación con clubes/organizadores reales. Se conserva solo como registro.
-- ══════════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- ROLLBACK — restaura exactamente lo que elimina cleanup-profiles-boxes-20260728.sql.
-- NO EJECUTAR salvo que esa limpieza ya se haya aplicado y se decida revertir.
-- Reconstruye profiles y boxes CON sus 2+1 filas originales (capturadas en
-- backup-profiles-boxes-pre-cleanup-20260728.sql).
-- =============================================================================

BEGIN;

-- ── 1. Enums ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('pendiente_pago', 'activo', 'inactivo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('admin', 'socio', 'coach', 'box_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.box_plan AS ENUM ('free', 'basic', 'pro', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.box_status AS ENUM ('active', 'inactive', 'trial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Tabla boxes (padre de profiles.box_id) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  logo_url text,
  address text,
  phone text,
  email text,
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  status public.box_status NOT NULL DEFAULT 'trial',
  plan public.box_plan NOT NULL DEFAULT 'free',
  owner_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boxes_slug_key UNIQUE (slug)
);
CREATE INDEX IF NOT EXISTS idx_boxes_slug ON public.boxes (slug);
CREATE INDEX IF NOT EXISTS idx_boxes_status ON public.boxes (status);

-- Fila original (Parabellum Cross):
INSERT INTO public.boxes (id, name, slug, status, plan, timezone, created_at, updated_at)
VALUES (
  'ef073de3-2b88-4725-bb5f-bbbfa51fd851', 'Parabellum Cross', 'parabellum-cross',
  'active', 'pro', 'America/Mexico_City',
  '2026-07-01 16:17:02.04018+00', '2026-07-01 16:17:02.04018+00'
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Tabla profiles ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_completo text NOT NULL,
  telefono text,
  foto_url text,
  bio text,
  rol public.user_role NOT NULL DEFAULT 'socio',
  estado_cuenta public.account_status NOT NULL DEFAULT 'pendiente_pago',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  box_id uuid NOT NULL REFERENCES public.boxes(id),
  is_super_admin boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_profiles_box_id ON public.profiles (box_id);
CREATE INDEX IF NOT EXISTS idx_profiles_estado ON public.profiles (estado_cuenta);
CREATE INDEX IF NOT EXISTS idx_profiles_rol ON public.profiles (rol);

-- Las 2 filas originales (capturadas en el backup). nombre_completo real
-- (prefijo del correo del usuario) redactado antes de subir este archivo
-- al repo — era literalmente el username de una persona real. El
-- placeholder de abajo solo satisface el NOT NULL de la columna; si se
-- necesita el valor original para un rollback fiel, está en la salida de
-- auditoría de la conversación, no en git.
INSERT INTO public.profiles (id, user_id, nombre_completo, telefono, bio, foto_url, rol, estado_cuenta, box_id, is_super_admin, created_at, updated_at)
VALUES
  ('6a526a3f-7c67-4286-8f79-2644e5914336', 'a5e0bfed-4779-4d24-9a5b-c1d575477521', '[nombre_completo redactado]', NULL, NULL, NULL, 'socio', 'pendiente_pago', 'ef073de3-2b88-4725-bb5f-bbbfa51fd851', false, '2026-07-11 21:06:56.654668+00', '2026-07-11 21:06:56.654668+00'),
  ('dfa549b7-d2ba-4c29-945c-5e36a647bbe4', '3cc60ef2-b5ba-4c3a-b207-41756db94b1a', '[nombre_completo redactado]', NULL, NULL, NULL, 'socio', 'pendiente_pago', 'ef073de3-2b88-4725-bb5f-bbbfa51fd851', false, '2026-07-16 17:11:49.721054+00', '2026-07-16 17:11:49.721054+00')
ON CONFLICT (id) DO NOTHING;

-- ── 4. Funciones ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND rol IN ('admin','box_admin')); $$;

CREATE OR REPLACE FUNCTION public.is_coach_or_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND rol IN ('admin','coach','box_admin')); $$;

-- ── 5. Políticas de profiles ───────────────────────────────────────────────
CREATE POLICY profiles_insert_admin ON public.profiles FOR INSERT WITH CHECK (is_admin());
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY profiles_select_coaches ON public.profiles FOR SELECT USING (rol = ANY (ARRAY['coach'::user_role, 'admin'::user_role]));
CREATE POLICY profiles_select_own_or_staff ON public.profiles FOR SELECT USING ((user_id = auth.uid()) OR is_coach_or_admin());
CREATE POLICY profiles_update_own_or_admin ON public.profiles FOR UPDATE USING ((user_id = auth.uid()) OR is_admin());

-- ── 6. Grants (estado previo a la limpieza) ───────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.boxes TO anon, authenticated;

COMMIT;

-- NOTA: este rollback NO restaura el trigger on_auth_user_created en
-- auth.users (ese se eliminó en la limpieza ANTERIOR, cleanup-foreign-
-- block-20260728.sql, y su propio rollback ya lo trata como opcional /
-- no recomendado). Si se ejecuta este rollback solo, profiles/boxes
-- vuelven a existir pero ya no se repueblan automáticamente en cada
-- signup — eso requeriría además revertir el script anterior.
