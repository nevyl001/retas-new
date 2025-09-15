-- Script para arreglar la tabla pairs
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Agregar columna player1_name a la tabla pairs si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pairs' AND column_name = 'player1_name'
    ) THEN
        ALTER TABLE public.pairs ADD COLUMN player1_name VARCHAR(255);
    END IF;
END $$;

-- 2. Agregar columna player2_name a la tabla pairs si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pairs' AND column_name = 'player2_name'
    ) THEN
        ALTER TABLE public.pairs ADD COLUMN player2_name VARCHAR(255);
    END IF;
END $$;

-- 3. Verificar la estructura actual de la tabla pairs
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'pairs' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. Verificar que las políticas RLS están correctas para pairs
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'pairs'
ORDER BY policyname;
