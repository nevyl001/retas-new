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

-- Respaldo, antes de la reparación y fuera del repositorio.
-- No guarda correos ni nombres. Sirve para comprobar que ninguna fila
-- fue aceptada por el proveedor y para restaurar texto y programación.
--
-- SELECT q.id, q.idempotency_key, q.liga_jugador_id, q.estado, q.motivo,
--        q.programado_para, q.asunto, q.cuerpo_texto, q.attempts, q.processed_at
-- FROM public.liga_notificaciones_queue q
-- JOIN public.liga_jornadas j ON j.id = q.jornada_id
-- WHERE j.numero = 2
--   AND j.fecha = DATE '2026-11-11'
--   AND q.tipo = 'recordatorio_jornada'
--   AND q.origen = 'automatico'
--   AND q.estado IN ('pendiente', 'omitido');
--
-- NO EJECUTAR. Medido el 2026-11-10: 10 pendientes, programados el
-- 2026-11-11 09:00 hora de México, con Fecha y enlace, sin Horario.
-- La hora oficial de la ronda 1 es 21:00 y es única. La función de sync
-- ya está viva; no hay que aplicar 0113. No llamar a sync para esta
-- reparación: además del texto puede reescribir estado y programación.
--
-- Este UPDATE solo inserta la línea Horario en esos 10 cuerpos.
-- No cambia programado_para, estado, motivo, clave, jugador ni intentos.
-- No toca los dos omitidos ni ningún enviado. Exige que el conteo previo
-- siga siendo 10 y que falte más de una hora para las 09:00.
--
-- UPDATE public.liga_notificaciones_queue q
-- SET cuerpo_texto = regexp_replace(
--       q.cuerpo_texto,
--       '(Fecha: 11/11/2026)(\nSede:)',
--       E'\\1\nHorario: 21:00 hrs\\2'
--     ),
--     updated_at = now()
-- FROM public.liga_jornadas j
-- WHERE j.id = q.jornada_id
--   AND j.numero = 2
--   AND j.fecha = DATE '2026-11-11'
--   AND q.tipo = 'recordatorio_jornada'
--   AND q.origen = 'automatico'
--   AND q.estado = 'pendiente'
--   AND q.programado_para = timestamptz '2026-11-11 09:00:00-06'
--   AND q.cuerpo_texto LIKE E'%Fecha: 11/11/2026\nSede:%'
--   AND q.cuerpo_texto NOT LIKE '%Horario:%'
--   AND q.attempts = 0
--   AND q.processed_at IS NULL;
