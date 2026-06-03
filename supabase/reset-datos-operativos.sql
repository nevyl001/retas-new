-- =============================================================================
-- RESET DATOS OPERATIVOS — RivieraApp / Riviera Open
-- =============================================================================
-- Borra retas, jugadores legacy, torneos express, ligas, registro Riviera
-- y colas de notificaciones. Deja intactos:
--   • auth.users y public.users (cuentas de organizadores)
--   • public.admin_users
--   • Esquema, funciones, RLS y políticas
--
-- CÓMO EJECUTAR (recomendado):
--   1. Supabase → SQL Editor → pegar este archivo completo
--   2. Ejecutar en STAGING primero si tienes copia
--   3. Usar rol con permisos (el editor de Supabase ya bypass RLS)
--
-- DESPUÉS EN EL NAVEGADOR (por organizador):
--   • Borrar datos locales: Americano / última reta (localStorage)
--   • Opcional: Storage → bucket jugadores-avatars → vaciar fotos
-- =============================================================================

BEGIN;

-- ── Conteo antes (solo tablas que existan) ──
DO $$
DECLARE
  t text;
  cnt bigint;
  tables text[] := ARRAY[
    'public.tournaments',
    'public.players',
    'public.pairs',
    'public.matches',
    'public.games',
    'public.torneo_express',
    'public.ligas',
    'public.liga_jugadores',
    'public.riviera_jugadores',
    'public.jugador_participaciones'
  ];
BEGIN
  RAISE NOTICE '=== ANTES DEL RESET ===';
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %s', t) INTO cnt;
      RAISE NOTICE '%: % filas', t, cnt;
    END IF;
  END LOOP;
END $$;

-- ── Tablas hijo → padre (orden seguro; CASCADE por si falta alguna FK) ──
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'public.notificaciones_eventos_queue',
    'public.notificaciones_log',
    'public.jugador_participaciones',
    'public.jugador_stats',
    'public.games',
    'public.matches',
    'public.tournament_public_config',
    'public.pairs',
    'public.torneo_express_partidos',
    'public.torneo_express_grupo_parejas',
    'public.torneo_express_eliminatoria_partidos',
    'public.torneo_express_grupos',
    'public.liga_partidos',
    'public.liga_jornada_parejas',
    'public.liga_jornadas',
    'public.liga_inscripciones',
    'public.tournaments',
    'public.torneo_express',
    'public.ligas',
    'public.liga_jugadores',
    'public.players',
    'public.riviera_jugadores'
  ];
  existing text[] := '{}';
  stmt text;
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      existing := array_append(existing, tbl);
    END IF;
  END LOOP;

  IF coalesce(array_length(existing, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No se encontró ninguna tabla operativa. ¿Ejecutaste las migraciones base?';
  END IF;

  stmt := 'TRUNCATE TABLE ' || array_to_string(existing, ', ') || ' RESTART IDENTITY CASCADE';
  RAISE NOTICE 'Ejecutando: %', stmt;
  EXECUTE stmt;
END $$;

-- ── Conteo después ──
DO $$
DECLARE
  t text;
  cnt bigint;
  tables text[] := ARRAY[
    'public.tournaments',
    'public.players',
    'public.riviera_jugadores',
    'public.torneo_express',
    'public.ligas'
  ];
BEGIN
  RAISE NOTICE '=== DESPUÉS DEL RESET (deberían ser 0) ===';
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %s', t) INTO cnt;
      RAISE NOTICE '%: % filas', t, cnt;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- RESET SOLO UN ORGANIZADOR (opcional; comentar el bloque anterior y usar esto)
-- Sustituye el UUID y ejecuta en un BEGIN/COMMIT aparte.
-- =============================================================================
/*
BEGIN;

DELETE FROM public.jugador_participaciones
WHERE jugador_id IN (
  SELECT id FROM public.riviera_jugadores
  WHERE organizador_id = 'TU-UUID-ORGANIZADOR'
);
DELETE FROM public.riviera_jugadores WHERE organizador_id = 'TU-UUID-ORGANIZADOR';

DELETE FROM public.notificaciones_log
WHERE torneo_express_id IN (
  SELECT id FROM public.torneo_express WHERE organizador_id = 'TU-UUID-ORGANIZADOR'
);
DELETE FROM public.torneo_express WHERE organizador_id = 'TU-UUID-ORGANIZADOR';

DELETE FROM public.games
WHERE match_id IN (
  SELECT m.id FROM public.matches m
  JOIN public.tournaments t ON t.id = m.tournament_id
  WHERE t.user_id = 'TU-UUID-ORGANIZADOR'
);
DELETE FROM public.matches
WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE user_id = 'TU-UUID-ORGANIZADOR');
DELETE FROM public.pairs
WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE user_id = 'TU-UUID-ORGANIZADOR');
DELETE FROM public.tournament_public_config
WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE user_id = 'TU-UUID-ORGANIZADOR');
DELETE FROM public.tournaments WHERE user_id = 'TU-UUID-ORGANIZADOR';
DELETE FROM public.players WHERE user_id = 'TU-UUID-ORGANIZADOR';

DELETE FROM public.liga_partidos
WHERE jornada_id IN (
  SELECT j.id FROM public.liga_jornadas j
  JOIN public.ligas l ON l.id = j.liga_id
  WHERE l.organizador_id = 'TU-UUID-ORGANIZADOR'
);
DELETE FROM public.liga_jornada_parejas
WHERE jornada_id IN (
  SELECT j.id FROM public.liga_jornadas j
  JOIN public.ligas l ON l.id = j.liga_id
  WHERE l.organizador_id = 'TU-UUID-ORGANIZADOR'
);
DELETE FROM public.liga_jornadas
WHERE liga_id IN (SELECT id FROM public.ligas WHERE organizador_id = 'TU-UUID-ORGANIZADOR');
DELETE FROM public.liga_inscripciones
WHERE liga_id IN (SELECT id FROM public.ligas WHERE organizador_id = 'TU-UUID-ORGANIZADOR');
DELETE FROM public.ligas WHERE organizador_id = 'TU-UUID-ORGANIZADOR';
DELETE FROM public.liga_jugadores WHERE organizador_id = 'TU-UUID-ORGANIZADOR';

COMMIT;
*/
