-- Script para hacer que los jugadores sean independientes del torneo
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Hacer que la columna tournament_id sea opcional (nullable)
ALTER TABLE public.players ALTER COLUMN tournament_id DROP NOT NULL;

-- 2. Actualizar las políticas RLS para permitir jugadores sin tournament_id
DROP POLICY IF EXISTS "Users can view their own players" ON public.players;
DROP POLICY IF EXISTS "Users can insert their own players" ON public.players;
DROP POLICY IF EXISTS "Users can update their own players" ON public.players;
DROP POLICY IF EXISTS "Users can delete their own players" ON public.players;

-- 3. Crear nuevas políticas RLS para jugadores independientes del torneo
CREATE POLICY "Users can view their own players" ON public.players
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own players" ON public.players
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own players" ON public.players
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own players" ON public.players
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Verificar la estructura actual de la tabla players
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'players' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 5. Verificar las políticas RLS actuales
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'players'
ORDER BY policyname;
