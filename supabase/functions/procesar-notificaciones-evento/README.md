# procesar-notificaciones-evento

Cola automática de emails (bienvenida, asignación de grupo, clasificación eliminatoria).

## Secreto de webhook (`NOTIFICACIONES_WEBHOOK_SECRET`)

La función **rechaza** cualquier `POST` sin el header `x-notificaciones-secret` correcto (respuesta `401`), antes de leer la cola.

El cuerpo aceptado es exactamente `{"record":{"id":"<uuid>"}}`. Un id ausente o que no sea UUID responde 400 y no consulta la cola. `id` o `queue_id` sueltos no sirven.

Nivel A, contra producción: 401 sin secreto, 401 con secreto distinto, y `skipped` con un UUID que no existe. No inserta, no actualiza, no borra y no envía correos. Nivel B está en `queueClaim.test.ts`: simula cola y destinatario. No hay entorno aislado, así que no cuenta como validación de producción. El primer evento real después de `0092` espera una autorización aparte. El rollback de `0092` vuelve al trigger que falla; no recupera la cola.

La versión desplegada el 2026-06-02 no hace esa comprobación. El trigger en producción manda `Authorization` con la anon key legacy y el cuerpo `{}`, así que no entrega `record.id`. No desplegar este archivo ni aplicar `supabase/manual/0092_notificaciones_webhook_vault.sql` hasta tener los secretos en Vault y en la función. `verify_jwt = false` queda solo en `config.toml` para ese despliegue; no está activo en producción. No activar ese flag sobre la función vieja: sin la comprobación del secreto, el trigger nuevo enviaría correos.

### 1. Generar un valor seguro

```bash
openssl rand -base64 32
```

### 2. Configurar en Supabase Secrets

Desde el directorio del proyecto (con Supabase CLI enlazado al proyecto):

```bash
supabase secrets set NOTIFICACIONES_WEBHOOK_SECRET="tu-valor-generado"
```

O en el dashboard: **Project Settings → Edge Functions → Secrets** → añadir `NOTIFICACIONES_WEBHOOK_SECRET`.

### 3. Redesplegar la función

```bash
supabase functions deploy procesar-notificaciones-evento
```

Sin redeploy, la función no verá el secret nuevo.

### 4. Configurar el caller (Database Webhook)

Quien invoque la función debe enviar el mismo valor en el header:

| Header | Valor |
|--------|--------|
| `x-notificaciones-secret` | El mismo string que `NOTIFICACIONES_WEBHOOK_SECRET` |

**Database Webhook** (Dashboard → Database → Webhooks → tu webhook sobre `notificaciones_eventos_queue`):

- En **HTTP Headers**, añadir:
  - `x-notificaciones-secret`: `tu-valor-generado`

**Invocación manual / prueba** (`curl`):

```bash
curl -X POST "https://TU_REF.supabase.co/functions/v1/procesar-notificaciones-evento" \
  -H "Authorization: Bearer TU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "x-notificaciones-secret: tu-valor-generado" \
  -d '{"record":{"id":"UUID-DE-FILA-COLA"}}'
```

### Rotación del secret

1. `supabase secrets set NOTIFICACIONES_WEBHOOK_SECRET="nuevo-valor"`
2. `supabase functions deploy procesar-notificaciones-evento`
3. Actualizar el header en el Database Webhook con el nuevo valor.

Hasta completar el paso 3, los webhooks fallarán con `401` (comportamiento esperado).
