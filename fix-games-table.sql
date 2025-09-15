-- Script para arreglar la tabla games
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Agregar columna user_id a la tabla games si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'games' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.games ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- 2. Verificar la estructura actual de la tabla games
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'games' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. Eliminar políticas RLS existentes para games (si las hay)
DROP POLICY IF EXISTS "Users can view their own games" ON public.games;
DROP POLICY IF EXISTS "Users can insert their own games" ON public.games;
DROP POLICY IF EXISTS "Users can update their own games" ON public.games;
DROP POLICY IF EXISTS "Users can delete their own games" ON public.games;

-- 4. Crear nuevas políticas RLS para games
CREATE POLICY "Users can view their own games" ON public.games
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own games" ON public.games
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own games" ON public.games
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own games" ON public.games
  FOR DELETE USING (auth.uid() = user_id);

-- 5. Verificar las políticas RLS actuales para games
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'games'
ORDER BY policyname;
