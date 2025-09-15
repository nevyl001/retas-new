-- Script para agregar columnas de puntuación faltantes a la tabla matches
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Agregar columna pair1_score a la tabla matches si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'pair1_score'
    ) THEN
        ALTER TABLE public.matches ADD COLUMN pair1_score INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. Agregar columna pair2_score a la tabla matches si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'pair2_score'
    ) THEN
        ALTER TABLE public.matches ADD COLUMN pair2_score INTEGER DEFAULT 0;
    END IF;
END $$;

-- 3. Agregar columna status a la tabla matches si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.matches ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
    END IF;
END $$;

-- 4. Verificar la estructura actual de la tabla matches
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'matches' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 5. Actualizar partidos existentes que no tengan status definido
UPDATE public.matches 
SET status = CASE 
    WHEN is_finished = true THEN 'finished'
    ELSE 'pending'
END
WHERE status IS NULL OR status = '';

-- 6. Verificar que las columnas se agregaron correctamente
SELECT 
    'matches' as table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'matches' 
    AND table_schema = 'public'
    AND column_name IN ('pair1_score', 'pair2_score', 'status')
ORDER BY column_name;
