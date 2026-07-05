# RIVIERA 2.1.2 — Player Membership RPCs + TS — Checklist

**Script SQL:** `supabase/riviera-player-membership-2.1.2-rpcs.sql`  
**Validate:** `supabase/riviera-player-membership-2.1.2-validate.sql`  
**Servicio TS:** `src/lib/rivieraJugadores/playerMembership.ts`  
**Prerrequisitos:** 2.0.1 + 2.0.2 + 2.1.1

---

## Alcance 2.1.2

| Incluido | Excluido |
|----------|----------|
| RPCs resolve / add / leave / list | UI |
| Servicios + tipos + tests TS | QR |
| Validación SQL read-only | Perfil público |
| Rollback comentado | Ranking / rating |
| | Retas / torneos / liga |
| | Backfill masivo |

---

## RPCs implementadas

| RPC | Propósito |
|-----|-----------|
| `resolve_player_by_riviera_id(text)` | Preview por Riviera ID exacto |
| `add_organizer_membership_by_riviera_id(text)` | Alta membresía + clon local |
| `leave_organizer_membership(uuid)` | Baja soft + archivar clon |
| `list_organizer_memberships()` | Membresías activas del org actual |

**Helpers internos (no expuestos):** `_normalize_riviera_id_exact`, `_resolve_identity_by_riviera_id`, `_link_membership_local_profile`

---

## Reglas de negocio congeladas

- Solo búsqueda **exacta** `RIV-[0-9]{8}` (trim, case-sensitive)
- No buscar por nombre / correo / teléfono
- No llamar `ensure_riviera_identity` en add
- No INSERT en `riviera_official_player_identity`
- No modificar `debut_organizer_id` / `debut_at` / `riviera_id`
- `profile_link`: solo INSERT `ON CONFLICT DO NOTHING` para clon local
- `organizer_player_access`: UNIQUE `(grantee, jugador_id)` respetado
- Clon local vía `ensure_granted_player_local` (patrón Fase 1)
- Organizador de Registro no puede add consigo mismo (`owner = grantee`)
- Transaccional: advisory lock + función única

---

## Despliegue

1. Ejecutar `riviera-player-membership-2.1.2-rpcs.sql` en staging
2. NOTICE: `Sprint 2.1.2 OK — RPCs=resolve,add,leave,list`
3. Ejecutar `riviera-player-membership-2.1.2-validate.sql`
4. `npm test -- playerMembership`
5. Pruebas SQL manuales (abajo)
6. Prod solo tras staging green

---

## Pruebas SQL (staging)

**Requisito:** al menos un jugador con `riviera_id` asignado (vía `ensure_riviera_identity` o admin).

### M1 — resolve not found

```sql
SELECT public.resolve_player_by_riviera_id('RIV-99999999');
-- Esperado: {"found": false, ...}
```

### M2 — resolve found (como org B)

```sql
SELECT public.resolve_player_by_riviera_id('RIV-00000001');
-- Esperado: found=true, display_name, already_member=false
```

### M3 — add membresía

```sql
SELECT public.add_organizer_membership_by_riviera_id('RIV-00000001');
-- Esperado: membership_id, local_jugador_id, created=true
```

### M4 — idempotencia add

Ejecutar M3 dos veces. Segunda: `already_member=true`, mismo `local_jugador_id`.

### M5 — list

```sql
SELECT * FROM public.list_organizer_memberships();
```

### M6 — leave

```sql
SELECT public.leave_organizer_membership('<local_jugador_id>'::uuid);
-- Esperado: left_at, is_active=false en OPA
```

### M7 — sin duplicados

```sql
SELECT grantee_organizer_id, jugador_id, count(*)
FROM organizer_player_access WHERE is_active GROUP BY 1,2 HAVING count(*) > 1;
-- 0 filas

SELECT riviera_jugador_id, count(*)
FROM riviera_official_player_profile_link GROUP BY 1 HAVING count(*) > 1;
-- 0 filas
```

### M8 — mismo org registro rechazado

Como organizador de registro del jugador, ejecutar add → error esperado.

---

## Pruebas TS

- [ ] `npm test -- playerMembership` green
- [ ] `normalizeRivieraIdInput` rechaza parcial / minúsculas
- [ ] resolve/add/leave/list delegan RPC correcta
- [ ] add idempotente en contrato parseado

---

## Rollback

Bloque comentado al final de `riviera-player-membership-2.1.2-rpcs.sql`.

**Nota:** rollback elimina RPCs; **no** revierte membresías creadas.

---

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Jugadores sin `riviera_id` asignado | add/resolver fallan | Asignar vía ensure en staging; prod gradual con flag |
| Carrera sin identity row | resolve not found | Requiere ROMC + ensure previo; documentado |
| Race concurrente mismo org+jugador | duplicado OPA | advisory lock + UNIQUE constraint |
| `ensure_granted_player_local` crea clon sin profile_link | ledger ROMC no resuelve | `_link_membership_local_profile` post-ensure |
| leave archiva clon pero conserva link | re-add idempotente | reactivate branch en add |
| Enumeración de Riviera IDs vía resolve | privacidad | solo nombre + found; no email/teléfono |
| Organizador add jugador propio registro | constraint violation | check explícito owner=grantee |
| admin_legacy grants coexisten | list mezcla fuentes | joined_via distingue canal |
| Sin UI aún | RPC expuestas sin uso app | GRANT solo authenticated; sin flag UI |

---

## Fuera de alcance (2.1.3+)

- Pantalla agregar por Riviera ID
- QR / deep links
- `admin_revoke` → setear `left_at` automático
- Notificaciones al Organizador de Registro
- Feature flag app

---

## Criterios de aceptación

- [ ] SQL 2.1.2 en staging
- [ ] Validate V1–V7 PASS
- [ ] M1–M8 PASS en staging
- [ ] Tests TS green
- [ ] Sin cambios rating/retas/torneos/UI
- [ ] Prod: desplegar RPCs antes de cualquier UI futura
