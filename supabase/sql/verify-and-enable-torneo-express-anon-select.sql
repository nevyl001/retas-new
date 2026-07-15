-- ═══════════════════════════════════════════════════════════════════════════════
-- SEPARADO — Lectura pública (anon) para las tablas que escucha Realtime.
-- Fecha: 2026-07-15
-- NO EJECUTAR junto con enable-torneo-express-realtime.sql. Revisa primero.
--
-- POR QUÉ EXISTE ESTE ARCHIVO:
-- Supabase Realtime respeta RLS. Si anon no tiene SELECT sobre una tabla,
-- una suscripción postgres_changes de un visitante anónimo NO recibirá
-- eventos de esa tabla, aunque la vista pública cargue datos hoy (porque
-- la carga inicial puede ir por una RPC SECURITY DEFINER que sí puede leer
-- todo, mientras que Realtime siempre corre como el rol real del socket:
-- anon en vistas públicas).
--
-- QUÉ YA EXISTE EN EL REPO (verificar si se aplicó en tu proyecto):
-- supabase/rls-enable-public-schema.sql (líneas ~338-446) YA define, para
-- exactamente estas 5 tablas, políticas anon SELECT USING(true):
--   torneo_express, torneo_express_grupos, torneo_express_grupo_parejas,
--   torneo_express_partidos, torneo_express_eliminatoria_partidos
-- Este archivo NO inventa una política nueva ni más permisiva: replica
-- textualmente (idempotente, DROP POLICY IF EXISTS + CREATE POLICY) lo que
-- ya está commiteado en ese archivo, por si en tu base de datos real nunca
-- se corrió o quedó desalineado.
--
-- POR QUÉ USING(true) NO EXPONE NADA SENSIBLE AQUÍ:
-- - `torneo_express` (la categoría deportiva) NO tiene un estado tipo
--   draft/borrador propio; el ciclo de vida borrador/publicado vive en
--   `torneo_express_evento` (el evento contenedor), que esta lectura NO
--   toca ni agrega a Realtime.
-- - Estas mismas tablas ya tienen hoy páginas públicas (/torneo-express/*)
--   que se sirven sin sesión: si no fueran seguras para anon, la vista
--   pública actual ya estaría expuesta del mismo modo, con o sin Realtime.
-- - No incluye `torneo_express_evento`, `admin_users`, ni ninguna tabla de
--   identidad/carrera/ranking: fuera de alcance de este cambio.
--
-- PASO 1 — Ejecuta primero (solo lectura) y revisa qué falta:
--   supabase/sql/verify-torneo-express-realtime.sql (bloques 4, 5 y 6)
-- PASO 2 — Si el bloque 5/6 de ese diagnóstico ya muestra SELECT para anon
-- en las 5 tablas, NO necesitas correr este archivo.
-- PASO 3 — Si falta, corre el bloque de abajo.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.torneo_express ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.torneo_express_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.torneo_express_grupo_parejas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.torneo_express_partidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.torneo_express_eliminatoria_partidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS te_select_anon ON public.torneo_express;
CREATE POLICY te_select_anon ON public.torneo_express
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS te_grupos_select_anon ON public.torneo_express_grupos;
CREATE POLICY te_grupos_select_anon ON public.torneo_express_grupos
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS te_gp_select_anon ON public.torneo_express_grupo_parejas;
CREATE POLICY te_gp_select_anon ON public.torneo_express_grupo_parejas
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS te_partidos_select_anon ON public.torneo_express_partidos;
CREATE POLICY te_partidos_select_anon ON public.torneo_express_partidos
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS te_elim_select_anon ON public.torneo_express_eliminatoria_partidos;
CREATE POLICY te_elim_select_anon ON public.torneo_express_eliminatoria_partidos
  FOR SELECT TO anon
  USING (true);

-- Verificación final: debe mostrar 1 fila anon por tabla (5 filas).
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN (
    'te_select_anon',
    'te_grupos_select_anon',
    'te_gp_select_anon',
    'te_partidos_select_anon',
    'te_elim_select_anon'
  )
ORDER BY tablename;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (comentado):
-- DROP POLICY IF EXISTS te_select_anon ON public.torneo_express;
-- DROP POLICY IF EXISTS te_grupos_select_anon ON public.torneo_express_grupos;
-- DROP POLICY IF EXISTS te_gp_select_anon ON public.torneo_express_grupo_parejas;
-- DROP POLICY IF EXISTS te_partidos_select_anon ON public.torneo_express_partidos;
-- DROP POLICY IF EXISTS te_elim_select_anon ON public.torneo_express_eliminatoria_partidos;
-- ═══════════════════════════════════════════════════════════════════════════════
