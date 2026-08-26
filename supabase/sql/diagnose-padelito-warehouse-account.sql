-- Diagnóstico Padelito Warehouse — ejecutar PRIMERO
-- Compara el UUID del login vs el UUID donde aplicaste el patch.

-- 1) UUID real del email con el que entras a la app
SELECT id AS organizador_id_login, email, raw_user_meta_data->>'name' AS name
FROM auth.users
WHERE lower(email) = lower('padelitopadel@gmail.com');

-- 2) Club Test (cuenta demo Riviera — NUNCA binding de Padelito)
SELECT 'cd45cea7-a8ac-4596-b0ee-24959b4cbb5d'::uuid AS club_test_uuid;

-- 3) Branding del login real (debe premium=true, branding_key=padelito-warehouse)
SELECT *
FROM public.get_organizador_branding_public(
  (SELECT id FROM auth.users WHERE lower(email) = lower('padelitopadel@gmail.com') LIMIT 1)
);

-- 4) Branding de Club Test (solo referencia)
SELECT *
FROM public.get_organizador_branding_public('cd45cea7-a8ac-4596-b0ee-24959b4cbb5d'::uuid);

-- Si organizador_id_login <> cd45cea7-… → el patch anterior iba a la cuenta equivocada.
-- Ejecuta patch-padelito-warehouse-branding-prod.sql (usa email, no UUID fijo).
