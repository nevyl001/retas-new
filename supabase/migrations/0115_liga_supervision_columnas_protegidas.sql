-- La primera versión ya está en Production, aplicada por SQL directo y sin
-- registrar en schema_migrations. Esa versión además apaga supervision_activa
-- cuando el correo sigue sin verificar. No debe volver a aplicarse tal cual:
-- el pedido de verificación haría ese UPDATE y apagaría las copias.
--
-- Este archivo ya no apaga la supervisión. Solo impide que authenticated, anon
-- o authenticator escriban las columnas de verificación, token y cupo.
-- Reemplazarlo en Production exige autorización explícita.
-- No toca la cola, el historial, 0111 ni 0113.

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
