-- SOLO backfill de metadata.organizador_id. NO mueve filas entre perfiles.
-- Ejecutar en Supabase SQL Editor (staging → prod).

UPDATE public.jugador_participaciones jp
SET metadata = COALESCE(jp.metadata, '{}'::jsonb) || jsonb_build_object('organizador_id', d.organizador_id::text)
FROM public.duelos_2v2 d
WHERE jp.tipo_evento = 'duelo_2v2'
  AND jp.evento_id::uuid = d.id
  AND COALESCE(jp.metadata->>'organizador_id', '') = '';

UPDATE public.jugador_participaciones jp
SET metadata = COALESCE(jp.metadata, '{}'::jsonb) || jsonb_build_object('organizador_id', t.organizador_id::text)
FROM public.torneo_express t
WHERE jp.tipo_evento = 'torneo_express'
  AND jp.evento_id::uuid = t.id
  AND COALESCE(jp.metadata->>'organizador_id', '') = '';

NOTIFY pgrst, 'reload schema';
