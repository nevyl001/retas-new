-- Borrado completo de una cuenta/organizador desde el panel admin maestro.
-- Requiere: supabase/admin-master-controls.sql (is_master_admin)
-- Ejecutar en Supabase → SQL Editor (CREATE OR REPLACE).
--
-- Fix 2026-08-02: Torneo Express hijos usan torneo_id (no torneo_express_id).
-- La función vieja fallaba con: column "torneo_express_id" does not exist.

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

  -- ── Notificaciones (Torneo Express) — columna torneo_express_id ──
  IF to_regclass('public.notificaciones_log') IS NOT NULL
     AND to_regclass('public.torneo_express') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'notificaciones_log'
         AND column_name = 'torneo_express_id'
     ) THEN
    DELETE FROM public.notificaciones_log
    WHERE torneo_express_id IN (
      SELECT id FROM public.torneo_express WHERE organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.notificaciones_eventos_queue') IS NOT NULL
     AND to_regclass('public.torneo_express') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'notificaciones_eventos_queue'
         AND column_name = 'torneo_express_id'
     ) THEN
    DELETE FROM public.notificaciones_eventos_queue
    WHERE torneo_express_id IN (
      SELECT id FROM public.torneo_express WHERE organizador_id = v_uid
    );
  END IF;

  -- ── Torneo Express (hijos → padre). Schema actual: torneo_id / grupo_id ──
  IF to_regclass('public.torneo_express_partidos') IS NOT NULL
     AND to_regclass('public.torneo_express_grupos') IS NOT NULL THEN
    DELETE FROM public.torneo_express_partidos
    WHERE grupo_id IN (
      SELECT g.id
      FROM public.torneo_express_grupos g
      JOIN public.torneo_express te ON te.id = g.torneo_id
      WHERE te.organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.torneo_express_grupo_parejas') IS NOT NULL
     AND to_regclass('public.torneo_express_grupos') IS NOT NULL THEN
    DELETE FROM public.torneo_express_grupo_parejas
    WHERE grupo_id IN (
      SELECT g.id
      FROM public.torneo_express_grupos g
      JOIN public.torneo_express te ON te.id = g.torneo_id
      WHERE te.organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.torneo_express_eliminatoria_partidos') IS NOT NULL THEN
    DELETE FROM public.torneo_express_eliminatoria_partidos
    WHERE torneo_id IN (
      SELECT id FROM public.torneo_express WHERE organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.torneo_express_grupos') IS NOT NULL THEN
    DELETE FROM public.torneo_express_grupos
    WHERE torneo_id IN (
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

  IF to_regclass('public.liga_equipos') IS NOT NULL THEN
    DELETE FROM public.liga_equipos
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

  -- ── Reta abierta / convocatoria ──
  IF to_regclass('public.reta_abierta_inscripciones') IS NOT NULL
     AND to_regclass('public.reta_abierta') IS NOT NULL THEN
    DELETE FROM public.reta_abierta_inscripciones
    WHERE convocatoria_id IN (
      SELECT id FROM public.reta_abierta WHERE organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.reta_abierta') IS NOT NULL THEN
    DELETE FROM public.reta_abierta WHERE organizador_id = v_uid;
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

  -- ── ROMC / identidad oficial (FK RESTRICT hacia riviera_jugadores) ──
  IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
    DELETE FROM public.riviera_official_points_ledger
    WHERE source_local_jugador_id IN (
      SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
    )
       OR source_organizer_id = v_uid
       OR official_player_key IN (
            SELECT i.official_player_key
            FROM public.riviera_official_player_identity i
            WHERE i.canonical_riviera_jugador_id IN (
              SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
            )
          );
  END IF;

  IF to_regclass('public.jugador_participacion_exclusiones') IS NOT NULL THEN
    DELETE FROM public.jugador_participacion_exclusiones
    WHERE scope_jugador_id IN (
      SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
    )
       OR official_player_key IN (
            SELECT i.official_player_key
            FROM public.riviera_official_player_identity i
            WHERE i.canonical_riviera_jugador_id IN (
              SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
            )
          );
  END IF;

  IF to_regclass('public.riviera_player_sharing_request') IS NOT NULL THEN
    DELETE FROM public.riviera_player_sharing_request
    WHERE riviera_jugador_id IN (
      SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
    )
       OR registration_jugador_id IN (
            SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
          );
  END IF;

  -- Reasignar o borrar identidades cuyo canonical pertenece a esta cuenta.
  -- (sin UPDATE…FROM LATERAL: Postgres marca "invalid reference to FROM-clause entry for table i")
  IF to_regclass('public.riviera_official_player_identity') IS NOT NULL THEN
    IF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
      UPDATE public.riviera_official_player_identity i
      SET canonical_riviera_jugador_id = (
        SELECT l.riviera_jugador_id
        FROM public.riviera_official_player_profile_link l
        WHERE l.official_player_key = i.official_player_key
          AND l.riviera_jugador_id NOT IN (
            SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
          )
        ORDER BY l.created_at
        LIMIT 1
      )
      WHERE i.canonical_riviera_jugador_id IN (
        SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
      )
        AND EXISTS (
          SELECT 1
          FROM public.riviera_official_player_profile_link l
          WHERE l.official_player_key = i.official_player_key
            AND l.riviera_jugador_id NOT IN (
              SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
            )
        );

      DELETE FROM public.riviera_official_player_profile_link
      WHERE riviera_jugador_id IN (
        SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
      );
    END IF;

    IF to_regclass('public.riviera_official_player_totals') IS NOT NULL THEN
      DELETE FROM public.riviera_official_player_totals
      WHERE official_player_key IN (
        SELECT i.official_player_key
        FROM public.riviera_official_player_identity i
        WHERE i.canonical_riviera_jugador_id IN (
          SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
        )
      );
    END IF;

    IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
      DELETE FROM public.riviera_official_points_ledger
      WHERE official_player_key IN (
        SELECT i.official_player_key
        FROM public.riviera_official_player_identity i
        WHERE i.canonical_riviera_jugador_id IN (
          SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
        )
      );
    END IF;

    DELETE FROM public.riviera_official_player_identity
    WHERE canonical_riviera_jugador_id IN (
      SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
    );
  ELSIF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
    DELETE FROM public.riviera_official_player_profile_link
    WHERE riviera_jugador_id IN (
      SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
    );
  END IF;

  IF to_regclass('public.organizer_player_access') IS NOT NULL THEN
    DELETE FROM public.organizer_player_access
    WHERE grantee_organizer_id = v_uid
       OR owner_organizador_id = v_uid
       OR jugador_id IN (
            SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
          )
       OR local_jugador_id IN (
            SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
          );
  END IF;

  -- Coaching ledger / vínculos con RESTRICT hacia riviera_jugadores
  IF to_regclass('public.coach_class_ledger') IS NOT NULL THEN
    DELETE FROM public.coach_class_ledger
    WHERE organizador_id = v_uid
       OR jugador_id IN (
            SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
          )
       OR (
            to_regclass('public.riviera_coaches') IS NOT NULL
            AND coach_id IN (
              SELECT id FROM public.riviera_coaches WHERE auth_user_id = v_uid
            )
          );
  END IF;

  IF to_regclass('public.coach_sessions') IS NOT NULL THEN
    DELETE FROM public.coach_sessions
    WHERE organizador_id = v_uid
       OR (
            to_regclass('public.riviera_coaches') IS NOT NULL
            AND coach_id IN (
              SELECT id FROM public.riviera_coaches WHERE auth_user_id = v_uid
            )
          );
  END IF;

  IF to_regclass('public.coach_player_relationships') IS NOT NULL THEN
    DELETE FROM public.coach_player_relationships
    WHERE organizador_id = v_uid
       OR jugador_id IN (
            SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
          )
       OR (
            to_regclass('public.riviera_coaches') IS NOT NULL
            AND coach_id IN (
              SELECT id FROM public.riviera_coaches WHERE auth_user_id = v_uid
            )
          );
  END IF;

  IF to_regclass('public.coach_student_invitations') IS NOT NULL THEN
    DELETE FROM public.coach_student_invitations
    WHERE organizador_id = v_uid
       OR jugador_id IN (
            SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
          );
  END IF;

  IF to_regclass('public.coach_student_account_links') IS NOT NULL THEN
    DELETE FROM public.coach_student_account_links
    WHERE organizador_id = v_uid
       OR jugador_id IN (
            SELECT id FROM public.riviera_jugadores WHERE organizador_id = v_uid
          );
  END IF;

  IF to_regclass('public.coach_club_memberships') IS NOT NULL THEN
    DELETE FROM public.coach_club_memberships
    WHERE organizador_id = v_uid
       OR (
            to_regclass('public.riviera_coaches') IS NOT NULL
            AND coach_id IN (
              SELECT id FROM public.riviera_coaches WHERE auth_user_id = v_uid
            )
          );
  END IF;

  -- La bitácora de membresía apuntaba al coach con ON DELETE RESTRICT y
  -- abortaba el borrado aunque la cuenta no tuviera clases ni alumnos.
  IF to_regclass('public.coach_club_membership_audit_log') IS NOT NULL THEN
    DELETE FROM public.coach_club_membership_audit_log
    WHERE to_regclass('public.riviera_coaches') IS NOT NULL
      AND coach_id IN (
        SELECT id FROM public.riviera_coaches WHERE auth_user_id = v_uid
      );
  END IF;

  IF to_regclass('public.riviera_coaches') IS NOT NULL THEN
    DELETE FROM public.riviera_coaches
    WHERE auth_user_id = v_uid;
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
     AND to_regclass('public.tournaments') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'players'
         AND column_name = 'tournament_id'
     ) THEN
    DELETE FROM public.players
    WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE user_id = v_uid);
  END IF;

  IF to_regclass('public.tournaments') IS NOT NULL THEN
    DELETE FROM public.tournaments WHERE user_id = v_uid;
  END IF;

  IF to_regclass('public.players') IS NOT NULL THEN
    DELETE FROM public.players WHERE user_id = v_uid;
  END IF;

  IF to_regclass('public.pairs') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'pairs'
         AND column_name = 'user_id'
     ) THEN
    DELETE FROM public.pairs WHERE user_id = v_uid;
  END IF;

  IF to_regclass('public.matches') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'matches'
         AND column_name = 'user_id'
     ) THEN
    DELETE FROM public.matches WHERE user_id = v_uid;
  END IF;

  IF to_regclass('public.games') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'games'
         AND column_name = 'user_id'
     ) THEN
    DELETE FROM public.games WHERE user_id = v_uid;
  END IF;

  -- ── Config admin por cuenta ──
  IF to_regclass('public.organizador_game_modes') IS NOT NULL THEN
    DELETE FROM public.organizador_game_modes WHERE organizador_id = v_uid;
  END IF;

  IF to_regclass('public.organizador_account_settings') IS NOT NULL THEN
    DELETE FROM public.organizador_account_settings WHERE organizador_id = v_uid;
  END IF;

  -- ── Perfil público y auth ──
  DELETE FROM public.users WHERE id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'user_id', v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_completo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user_completo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_completo(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
