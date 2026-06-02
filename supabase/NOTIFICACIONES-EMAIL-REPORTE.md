# Reporte — Módulo de notificaciones (solo email / Resend)

Generado tras auditoría. WhatsApp/Twilio **deshabilitado temporalmente** en Edge Functions.

## Remitente (RESEND_FROM)

| Origen | Valor |
|--------|--------|
| **Producción esperado** | `Riviera Open <noreply@appriviera.rivieraopen.com>` |
| **Constante en código** | `supabase/functions/_shared/resendEmail.ts` → `RESEND_FROM_DEFAULT` |
| **`.env` local (frontend)** | No define `RESEND_FROM` (solo aplica en Supabase secrets) |
| **`.env.example`** | `RESEND_FROM=Riviera Open <noreply@appriviera.rivieraopen.com>` |

Si `RESEND_FROM` en secrets contiene `@rivieraopen.com` sin `appriviera`, el código **fuerza** `noreply@appriviera.rivieraopen.com` y registra `resend_from_override` en logs.

## RESEND_API_KEY en producción

Verificar en Supabase Dashboard → **Project Settings → Edge Functions → Secrets** o:

```bash
npx supabase secrets list
```

Debe existir `RESEND_API_KEY` con prefijo `re_`. La función `enviar-notificaciones` devuelve **500** si falta.

No es posible leer secrets desde el repo; solo comprobar en Supabase CLI/Dashboard.

## Puntos de envío de email (Resend)

| Archivo | Línea (aprox.) | Función | Rol |
|---------|----------------|---------|-----|
| `supabase/functions/_shared/resendEmail.ts` | ~52 | `sendByResend()` | **Única implementación** HTTP → `https://api.resend.com/emails` |
| `supabase/functions/enviar-notificaciones/index.ts` | ~import | — | Invoca `sendByResend` por jugador (manual / panel) |
| `supabase/functions/enviar-notificaciones/index.ts` | ~loop `emailOk` | handler `Deno.serve` | Dispara envío según `tipo` |
| `supabase/functions/procesar-notificaciones-evento/index.ts` | ~import | — | Invoca `sendByResend` por evento de cola |
| `supabase/functions/procesar-notificaciones-evento/index.ts` | `runQueueEvent` | `runQueueEvent()` | Procesa `notificaciones_eventos_queue` (automático) |

**No hay otros archivos** que llamen a la API de Resend directamente.

## Flujo frontend (no envía email directo)

| Archivo | Función | Acción |
|---------|---------|--------|
| `src/services/torneoExpressNotificacionesService.ts` | `dispatchTorneoExpressNotificaciones()` | `supabase.functions.invoke('enviar-notificaciones')` |
| `src/services/torneoExpressNotificacionesService.ts` | `updatePlayerNotificationContact()` | Tras guardar contacto → `autoNotifyPlayerEnrollment()` → invoke |
| SQL triggers | `enqueue_notif_event` | INSERT cola → webhook → `procesar-notificaciones-evento` |

## Logs añadidos (Supabase → Edge Functions → Logs)

Eventos JSON en consola:

- `resend_config` — al arrancar función (`resend_from`, `resend_api_key_present`)
- `resend_send_attempt` — `from`, `to`, `subject`, contexto
- `resend_send_success` / `resend_send_failed` — `status`, `responseBody` completo
- `resend_from_override` — si se corrige dominio incorrecto

Metadata en `notificaciones_log`: `resend_status`, `resend_response` (primeros 500 chars).

## WhatsApp / Twilio (temporalmente off)

Eliminado de:

- `enviar-notificaciones/index.ts` (sin llamadas Twilio)
- `procesar-notificaciones-evento/index.ts` (sin llamadas Twilio)

**Sin cambiar:** columnas/UI de WhatsApp en `players`, `WhatsappOptInHint`, panel de contacto.

## Referencias `@rivieraopen.com` en repo

| Ubicación | Acción |
|-----------|--------|
| Edge Functions `RESEND_FROM` | Forzado a `@appriviera.rivieraopen.com` si env incorrecto |
| `TorneoExpressNotificacionesPanel.tsx` hint infra | Solo texto de ayuda (dominio verificado) |
| Marca "Riviera Open" en cuerpo de emails | Texto de marca, no dirección de envío |

## Deploy requerido

```bash
npx supabase functions deploy enviar-notificaciones
npx supabase functions deploy procesar-notificaciones-evento
npx supabase secrets set RESEND_FROM="Riviera Open <noreply@appriviera.rivieraopen.com>"
```
