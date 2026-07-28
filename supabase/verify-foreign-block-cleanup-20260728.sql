-- =============================================================================
-- VERIFICACIÓN POST-LIMPIEZA — correr después de cleanup-foreign-block-20260728.sql
-- Todo debe devolver lo esperado indicado en cada comentario. Solo lectura.
-- =============================================================================

-- 1. Los 8 objetos ajenos ya no existen; boxes y profiles SIGUEN existiendo.
SELECT
  to_regclass('public.membresias')       IS NULL AS membresias_borrada,
  to_regclass('public.planes')           IS NULL AS planes_borrada,
  to_regclass('public.clases')           IS NULL AS clases_borrada,
  to_regclass('public.reservas')         IS NULL AS reservas_borrada,
  to_regclass('public.atleta_pr_marcas') IS NULL AS atleta_pr_marcas_borrada,
  to_regclass('public.atleta_skills')    IS NULL AS atleta_skills_borrada,
  to_regclass('public.atleta_skill_historial') IS NULL AS atleta_skill_historial_borrada,
  to_regclass('public.alertas_membresia')  IS NULL AS alertas_membresia_borrada,
  to_regclass('public.membresia_actual')   IS NULL AS membresia_actual_borrada,
  to_regclass('public.reservas_con_cupo')  IS NULL AS reservas_con_cupo_borrada,
  to_regclass('public.profiles') IS NOT NULL AS profiles_intacta,   -- debe ser TRUE
  to_regclass('public.boxes')    IS NOT NULL AS boxes_intacta;      -- debe ser TRUE

-- 2. profiles conserva exactamente sus 2 filas originales, sin cambios.
SELECT count(*) AS profiles_row_count FROM profiles;  -- esperado: 2
SELECT id, user_id, rol, created_at FROM profiles ORDER BY created_at;  -- comparar contra la auditoría

-- 3. El trigger en auth.users ya no existe (esto es lo que evita que el
--    próximo signup real de Riviera Open falle o vuelva a crear basura).
SELECT count(*) AS triggers_restantes_auth_users
FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal
  AND tgname = 'on_auth_user_created';  -- esperado: 0

-- 4. Riviera Open sigue funcionando — ranking oficial, la vista que SÍ se
--    conserva, sigue devolviendo filas con normalidad.
SELECT count(*) AS ranking_oficial_filas FROM public.riviera_jugadores_sitio_oficial;
-- esperado: > 0, mismo orden de magnitud que antes de la limpieza (156
-- jugadores activos aprox., verificar contra el número real actual)

-- 5. Las herramientas de auditoría de carrera que se dejaron intactas
--    siguen funcionando.
SELECT count(*) FROM public._career_participacion_host_audit;
SELECT count(*) FROM public._historical_orphan_parent_participaciones;

-- 6. Tablas núcleo de Riviera Open intactas — conteos deben ser IGUALES
--    a los de antes de la limpieza (156 / 312, verificar contra el número
--    real actual en el momento de correr esto).
SELECT 'riviera_jugadores' t, count(*) n FROM riviera_jugadores
UNION ALL SELECT 'jugador_participaciones', count(*) FROM jugador_participaciones
UNION ALL SELECT 'jugador_stats', count(*) FROM jugador_stats
UNION ALL SELECT 'tournaments', count(*) FROM tournaments
UNION ALL SELECT 'matches', count(*) FROM matches
UNION ALL SELECT 'pairs', count(*) FROM pairs
UNION ALL SELECT 'games', count(*) FROM games
UNION ALL SELECT 'duelos_2v2', count(*) FROM duelos_2v2
UNION ALL SELECT 'ligas', count(*) FROM ligas
UNION ALL SELECT 'torneo_express_evento', count(*) FROM torneo_express_evento
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'admin_users', count(*) FROM admin_users;

-- 7. Aislamiento entre organizadores no se tocó — spot-check de que las
--    policies de riviera_jugadores/jugador_participaciones siguen iguales
--    (no deberían haber cambiado en absoluto, este script solo confirma).
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('riviera_jugadores', 'jugador_participaciones', 'jugador_stats')
ORDER BY tablename, policyname;

-- 8. Acceso anon a las vistas eliminadas debe fallar ahora (esperar error
--    "relation does not exist" al probar desde el cliente / REST API, no
--    ejecutar aquí — este bloque es un recordatorio de qué probar afuera):
--    GET https://<proyecto>.supabase.co/rest/v1/alertas_membresia   -> 404/no existe
--    GET https://<proyecto>.supabase.co/rest/v1/membresia_actual    -> 404/no existe
--    GET https://<proyecto>.supabase.co/rest/v1/reservas_con_cupo   -> 404/no existe

-- 9. Advisor — confirmar en el dashboard de Supabase (Database > Advisors)
--    o re-correr localmente:
--      supabase db advisors --linked --type security
--    Debe seguir mostrando ERROR para riviera_jugadores_sitio_oficial,
--    _career_participacion_host_audit y _historical_orphan_parent_participaciones
--    (a propósito, se atienden aparte) y YA NO mostrar nada para
--    alertas_membresia, membresia_actual ni reservas_con_cupo.

-- =============================================================================
-- PRUEBAS FUNCIONALES EN LA APP (no-SQL, hacer manualmente después de la
-- limpieza, cubriendo lo que pediste):
--   [ ] Login (Riviera Open y Hack Padel)
--   [ ] Registro de una cuenta nueva de prueba — confirmar que:
--         (a) el signup se completa sin error, y
--         (b) NO aparece una fila nueva en public.profiles (confirma que
--             el trigger ajeno ya no ensucia cuentas reales)
--   [ ] Organizadores: crear/editar un organizador, branding dinámico
--   [ ] Riviera ID: búsqueda y vinculación de jugador por Riviera ID
--   [ ] Jugadores: alta, edición, ficha pública y admin
--   [ ] Ranking oficial (vista pública del sitio)
--   [ ] Retas (Reta clásica): crear, parejas, partidos, resultados
--   [ ] Torneos (Torneo Express): crear evento, grupos, eliminatoria
--   [ ] Americano: registro de jugadores, rondas, ranking
--   [ ] Ligas: jornadas, partidos, tabla
--   [ ] Duelo 2v2: flujo completo
--   [ ] Participaciones y puntos: que sigan calculándose igual
--   [ ] Vistas públicas de cada modo (sin login)
--   [ ] Acceso anon: rutas públicas siguen funcionando, rutas privadas
--       siguen bloqueadas
--   [ ] Acceso authenticated: cada organizador solo ve lo suyo
--   [ ] Aislamiento entre organizadores: organizador A no ve datos de B
-- =============================================================================
