-- ══════════════════════════════════════════════════════════════════════════════
-- 0016 — Índices de las rutas calientes de Reta
--
-- Ninguna de estas cuatro tablas tiene CREATE TABLE en el repo (se
-- provisionaron fuera de las migraciones versionadas, ver
-- supabase/migrations/README.md), así que no hay evidencia en el repo de que
-- existan hoy índices sobre las columnas que de verdad filtran las consultas
-- calientes del ciclo de vida de una reta. Se agregan cuatro, cada uno
-- justificado por una consulta ya trazada en el código -- ninguno es
-- especulativo:
--
--   matches_tournament_id_idx        -> getMatches(tournamentId) (src/lib/database.ts),
--                                        conteo de partidos pendientes en
--                                        finalize_reta_atomic (0015), y el
--                                        filtrado por tournament_id que hace
--                                        syncRetaParticipacionesInner al cerrar.
--   pairs_tournament_id_idx          -> getPairs(tournamentId) (src/lib/database.ts).
--   jugador_participaciones_lookup_idx -> misma columna que usa el ON CONFLICT
--                                        de registrar_participacion_jugador
--                                        (jugador_id, tipo_evento, evento_id, resultado);
--                                        acelera esa probe de conflicto además
--                                        de las lecturas por jugador+evento.
--   tournaments_user_is_finished_idx  -> "Mis retas" filtra por user_id;
--                                        tournaments_user_active_idx (patch-
--                                        soft-archive-mis-retas.sql) ya cubre
--                                        (user_id, created_at DESC) WHERE
--                                        archived_at IS NULL pero nada cubre
--                                        is_finished, que es el filtro que usa
--                                        la vista "En curso" / "Finalizadas".
--
-- Confirmación final con EXPLAIN (ANALYZE, BUFFERS) contra datos de
-- producción es un seguimiento post-deploy, no una condición previa: estos
-- índices respaldan columnas de filtro/FK ya usadas hoy, no son una apuesta.
--
-- Idempotente: CREATE INDEX IF NOT EXISTS es repetible sin error. Sin RLS, sin
-- SECURITY DEFINER -- no aplica ninguna regla de scan-unsafe-sql.
-- Rollback:
--   DROP INDEX IF EXISTS public.matches_tournament_id_idx;
--   DROP INDEX IF EXISTS public.pairs_tournament_id_idx;
--   DROP INDEX IF EXISTS public.jugador_participaciones_lookup_idx;
--   DROP INDEX IF EXISTS public.tournaments_user_is_finished_idx;
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS matches_tournament_id_idx
  ON public.matches (tournament_id);

CREATE INDEX IF NOT EXISTS pairs_tournament_id_idx
  ON public.pairs (tournament_id);

CREATE INDEX IF NOT EXISTS jugador_participaciones_lookup_idx
  ON public.jugador_participaciones (jugador_id, tipo_evento, evento_id);

CREATE INDEX IF NOT EXISTS tournaments_user_is_finished_idx
  ON public.tournaments (user_id, is_finished);
