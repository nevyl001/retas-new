-- ═══════════════════════════════════════════════════════════════════════════
-- AUDITORÍA READ-ONLY: paridad carrera global (admin vs público vs real)
--
-- Compara para TODOS los Riviera ID con múltiples perfiles:
--   • participaciones globales esperadas (official_player_key / career RPC)
--   • participaciones visibles con motor admin legacy (scoped por org + jugador_id)
--   • participaciones visibles con motor global (career merge)
--
-- Ejecutar en Supabase SQL Editor. Solo SELECT. Sin UPDATE.
-- ═══════════════════════════════════════════════════════════════════════════

WITH identity_profiles AS (
  SELECT
    i.riviera_id::text AS riviera_id,
    i.official_player_key::text AS official_player_key,
    COALESCE(
      i.canonical_riviera_jugador_id,
      (
        SELECT pl.riviera_jugador_id
        FROM public.riviera_official_player_profile_link pl
        WHERE pl.official_player_key = i.official_player_key
        ORDER BY pl.created_at NULLS LAST
        LIMIT 1
      )
    ) AS anchor_jugador_id,
    rj.id AS jugador_id,
    rj.nombre,
    rj.organizador_id,
    COALESCE(
      public.get_organizador_display_name(rj.organizador_id),
      rj.organizador_id::text
    ) AS club
  FROM public.riviera_official_player_identity i
  JOIN public.riviera_official_player_profile_link pl
    ON pl.official_player_key = i.official_player_key
  JOIN public.riviera_jugadores rj ON rj.id = pl.riviera_jugador_id
  WHERE rj.estado = 'activo'
),

multi_profile AS (
  SELECT riviera_id, official_player_key, MIN(anchor_jugador_id) AS anchor_jugador_id
  FROM identity_profiles
  GROUP BY riviera_id, official_player_key
  HAVING COUNT(DISTINCT jugador_id) > 1
     OR COUNT(DISTINCT organizador_id) > 1
),

global_participaciones AS (
  SELECT
    mp.riviera_id,
    mp.official_player_key,
    COUNT(DISTINCT jp.id) AS participaciones_globales_reales
  FROM multi_profile mp
  CROSS JOIN LATERAL (
    SELECT g.jugador_id
    FROM public.get_public_career_jugador_ids(mp.anchor_jugador_id) AS g(jugador_id)
  ) career_ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = career_ids.jugador_id
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  WHERE rj.estado = 'activo'
    AND NOT public.is_jugador_participacion_excluded(
      jp.jugador_id, jp.tipo_evento::text, jp.evento_id
    )
  GROUP BY mp.riviera_id, mp.official_player_key
),

-- Simula motor admin legacy: solo participaciones del perfil local filtradas por org
admin_legacy_per_profile AS (
  SELECT
    ip.riviera_id,
    ip.jugador_id,
    ip.club,
    COUNT(jp.id) AS participaciones_admin_legacy
  FROM identity_profiles ip
  JOIN multi_profile mp ON mp.riviera_id = ip.riviera_id
  LEFT JOIN public.jugador_participaciones jp
    ON jp.jugador_id = ip.jugador_id
   AND NOT public.is_jugador_participacion_excluded(
     jp.jugador_id, jp.tipo_evento::text, jp.evento_id
   )
   AND COALESCE(jp.metadata->>'organizador_id', ip.organizador_id::text)
     = ip.organizador_id::text
  GROUP BY ip.riviera_id, ip.jugador_id, ip.club
),

admin_legacy_worst AS (
  SELECT
    riviera_id,
    MAX(participaciones_admin_legacy) AS max_admin_legacy,
    MIN(participaciones_admin_legacy) AS min_admin_legacy
  FROM admin_legacy_per_profile
  GROUP BY riviera_id
),

linked_summary AS (
  SELECT
    ip.riviera_id,
    string_agg(DISTINCT ip.jugador_id::text, ', ' ORDER BY ip.jugador_id::text) AS perfiles_vinculados,
    string_agg(DISTINCT ip.club, ' | ' ORDER BY ip.club) AS clubes_vinculados,
    MAX(ip.nombre) AS nombre
  FROM identity_profiles ip
  JOIN multi_profile mp ON mp.riviera_id = ip.riviera_id
  GROUP BY ip.riviera_id
)

SELECT
  ls.riviera_id,
  mp.official_player_key,
  ls.nombre,
  ls.perfiles_vinculados,
  ls.clubes_vinculados,
  gp.participaciones_globales_reales AS total_participaciones_reales,
  alw.max_admin_legacy AS max_mostrado_admin_legacy,
  alw.min_admin_legacy AS min_mostrado_admin_legacy,
  gp.participaciones_globales_reales - alw.max_admin_legacy AS faltantes_admin_legacy,
  CASE
    WHEN gp.participaciones_globales_reales > alw.max_admin_legacy
      THEN 'CARRERA_PARCIAL_EN_ADMIN'
    WHEN alw.max_admin_legacy <> alw.min_admin_legacy
      THEN 'HISTORIAL_CAMBIA_POR_CLUB'
    ELSE 'OK'
  END AS alerta
FROM linked_summary ls
JOIN multi_profile mp ON mp.riviera_id = ls.riviera_id
JOIN global_participaciones gp ON gp.riviera_id = ls.riviera_id
JOIN admin_legacy_worst alw ON alw.riviera_id = ls.riviera_id
ORDER BY faltantes_admin_legacy DESC, ls.riviera_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- Casos obligatorios de validación manual
-- ═══════════════════════════════════════════════════════════════════════════
-- WHERE ls.riviera_id IN (
--   'RIV-00000071', -- Victor L
--   'RIV-00000003', -- Alejandro R
--   'RIV-00000031', -- Edgardo T
--   'RIV-00000011', -- Nevyl
--   'RIV-00000009', -- Daniel N
--   'RIV-00000024', -- Sebastian
--   'RIV-00000019', -- Irving
--   'RIV-00000041'  -- David R
-- );
