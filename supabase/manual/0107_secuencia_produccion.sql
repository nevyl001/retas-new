-- 0107 DESCARTADA.
-- No ejecutar supabase/_archive/migrations/0107_liga_autorizacion_registro_jugador.sql.
-- Ese archivo aborta a propósito y no reemplaza funciones.
-- 0108 tampoco se aplica hasta autorización expresa.

SELECT q.estado, q.tipo, q.attempts, left(lj.nombre, 48) AS nombre
FROM public.liga_notificaciones_queue q
JOIN public.liga_jugadores lj ON lj.id = q.liga_jugador_id
WHERE lj.nombre IN ('Zaid', 'Eduardo L')
ORDER BY q.created_at;
