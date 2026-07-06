-- Enlace MANUAL para casos REVIEW históricos (Daniel N, Sebastian).
--
-- PREREQUISITOS:
--   1) career-profile-link-integrity.sql desplegado
--   2) Confirmación visual en app/SQL Editor de que el huérfano es la misma persona
--   3) diagnose-orphan-career-profiles.sql muestra confidence = REVIEW para estos casos
--
-- NO ejecutar el bloque INSERT sin revisar el PREVIEW.
-- Este script NO auto-linkea: requiere descomentar el INSERT tras validar.

-- ── PASO 1: PREVIEW (solo lectura) ──────────────────────────────────────────
SELECT
  a.orphan_jugador_id,
  a.orphan_nombre,
  a.orphan_club_name,
  a.total_puntos,
  a.host_clubs,
  a.candidate_official_jugador_id,
  a.candidate_nombre,
  a.candidate_riviera_id,
  a.candidate_official_player_key,
  a.confidence,
  a.reason,
  a.in_career_rpc,
  EXISTS (
    SELECT 1
    FROM public.riviera_official_player_profile_link pl
    WHERE pl.riviera_jugador_id = a.orphan_jugador_id
  ) AS already_linked
FROM public._riviera_orphan_profile_audit() a
WHERE a.orphan_nombre IN ('Daniel N', 'Sebastian')
ORDER BY a.orphan_nombre;

-- Verificar candidato oficial (perfil ya enlazado con Riviera ID)
SELECT
  rj.id AS official_jugador_id,
  rj.nombre,
  rj.organizador_id,
  public.get_organizador_display_name(rj.organizador_id) AS club,
  i.riviera_id,
  i.official_player_key
FROM public.riviera_jugadores rj
INNER JOIN public.riviera_official_player_profile_link pl
  ON pl.riviera_jugador_id = rj.id
INNER JOIN public.riviera_official_player_identity i
  ON i.official_player_key = pl.official_player_key
WHERE rj.nombre IN ('Daniel N', 'Sebastian')
  AND rj.estado = 'activo'
  AND i.riviera_id IN ('RIV-00000009', 'RIV-00000024')
ORDER BY rj.nombre, rj.organizador_id;

-- ── PASO 2: INSERT (descomentar tras confirmar PREVIEW) ─────────────────────
--
-- Validaciones antes de insertar:
--   - orphan_jugador_id = perfil HackPadel SIN link (huérfano con puntos)
--   - candidate_official_player_key = clave del RIV-00000009 / RIV-00000024
--   - confidence sigue siendo REVIEW (esperado; enlace manual explícito)
--   - no existe fila previa en riviera_official_player_profile_link para orphan_jugador_id
--
/*
BEGIN;

-- Daniel N → RIV-00000009
INSERT INTO public.riviera_official_player_profile_link (
  official_player_key,
  riviera_jugador_id,
  organizer_id,
  link_source,
  created_by
)
SELECT
  a.candidate_official_player_key,
  a.orphan_jugador_id,
  a.orphan_organizador_id,
  'manual_admin',
  auth.uid()
FROM public._riviera_orphan_profile_audit() a
WHERE a.orphan_nombre = 'Daniel N'
  AND a.candidate_riviera_id = 'RIV-00000009'
  AND a.confidence = 'REVIEW'
  AND a.candidate_official_player_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.riviera_official_player_profile_link pl
    WHERE pl.riviera_jugador_id = a.orphan_jugador_id
  );

-- Sebastian → RIV-00000024
INSERT INTO public.riviera_official_player_profile_link (
  official_player_key,
  riviera_jugador_id,
  organizer_id,
  link_source,
  created_by
)
SELECT
  a.candidate_official_player_key,
  a.orphan_jugador_id,
  a.orphan_organizador_id,
  'manual_admin',
  auth.uid()
FROM public._riviera_orphan_profile_audit() a
WHERE a.orphan_nombre = 'Sebastian'
  AND a.candidate_riviera_id = 'RIV-00000024'
  AND a.confidence = 'REVIEW'
  AND a.candidate_official_player_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.riviera_official_player_profile_link pl
    WHERE pl.riviera_jugador_id = a.orphan_jugador_id
  );

-- Refresh stats de perfiles recién enlazados
DO $$
DECLARE
  v_jid uuid;
BEGIN
  FOR v_jid IN
    SELECT pl.riviera_jugador_id
    FROM public.riviera_official_player_profile_link pl
    INNER JOIN public.riviera_jugadores rj ON rj.id = pl.riviera_jugador_id
    WHERE rj.nombre IN ('Daniel N', 'Sebastian')
      AND pl.link_source = 'manual_admin'
      AND pl.created_at > now() - interval '2 minutes'
  LOOP
    BEGIN
      PERFORM public.refresh_jugador_stats(v_jid);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'refresh_jugador_stats %: %', v_jid, SQLERRM;
    END;
  END LOOP;
END $$;

COMMIT;
*/

-- ── PASO 3: Verificación post-link (ejecutar tras INSERT) ───────────────────
SELECT
  orphan_nombre,
  confidence,
  in_career_rpc,
  total_puntos
FROM public._riviera_orphan_profile_audit()
WHERE orphan_nombre IN ('Daniel N', 'Sebastian');
