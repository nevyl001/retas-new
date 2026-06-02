-- Notificaciones automaticas por eventos de Torneo Express
-- Requiere haber ejecutado:
--   1) supabase/torneo-express-migration.sql
--   2) supabase/torneo-express-bracket.sql
--   3) supabase/notificaciones-sistema.sql

-- ---------------------------------------------------------------------------
-- 0) Ampliar tipos permitidos en log de notificaciones
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.notificaciones_log') IS NULL THEN
    RAISE EXCEPTION 'Falta public.notificaciones_log. Ejecuta primero supabase/notificaciones-sistema.sql';
  END IF;
END $$;

ALTER TABLE public.notificaciones_log
  DROP CONSTRAINT IF EXISTS notificaciones_log_tipo_check;

ALTER TABLE public.notificaciones_log
  ADD CONSTRAINT notificaciones_log_tipo_check
  CHECK (tipo IN (
    'inscripcion_torneo',
    'asignacion_grupo',
    'clasifico_eliminatoria',
    'no_clasifico',
    'resultado_partido',
    'recordatorio_partido',
    'proximo_partido',
    'partido_programado'
  ));

-- ---------------------------------------------------------------------------
-- 1) Cola interna de eventos (outbox)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notificaciones_eventos_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_express_id uuid REFERENCES public.torneo_express(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'inscripcion_torneo',
    'asignacion_grupo',
    'clasifico_eliminatoria_batch',
    'partido_programado',
    'resultado_partido'
  )),
  ref_table text NOT NULL,
  ref_id uuid,
  pair_id uuid REFERENCES public.pairs(id),
  player_id uuid REFERENCES public.players(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente', 'procesando', 'procesado', 'error', 'omitido'
  )),
  attempts int NOT NULL DEFAULT 0,
  error_detalle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notif_eventos_estado_created
  ON public.notificaciones_eventos_queue (estado, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_eventos_torneo
  ON public.notificaciones_eventos_queue (torneo_express_id);
CREATE INDEX IF NOT EXISTS idx_notif_eventos_type
  ON public.notificaciones_eventos_queue (event_type);

ALTER TABLE public.notificaciones_eventos_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizador_ve_eventos_queue" ON public.notificaciones_eventos_queue;
CREATE POLICY "organizador_ve_eventos_queue"
  ON public.notificaciones_eventos_queue
  FOR SELECT
  USING (
    torneo_express_id IN (
      SELECT id FROM public.torneo_express
      WHERE organizador_id = auth.uid()
    )
  );

-- La insercion de eventos la hacen triggers (SECURITY DEFINER), no el cliente.

-- ---------------------------------------------------------------------------
-- 2) Funciones helper para encolar eventos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_notif_event(
  p_torneo_express_id uuid,
  p_event_type text,
  p_ref_table text,
  p_ref_id uuid,
  p_pair_id uuid,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notificaciones_eventos_queue (
    torneo_express_id,
    event_type,
    ref_table,
    ref_id,
    pair_id,
    payload
  ) VALUES (
    p_torneo_express_id,
    p_event_type,
    p_ref_table,
    p_ref_id,
    p_pair_id,
    COALESCE(p_payload, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notif_event(uuid, text, text, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_notif_event(uuid, text, text, uuid, uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Trigger: INSCRIPCION + ASIGNACION DE GRUPO
--    Tabla: torneo_express_grupo_parejas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notif_inscripcion_grupo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_torneo_id uuid;
  v_grupo_nombre text;
  v_payload jsonb;
BEGIN
  SELECT g.torneo_id, g.nombre
  INTO v_torneo_id, v_grupo_nombre
  FROM public.torneo_express_grupos g
  WHERE g.id = NEW.grupo_id;

  IF v_torneo_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'grupo_id', NEW.grupo_id,
    'grupo_nombre', v_grupo_nombre
  );

  -- Un solo email: inscripción con grupo ya asignado
  PERFORM public.enqueue_notif_event(
    v_torneo_id,
    'asignacion_grupo',
    TG_TABLE_NAME,
    NEW.id,
    NEW.pareja_id,
    v_payload
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_inscripcion_grupo_ai ON public.torneo_express_grupo_parejas;
CREATE TRIGGER trg_notif_inscripcion_grupo_ai
AFTER INSERT ON public.torneo_express_grupo_parejas
FOR EACH ROW
EXECUTE FUNCTION public.trg_notif_inscripcion_grupo();

-- ---------------------------------------------------------------------------
-- 4) Trigger: CLASIFICO / NO CLASIFICO (batch al pasar a eliminatoria)
--    Tabla: torneo_express
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notif_clasificacion_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.fase_torneo = 'eliminatoria'
     AND (OLD.fase_torneo IS DISTINCT FROM NEW.fase_torneo) THEN
    PERFORM public.enqueue_notif_event(
      NEW.id,
      'clasifico_eliminatoria_batch',
      TG_TABLE_NAME,
      NEW.id,
      NULL,
      jsonb_build_object(
        'fase_anterior', OLD.fase_torneo,
        'fase_nueva', NEW.fase_torneo
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_clasificacion_batch_au ON public.torneo_express;
CREATE TRIGGER trg_notif_clasificacion_batch_au
AFTER UPDATE ON public.torneo_express
FOR EACH ROW
EXECUTE FUNCTION public.trg_notif_clasificacion_batch();

-- ---------------------------------------------------------------------------
-- 5) Trigger: PARTIDO PROGRAMADO (eliminatoria)
--    Tabla: torneo_express_eliminatoria_partidos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notif_partido_programado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_programado_cambio boolean;
  v_cancha_cambio boolean;
  v_max_ronda integer;
  v_ronda_label text;
  v_torneo_nombre text;
  v_torneo_categoria text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_programado_cambio := NEW.programado_en IS DISTINCT FROM OLD.programado_en;
    v_cancha_cambio := COALESCE(NEW.cancha, '') IS DISTINCT FROM COALESCE(OLD.cancha, '');
    IF NOT (v_programado_cambio OR v_cancha_cambio) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.programado_en IS NULL AND (NEW.cancha IS NULL OR TRIM(NEW.cancha) = '') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(ronda), NEW.ronda)
  INTO v_max_ronda
  FROM public.torneo_express_eliminatoria_partidos
  WHERE torneo_id = NEW.torneo_id;

  v_ronda_label := CASE
    WHEN NEW.ronda = v_max_ronda THEN '🏆 FINAL'
    WHEN NEW.ronda = v_max_ronda - 1 THEN '⚡ SEMIFINAL'
    WHEN NEW.ronda = v_max_ronda - 2 THEN '💥 CUARTOS DE FINAL'
    WHEN NEW.ronda = v_max_ronda - 3 THEN 'OCTAVOS DE FINAL'
    ELSE CONCAT('Ronda ', NEW.ronda::text)
  END;

  SELECT nombre, categoria
  INTO v_torneo_nombre, v_torneo_categoria
  FROM public.torneo_express
  WHERE id = NEW.torneo_id;

  PERFORM public.enqueue_notif_event(
    NEW.torneo_id,
    'partido_programado',
    TG_TABLE_NAME,
    NEW.id,
    COALESCE(NEW.pareja_local_id, NEW.pareja_visitante_id),
    jsonb_build_object(
      'ronda', NEW.ronda,
      'ronda_label', v_ronda_label,
      'orden', NEW.orden,
      'programado_en', NEW.programado_en,
      'cancha', NEW.cancha,
      'torneo_nombre', v_torneo_nombre,
      'torneo_categoria', v_torneo_categoria,
      'pareja_local_id', NEW.pareja_local_id,
      'pareja_visitante_id', NEW.pareja_visitante_id
    )
  );

  RETURN NEW;
END;
$$;

-- Partido programado: sin emails (ver notificaciones-solo-momentos-clave.sql)
DROP TRIGGER IF EXISTS trg_notif_partido_programado_au ON public.torneo_express_eliminatoria_partidos;
DROP TRIGGER IF EXISTS trg_notif_partido_programado_ai ON public.torneo_express_eliminatoria_partidos;

-- ---------------------------------------------------------------------------
-- 6) RESULTADO DE PARTIDO — deshabilitado (no emails por cada juego)
-- Ver supabase/notificaciones-solo-momentos-clave.sql
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notif_resultado_partido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;

-- Triggers de resultado desactivados (ver notificaciones-solo-momentos-clave.sql)

-- Ampliar constraint si la tabla ya existia sin resultado_partido
ALTER TABLE public.notificaciones_eventos_queue
  DROP CONSTRAINT IF EXISTS notificaciones_eventos_queue_event_type_check;

ALTER TABLE public.notificaciones_eventos_queue
  ADD CONSTRAINT notificaciones_eventos_queue_event_type_check
  CHECK (event_type IN (
    'inscripcion_torneo',
    'asignacion_grupo',
    'clasifico_eliminatoria_batch',
    'partido_programado',
    'resultado_partido'
  ));

-- ---------------------------------------------------------------------------
-- 7) Vista de monitoreo rapido
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.notificaciones_eventos_queue_resumen AS
SELECT
  torneo_express_id,
  event_type,
  estado,
  count(*)::int AS total
FROM public.notificaciones_eventos_queue
GROUP BY torneo_express_id, event_type, estado;

COMMENT ON VIEW public.notificaciones_eventos_queue_resumen IS
  'Resumen operativo de cola de eventos de notificaciones';

-- ---------------------------------------------------------------------------
-- 8) PostgREST schema cache
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Configuracion requerida en Supabase Dashboard (Database Webhooks):
--
-- Webhook A:
--   Table: public.notificaciones_eventos_queue
--   Events: INSERT
--   Filter: estado=eq.pendiente
--   URL: https://<PROJECT_REF>.supabase.co/functions/v1/procesar-notificaciones-evento
--   HTTP Method: POST
--
-- El payload del webhook debe incluir "record.id".
-- ---------------------------------------------------------------------------

