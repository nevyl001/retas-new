-- Todos los jugadores activos participan en el ranking interno del club.
UPDATE public.riviera_jugadores
SET suma_ranking = true, updated_at = now()
WHERE estado <> 'archivado'
  AND suma_ranking IS DISTINCT FROM true;
