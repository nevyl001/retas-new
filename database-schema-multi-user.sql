-- =====================================================
-- ESQUEMA DE BASE DE DATOS MULTI-USUARIO PARA RETAS
-- =====================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLA DE USUARIOS (extendiendo auth.users de Supabase)
-- =====================================================
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA DE RETAS
-- =====================================================
CREATE TABLE public.tournaments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  courts INTEGER DEFAULT 1,
  is_started BOOLEAN DEFAULT FALSE,
  is_finished BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT FALSE,
  max_players INTEGER DEFAULT 8,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA DE JUGADORES
-- =====================================================
CREATE TABLE public.players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  skill_level VARCHAR(20) DEFAULT 'intermedio',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA DE PAREJAS
-- =====================================================
CREATE TABLE public.pairs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  player1_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  player2_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  sets_won INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  matches_played INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA DE PARTIDOS
-- =====================================================
CREATE TABLE public.matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  pair1_id UUID NOT NULL REFERENCES public.pairs(id) ON DELETE CASCADE,
  pair2_id UUID NOT NULL REFERENCES public.pairs(id) ON DELETE CASCADE,
  court INTEGER NOT NULL,
  round INTEGER NOT NULL,
  winner_id UUID REFERENCES public.pairs(id),
  is_finished BOOLEAN DEFAULT FALSE,
  scheduled_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA DE JUEGOS
-- =====================================================
CREATE TABLE public.games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL,
  pair1_games INTEGER DEFAULT 0,
  pair2_games INTEGER DEFAULT 0,
  is_tie_break BOOLEAN DEFAULT FALSE,
  tie_break_pair1_points INTEGER DEFAULT 0,
  tie_break_pair2_points INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ÍNDICES PARA MEJOR RENDIMIENTO
-- =====================================================
CREATE INDEX idx_tournaments_user_id ON public.tournaments(user_id);
CREATE INDEX idx_players_user_id ON public.players(user_id);
CREATE INDEX idx_pairs_user_id ON public.pairs(user_id);
CREATE INDEX idx_pairs_tournament_id ON public.pairs(tournament_id);
CREATE INDEX idx_matches_user_id ON public.matches(user_id);
CREATE INDEX idx_matches_tournament_id ON public.matches(tournament_id);
CREATE INDEX idx_games_user_id ON public.games(user_id);
CREATE INDEX idx_games_match_id ON public.games(match_id);
CREATE INDEX idx_tournaments_created_at ON public.tournaments(created_at);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLÍTICAS RLS - LOS USUARIOS SOLO VEN SUS PROPIOS DATOS
-- =====================================================

-- Política para usuarios
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Política para retas
CREATE POLICY "Users can view own tournaments" ON public.tournaments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tournaments" ON public.tournaments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tournaments" ON public.tournaments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tournaments" ON public.tournaments
  FOR DELETE USING (auth.uid() = user_id);

-- Política para jugadores
CREATE POLICY "Users can view own players" ON public.players
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own players" ON public.players
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own players" ON public.players
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own players" ON public.players
  FOR DELETE USING (auth.uid() = user_id);

-- Política para parejas
CREATE POLICY "Users can view own pairs" ON public.pairs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own pairs" ON public.pairs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pairs" ON public.pairs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pairs" ON public.pairs
  FOR DELETE USING (auth.uid() = user_id);

-- Política para partidos
CREATE POLICY "Users can view own matches" ON public.matches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own matches" ON public.matches
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own matches" ON public.matches
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own matches" ON public.matches
  FOR DELETE USING (auth.uid() = user_id);

-- Política para juegos
CREATE POLICY "Users can view own games" ON public.games
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own games" ON public.games
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own games" ON public.games
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own games" ON public.games
  FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- FUNCIONES Y TRIGGERS
-- =====================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Función para crear perfil de usuario automáticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers para actualizar updated_at
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tournaments_updated_at 
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pairs_updated_at 
  BEFORE UPDATE ON public.pairs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_matches_updated_at 
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_games_updated_at 
  BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para crear perfil de usuario automáticamente
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- COMENTARIOS
-- =====================================================
COMMENT ON TABLE public.users IS 'Perfiles de usuario extendidos';
COMMENT ON TABLE public.tournaments IS 'Retas de pádel por usuario';
COMMENT ON TABLE public.players IS 'Jugadores por usuario';
COMMENT ON TABLE public.pairs IS 'Parejas por usuario';
COMMENT ON TABLE public.matches IS 'Partidos por usuario';
COMMENT ON TABLE public.games IS 'Juegos por usuario';
