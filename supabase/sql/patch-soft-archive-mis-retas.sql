-- ══════════════════════════════════════════════════════════════════════════════
-- Soft-archive de eventos (Duelo 2v2 + Reta) desde «Mis retas»
--
-- Problema: delete físico de duelos_2v2 / tournaments deja participaciones con
-- evento_id apuntando a un padre inexistente (huérfanas lógicas). Rating,
-- ledger y puntos NO se borran por FK (no hay CASCADE desde el padre), pero
-- las herramientas de integridad/auditoría marcan parent_exists=false.
--
-- Solución: archived_at. La fila padre se conserva; Mis retas la oculta.
-- NO ejecutar automáticamente: aplicar manualmente en staging/prod.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Duelos 2v2 ───────────────────────────────────────────────────────────────
ALTER TABLE public.duelos_2v2
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

COMMENT ON COLUMN public.duelos_2v2.archived_at IS
  'Soft-archive desde Mis retas. NULL = visible en admin. No borra carrera.';

CREATE INDEX IF NOT EXISTS duelos_2v2_organizador_active_idx
  ON public.duelos_2v2 (organizador_id, created_at DESC)
  WHERE archived_at IS NULL;

-- ── Retas (tournaments) ────────────────────────────────────────────────────
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

COMMENT ON COLUMN public.tournaments.archived_at IS
  'Soft-archive desde Mis retas. NULL = visible en admin. No borra carrera.';

CREATE INDEX IF NOT EXISTS tournaments_user_active_idx
  ON public.tournaments (user_id, created_at DESC)
  WHERE archived_at IS NULL;

-- ── Bloquear DELETE físico cuando hay carrera asociada ───────────────────────
CREATE OR REPLACE FUNCTION public._block_hard_delete_event_with_career()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_count integer := 0;
BEGIN
  IF TG_TABLE_NAME = 'duelos_2v2' THEN
    v_tipo := 'duelo_2v2';
  ELSIF TG_TABLE_NAME = 'tournaments' THEN
    v_tipo := 'reta';
  ELSE
    RETURN OLD;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.jugador_participaciones jp
  WHERE jp.tipo_evento::text = v_tipo
    AND jp.evento_id::text = OLD.id::text;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'No se puede eliminar definitivamente: hay % participación(es) de carrera. Archiva el evento (archived_at) en su lugar.',
      v_count;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_hard_delete_duelo_career ON public.duelos_2v2;
CREATE TRIGGER trg_block_hard_delete_duelo_career
  BEFORE DELETE ON public.duelos_2v2
  FOR EACH ROW
  EXECUTE FUNCTION public._block_hard_delete_event_with_career();

DROP TRIGGER IF EXISTS trg_block_hard_delete_tournament_career ON public.tournaments;
CREATE TRIGGER trg_block_hard_delete_tournament_career
  BEFORE DELETE ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public._block_hard_delete_event_with_career();

NOTIFY pgrst, 'reload schema';
