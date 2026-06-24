-- Ajuste puntos ranking duelo 2 vs 2: ganador 50, perdedor 20
-- Ejecutar una vez en Supabase SQL Editor (después de desplegar el cambio en la app).

UPDATE public.jugador_participaciones jp
SET
  puntos_obtenidos = CASE WHEN jp.resultado = 'victoria' THEN 50 ELSE 20 END,
  metadata = COALESCE(jp.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'puntos_evento',
      CASE WHEN jp.resultado = 'victoria' THEN 50 ELSE 20 END,
      'puntos_desglose',
      CASE
        WHEN jp.resultado = 'victoria' THEN jsonb_build_object('duelo_2v2_ganador', 50)
        ELSE jsonb_build_object('duelo_2v2_perdedor', 20)
      END
    )
WHERE jp.tipo_evento = 'duelo_2v2';

UPDATE public.jugador_stats js
SET
  puntos_totales = sub.total,
  updated_at = now()
FROM (
  SELECT jugador_id, COALESCE(SUM(puntos_obtenidos), 0)::integer AS total
  FROM public.jugador_participaciones
  GROUP BY jugador_id
) sub
WHERE js.jugador_id = sub.jugador_id;

NOTIFY pgrst, 'reload schema';
