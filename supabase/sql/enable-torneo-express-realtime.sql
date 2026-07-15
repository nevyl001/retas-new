-- ═══════════════════════════════════════════════════════════════════════════════
-- HABILITAR Realtime para Torneo Express — IDEMPOTENTE.
-- Fecha: 2026-07-15
--
-- Propósito: agregar a la publicación supabase_realtime SOLO las tablas que
-- el código realmente escucha hoy (ver verify-torneo-express-realtime.sql,
-- bloque 1 del comentario). No crea ni recrea la publicación, no quita nada
-- existente, no toca matches/games (sistema reta clásico, ya funciona con su
-- propio useRealtimeSubscription y no se modifica aquí).
--
-- Seguro para correr más de una vez: cada ALTER PUBLICATION ... ADD TABLE va
-- envuelto en su propio DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL,
-- el mismo patrón ya usado en supabase/duelos-2v2.sql y
-- supabase/tournament-public-config-americano.sql de este repo.
--
-- PRERREQUISITO: corre primero verify-torneo-express-realtime.sql y revisa que
-- las tablas existan (bloque 1). Si alguna no existe en tu entorno, este
-- script fallaría en el ALTER de esa tabla puntual: puedes comentar esa línea.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.torneo_express;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.torneo_express_grupos;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.torneo_express_grupo_parejas;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.torneo_express_partidos;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.torneo_express_eliminatoria_partidos;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Verificación final: debe mostrar las 5 tablas de Torneo Express (y las que
-- ya tuvieras antes, p. ej. duelos_2v2, tournament_public_config, matches, games).
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (comentado — solo si hace falta revertir esta habilitación puntual;
-- no afecta las demás tablas de la publicación):
--
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.torneo_express;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.torneo_express_grupos;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.torneo_express_grupo_parejas;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.torneo_express_partidos;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.torneo_express_eliminatoria_partidos;
-- ═══════════════════════════════════════════════════════════════════════════════
