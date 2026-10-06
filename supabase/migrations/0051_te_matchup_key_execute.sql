-- El índice único de enfrentamientos llama a te_matchup_key en cada insert.
-- Postgres evalúa esa expresión con el rol de la sesión. 0044 le quitó
-- EXECUTE a authenticated, así que crear una categoría falla con
-- "permission denied for function te_matchup_key" aunque la consola
-- del navegador no muestre una excepción.
--
-- La función solo ordena dos uuid. No abre datos.

GRANT EXECUTE ON FUNCTION public.te_matchup_key(uuid, uuid) TO authenticated;
