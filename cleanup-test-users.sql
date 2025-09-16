-- Script para limpiar usuarios de prueba
-- Ejecutar en Supabase SQL Editor

-- Ver usuarios con emails sospechosos
SELECT email, created_at, email_confirmed_at 
FROM auth.users 
WHERE email LIKE '%test%' 
   OR email LIKE '%example%' 
   OR email LIKE '%@test.%'
   OR email LIKE '%@example.%'
   OR email LIKE '%@localhost%'
   OR email LIKE '%@temp%'
   OR email LIKE '%@fake%'
ORDER BY created_at DESC;

-- Eliminar usuarios de prueba (descomenta si es necesario)
-- DELETE FROM auth.users 
-- WHERE email LIKE '%test%' 
--    OR email LIKE '%example%' 
--    OR email LIKE '%@test.%'
--    OR email LIKE '%@example.%'
--    OR email LIKE '%@localhost%'
--    OR email LIKE '%@temp%'
--    OR email LIKE '%@fake%';
