-- SOLO LECTURA. No actualiza la cola. No envía correos.
-- Ejecutar el SELECT después de revisar el resultado.
-- La reparación real queda comentada al final y exige:
--   1. haber aplicado 0113_liga_recordatorio_horario_oficial.sql
--   2. autorización explícita
--
-- Alcance: recordatorios automáticos pendientes de la jornada con
-- fecha 2026-11-11 y número 2, cuyo texto no trae el horario oficial.
-- No selecciona enviados, no cambia idempotency_key, no crea filas.

SELECT
  q.estado,
  q.motivo,
  to_char(q.programado_para AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD HH24:MI') AS programado_mx,
  (q.cuerpo_texto LIKE '%Horario: 21:00 hrs%') AS cuerpo_tiene_hora,
  (q.cuerpo_texto LIKE '%RESULTADOS_URL:/public/liga/%/jornada/2') AS cuerpo_tiene_enlace,
  count(*) AS filas
FROM public.liga_notificaciones_queue q
JOIN public.liga_jornadas j ON j.id = q.jornada_id
WHERE j.numero = 2
  AND j.fecha = DATE '2026-11-11'
  AND q.tipo = 'recordatorio_jornada'
  AND q.origen = 'automatico'
GROUP BY 1, 2, 3, 4, 5
ORDER BY 1, 3;

-- Comparación del texto que escribiría la función ya corregida,
-- sin leer correos ni nombres de jugadores.
SELECT
  j.numero,
  j.estado,
  to_char(j.fecha, 'DD/MM/YYYY') AS fecha,
  to_char(min(p.hora_inicio), 'HH24:MI') AS hora_ronda_1,
  count(DISTINCT p.hora_inicio) FILTER (WHERE COALESCE(p.ronda, 1) = 1) AS horas_distintas,
  'Horario: ' || to_char(min(p.hora_inicio) FILTER (WHERE COALESCE(p.ronda, 1) = 1), 'HH24:MI') || ' hrs' AS linea_horario_nueva,
  '/public/liga/' || j.liga_id::text || '/jornada/' || j.numero::text AS enlace
FROM public.liga_jornadas j
LEFT JOIN public.liga_partidos p ON p.jornada_id = j.id
WHERE j.numero = 2
  AND j.fecha = DATE '2026-11-11'
GROUP BY j.id, j.numero, j.estado, j.fecha, j.liga_id;

-- NO EJECUTAR. Después de aplicar 0113 y de confirmar que hora_ronda_1
-- es 21:00 y horas_distintas es 1, esto regenera solo pendiente/omitido
-- de esa jornada. Conserva la clave de idempotencia. No toca enviados.
-- No llama al worker.
--
-- SELECT public.liga_notificaciones_sync_recordatorio(j.id)
-- FROM public.liga_jornadas j
-- WHERE j.numero = 2
--   AND j.fecha = DATE '2026-11-11';
