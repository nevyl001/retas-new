-- =============================================================================
-- BACKUP — public.profiles, public.boxes y sus 2 funciones/4 enums asociados.
-- Solo lectura. Datos capturados en vivo el 2026-07-28, antes de eliminar.
-- =============================================================================

-- ── Filas de profiles (2, íntegras, verificadas idénticas a auth.users) ──
-- id                                    | user_id                              | rol    | estado_cuenta   | box_id                               | nombre_completo         | telefono | bio  | foto_url | is_super_admin | created_at
-- 6a526a3f-7c67-4286-8f79-2644e5914336  | a5e0bfed-4779-4d24-9a5b-c1d575477521 | socio  | pendiente_pago  | ef073de3-2b88-4725-bb5f-bbbfa51fd851 | [REDACTADO — ver nota]  | NULL     | NULL | NULL     | false          | 2026-07-11 21:06:56.654668+00
-- dfa549b7-d2ba-4c29-945c-5e36a647bbe4  | 3cc60ef2-b5ba-4c3a-b207-41756db94b1a | socio  | pendiente_pago  | ef073de3-2b88-4725-bb5f-bbbfa51fd851 | [REDACTADO — ver nota]  | NULL     | NULL | NULL     | false          | 2026-07-16 17:11:49.721054+00
--
-- nombre_completo en ambas filas era literalmente el prefijo del correo del
-- usuario real (split_part(email,'@',1)) — confirma que nunca fueron datos
-- de perfil de gimnasio reales, solo el valor por defecto que ponía
-- handle_new_user(). Redactado aquí antes de subir este archivo al repo
-- (identifica a una persona real); el valor exacto, si se necesita para un
-- rollback fiel, está solo en la salida de auditoría de la conversación
-- original, no en git.

SELECT * FROM profiles ORDER BY created_at;

-- ── Fila de boxes (1) ──
-- id                                    | name             | slug              | status | plan | timezone            | owner_user_id | address | phone | email | logo_url | created_at
-- ef073de3-2b88-4725-bb5f-bbbfa51fd851  | Parabellum Cross | parabellum-cross  | active | pro  | America/Mexico_City | NULL          | NULL    | NULL  | NULL  | NULL     | 2026-07-01 16:17:02.04018+00

SELECT * FROM boxes;

-- ── Confirmación cruzada con auth.users (re-verificar en vivo antes de borrar) ──
SELECT
  pr.id AS profile_id, pr.user_id, pr.created_at AS profile_created_at,
  au.created_at AS auth_user_created_at,
  au.created_at = pr.created_at AS timestamps_identicos -- debe ser TRUE en ambas filas
FROM profiles pr
JOIN auth.users au ON au.id = pr.user_id;

-- ── Definiciones — políticas de profiles (5) ──
-- profiles_insert_admin   (INSERT, WITH CHECK: is_admin())
-- profiles_insert_own     (INSERT)
-- profiles_select_coaches (SELECT, USING: rol = ANY (ARRAY['coach','admin']))
-- profiles_select_own_or_staff (SELECT, USING: user_id = auth.uid() OR is_coach_or_admin())
-- profiles_update_own_or_admin (UPDATE, USING: user_id = auth.uid() OR is_admin())
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname;

-- boxes: sin políticas (confirmado, 0 filas).

-- ── Definiciones — columnas y constraints de profiles/boxes ──
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('profiles','boxes')
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS tbl, conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid::regclass::text IN ('profiles','boxes')
ORDER BY tbl, contype;

-- ── Definiciones — funciones ──
-- is_admin(): SELECT EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND rol IN ('admin','box_admin'))
-- is_coach_or_admin(): SELECT EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND rol IN ('admin','coach','box_admin'))
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('is_admin','is_coach_or_admin');

-- ── Definiciones — enums ──
-- account_status: pendiente_pago, activo, inactivo
-- user_role: admin, socio, coach, box_admin
-- box_plan: free, basic, pro, enterprise
-- box_status: active, inactive, trial
SELECT t.typname, e.enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('account_status','user_role','box_plan','box_status')
ORDER BY t.typname, e.enumsortorder;
