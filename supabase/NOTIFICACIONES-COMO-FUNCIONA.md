# Cómo se envían las notificaciones (Torneo Express)

## Política actual (3 momentos)

| # | Momento | Tipo en código / log | Disparador |
|---|---------|----------------------|------------|
| 1 | Pareja asignada a un grupo | `asignacion_grupo` | Trigger SQL al INSERT en `torneo_express_grupo_parejas` |
| 2 | Fin fase grupos → eliminatoria | `clasifico_eliminatoria` / `no_clasifico` | Trigger SQL al UPDATE `torneo_express.fase_torneo` → `eliminatoria` |
| 3 | Se crea la ronda final | `clasifico_final` / `no_llego_final` | Código en `avanzarEliminatoriaSiCompleta` → `notifyFinalPhase()` |

**No** se envían por: resultado de partido, partido programado, ni botones del panel (salvo reenvío manual explícito).

---

## Flujo automático (producción)

```
Acción en BD (trigger)
    → INSERT en notificaciones_eventos_queue (estado: pendiente)
    → Database Webhook (Supabase Dashboard) on INSERT
    → Edge Function: procesar-notificaciones-evento
    → Resend (email HTML)
    → INSERT en notificaciones_log (estado: enviado | error | sin_contacto)
```

### Archivos clave

| Pieza | Ubicación |
|-------|-----------|
| Triggers + cola | Ya en Supabase (tabla `notificaciones_eventos_queue`) |
| Desactivar resultados | Política en BD (sin eventos por resultado/partido programado) |
| Procesar cola | `supabase/functions/procesar-notificaciones-evento/index.ts` |
| Plantillas HTML | `supabase/functions/_shared/emailTemplates.ts` |
| Resend | `supabase/functions/_shared/resendEmail.ts` |
| Dedup (no repetir mismo tipo/pareja) | `supabase/functions/_shared/notifDedup.ts` |

### Eventos de cola activos

Solo se procesan: `asignacion_grupo`, `clasifico_eliminatoria_batch`.

Filas legacy (`resultado_partido`, `partido_programado`, `inscripcion_torneo`) se ignoran sin enviar (triggers desactivados en Supabase).

### Webhook requerido (Supabase Dashboard)

- **Table:** `public.notificaciones_eventos_queue`
- **Event:** INSERT
- **URL:** `https://<PROJECT_REF>.supabase.co/functions/v1/procesar-notificaciones-evento`
- **Body:** debe incluir `record.id` de la fila insertada

### Secrets Edge Functions

- `RESEND_API_KEY`
- `RESEND_FROM` (ej. `Riviera Open <noreply@appriviera.rivieraopen.com>`)
- `APP_PUBLIC_URL` = `https://appriviera.rivieraopen.com` (solo dominio, sin `{id}`)

---

## Flujo manual (panel admin)

```
UI TorneoExpressNotificacionesPanel
    → torneoExpressNotificacionesService.dispatchTorneoExpressNotificaciones()
    → supabase.functions.invoke('enviar-notificaciones')
    → Resend + notificaciones_log
```

- **No** usa la cola `notificaciones_eventos_queue`.
- Botones = reenvío por tipo (`clasifico_eliminatoria`, `no_clasifico`, `asignacion_grupo`).
- Al guardar email de un jugador: `updatePlayerNotificationContact` puede llamar `asignacion_grupo` si ya está en un torneo con grupo.

### Final (momento 3)

```
save eliminatoria ronda completa
    → torneoExpressService.avanzarEliminatoriaSiCompleta()
    → notifyFinalPhase(torneoId, finalistPairIds)
    → invoke enviar-notificaciones por pareja (clasifico_final | no_llego_final)
```

---

## Si siguen llegando emails de “Resultado registrado”

1. **Triggers viejos aún activos en Supabase.** Desactivar triggers de resultado/partido programado en el SQL Editor.
2. Verificar triggers en BD:

```sql
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname LIKE '%notif%'
  AND NOT tgisinternal;
```

No deberían existir `trg_notif_resultado_partido_*` ni `trg_notif_partido_programado_*`.

3. Cola pendiente antigua:

```sql
SELECT event_type, estado, count(*)
FROM notificaciones_eventos_queue
GROUP BY 1, 2;
```

4. No pulsar reenvíos manuales en el panel durante pruebas.

---

## Deploy funciones

```bash
npx supabase functions deploy enviar-notificaciones
npx supabase functions deploy procesar-notificaciones-evento
```
