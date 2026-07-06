-- SEED manual: overrides de host para eventos históricos confirmados visualmente.
-- Remontada Final: 2 evento_id distintos (audit confirmó rosters sin solapamiento).
-- Ejecutar audit-remontada-final-duplicate-eventos.sql antes del INSERT.
--
-- NO ejecutar hasta:
--   1) career-event-host-manual-overrides.sql desplegado
--   2) diagnose-historical-orphan-parent-participaciones.sql desplegado
--   3) Revisar sección VERIFY y confirmar evento_id / tipo_evento / conteos
--
-- Eventos incluidos (4 overrides explícitos):
--   - Hack Padel
--   - Hack Padel 5ta Fuerza
--   - Remontada Final (52d338ec-...)
--   - Remontada Final (99a9e83c-...)
--
-- NO auto-repair. Solo INSERT en career_event_host_manual_overrides.
-- Casts: override.tipo_evento/evento_id son text; jp.tipo_evento::text, jp.evento_id::text.
-- Ejecutar manualmente en SQL Editor (master admin / service role).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) VERIFY — solo lectura (ejecutar primero)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  jp.tipo_evento,
  jp.evento_id,
  jp.evento_nombre,
  public._riviera_normalize_evento_nombre(jp.evento_nombre) AS event_name_key,
  COUNT(*) AS participaciones,
  COALESCE(SUM(jp.puntos_obtenidos), 0) AS puntos,
  public._riviera_participacion_parent_row_exists(
    jp.tipo_evento::text,
    jp.evento_id::text
  ) AS parent_row_found,
  EXISTS (
    SELECT 1
    FROM public.career_event_host_manual_overrides o
    WHERE o.tipo_evento = jp.tipo_evento::text
      AND o.evento_id = trim(jp.evento_id::text)
  ) AS override_already_exists
FROM public.jugador_participaciones jp
WHERE public._riviera_historical_event_name_whitelist_hit(jp.evento_nombre)
  AND COALESCE(jp.puntos_obtenidos, 0) > 0
GROUP BY jp.tipo_evento, jp.evento_id, jp.evento_nombre
ORDER BY jp.evento_nombre;

-- Debe incluir los 4 evento_id confirmados (Hack Padel, 5ta Fuerza, 2× Remontada Final).
-- parent_row_found debe ser false (evento padre eliminado).
-- Anotar organizador_id aprobado antes del INSERT (sección 2).

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) INSERT — ejecutar manualmente tras confirmar VERIFY
-- ═══════════════════════════════════════════════════════════════════════════
-- Reemplazar <ORGANIZADOR_ID_APROBADO> con el UUID del club host confirmado.
-- Reemplazar <CLUB_NAME> con get_organizador_display_name(<ORG>) o nombre exacto en app.
-- approved_by: auth.uid() si sesión autenticada; NULL si SQL Editor service role.

/*
INSERT INTO public.career_event_host_manual_overrides (
  tipo_evento,
  evento_id,
  evento_nombre,
  organizador_id,
  club_name,
  approved_by,
  reason
)
SELECT DISTINCT ON (jp.tipo_evento, jp.evento_id)
  jp.tipo_evento::text,
  trim(jp.evento_id::text),
  jp.evento_nombre,
  '<ORGANIZADOR_ID_APROBADO>'::uuid,
  COALESCE(
    public.get_organizador_display_name('<ORGANIZADOR_ID_APROBADO>'::uuid),
    '<CLUB_NAME>'
  ),
  auth.uid(),
  'Confirmado visualmente en app — evento padre eliminado, host aprobado manualmente (seed histórico)'
FROM public.jugador_participaciones jp
WHERE public._riviera_historical_event_name_whitelist_hit(jp.evento_nombre)
  AND COALESCE(jp.puntos_obtenidos, 0) > 0
  AND NOT public._riviera_participacion_parent_row_exists(
    jp.tipo_evento::text,
    jp.evento_id::text
  )
ON CONFLICT (tipo_evento, evento_id) DO NOTHING
RETURNING tipo_evento, evento_id, evento_nombre, organizador_id, club_name;
*/

