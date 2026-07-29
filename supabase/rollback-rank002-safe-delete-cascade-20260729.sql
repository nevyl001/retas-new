-- =============================================================================
-- ROLLBACK -- elimina las funciones creadas por
-- fix-rank002-safe-delete-cascade-20260729.sql. Son funciones NUEVAS (no
-- redefinen nada existente), así que el rollback es simplemente DROP.
-- NO EJECUTAR salvo que el fix ya se haya aplicado y se decida revertir --
-- si el frontend ya fue actualizado para llamar a estas RPCs (commit
-- separado), revertir el frontend primero.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.admin_delete_torneo_express_categoria_cascade(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_delete_liga_cascade(uuid, uuid);
DROP FUNCTION IF EXISTS public._revert_rating_for_partido_ref(text);

COMMIT;
