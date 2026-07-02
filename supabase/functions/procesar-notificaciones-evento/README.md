# procesar-notificaciones-evento

Cola automática de emails (bienvenida, asignación de grupo, clasificación eliminatoria).

## Secreto de webhook (`NOTIFICACIONES_WEBHOOK_SECRET`)

La función **rechaza** cualquier `POST` sin el header `x-notificaciones-secret` correcto (respuesta `401`).

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
