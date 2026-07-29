-- =============================================================================
-- VERIFICACIÓN POST-FIX -- SEC-001 (RLS abierto en Liga/Torneo Express/Duelo2v2/
-- tournament_public_config/career_event_host_manual_overrides)
-- =============================================================================

-- 1. Cero políticas con bypass abierto fuera de galeria_eventos (intencional).
SELECT tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename <> 'galeria_eventos'
  AND (
    btrim(coalesce(qual, '')) = 'true'
    OR btrim(coalesce(with_check, '')) = 'true'
    OR qual ILIKE '%OR true%'
    OR with_check ILIKE '%OR true%'
    OR (qual ILIKE '%auth.role()%authenticated%' AND cmd IN ('INSERT','UPDATE','DELETE','ALL'))
  );
-- esperado: 0 filas

-- 2. Columnas PII de liga_jugadores ya no SELECT-ables por anon (sí pueden
--    quedar otros privilegios como INSERT/UPDATE/REFERENCES, irrelevantes
--    porque RLS bloquea esas escrituras para anon vía organizador_id=auth.uid()).
SELECT grantee, column_name, privilege_type
FROM information_schema.role_column_grants
WHERE table_schema='public' AND table_name='liga_jugadores'
  AND grantee='anon' AND column_name IN ('email','telefono') AND privilege_type='SELECT';
-- esperado: 0 filas

-- 3. Confirmar que las políticas correctas preexistentes siguen intactas
--    (spot-check, no deben haber cambiado).
SELECT tablename, policyname, cmd, roles::text
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('tournament_public_config','duelos_2v2','ligas','torneo_express')
ORDER BY tablename, policyname;

-- 4. Conteos de fila sin cambios (ninguna operación de esta migración toca datos).
SELECT 'ligas' t, count(*) n FROM ligas
UNION ALL SELECT 'liga_jugadores', count(*) FROM liga_jugadores
UNION ALL SELECT 'torneo_express', count(*) FROM torneo_express
UNION ALL SELECT 'duelos_2v2', count(*) FROM duelos_2v2
UNION ALL SELECT 'tournament_public_config', count(*) FROM tournament_public_config;

-- =============================================================================
-- PRUEBAS MANUALES CON ANON KEY REAL (ejecutar aparte, vía REST, no SQL):
--   [ ] GET .../rest/v1/liga_jugadores?select=email,telefono  -> error/columna vacía
--   [ ] GET .../rest/v1/ligas  (sin sesión) -> solo ligas con is_liga_public=true
--   [ ] GET .../rest/v1/duelos_2v2  (sin sesión) -> solo es_publico=true
--   [ ] GET .../rest/v1/torneo_express  (sin sesión) -> solo públicos
--   [ ] POST/PATCH .../rest/v1/tournament_public_config (con sesión de OTRO
--       organizador) -> rechazado
--   [ ] Vista pública de una liga pública real, sesión anónima -> sigue
--       mostrando standings/nombres correctamente
--   [ ] Vista pública de una liga pública real, sesión de OTRO organizador
--       autenticado -> sigue mostrando standings/nombres correctamente
-- Re-correr: supabase db advisors --linked --type security (comparar contra
-- el snapshot de 253 alertas del 2026-07-28 -- no deben aparecer alertas
-- nuevas, y ojalá bajen las de exposición si el Advisor las detectaba).
-- =============================================================================
