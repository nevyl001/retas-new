-- =====================================================
-- SCRIPT COMPLETO PARA HABILITAR ACCESO PÚBLICO
-- =====================================================

-- 1. Marcar todos los torneos existentes como públicos
UPDATE public.tournaments 
SET is_public = true 
WHERE is_public IS NULL OR is_public = false;

-- 2. Agregar políticas públicas para acceso sin autenticación

-- Política pública para torneos marcados como públicos
DROP POLICY IF EXISTS "Public can view public tournaments" ON public.tournaments;
CREATE POLICY "Public can view public tournaments" ON public.tournaments
  FOR SELECT USING (is_public = true);

-- Política pública para parejas de torneos públicos
DROP POLICY IF EXISTS "Public can view pairs from public tournaments" ON public.pairs;
CREATE POLICY "Public can view pairs from public tournaments" ON public.pairs
  FOR SELECT USING (
    tournament_id IN (
      SELECT id FROM public.tournaments WHERE is_public = true
    )
  );

-- Política pública para partidos de torneos públicos
DROP POLICY IF EXISTS "Public can view matches from public tournaments" ON public.matches;
CREATE POLICY "Public can view matches from public tournaments" ON public.matches
  FOR SELECT USING (
    tournament_id IN (
      SELECT id FROM public.tournaments WHERE is_public = true
    )
  );

-- Política pública para juegos de partidos de torneos públicos
DROP POLICY IF EXISTS "Public can view games from public tournaments" ON public.games;
CREATE POLICY "Public can view games from public tournaments" ON public.games
  FOR SELECT USING (
    match_id IN (
      SELECT m.id FROM public.matches m
      JOIN public.tournaments t ON m.tournament_id = t.id
      WHERE t.is_public = true
    )
  );

-- Política pública para jugadores que participan en torneos públicos
DROP POLICY IF EXISTS "Public can view players from public tournaments" ON public.players;
CREATE POLICY "Public can view players from public tournaments" ON public.players
  FOR SELECT USING (
    id IN (
      SELECT DISTINCT p1.player1_id FROM public.pairs p1
      JOIN public.tournaments t ON p1.tournament_id = t.id
      WHERE t.is_public = true
      UNION
      SELECT DISTINCT p2.player2_id FROM public.pairs p2
      JOIN public.tournaments t ON p2.tournament_id = t.id
      WHERE t.is_public = true
    )
  );

-- 3. Verificar que todo esté configurado correctamente
SELECT 'Tournaments marked as public:' as status, COUNT(*) as count 
FROM public.tournaments WHERE is_public = true;

SELECT 'Public policies created successfully' as status;
