-- =====================================================
-- POLÍTICAS PÚBLICAS PARA ACCESO SIN AUTENTICACIÓN
-- =====================================================

-- Política pública para torneos marcados como públicos
CREATE POLICY "Public can view public tournaments" ON public.tournaments
  FOR SELECT USING (is_public = true);

-- Política pública para parejas de torneos públicos
CREATE POLICY "Public can view pairs from public tournaments" ON public.pairs
  FOR SELECT USING (
    tournament_id IN (
      SELECT id FROM public.tournaments WHERE is_public = true
    )
  );

-- Política pública para partidos de torneos públicos
CREATE POLICY "Public can view matches from public tournaments" ON public.matches
  FOR SELECT USING (
    tournament_id IN (
      SELECT id FROM public.tournaments WHERE is_public = true
    )
  );

-- Política pública para juegos de partidos de torneos públicos
CREATE POLICY "Public can view games from public tournaments" ON public.games
  FOR SELECT USING (
    match_id IN (
      SELECT m.id FROM public.matches m
      JOIN public.tournaments t ON m.tournament_id = t.id
      WHERE t.is_public = true
    )
  );

-- Política pública para jugadores que participan en torneos públicos
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

-- =====================================================
-- NOTA IMPORTANTE
-- =====================================================
-- Para que los links públicos funcionen, necesitas:
-- 1. Ejecutar este script en tu base de datos Supabase
-- 2. Marcar los torneos como públicos (is_public = true) en la base de datos
-- 3. Los links públicos solo funcionarán para torneos marcados como públicos