-- ── INSERT explícito: 4 overrides (descomentar y ejecutar tras VERIFY) ──
--   Hack Padel              reta       6f85c8d1-cd90-42cc-b551-5db92b35ad7f
--   Remontada Final (A)     reta       52d338ec-77a7-4b40-9714-8728db183974
--   Remontada Final (B)     reta       99a9e83c-2fd5-4701-8602-7093235cbe8e
--   Hack Padel 5ta Fuerza   duelo_2v2  8b61a73c-53b8-4040-a9d3-bf06e41ddc9b
-- HackPadel organizador (confirmado en prod): e724de97-3552-4a01-a269-f621e6f1ed26

/*
INSERT INTO public.career_event_host_manual_overrides (
  tipo_evento, evento_id, evento_nombre, organizador_id, club_name, approved_by, reason
) VALUES
  (
    'reta',
    '6f85c8d1-cd90-42cc-b551-5db92b35ad7f',
    'Hack Padel',
    'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid,
    COALESCE(public.get_organizador_display_name('e724de97-3552-4a01-a269-f621e6f1ed26'::uuid), 'Hackpadel'),
    auth.uid(),
    'Confirmado visualmente — Hack Padel, padre eliminado'
  ),
  (
    'reta',
    '52d338ec-77a7-4b40-9714-8728db183974',
    'Remontada Final',
    'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid,
    COALESCE(public.get_organizador_display_name('e724de97-3552-4a01-a269-f621e6f1ed26'::uuid), 'Hackpadel'),
    auth.uid(),
    'Confirmado visualmente — Remontada Final (A), padre eliminado, roster distinto de 99a9e83c'
  ),
  (
    'reta',
    '99a9e83c-2fd5-4701-8602-7093235cbe8e',
    'Remontada Final',
    'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid,
    COALESCE(public.get_organizador_display_name('e724de97-3552-4a01-a269-f621e6f1ed26'::uuid), 'Hackpadel'),
    auth.uid(),
    'Confirmado visualmente — Remontada Final (B), padre eliminado, roster distinto de 52d338ec'
  ),
  (
    'duelo_2v2',
    '8b61a73c-53b8-4040-a9d3-bf06e41ddc9b',
    'Hack Padel 5ta Fuerza',
    'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid,
    COALESCE(public.get_organizador_display_name('e724de97-3552-4a01-a269-f621e6f1ed26'::uuid), 'Hackpadel'),
    auth.uid(),
    'Confirmado visualmente — Hack Padel 5ta Fuerza, duelo padre eliminado'
  )
ON CONFLICT (tipo_evento, evento_id) DO NOTHING
RETURNING tipo_evento, evento_id, evento_nombre, organizador_id, club_name;
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) VALIDATE — tras INSERT, re-ejecutar diagnose o esta query
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  evento_nombre,
  tipo_evento,
  evento_id,
  suggested_action,
  expected_host_source,
  has_manual_override,
  manual_override_organizador_id,
  manual_override_club_name,
  COUNT(*) AS participaciones
FROM public._historical_orphan_parent_participaciones
WHERE has_manual_override
GROUP BY
  evento_nombre,
  tipo_evento,
  evento_id,
  suggested_action,
  expected_host_source,
  has_manual_override,
  manual_override_organizador_id,
  manual_override_club_name
ORDER BY evento_nombre;

-- Esperado: suggested_action = READY_MANUAL_OVERRIDE para los 4 eventos
-- (hasta que exista repair de metadata → OK_OVERRIDE_APPLIED).

SELECT COUNT(*) AS ready_manual_override_rows
FROM public._historical_orphan_parent_participaciones
WHERE suggested_action = 'READY_MANUAL_OVERRIDE';
