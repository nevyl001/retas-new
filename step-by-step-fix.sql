-- =====================================================
-- SCRIPT PASO A PASO PARA HABILITAR ACCESO PÚBLICO
-- =====================================================

-- PASO 1: Marcar todos los torneos existentes como públicos
UPDATE public.tournaments 
SET is_public = true 
WHERE is_public IS NULL OR is_public = false;

-- PASO 2: Eliminar políticas existentes (si las hay)
DROP POLICY IF EXISTS "Public can view public tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Public can view pairs from public tournaments" ON public.pairs;
DROP POLICY IF EXISTS "Public can view matches from public tournaments" ON public.matches;
DROP POLICY IF EXISTS "Public can view games from public tournaments" ON public.games;
DROP POLICY IF EXISTS "Public can view players from public tournaments" ON public.players;

-- PASO 3: Crear políticas públicas
CREATE POLICY "Public can view public tournaments" ON public.tournaments
  FOR SELECT USING (is_public = true);

CREATE POLICY "Public can view pairs from public tournaments" ON public.pairs
  FOR SELECT USING (
    tournament_id IN (
      SELECT id FROM public.tournaments WHERE is_public = true
    )
  );

CREATE POLICY "Public can view matches from public tournaments" ON public.matches
  FOR SELECT USING (
    tournament_id IN (
      SELECT id FROM public.tournaments WHERE is_public = true
    )
  );

CREATE POLICY "Public can view games from public tournaments" ON public.games
  FOR SELECT USING (
    match_id IN (
      SELECT m.id FROM public.matches m
      JOIN public.tournaments t ON m.tournament_id = t.id
      WHERE t.is_public = true
    )
  );

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

-- PASO 4: Verificar que todo esté configurado correctamente
SELECT 'Tournaments marked as public:' as status, COUNT(*) as count 
FROM public.tournaments WHERE is_public = true;
