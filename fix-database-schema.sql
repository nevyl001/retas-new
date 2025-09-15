-- Script para arreglar el esquema de la base de datos multi-usuario
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Agregar columna tournament_id a la tabla players si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'players' AND column_name = 'tournament_id'
    ) THEN
        ALTER TABLE public.players ADD COLUMN tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Agregar columna user_id a la tabla players si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'players' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.players ADD COLUMN user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Agregar columna user_id a la tabla pairs si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pairs' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.pairs ADD COLUMN user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Agregar columna user_id a la tabla matches si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.matches ADD COLUMN user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 5. Agregar columna user_id a la tabla games si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'games' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.games ADD COLUMN user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 6. Actualizar RLS policies para incluir user_id
-- Players
DROP POLICY IF EXISTS "Users can view their own players" ON public.players;
CREATE POLICY "Users can view their own players" ON public.players
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own players" ON public.players;
CREATE POLICY "Users can insert their own players" ON public.players
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own players" ON public.players;
CREATE POLICY "Users can update their own players" ON public.players
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own players" ON public.players;
CREATE POLICY "Users can delete their own players" ON public.players
    FOR DELETE USING (auth.uid() = user_id);

-- Pairs
DROP POLICY IF EXISTS "Users can view their own pairs" ON public.pairs;
CREATE POLICY "Users can view their own pairs" ON public.pairs
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own pairs" ON public.pairs;
CREATE POLICY "Users can insert their own pairs" ON public.pairs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own pairs" ON public.pairs;
CREATE POLICY "Users can update their own pairs" ON public.pairs
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own pairs" ON public.pairs;
CREATE POLICY "Users can delete their own pairs" ON public.pairs
    FOR DELETE USING (auth.uid() = user_id);

-- Matches
DROP POLICY IF EXISTS "Users can view their own matches" ON public.matches;
CREATE POLICY "Users can view their own matches" ON public.matches
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own matches" ON public.matches;
CREATE POLICY "Users can insert their own matches" ON public.matches
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own matches" ON public.matches;
CREATE POLICY "Users can update their own matches" ON public.matches
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own matches" ON public.matches;
CREATE POLICY "Users can delete their own matches" ON public.matches
    FOR DELETE USING (auth.uid() = user_id);

-- Games
DROP POLICY IF EXISTS "Users can view their own games" ON public.games;
CREATE POLICY "Users can view their own games" ON public.games
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own games" ON public.games;
CREATE POLICY "Users can insert their own games" ON public.games
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own games" ON public.games;
CREATE POLICY "Users can update their own games" ON public.games
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own games" ON public.games;
CREATE POLICY "Users can delete their own games" ON public.games
    FOR DELETE USING (auth.uid() = user_id);

-- 7. Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_players_tournament_id ON public.players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_players_user_id ON public.players(user_id);
CREATE INDEX IF NOT EXISTS idx_pairs_user_id ON public.pairs(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON public.matches(user_id);
CREATE INDEX IF NOT EXISTS idx_games_user_id ON public.games(user_id);

-- 8. Actualizar datos existentes (si los hay)
-- Esto asigna los datos existentes al usuario actual (solo para datos de prueba)
UPDATE public.players SET user_id = auth.uid() WHERE user_id IS NULL;
UPDATE public.pairs SET user_id = auth.uid() WHERE user_id IS NULL;
UPDATE public.matches SET user_id = auth.uid() WHERE user_id IS NULL;
UPDATE public.games SET user_id = auth.uid() WHERE user_id IS NULL;

-- 9. Hacer las columnas NOT NULL después de actualizar los datos
ALTER TABLE public.players ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.pairs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.matches ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.games ALTER COLUMN user_id SET NOT NULL;
