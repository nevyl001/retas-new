-- Sistema de notificaciones (email + WhatsApp) para Torneo Express
-- Ejecutar en Supabase SQL Editor.

-- 1) Extender players con contacto real y preferencias
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS whatsapp_phone text,
  ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_opt_in_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_opt_in_whatsapp boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_updated_at timestamptz;

UPDATE public.players
SET email_verified = false
WHERE email ILIKE '%@padel.local';

COMMENT ON COLUMN public.players.whatsapp_phone IS
  'Telefono WhatsApp en formato E.164, p.ej. +5219991234567';
COMMENT ON COLUMN public.players.email_verified IS
  'True cuando el jugador confirmo su email real';
COMMENT ON COLUMN public.players.notif_opt_in_email IS
  'Consentimiento para notificaciones por email';
COMMENT ON COLUMN public.players.notif_opt_in_whatsapp IS
  'Consentimiento para notificaciones por WhatsApp';
COMMENT ON COLUMN public.players.contact_updated_at IS
  'Ultima fecha de actualizacion de contacto';

-- 2) Vista helper: parejas con contacto de ambos jugadores
CREATE OR REPLACE VIEW public.pairs_with_contact AS
SELECT
  p.id AS pair_id,
  p.tournament_id,
  p.player1_id,
  p.player2_id,
  pl1.name AS player1_name,
  pl1.email AS player1_email,
  pl1.whatsapp_phone AS player1_whatsapp,
  pl1.email_verified AS player1_email_verified,
  pl1.notif_opt_in_email AS player1_opt_email,
  pl1.notif_opt_in_whatsapp AS player1_opt_whatsapp,
  pl2.name AS player2_name,
  pl2.email AS player2_email,
  pl2.whatsapp_phone AS player2_whatsapp,
  pl2.email_verified AS player2_email_verified,
  pl2.notif_opt_in_email AS player2_opt_email,
  pl2.notif_opt_in_whatsapp AS player2_opt_whatsapp
FROM public.pairs p
JOIN public.players pl1 ON pl1.id = p.player1_id
JOIN public.players pl2 ON pl2.id = p.player2_id;

COMMENT ON VIEW public.pairs_with_contact IS
  'Parejas con datos de contacto y opt-in de ambos jugadores';

-- 3) Log de notificaciones
CREATE TABLE IF NOT EXISTS public.notificaciones_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_express_id uuid REFERENCES public.torneo_express(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id),
  pair_id uuid REFERENCES public.pairs(id),
  canal text NOT NULL CHECK (canal IN ('email', 'whatsapp')),
  tipo text NOT NULL CHECK (tipo IN (
    'inscripcion_torneo',
    'asignacion_grupo',
    'clasifico_eliminatoria',
    'no_clasifico',
    'resultado_partido',
    'clasifico_final',
    'no_llego_final',
    'recordatorio_partido',
    'proximo_partido',
    'partido_programado'
  )),
  destinatario text NOT NULL,
  mensaje_preview text,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'enviado', 'error', 'sin_contacto')),
  error_detalle text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

COMMENT ON TABLE public.notificaciones_log IS
  'Auditoria de notificaciones email/whatsapp de Torneo Express';

ALTER TABLE public.notificaciones_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizador_ve_logs" ON public.notificaciones_log;
CREATE POLICY "organizador_ve_logs"
  ON public.notificaciones_log
  FOR SELECT
  USING (
    torneo_express_id IN (
      SELECT id
      FROM public.torneo_express
      WHERE organizador_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "jugador_ve_sus_logs" ON public.notificaciones_log;
-- Nota: algunas instalaciones legacy no tienen players.user_id.
-- Por compatibilidad, dejamos lectura de logs al organizador del torneo.

DROP POLICY IF EXISTS "organizador_inserta_logs" ON public.notificaciones_log;
CREATE POLICY "organizador_inserta_logs"
  ON public.notificaciones_log
  FOR INSERT
  WITH CHECK (
    torneo_express_id IN (
      SELECT id
      FROM public.torneo_express
      WHERE organizador_id = auth.uid()
    )
  );

-- Indices
CREATE INDEX IF NOT EXISTS idx_notif_log_torneo
  ON public.notificaciones_log (torneo_express_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_player
  ON public.notificaciones_log (player_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_estado
  ON public.notificaciones_log (estado);
CREATE INDEX IF NOT EXISTS idx_notif_log_tipo
  ON public.notificaciones_log (tipo);

-- 4) Organizador puede actualizar contacto de jugadores (email / WhatsApp)
DROP POLICY IF EXISTS "organizador_actualiza_contacto_players" ON public.players;
CREATE POLICY "organizador_actualiza_contacto_players"
  ON public.players
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR id IN (
      SELECT pl.id
      FROM public.players pl
      JOIN public.pairs pr
        ON pl.id = pr.player1_id OR pl.id = pr.player2_id
      JOIN public.torneo_express_grupo_parejas tgp
        ON tgp.pareja_id = pr.id
      JOIN public.torneo_express_grupos tg
        ON tg.id = tgp.grupo_id
      JOIN public.torneo_express te
        ON te.id = tg.torneo_id
      WHERE te.organizador_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR id IN (
      SELECT pl.id
      FROM public.players pl
      JOIN public.pairs pr
        ON pl.id = pr.player1_id OR pl.id = pr.player2_id
      JOIN public.torneo_express_grupo_parejas tgp
        ON tgp.pareja_id = pr.id
      JOIN public.torneo_express_grupos tg
        ON tg.id = tgp.grupo_id
      JOIN public.torneo_express te
        ON te.id = tg.torneo_id
      WHERE te.organizador_id = auth.uid()
    )
  );

