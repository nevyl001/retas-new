-- NO APLICADA. No ejecutar en Production hasta autorización explícita.
-- No reemplaza funciones de 0111 ni de 0113. No toca la cola ni el historial.
--
-- El organizador puede actualizar su fila de configuración. Sin este candado
-- podría copiar el correo a supervision_email_verificado sin abrir el enlace.
-- Las funciones SECURITY DEFINER corren como su dueño y sí pueden escribir
-- esas columnas. Un UPDATE directo de authenticated o anon no.

CREATE OR REPLACE FUNCTION public.liga_notificaciones_proteger_supervision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon', 'authenticator') THEN
    NEW.supervision_email_verificado := OLD.supervision_email_verificado;
    NEW.supervision_verificado_at := OLD.supervision_verificado_at;
    NEW.supervision_token_hash := OLD.supervision_token_hash;
    NEW.supervision_token_expira := OLD.supervision_token_expira;
    NEW.supervision_intentos := OLD.supervision_intentos;
    NEW.supervision_solicitudes := OLD.supervision_solicitudes;
    NEW.supervision_solicitud_ventana := OLD.supervision_solicitud_ventana;
    NEW.supervision_prueba_conteo := OLD.supervision_prueba_conteo;
    NEW.supervision_prueba_ventana := OLD.supervision_prueba_ventana;
  END IF;

  IF NEW.supervision_activa IS TRUE
     AND (
       NEW.supervision_verificado_at IS NULL
       OR NEW.supervision_email IS DISTINCT FROM NEW.supervision_email_verificado
     )
  THEN
    NEW.supervision_activa := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS liga_notificaciones_proteger_supervision
  ON public.liga_notificaciones_config;

CREATE TRIGGER liga_notificaciones_proteger_supervision
  BEFORE UPDATE ON public.liga_notificaciones_config
  FOR EACH ROW
  EXECUTE FUNCTION public.liga_notificaciones_proteger_supervision();

REVOKE ALL ON FUNCTION public.liga_notificaciones_proteger_supervision() FROM PUBLIC, anon, authenticated;
