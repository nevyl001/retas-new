-- Script para arreglar la tabla matches
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Agregar columna user_id a la tabla matches si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.matches ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- 2. Agregar columna pair1_name a la tabla matches si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'pair1_name'
    ) THEN
        ALTER TABLE public.matches ADD COLUMN pair1_name VARCHAR(255);
    END IF;
END $$;

-- 3. Agregar columna pair2_name a la tabla matches si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'pair2_name'
    ) THEN
        ALTER TABLE public.matches ADD COLUMN pair2_name VARCHAR(255);
    END IF;
END $$;

-- 4. Verificar la estructura actual de la tabla matches
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'matches' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 5. Verificar las políticas RLS actuales para matches
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'matches'
ORDER BY policyname;

-- 6. Si no existen políticas RLS para matches, crearlas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'matches'
    ) THEN
        -- Crear políticas RLS para matches
        CREATE POLICY "Users can view their own matches" ON public.matches
          FOR SELECT USING (auth.uid() = user_id);

        CREATE POLICY "Users can insert their own matches" ON public.matches
          FOR INSERT WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Users can update their own matches" ON public.matches
          FOR UPDATE USING (auth.uid() = user_id);

        CREATE POLICY "Users can delete their own matches" ON public.matches
          FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;
