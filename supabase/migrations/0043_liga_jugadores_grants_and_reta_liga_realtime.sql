-- 0043: liga_jugadores grants (anon) + realtime para reta/liga
--
-- Contexto (2026-09-23):
-- 1) anon tenía INSERT/UPDATE/DELETE en liga_jugadores sin SELECT de tabla
--    (peligroso y asimétrico). El SELECT de columnas sin PII ya existía
--    (fix-rls 2026-07-29); se reafirma y se revoca el DML de anon.
-- 2) games/matches (reta) y liga_jornadas/inscripciones/partidos NO estaban
--    en supabase_realtime → CHANNEL_ERROR y fallback a polling en consola.
--
-- Idempotente. No toca RLS FORCE ni políticas de PII.

-- ── 1) Grants anon sobre liga_jugadores ─────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.liga_jugadores FROM anon;

-- Reafirmar lectura pública sin PII (email/telefono siguen sin GRANT a anon).
REVOKE SELECT ON public.liga_jugadores FROM anon;
GRANT SELECT (id, nombre, organizador_id, genero, nivel, estado, created_at)
  ON public.liga_jugadores TO anon;

-- Master admin: leer roster de cualquier liga (repair / soporte).
DROP POLICY IF EXISTS lj_select_master_admin ON public.liga_jugadores;
CREATE POLICY lj_select_master_admin ON public.liga_jugadores
  FOR SELECT
  TO authenticated
  USING (public.is_master_admin());

-- ── 2) Realtime: reta clásica ───────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 3) Realtime: liga pública ───────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.liga_jornadas;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.liga_inscripciones;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.liga_partidos;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
