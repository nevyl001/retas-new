-- ══════════════════════════════════════════════════════════════════════════════
-- 0022 — Índices de rutas calientes: games.match_id y liga_partidos.jornada_id
--
-- Igual que 0016 (Reta), ninguna evidencia en el repo de índice existente
-- sobre estas columnas de filtro. Justificación por consulta ya trazada en
-- el código -- ninguno especulativo:
--
--   games_match_id_idx          -> getGames(matchId) (src/lib/database.ts,
--                                    .eq("match_id", matchId)) y
--                                    getTournamentGames(tournamentId)
--                                    (.in("match_id", matchIds)); también
--                                    acelera el filtrado en cliente que hace
--                                    useRealtimeSubscription al descartar
--                                    cambios de games de otro torneo.
--   liga_partidos_jornada_id_idx -> getLigaById (src/services/ligaService.ts,
--                                    .in("jornada_id", jornadaIds)) y el resto
--                                    de consultas de liga_partidos filtradas
--                                    por jornada_id (guardar/leer resultados,
--                                    generación de rondas); también acelera
--                                    el filtrado en cliente que hace
--                                    useLigaRealtime.
--
-- No se ejecuta contra producción como parte de este cambio.
--
-- Idempotente: CREATE INDEX IF NOT EXISTS es repetible sin error. Sin RLS, sin
-- SECURITY DEFINER -- no aplica ninguna regla de scan-unsafe-sql.
-- Rollback:
--   DROP INDEX IF EXISTS public.games_match_id_idx;
--   DROP INDEX IF EXISTS public.liga_partidos_jornada_id_idx;
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS games_match_id_idx
  ON public.games (match_id);

CREATE INDEX IF NOT EXISTS liga_partidos_jornada_id_idx
  ON public.liga_partidos (jornada_id);
