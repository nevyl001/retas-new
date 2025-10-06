-- =====================================================
-- MARCAR TORNEOS EXISTENTES COMO PÚBLICOS
-- =====================================================

-- Marcar todos los torneos existentes como públicos
-- (Esto es temporal para que funcionen los links existentes)
UPDATE public.tournaments 
SET is_public = true 
WHERE is_public IS NULL OR is_public = false;

-- Verificar que se actualizaron correctamente
SELECT id, name, is_public, created_at 
FROM public.tournaments 
ORDER BY created_at DESC;
