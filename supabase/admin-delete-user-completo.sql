-- Borrado completo de una cuenta/organizador desde el panel admin maestro.
-- Requiere: supabase/admin-master-controls.sql (is_master_admin)
-- Ejecutar en Supabase → SQL Editor

CREATE OR REPLACE FUNCTION public.admin_delete_user_completo(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := p_target_user_id;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'No tienes permisos de administrador maestro';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario inválido';
  END IF;

  IF v_uid = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminar tu propia cuenta desde el panel';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  -- ── Notificaciones (Torneo Express) ──
  IF to_regclass('public.notificaciones_log') IS NOT NULL
     AND to_regclass('public.torneo_express') IS NOT NULL THEN
    DELETE FROM public.notificaciones_log
    WHERE torneo_express_id IN (
      SELECT id FROM public.torneo_express WHERE organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.notificaciones_eventos_queue') IS NOT NULL
     AND to_regclass('public.torneo_express') IS NOT NULL THEN
    DELETE FROM public.notificaciones_eventos_queue
    WHERE torneo_express_id IN (
      SELECT id FROM public.torneo_express WHERE organizador_id = v_uid
    );
  END IF;

  -- ── Torneo Express (hijos → padre) ──
  IF to_regclass('public.torneo_express_partidos') IS NOT NULL THEN
    DELETE FROM public.torneo_express_partidos
    WHERE torneo_express_id IN (
      SELECT id FROM public.torneo_express WHERE organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.torneo_express_grupo_parejas') IS NOT NULL THEN
    DELETE FROM public.torneo_express_grupo_parejas
    WHERE grupo_id IN (
      SELECT g.id
      FROM public.torneo_express_grupos g
      JOIN public.torneo_express te ON te.id = g.torneo_express_id
      WHERE te.organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.torneo_express_eliminatoria_partidos') IS NOT NULL THEN
    DELETE FROM public.torneo_express_eliminatoria_partidos
    WHERE torneo_express_id IN (
      SELECT id FROM public.torneo_express WHERE organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.torneo_express_grupos') IS NOT NULL THEN
    DELETE FROM public.torneo_express_grupos
    WHERE torneo_express_id IN (
      SELECT id FROM public.torneo_express WHERE organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.torneo_express') IS NOT NULL THEN
    DELETE FROM public.torneo_express WHERE organizador_id = v_uid;
  END IF;

  -- ── Liga ──
  IF to_regclass('public.liga_partidos') IS NOT NULL THEN
    DELETE FROM public.liga_partidos
    WHERE jornada_id IN (
      SELECT j.id
      FROM public.liga_jornadas j
      JOIN public.ligas l ON l.id = j.liga_id
      WHERE l.organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.liga_jornada_parejas') IS NOT NULL THEN
    DELETE FROM public.liga_jornada_parejas
    WHERE jornada_id IN (
      SELECT j.id
      FROM public.liga_jornadas j
      JOIN public.ligas l ON l.id = j.liga_id
      WHERE l.organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.liga_jornadas') IS NOT NULL THEN
    DELETE FROM public.liga_jornadas
    WHERE liga_id IN (SELECT id FROM public.ligas WHERE organizador_id = v_uid);
  END IF;

  IF to_regclass('public.liga_inscripciones') IS NOT NULL THEN
    DELETE FROM public.liga_inscripciones
    WHERE liga_id IN (SELECT id FROM public.ligas WHERE organizador_id = v_uid);
  END IF;

  IF to_regclass('public.ligas') IS NOT NULL THEN
    DELETE FROM public.ligas WHERE organizador_id = v_uid;
  END IF;

  IF to_regclass('public.liga_jugadores') IS NOT NULL THEN
    DELETE FROM public.liga_jugadores WHERE organizador_id = v_uid;
  END IF;

  -- ── Duelos 2v2 (antes de riviera_jugadores por FK) ──
  IF to_regclass('public.duelos_2v2') IS NOT NULL THEN
    DELETE FROM public.duelos_2v2 WHERE organizador_id = v_uid;
  END IF;

  -- ── Registro Riviera Open ──
  IF to_regclass('public.jugador_participaciones') IS NOT NULL THEN
    DELETE FROM public.jugador_participaciones
    WHERE jugador_id IN (
      SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.rating_historial') IS NOT NULL THEN
    DELETE FROM public.rating_historial
    WHERE jugador_id IN (
      SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.jugador_stats') IS NOT NULL THEN
    DELETE FROM public.jugador_stats
    WHERE jugador_id IN (
      SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.riviera_jugadores') IS NOT NULL THEN
    DELETE FROM public.riviera_jugadores WHERE organizador_id = v_uid;
  END IF;

  -- ── Retas clásicas ──
  IF to_regclass('public.games') IS NOT NULL
     AND to_regclass('public.matches') IS NOT NULL
     AND to_regclass('public.tournaments') IS NOT NULL THEN
    DELETE FROM public.games
    WHERE match_id IN (
      SELECT m.id
      FROM public.matches m
      JOIN public.tournaments t ON t.id = m.tournament_id
      WHERE t.user_id = v_uid
    );
  END IF;

  IF to_regclass('public.matches') IS NOT NULL
     AND to_regclass('public.tournaments') IS NOT NULL THEN
    DELETE FROM public.matches
    WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE user_id = v_uid);
  END IF;

  IF to_regclass('public.pairs') IS NOT NULL
     AND to_regclass('public.tournaments') IS NOT NULL THEN
    DELETE FROM public.pairs
    WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE user_id = v_uid);
  END IF;

  IF to_regclass('public.tournament_public_config') IS NOT NULL
     AND to_regclass('public.tournaments') IS NOT NULL THEN
    DELETE FROM public.tournament_public_config
    WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE user_id = v_uid);
  END IF;

  IF to_regclass('public.players') IS NOT NULL
     AND to_regclass('public.tournaments') IS NOT NULL THEN
    DELETE FROM public.players
    WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE user_id = v_uid);
  END IF;

  IF to_regclass('public.tournaments') IS NOT NULL THEN
    DELETE FROM public.tournaments WHERE user_id = v_uid;
  END IF;

  IF to_regclass('public.players') IS NOT NULL THEN
    DELETE FROM public.players WHERE user_id = v_uid;
  END IF;

  IF to_regclass('public.pairs') IS NOT NULL THEN
    DELETE FROM public.pairs WHERE user_id = v_uid;
  END IF;

  IF to_regclass('public.matches') IS NOT NULL THEN
    DELETE FROM public.matches WHERE user_id = v_uid;
  END IF;

  IF to_regclass('public.games') IS NOT NULL THEN
    DELETE FROM public.games WHERE user_id = v_uid;
  END IF;

  -- ── Config admin por cuenta ──
  IF to_regclass('public.organizador_game_modes') IS NOT NULL THEN
    DELETE FROM public.organizador_game_modes WHERE organizador_id = v_uid;
  END IF;

  -- ── Perfil público y auth ──
  DELETE FROM public.users WHERE id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'user_id', v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_completo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_completo(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
