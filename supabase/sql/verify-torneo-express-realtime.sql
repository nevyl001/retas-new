-- ═══════════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO Realtime Torneo Express — SOLO LECTURA. No modifica nada.
-- Fecha: 2026-07-15
--
-- Tablas realmente escuchadas por el código (subscribeTorneoExpress /
-- useTorneoExpress), confirmadas leyendo src/services/torneoExpressService.ts:
--   torneo_express                       (filter id=eq.<torneoId>)
--   torneo_express_grupos                (filter torneo_id=eq.<torneoId>)
--   torneo_express_grupo_parejas         (filter grupo_id=eq.<grupoId>, por grupo)
--   torneo_express_partidos              (filter grupo_id=eq.<grupoId>, por grupo;
--                                          esta tabla NO tiene columna torneo_id)
--   torneo_express_eliminatoria_partidos (filter torneo_id=eq.<torneoId>)
--
-- torneo_express_evento NO se escucha (VistaPublicaEvento es el selector de
-- categorías; a propósito no abre Realtime ahí para no crear N suscripciones).
-- matches / games (sistema reta clásico, useRealtimeSubscription) YA están en
-- uso hoy; se listan solo para confirmar que no se rompieron, NO se tocan.
--
-- Ejecuta este archivo completo en el SQL Editor y pega el resultado de cada
-- bloque en el chat antes de correr enable-torneo-express-realtime.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1) ¿Existen las tablas? (para no agregar a la publicación algo inexistente)
SELECT table_name, 'exists' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'torneo_express',
    'torneo_express_grupos',
    'torneo_express_grupo_parejas',
    'torneo_express_partidos',
    'torneo_express_eliminatoria_partidos',
    'matches',
    'games'
  )
ORDER BY table_name;

-- 2) ¿Cuáles ya están en la publicación supabase_realtime?
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename IN (
    'torneo_express',
    'torneo_express_grupos',
    'torneo_express_grupo_parejas',
    'torneo_express_partidos',
    'torneo_express_eliminatoria_partidos',
    'matches',
    'games'
  )
ORDER BY tablename;

-- 3) REPLICA IDENTITY actual (d=default/PK, f=full, n=nothing, i=index).
--    El callback de Realtime en el código SOLO usa el evento como señal para
--    refetch (no lee payload.old ni compara columnas), así que 'd' (default)
--    es suficiente. Esta consulta es para CONFIRMARLO, no para cambiarlo.
SELECT
  c.relname AS table_name,
  c.relreplident AS replica_identity_code,
  CASE c.relreplident
    WHEN 'd' THEN 'default (PK) — suficiente para refetch-signal'
    WHEN 'f' THEN 'full — ya envía payload.old completo (no requerido hoy)'
    WHEN 'n' THEN 'nothing — sin datos en payload.old'
    WHEN 'i' THEN 'index — según índice único'
  END AS meaning
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'torneo_express',
    'torneo_express_grupos',
    'torneo_express_grupo_parejas',
    'torneo_express_partidos',
    'torneo_express_eliminatoria_partidos',
    'matches',
    'games'
  )
ORDER BY c.relname;

-- 4) RLS activo por tabla.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'torneo_express',
    'torneo_express_grupos',
    'torneo_express_grupo_parejas',
    'torneo_express_partidos',
    'torneo_express_eliminatoria_partidos'
  )
ORDER BY c.relname;

-- 5) Políticas RLS existentes (para confirmar que hay SELECT anon USING(true),
--    o detectar que falta / quedó distinto de lo esperado en el repo).
SELECT schemaname, tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'torneo_express',
    'torneo_express_grupos',
    'torneo_express_grupo_parejas',
    'torneo_express_partidos',
    'torneo_express_eliminatoria_partidos'
  )
ORDER BY tablename, policyname;

-- 6) Grants SQL directos a los roles anon/authenticated (independiente de RLS;
--    si no hay GRANT SELECT, RLS ni importa — Postgres bloquea antes).
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'torneo_express',
    'torneo_express_grupos',
    'torneo_express_grupo_parejas',
    'torneo_express_partidos',
    'torneo_express_eliminatoria_partidos'
  )
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;
