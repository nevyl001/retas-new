# Sprint 2.1.0 — Player Sharing Requests — Checklist

**Script:** `supabase/riviera-player-sharing-requests-2.1.0.sql`  
**Servicio TS:** `src/lib/rivieraJugadores/playerSharingRequests.ts`  
**Prerrequisitos:** ROMC-1, Sprint 2.0.1+ (identity/debut opcional pero recomendado)

---

## Alcance

- Solicitudes entre organizadores para **usar** un jugador
- Organizador de Registro **acepta / rechaza**
- **NO** crea `organizer_player_access`
- **NO** comparte jugador operativamente
- **NO** UI en este sprint

---

## Despliegue

1. Ejecutar `riviera-player-sharing-requests-2.1.0.sql` en staging
2. NOTICE: `Sprint 2.1.0 OK`
3. `npm test -- playerSharingRequests`
4. Pruebas SQL manuales (abajo)

---

## Pruebas SQL (staging)

### S1 — Crear solicitud (org Hack → jugador Riviera)

```sql
-- Autenticado como organizador Hack (no dueño del jugador)
SELECT public.create_player_sharing_request(
  '<riviera_jugador_id_origen>'::uuid,
  'Solicitud liga marzo'
);
```

Esperado: `status: pending`, `registration_organizer_id` = Organizador de Registro.

### S2 — Idempotencia: segunda solicitud pendiente falla

Repetir S1 → ERROR `Ya existe una solicitud pendiente`.

### S3 — Bandeja Organizador de Registro

```sql
-- Autenticado como registration_organizer
SELECT public.list_incoming_player_sharing_requests('pending');
```

### S4 — Aceptar

```sql
SELECT public.respond_player_sharing_request(
  '<request_id>'::uuid,
  true,
  'Aprobado para liga'
);
```

Esperado: `status: accepted`, `decided_at` NOT NULL.  
Verificar: **0 filas nuevas** en `organizer_player_access`.

### S5 — Rechazar otra solicitud

```sql
SELECT public.respond_player_sharing_request('<request_id>'::uuid, false, 'No');
```

### S6 — Decisión duplicada falla

Repetir S4 sobre misma solicitud → ERROR `La solicitud ya fue decidida`.

### S7 — Solicitud propia falla

Org dueño solicita su jugador → ERROR.

---

## Pruebas app

- [ ] `npm test -- playerSharingRequests` green
- [ ] Smoke retas/rating/torneos sin regresión
- [ ] Sin UI nueva (servicios listos para sprint UI)

---

## RPCs

| RPC | Rol |
|-----|-----|
| `create_player_sharing_request(uuid, text?)` | Organizador solicitante |
| `list_outgoing_player_sharing_requests(text?)` | Mis solicitudes enviadas |
| `list_incoming_player_sharing_requests(text?)` | Bandeja Organizador de Registro |
| `respond_player_sharing_request(uuid, boolean, text?)` | Aceptar / rechazar |

---

## Rollback

Bloque ROLLBACK al final del script SQL.

---

## Criterios de aceptación

- [ ] Tabla + RLS + 4 RPCs desplegadas
- [ ] Aceptar NO inserta en `organizer_player_access`
- [ ] Una sola solicitud `pending` por par (requester, registration_jugador)
- [ ] Tests TS green
- [ ] ROMC / ensure sin cambios
