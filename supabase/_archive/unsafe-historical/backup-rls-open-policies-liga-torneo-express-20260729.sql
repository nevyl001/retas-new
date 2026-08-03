-- =============================================================================
-- BACKUP -- definiciones EXACTAS de las políticas RLS heredadas/permisivas
-- (qual/with_check = true o equivalente de bypass) capturadas en vivo el
-- 2026-07-29, antes de aplicar fix-rls-open-policies-liga-torneo-express-20260729.sql.
--
-- Vulnerabilidad (hallazgo SEC-001, auditoría 2026-07-29 -- mismo patrón que
-- hotfix-drop-legacy-permissive-policies.sql corrigió el 2026-07-26 para
-- matches/tournaments/users/players, pero nunca se extendió a estas tablas):
-- En Postgres, varias políticas PERMISSIVE del mismo comando se combinan con
-- OR. Cada tabla de abajo tenía, junto a sus políticas correctas de
-- aislamiento (is_liga_public/is_torneo_express_public/is_duelo_public/
-- is_tournament_publicly_readable/organizador_id=auth.uid()), una política
-- adicional con qual/check literalmente `true` (o `... OR true`, o
-- `auth.role()='authenticated'` sin scoping) para el rol `public`/`anon`/
-- `authenticated`. Esa política ganaba el OR y anulaba la restricción real.
--
-- Uso de este archivo: solo referencia. El rollback ejecutable que reconstruye
-- estas políticas tal cual está en rollback-rls-open-policies-liga-torneo-
-- express-20260729.sql.
-- =============================================================================

-- ── career_event_host_manual_overrides.career_event_host_manual_overrides_select (cmd=SELECT, roles={authenticated}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── duelos_2v2.duelos_2v2_select_anon (cmd=SELECT, roles={anon}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── duelos_2v2.duelos_2v2_select_auth (cmd=SELECT, roles={authenticated}) ──
-- USING: (organizador_id = auth.uid()) OR true
-- WITH CHECK: (ninguno)

-- ── liga_equipos.leq_select_anon (cmd=SELECT, roles={anon}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── liga_inscripciones.liga_inscripciones_select (cmd=SELECT, roles={public}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── liga_jornada_parejas.liga_jornada_parejas_select (cmd=SELECT, roles={public}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── liga_jornadas.liga_jornadas_select (cmd=SELECT, roles={public}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── liga_jugadores.liga_jugadores_select (cmd=SELECT, roles={public}) ──
-- USING: true
-- WITH CHECK: (ninguno)
-- NOTA: liga_jugadores tiene columnas email/telefono (PII). anon y
-- authenticated tenían GRANT SELECT sobre TODAS las columnas (backup exacto
-- de grants más abajo).

-- ── liga_partidos.liga_partidos_select (cmd=SELECT, roles={public}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── ligas.ligas_select (cmd=SELECT, roles={public}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── torneo_express.lectura_publica_torneo_express (cmd=SELECT, roles={public}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── torneo_express.te_select_anon (cmd=SELECT, roles={anon}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── torneo_express_eliminatoria_partidos.lectura_publica_eliminatoria (cmd=SELECT, roles={public}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── torneo_express_eliminatoria_partidos.te_elim_select_anon (cmd=SELECT, roles={anon}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── torneo_express_grupo_parejas.lectura_publica_te_grupo_parejas (cmd=SELECT, roles={public}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── torneo_express_grupo_parejas.te_gp_select_anon (cmd=SELECT, roles={anon}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── torneo_express_grupos.lectura_publica_te_grupos (cmd=SELECT, roles={public}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── torneo_express_grupos.te_grupos_select_anon (cmd=SELECT, roles={anon}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── torneo_express_partidos.lectura_publica_te_partidos (cmd=SELECT, roles={public}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── torneo_express_partidos.te_partidos_select_anon (cmd=SELECT, roles={anon}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── tournament_public_config."Allow public read" (cmd=SELECT, roles={public}) ──
-- USING: true
-- WITH CHECK: (ninguno)

-- ── tournament_public_config."Allow authenticated upsert" (cmd=ALL, roles={public}) ──
-- USING: auth.role() = 'authenticated'
-- WITH CHECK: auth.role() = 'authenticated'

-- ── Grants de columna de liga_jugadores antes del fix (SELECT/INSERT/UPDATE/REFERENCES,
--    las 9 columnas, para anon Y authenticated -- incluye email y telefono) ──
-- anon:          SELECT,INSERT,UPDATE,REFERENCES sobre (created_at,email,estado,genero,id,nivel,nombre,organizador_id,telefono)
-- authenticated: SELECT,INSERT,UPDATE,REFERENCES sobre (created_at,email,estado,genero,id,nivel,nombre,organizador_id,telefono)
