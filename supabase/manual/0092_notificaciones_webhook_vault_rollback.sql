-- NO EJECUTAR salvo para revertir 0092_notificaciones_webhook_vault.sql.
-- Lee vault.notificaciones_legacy_bearer (JWT anon, nunca service_role).
-- Restaura el trigger anterior: Authorization Bearer y cuerpo {}.
-- LIMITACIÓN: ese trigger no entrega record.id y la función responde 400.
-- Revertir 0092 no recupera notificaciones ni reanuda la cola.
-- No borra filas. El valor no se escribe en este archivo. Si Vault no lo tiene, no cambia el trigger.

CREATE OR REPLACE FUNCTION public.rollback_notificaciones_webhook_trigger()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, vault, public
AS $$
DECLARE
  v_bearer text;
  v_payload text;
  v_role text;
  v_headers text;
BEGIN
  SELECT decrypted_secret INTO v_bearer
  FROM vault.decrypted_secrets
  WHERE name = 'notificaciones_legacy_bearer'
  LIMIT 1;

  IF v_bearer IS NULL OR v_bearer NOT LIKE 'eyJ%' THEN
    RAISE EXCEPTION 'rollback detenido: falta notificaciones_legacy_bearer en Vault';
  END IF;

  BEGIN
    v_payload := convert_from(
      decode(
        rpad(
          replace(replace(split_part(v_bearer, '.', 2), '-', '+'), '_', '/'),
          ((length(replace(replace(split_part(v_bearer, '.', 2), '-', '+'), '_', '/')) + 3) / 4) * 4,
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
    RAISE EXCEPTION 'rollback detenido: notificaciones_legacy_bearer no es un JWT anon';
  END IF;

  v_headers := json_build_object(
    'Content-type', 'application/json',
    'Authorization', 'Bearer ' || v_bearer
  )::text;

  DROP TRIGGER IF EXISTS "notificaciones-auto" ON public.notificaciones_eventos_queue;

  EXECUTE format(
    'CREATE TRIGGER "notificaciones-auto" AFTER INSERT ON public.notificaciones_eventos_queue FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(%L, %L, %L, %L, %L)',
    'https://giswxhmjgjepoobdoljb.supabase.co/functions/v1/procesar-notificaciones-evento',
    'POST',
    v_headers,
    '{}',
    '5000'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_notificaciones_webhook_trigger() FROM PUBLIC, anon, authenticated;

SELECT public.rollback_notificaciones_webhook_trigger();

DROP FUNCTION public.rollback_notificaciones_webhook_trigger();
DROP FUNCTION IF EXISTS public.dispatch_notificaciones_webhook();

-- Restaura los grants que 0092 retira. Vuelve el EXECUTE anónimo de enqueue_notif_event.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.notificaciones_eventos_queue
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_notif_event(uuid, text, text, uuid, uuid, jsonb)
  TO anon, authenticated;
