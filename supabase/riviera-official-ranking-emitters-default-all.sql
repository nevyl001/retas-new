-- ROMC: todos los organizadores emiten al ranking Riviera Open por defecto.
-- Modelo: opt-out (solo se bloquea si is_active = false en riviera_official_ranking_emitters).
-- Ejecutar después de romc2.sql y romc2-phase2.sql.
--
-- Grants (organizer_player_access): ya aceptan cualquier grantee en public.users;
-- este script solo unifica el gate ROMC con esa política.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Gate: cualquier usuario organizador puede emitir (salvo bloqueo explícito)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._is_official_ranking_emitter(p_organizador_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_organizador_id IS NULL THEN false
    WHEN EXISTS (
      SELECT 1
      FROM public.riviera_official_ranking_emitters e
      WHERE e.organizador_id = p_organizador_id
        AND e.is_active = false
    ) THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = p_organizador_id
    )
  END;
$$;

REVOKE ALL ON FUNCTION public._is_official_ranking_emitter(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._is_official_ranking_emitter(uuid) FROM anon, authenticated;

COMMENT ON TABLE public.riviera_official_ranking_emitters IS
  'ROMC emisores: por defecto TODOS los organizadores (public.users) emiten al ranking oficial Riviera. '
  'Solo usar is_active=false para bloquear explícitamente un club.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Backfill: registrar todos los organizadores actuales
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.riviera_official_ranking_emitters (organizador_id, is_active, notes)
SELECT
  u.id,
  true,
  'Auto: organizador activo en ecosistema Riviera'
FROM public.users u
ON CONFLICT (organizador_id) DO UPDATE
SET
  is_active = true,
  notes = COALESCE(
    NULLIF(trim(riviera_official_ranking_emitters.notes), ''),
    EXCLUDED.notes
  ),
  updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Nuevos registros: auto-activar emisor ROMC al crear public.users
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_organizador_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organizador_game_modes (organizador_id)
  VALUES (NEW.id)
  ON CONFLICT (organizador_id) DO NOTHING;

  INSERT INTO public.riviera_official_ranking_emitters (
    organizador_id,
    is_active,
    notes
  )
  VALUES (
    NEW.id,
    true,
    'Auto: registro organizador'
  )
  ON CONFLICT (organizador_id) DO UPDATE
  SET is_active = true, updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_users_create_organizador_defaults ON public.users;
CREATE TRIGGER on_users_create_organizador_defaults
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_organizador_user();

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Verificación
-- ══════════════════════════════════════════════════════════════════════════════
--
-- SELECT u.id, coalesce(u.name, u.email) AS nombre,
--        public._is_official_ranking_emitter(u.id) AS puede_emitir_romc
-- FROM public.users u
-- ORDER BY nombre;
