-- Script para arreglar las políticas RLS (Row Level Security)
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Verificar que RLS esté habilitado en todas las tablas
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar todas las políticas existentes para empezar limpio
DROP POLICY IF EXISTS "Users can view their own players" ON public.players;
DROP POLICY IF EXISTS "Users can insert their own players" ON public.players;
DROP POLICY IF EXISTS "Users can update their own players" ON public.players;
DROP POLICY IF EXISTS "Users can delete their own players" ON public.players;

DROP POLICY IF EXISTS "Users can view their own pairs" ON public.pairs;
DROP POLICY IF EXISTS "Users can insert their own pairs" ON public.pairs;
DROP POLICY IF EXISTS "Users can update their own pairs" ON public.pairs;
DROP POLICY IF EXISTS "Users can delete their own pairs" ON public.pairs;

DROP POLICY IF EXISTS "Users can view their own matches" ON public.matches;
DROP POLICY IF EXISTS "Users can insert their own matches" ON public.matches;
DROP POLICY IF EXISTS "Users can update their own matches" ON public.matches;
DROP POLICY IF EXISTS "Users can delete their own matches" ON public.matches;

DROP POLICY IF EXISTS "Users can view their own games" ON public.games;
DROP POLICY IF EXISTS "Users can insert their own games" ON public.games;
DROP POLICY IF EXISTS "Users can update their own games" ON public.games;
DROP POLICY IF EXISTS "Users can delete their own games" ON public.games;

DROP POLICY IF EXISTS "Users can view their own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can insert their own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can update their own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can delete their own tournaments" ON public.tournaments;

-- 3. Crear políticas RLS correctas para TOURNAMENTS
CREATE POLICY "Users can view their own tournaments" ON public.tournaments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tournaments" ON public.tournaments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tournaments" ON public.tournaments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tournaments" ON public.tournaments
    FOR DELETE USING (auth.uid() = user_id);

-- 4. Crear políticas RLS correctas para PLAYERS
CREATE POLICY "Users can view their own players" ON public.players
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own players" ON public.players
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own players" ON public.players
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own players" ON public.players
    FOR DELETE USING (auth.uid() = user_id);

-- 5. Crear políticas RLS correctas para PAIRS
CREATE POLICY "Users can view their own pairs" ON public.pairs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pairs" ON public.pairs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pairs" ON public.pairs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pairs" ON public.pairs
    FOR DELETE USING (auth.uid() = user_id);

-- 6. Crear políticas RLS correctas para MATCHES
CREATE POLICY "Users can view their own matches" ON public.matches
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own matches" ON public.matches
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own matches" ON public.matches
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own matches" ON public.matches
    FOR DELETE USING (auth.uid() = user_id);

-- 7. Crear políticas RLS correctas para GAMES
CREATE POLICY "Users can view their own games" ON public.games
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own games" ON public.games
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own games" ON public.games
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own games" ON public.games
    FOR DELETE USING (auth.uid() = user_id);

-- 8. Verificar que las columnas user_id existen y tienen valores
-- Primero, verificar la estructura de las tablas
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'players' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 9. Verificar que el usuario actual tiene un perfil en la tabla users
SELECT id, email, name FROM public.users WHERE id = auth.uid();

-- 10. Verificar que las políticas se crearon correctamente
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('players', 'pairs', 'matches', 'games', 'tournaments')
ORDER BY tablename, policyname;
