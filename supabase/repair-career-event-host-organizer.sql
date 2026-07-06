-- Reparación idempotente: metadata.organizador_id + metadata.club_name
-- desde el evento padre (club anfitrión real).
--
-- NO modifica: puntos, rating, jugadores, Riviera ID, duplicados de filas.
-- SÍ actualiza: solo metadata.organizador_id y metadata.club_name cuando difieren del padre.
--
-- Ejecutar en Supabase SQL Editor:
--   1) Primero diagnose-career-event-host-organizer.sql (ver MAL)
--   2) Este script
--   3) Volver a ejecutar diagnóstico (todo OK)
--
-- Idempotente: segunda ejecución no cambia filas ya correctas.

-- ── Función resolver (compartida con diagnóstico) ─────────────────────────
CREATE OR REPLACE FUNCTION public.riviera_participacion_expected_host_org(
  p_tipo_evento text,
  p_evento_id text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_tipo_evento
    WHEN 'reta' THEN (
      SELECT t.user_id
      FROM public.tournaments t
      WHERE t.id = NULLIF(trim(p_evento_id), '')::uuid
      LIMIT 1
    )
    WHEN 'americano' THEN (
      SELECT t.user_id
      FROM public.tournaments t
      WHERE t.id = NULLIF(trim(p_evento_id), '')::uuid
      LIMIT 1
    )
    WHEN 'duelo_2v2' THEN (
      SELECT d.organizador_id
      FROM public.duelos_2v2 d
      WHERE d.id = NULLIF(trim(p_evento_id), '')::uuid
      LIMIT 1
    )
    WHEN 'torneo_express' THEN (
      SELECT t.organizador_id
      FROM public.torneo_express t
      WHERE t.id = NULLIF(trim(p_evento_id), '')::uuid
      LIMIT 1
    )
    WHEN 'liga' THEN COALESCE(
      (
        SELECT l.organizador_id
        FROM public.liga_jornadas lj
        INNER JOIN public.ligas l ON l.id = lj.liga_id
        WHERE lj.id = NULLIF(trim(p_evento_id), '')::uuid
        LIMIT 1
      ),
      (
        SELECT l.organizador_id
        FROM public.ligas l
        WHERE l.id = NULLIF(trim(p_evento_id), '')::uuid
        LIMIT 1
      )
    )
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.riviera_participacion_expected_host_org(text, text) IS
  'Club anfitrión esperado según evento padre. Usado por diagnose/repair career host.';

GRANT EXECUTE ON FUNCTION public.riviera_participacion_expected_host_org(text, text)
  TO anon, authenticated;

-- ── Vista de trabajo: participaciones con host esperado ─────────────────────
CREATE OR REPLACE VIEW public._career_participacion_host_audit AS
SELECT
  jp.id AS participacion_id,
  jp.jugador_id,
  jp.evento_id,
  jp.evento_nombre,
  jp.tipo_evento,
  jp.puntos_obtenidos,
  COALESCE(jp.metadata, '{}'::jsonb) AS metadata,
  COALESCE(jp.metadata->>'organizador_id', '') AS metadata_organizador_id,
  COALESCE(jp.metadata->>'club_name', '') AS metadata_club_name,
  public.riviera_participacion_expected_host_org(
    jp.tipo_evento::text,
    jp.evento_id::text
  ) AS expected_organizador_id,
  public.get_organizador_display_name(
    public.riviera_participacion_expected_host_org(
      jp.tipo_evento::text,
      jp.evento_id::text
    )
  ) AS expected_club_name
FROM public.jugador_participaciones jp;

COMMENT ON VIEW public._career_participacion_host_audit IS
  'Auditoría interna: metadata vs host del evento padre.';

-- ── REPARACIÓN: solo metadata, solo cuando hay padre y difiere ───────────────
DO $$
DECLARE
  v_jid uuid;
  v_fixed integer := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _career_host_repair_targets (
    participacion_id uuid PRIMARY KEY,
    jugador_id uuid NOT NULL,
    expected_organizador_id uuid NOT NULL,
    expected_club_name text
  ) ON COMMIT DROP;

  DELETE FROM _career_host_repair_targets;

  INSERT INTO _career_host_repair_targets (
    participacion_id,
    jugador_id,
    expected_organizador_id,
    expected_club_name
  )
  SELECT
    a.participacion_id,
    a.jugador_id,
    a.expected_organizador_id,
    a.expected_club_name
  FROM public._career_participacion_host_audit a
  WHERE a.expected_organizador_id IS NOT NULL
    AND (
      COALESCE(a.metadata_organizador_id, '') = ''
      OR a.metadata_organizador_id
        IS DISTINCT FROM a.expected_organizador_id::text
      OR COALESCE(a.metadata_club_name, '') = ''
      OR a.metadata_club_name IS DISTINCT FROM COALESCE(a.expected_club_name, '')
    );

  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RAISE NOTICE 'career-host-repair: % participaciones a reparar', v_fixed;

  UPDATE public.jugador_participaciones jp
  SET metadata = COALESCE(jp.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'organizador_id', t.expected_organizador_id::text,
      'club_name', COALESCE(NULLIF(trim(t.expected_club_name), ''), 'Club')
    )
  FROM _career_host_repair_targets t
  WHERE jp.id = t.participacion_id;

  FOR v_jid IN
    SELECT DISTINCT jugador_id FROM _career_host_repair_targets
  LOOP
    BEGIN
      PERFORM public.refresh_jugador_stats(v_jid);
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'refresh_jugador_stats no disponible; usar backfill desde app';
        EXIT;
      WHEN OTHERS THEN
        RAISE NOTICE 'refresh_jugador_stats %: %', v_jid, SQLERRM;
    END;
  END LOOP;
END $$;

-- ── Validación post-repair: jugadores objetivo ─────────────────────────────
WITH target_names AS (
  SELECT unnest(ARRAY[
    'Daniel N', 'Nevyl', 'Sebastian', 'TestplayerCT1', 'TestplaCT2'
  ]::text[]) AS nombre
),
target_riviera AS (
  SELECT unnest(ARRAY['RIV-00000102', 'RIV-00000103']::text[]) AS riviera_id
),
seed_profiles AS (
  SELECT DISTINCT rj.id AS jugador_id
  FROM public.riviera_jugadores rj
  WHERE rj.nombre IN (SELECT nombre FROM target_names)
  UNION
  SELECT DISTINCT pl.riviera_jugador_id
  FROM public.riviera_official_player_profile_link pl
  INNER JOIN public.riviera_official_player_identity ri
    ON ri.official_player_key = pl.official_player_key
  WHERE ri.riviera_id IN (SELECT riviera_id FROM target_riviera)
),
linked_profiles AS (
  SELECT DISTINCT pl2.riviera_jugador_id AS jugador_id
  FROM seed_profiles sp
  INNER JOIN public.riviera_official_player_profile_link pl1
    ON pl1.riviera_jugador_id = sp.jugador_id
  INNER JOIN public.riviera_official_player_profile_link pl2
    ON pl2.official_player_key = pl1.official_player_key
  UNION
  SELECT jugador_id FROM seed_profiles
),
diag AS (
  SELECT
    rj.nombre AS jugador,
    ri.riviera_id,
    jp.evento_nombre,
    jp.puntos_obtenidos,
    jp.metadata->>'organizador_id' AS meta_org,
    public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text) AS exp_org,
    CASE
      WHEN public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text) IS NULL
        THEN 'SIN_PADRE'
      WHEN COALESCE(jp.metadata->>'organizador_id', '') IS DISTINCT FROM
        public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)::text
        THEN 'MAL'
      ELSE 'OK'
    END AS estado
  FROM linked_profiles lp
  INNER JOIN public.riviera_jugadores rj ON rj.id = lp.jugador_id
  INNER JOIN public.jugador_participaciones jp ON jp.jugador_id = rj.id
  LEFT JOIN public.riviera_official_player_profile_link pl ON pl.riviera_jugador_id = rj.id
  LEFT JOIN public.riviera_official_player_identity ri ON ri.official_player_key = pl.official_player_key
)
SELECT
  jugador,
  riviera_id,
  COUNT(*) FILTER (WHERE estado = 'MAL') AS mal_restantes,
  COALESCE(SUM(puntos_obtenidos) FILTER (
    WHERE estado = 'OK'
      AND meta_org = 'e724de97-3552-4a01-a269-f621e6f1ed26'
  ), 0) AS pts_hackpadel_ok
FROM diag
GROUP BY jugador, riviera_id
ORDER BY jugador;

NOTIFY pgrst, 'reload schema';
