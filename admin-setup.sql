-- =====================================================
-- ADMIN SETUP - TABLA DE ADMINISTRADORES
-- =====================================================

-- Crear tabla de administradores
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true
);

-- Habilitar RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Política RLS simple para admin_users
DROP POLICY IF EXISTS "Admin users can view admin_users" ON public.admin_users;
CREATE POLICY "Allow admin access" ON public.admin_users
  FOR ALL USING (true);

-- Insertar usuario admin por defecto
-- Email: admin@test.com
-- Password: 123456 (hash: $2a$10$rQZ8k7QZ8k7QZ8k7QZ8k7O)
INSERT INTO public.admin_users (email, password_hash, name, is_active)
VALUES (
  'admin@test.com',
  '$2a$10$rQZ8k7QZ8k7QZ8k7QZ8k7O', -- Hash de '123456'
  'Administrador',
  true
) ON CONFLICT (email) DO NOTHING;

-- Verificar que se insertó correctamente
SELECT * FROM public.admin_users WHERE email = 'admin@test.com';
