-- NO EJECUTAR hasta autorización expresa.
-- Este archivo está fuera de supabase/migrations para que un db push no lo aplique.
--
-- Antes de aplicarlo tienen que existir, sin copiar sus valores aquí:
--   vault: notificaciones_publishable_key   (sb_publishable_; un JWT anon solo como puente)
--   vault: notificaciones_webhook_secret    (el mismo valor que NOTIFICACIONES_WEBHOOK_SECRET)
--   edge:  NOTIFICACIONES_WEBHOOK_SECRET
--   función desplegada con verify_jwt = false
--
-- La función desplegada hoy no exige el secreto y el trigger manda el cuerpo {}.
-- Por eso la cola puede quedarse en pendiente. Este cambio no se aplica solo.

CREATE OR REPLACE FUNCTION public.dispatch_notificaciones_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, vault, net, public
AS $$
DECLARE
  v_api_key text;
  v_webhook text;
  v_payload text;
  v_role text;
BEGIN
  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets
  WHERE name = 'notificaciones_publishable_key'
  LIMIT 1;

  SELECT decrypted_secret INTO v_webhook
  FROM vault.decrypted_secrets
  WHERE name = 'notificaciones_webhook_secret'
  LIMIT 1;

  IF v_api_key IS NULL OR v_webhook IS NULL
     OR length(btrim(v_api_key)) = 0 OR length(btrim(v_webhook)) = 0 THEN
    RAISE WARNING 'notificaciones webhook: faltan secretos de Vault; la fila queda pendiente';
    RETURN NEW;
  END IF;

  IF v_api_key LIKE 'sb_secret_%' THEN
    RAISE WARNING 'notificaciones webhook: la clave de Vault es privilegiada y no se envía';
    RETURN NEW;
  END IF;

  IF v_api_key LIKE 'eyJ%' THEN
    BEGIN
      v_payload := convert_from(
        decode(
          rpad(
            replace(replace(split_part(v_api_key, '.', 2), '-', '+'), '_', '/'),
            ((length(replace(replace(split_part(v_api_key, '.', 2), '-', '+'), '_', '/')) + 3) / 4) * 4,
            '='
          ),
          'base64'
        ),
        'utf8'
      );
      v_role := substring(v_payload FROM '"role"[[:space:]]*:[[:space:]]*"([^"]+)"');
    EXCEPTION WHEN OTHERS THEN
      v_role := NULL;
    END;
    IF v_role IS DISTINCT FROM 'anon' THEN
      RAISE WARNING 'notificaciones webhook: el JWT de Vault no es anon y no se envía';
      RETURN NEW;
    END IF;
  ELSIF v_api_key NOT LIKE 'sb_publishable_%' THEN
    RAISE WARNING 'notificaciones webhook: la clave de Vault no es publishable y no se envía';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://giswxhmjgjepoobdoljb.supabase.co/functions/v1/procesar-notificaciones-evento',
    body := jsonb_build_object('record', jsonb_build_object('id', NEW.id)),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_api_key,
      'x-notificaciones-secret', v_webhook
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_notificaciones_webhook() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_notificaciones_webhook() TO authenticated, service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA vault FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA net FROM anon, authenticated;

-- La cola se llena por triggers SECURITY DEFINER. Estos grants no hacen falta
-- para ese camino y permiten escritura directa con la clave pública.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.notificaciones_eventos_queue
  FROM anon, authenticated;
REVOKE SELECT ON TABLE public.notificaciones_eventos_queue FROM anon;

REVOKE ALL ON FUNCTION public.enqueue_notif_event(uuid, text, text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notif_event(uuid, text, text, uuid, uuid, jsonb)
  TO service_role;

DROP TRIGGER IF EXISTS "notificaciones-auto" ON public.notificaciones_eventos_queue;

CREATE TRIGGER "notificaciones-auto"
  AFTER INSERT ON public.notificaciones_eventos_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_notificaciones_webhook();
