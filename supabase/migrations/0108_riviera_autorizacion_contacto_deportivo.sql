-- 0108: evidencia de una autorización explícita de contacto deportivo en altas futuras.
--
-- NO APLICAR hasta autorización expresa.
-- No marca a los 652 jugadores históricos.
-- No copia una aceptación genérica de privacidad.
-- No autoriza promociones.
-- No escribe preferencias de liga, no toca la cola y no envía correos.
-- Una fila aquí no deja a nadie LISTO PARA ENVIAR: la liga sigue exigiendo
-- la constancia de 0106 y el interruptor del administrador.

CREATE TABLE IF NOT EXISTS public.riviera_autorizacion_contacto_deportivo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  riviera_jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  organizador_id uuid NOT NULL,
  alcance text NOT NULL CHECK (alcance = 'comunicaciones_deportivas_liga'),
  aviso_texto text NOT NULL CHECK (char_length(btrim(aviso_texto)) BETWEEN 20 AND 2000),
  aviso_version text NOT NULL CHECK (char_length(btrim(aviso_version)) BETWEEN 1 AND 40),
  aceptado_at timestamptz NOT NULL,
  medio text NOT NULL CHECK (medio = 'formulario_alta'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT riviera_autorizacion_contacto_unica
    UNIQUE (riviera_jugador_id, aviso_version)
);

COMMENT ON TABLE public.riviera_autorizacion_contacto_deportivo IS
  'Aceptación explícita de avisos deportivos en el alta. No es el aviso de privacidad ni un consentimiento promocional.';

ALTER TABLE public.riviera_autorizacion_contacto_deportivo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS riviera_autorizacion_contacto_admin
  ON public.riviera_autorizacion_contacto_deportivo;

CREATE POLICY riviera_autorizacion_contacto_admin
  ON public.riviera_autorizacion_contacto_deportivo
  FOR ALL
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  )
  WITH CHECK (
    organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  );

REVOKE ALL ON TABLE public.riviera_autorizacion_contacto_deportivo FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.riviera_autorizacion_contacto_deportivo TO authenticated;
