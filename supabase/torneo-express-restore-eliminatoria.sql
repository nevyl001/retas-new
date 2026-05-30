-- Restaurar torneo cerrado incorrectamente antes de jugar la final.
-- Ejecutar en Supabase SQL Editor y ajustar el filtro WHERE.

UPDATE torneo_express
SET
  estado = 'en_curso',
  fase_torneo = 'eliminatoria',
  fecha_fin = NULL
WHERE nombre ILIKE '%Torneo Express Padelito%'
  AND estado = 'finalizado'
  AND fase_torneo = 'cerrado';

-- Verificar partidos de final pendientes (opcional):
-- SELECT id, ronda, estado, pareja_local_id, pareja_visitante_id
-- FROM torneo_express_eliminatoria_partidos
-- WHERE torneo_id = '<uuid-del-torneo>'
-- ORDER BY ronda, orden;
