-- Tabla explícita de overrides manuales para host de eventos históricos.
-- Sin hardcode de club en funciones. Solo filas aprobadas aquí pueden repararse.
--
-- Flujo:
--   1) diagnose-historical-orphan-parent-participaciones.sql
--   2) seed-career-event-host-manual-overrides.sql (INSERT manual)
--   3) Re-ejecutar diagnose → READY_MANUAL_OVERRIDE
--   4) (futuro) repair-career-event-host-from-manual-overrides.sql
--
-- NO ejecutar repair hasta tener filas aprobadas.

CREATE TABLE IF NOT EXISTS public.career_event_host_manual_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_evento text NOT NULL
    CHECK (tipo_evento IN ('reta', 'americano', 'duelo_2v2', 'torneo_express', 'liga')),
  evento_id text NOT NULL,
  evento_nombre text NOT NULL,
  organizador_id uuid NOT NULL,
  club_name text NOT NULL,
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT career_event_host_manual_overrides_event_unique
    UNIQUE (tipo_evento, evento_id)
);

CREATE INDEX IF NOT EXISTS career_event_host_manual_overrides_evento_id_idx
  ON public.career_event_host_manual_overrides (evento_id);

CREATE INDEX IF NOT EXISTS career_event_host_manual_overrides_organizador_id_idx
  ON public.career_event_host_manual_overrides (organizador_id);

COMMENT ON TABLE public.career_event_host_manual_overrides IS
  'Overrides aprobados manualmente para metadata.organizador_id cuando el evento padre fue eliminado.';

COMMENT ON COLUMN public.career_event_host_manual_overrides.tipo_evento IS
  'Tipo de participación: reta | americano | duelo_2v2 | torneo_express | liga';
COMMENT ON COLUMN public.career_event_host_manual_overrides.evento_id IS
  'UUID del evento padre eliminado (mismo valor que jugador_participaciones.evento_id)';
COMMENT ON COLUMN public.career_event_host_manual_overrides.reason IS
  'Justificación humana: p.ej. confirmado visualmente en app, evento Hack Padel marzo 2024';

-- Lookup para diagnóstico y repair (sin inferencia).
-- Callers: pasar jp.tipo_evento::text y trim(jp.evento_id::text) desde jugador_participaciones.
-- override.tipo_evento es text; jp.tipo_evento es enum jugador_tipo_evento.
CREATE OR REPLACE FUNCTION public.riviera_career_event_host_manual_override(
  p_tipo_evento text,
  p_evento_id text
)
RETURNS TABLE (
  override_id uuid,
  organizador_id uuid,
  club_name text,
  evento_nombre text,
  approved_by uuid,
  approved_at timestamptz,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.career_event_host_manual_overrides') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.organizador_id,
    o.club_name,
    o.evento_nombre,
    o.approved_by,
    o.approved_at,
    o.reason
  FROM public.career_event_host_manual_overrides o
  WHERE o.tipo_evento = trim(p_tipo_evento)
    AND o.evento_id = trim(p_evento_id)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.riviera_career_event_host_manual_override(text, text)
  TO anon, authenticated;

-- RLS: solo master admin escribe; lectura para audit autenticado
ALTER TABLE public.career_event_host_manual_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS career_event_host_manual_overrides_select
  ON public.career_event_host_manual_overrides;
CREATE POLICY career_event_host_manual_overrides_select
  ON public.career_event_host_manual_overrides
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS career_event_host_manual_overrides_insert
  ON public.career_event_host_manual_overrides;
CREATE POLICY career_event_host_manual_overrides_insert
  ON public.career_event_host_manual_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS career_event_host_manual_overrides_update
  ON public.career_event_host_manual_overrides;
CREATE POLICY career_event_host_manual_overrides_update
  ON public.career_event_host_manual_overrides
  FOR UPDATE
  TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS career_event_host_manual_overrides_delete
  ON public.career_event_host_manual_overrides;
CREATE POLICY career_event_host_manual_overrides_delete
  ON public.career_event_host_manual_overrides
  FOR DELETE
  TO authenticated
  USING (public.is_master_admin());

-- Ver overrides activos (opcional, post-deploy)
-- SELECT * FROM public.career_event_host_manual_overrides ORDER BY approved_at DESC;

NOTIFY pgrst, 'reload schema';
