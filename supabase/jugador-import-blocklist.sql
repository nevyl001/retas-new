-- Jugadores eliminados del registro: no deben recrearse al importar historial.
-- Ejecutar en Supabase SQL Editor (después de organizer-player-access.sql).

CREATE TABLE IF NOT EXISTS public.riviera_jugador_import_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  nombre_key text NOT NULL,
  legacy_player_id uuid,
  legacy_liga_jugador_id uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT riviera_jugador_import_blocklist_org_nombre_key
    UNIQUE (organizador_id, nombre_key)
);

CREATE INDEX IF NOT EXISTS riviera_jugador_import_blocklist_org_legacy_player_idx
  ON public.riviera_jugador_import_blocklist (organizador_id, legacy_player_id)
  WHERE legacy_player_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS riviera_jugador_import_blocklist_org_legacy_liga_idx
  ON public.riviera_jugador_import_blocklist (organizador_id, legacy_liga_jugador_id)
  WHERE legacy_liga_jugador_id IS NOT NULL;

COMMENT ON TABLE public.riviera_jugador_import_blocklist IS
  'Jugadores borrados por el organizador; backfill/import no debe recrearlos.';

ALTER TABLE public.riviera_jugador_import_blocklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rjib_select_own ON public.riviera_jugador_import_blocklist;
CREATE POLICY rjib_select_own ON public.riviera_jugador_import_blocklist
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid());

DROP POLICY IF EXISTS rjib_mutate_own ON public.riviera_jugador_import_blocklist;
CREATE POLICY rjib_mutate_own ON public.riviera_jugador_import_blocklist
  FOR ALL TO authenticated
  USING (organizador_id = auth.uid())
  WITH CHECK (organizador_id = auth.uid());

CREATE OR REPLACE FUNCTION public._riviera_jugador_nombre_key(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')));
$$;

CREATE OR REPLACE FUNCTION public.register_riviera_jugador_import_blocklist(
  p_organizador_id uuid,
  p_nombre text,
  p_legacy_player_id uuid DEFAULT NULL,
  p_legacy_liga_jugador_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_organizador_id IS NULL THEN
    RETURN;
  END IF;

  v_key := public._riviera_jugador_nombre_key(p_nombre);
  IF v_key = '' THEN
    RETURN;
  END IF;

  IF auth.uid() IS DISTINCT FROM p_organizador_id
     AND NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  INSERT INTO public.riviera_jugador_import_blocklist (
    organizador_id,
    nombre,
    nombre_key,
    legacy_player_id,
    legacy_liga_jugador_id
  )
  VALUES (
    p_organizador_id,
    trim(p_nombre),
    v_key,
    p_legacy_player_id,
    p_legacy_liga_jugador_id
  )
  ON CONFLICT (organizador_id, nombre_key) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      legacy_player_id = coalesce(EXCLUDED.legacy_player_id, riviera_jugador_import_blocklist.legacy_player_id),
      legacy_liga_jugador_id = coalesce(EXCLUDED.legacy_liga_jugador_id, riviera_jugador_import_blocklist.legacy_liga_jugador_id),
      deleted_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_riviera_jugador_import_blocklist(uuid, text, uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.is_jugador_import_blocked(
  p_organizador_id uuid,
  p_nombre text DEFAULT NULL,
  p_legacy_player_id uuid DEFAULT NULL,
  p_legacy_liga_jugador_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.riviera_jugador_import_blocklist b
    WHERE b.organizador_id = p_organizador_id
      AND (
        (p_legacy_player_id IS NOT NULL AND b.legacy_player_id = p_legacy_player_id)
        OR (p_legacy_liga_jugador_id IS NOT NULL AND b.legacy_liga_jugador_id = p_legacy_liga_jugador_id)
        OR (
          coalesce(public._riviera_jugador_nombre_key(p_nombre), '') <> ''
          AND b.nombre_key = public._riviera_jugador_nombre_key(p_nombre)
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_jugador_import_blocked(uuid, text, uuid, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Jugadores ya borrados antes de este script (reemplaza el UUID del organizador Hack Padel):
-- SELECT public.register_riviera_jugador_import_blocklist(
--   '00000000-0000-0000-0000-000000000000'::uuid, 'Daniel N', NULL, NULL);
-- SELECT public.register_riviera_jugador_import_blocklist(
--   '00000000-0000-0000-0000-000000000000'::uuid, 'Sebastian', NULL, NULL);
