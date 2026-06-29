# Ranking Oficial Riviera Multi-Club — Arquitectura y plan

**Estado:** 🔒 Diseño aprobado conceptualmente — **no implementar** sin aprobación explícita.  
**Última actualización:** 2026-06-24  
**Relacionado:** `docs/RANKING-OFICIAL-RIVIERAOPEN.md`, `docs/JUGADOR-GLOBAL-FASE-2.md`, `supabase/organizer-player-access.sql`

---

## Frase central

> **Ranking interno por club** = `jugador_stats` del perfil local (`riviera_jugadores` + participaciones del club).  
> **Ranking oficial Riviera multi-club** = ledger oficial acumulado por **identidad del jugador**, independiente de cada club.

---

## Regla de producto

Cuando un jugador participa en un club **autorizado** y en un evento **marcado como oficial**:

| Destino | Qué suma | Fuente |
|---------|----------|--------|
| Ranking interno del club | Puntos del evento en ese club | `jugador_participaciones` → `jugador_stats` (perfil local B) |
| Ranking oficial Riviera acumulado | Mismos puntos (o subconjunto definido) | `riviera_official_points_ledger` (identidad del jugador) |

**Ejemplo Aaron:** 500 pts oficiales + 80 en liga Hack autorizada → interno Hack +80, oficial Riviera **580**.

- Los **puntos oficiales nunca restan** (solo acumulación ≥ 0).
- El **rating** sigue en el perfil local del club donde se jugó; puede subir o bajar; **no** es el ranking oficial de puntos.

---

## 1. Tablas a crear

### 1.1 `riviera_official_points_ledger` (ledger append-only)

Fuente de verdad de cada movimiento oficial. **No** reemplaza `jugador_participaciones` ni `jugador_stats`.

### 1.2 `riviera_official_player_totals` (agregado materializado, recomendado)

Vista materializada o tabla de totales por jugador oficial para consultas rápidas de ranking. Se actualiza incrementalmente al insertar en el ledger (trigger o RPC).

### 1.3 `riviera_official_player_identity` (puente de identidad, pre-`global_players`)

Tabla de resolución estable **antes** de Fase 2A. Une perfiles locales (`riviera_jugadores.id`) a una `official_player_key` UUID.

| Por qué no solo `global_players` | Fase 2A congelada; esta capa puede avanzar con puente mínimo reversible. |
|----------------------------------|--------------------------------------------------------------------------|

### 1.4 Opcional: `riviera_official_points_by_club` (desglose)

Agregado `(official_player_key, source_organizer_id) → puntos` para UI «puntos Hack / Riviera / Padelito» sin recalcular desde ledger cada vez.

---

## 2. Campos mínimos

### `riviera_official_points_ledger`

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `id` | `uuid PK` | sí | |
| `official_player_key` | `uuid` | sí | Identidad acumuladora (ver §4) |
| `source_organizer_id` | `uuid → auth.users` | sí | Club donde ocurrió el evento |
| `source_local_jugador_id` | `uuid → riviera_jugadores` | sí | Perfil local que generó la participación |
| `participacion_id` | `uuid → jugador_participaciones` | sí | **UNIQUE** — anti doble conteo |
| `event_type` | `text` | sí | `liga`, `torneo`, `reta`, `americano`, … |
| `event_id` | `uuid` | sí | Id del evento (liga, jornada, torneo, …) |
| `event_name` | `text` | sí | Denormalizado para auditoría/UI |
| `points` | `integer` | sí | `CHECK (points >= 0)` |
| `counts_for_official_ranking` | `boolean` | sí | Default `true`; permite auditoría si algún gate falló post-hoc |
| `source_club_name` | `text` | no | Snapshot nombre club al momento del evento |
| `metadata` | `jsonb` | no | `puntos_desglose`, `subtipo`, `jornada_numero`, etc. |
| `created_at` | `timestamptz` | sí | |

Índices: `(official_player_key, created_at DESC)`, `(source_organizer_id)`, UNIQUE `(participacion_id)`.

### `riviera_official_player_identity`

| Campo | Tipo | Notas |
|-------|------|-------|
| `official_player_key` | `uuid PK` | Misma clave en todo el ecosistema |
| `canonical_riviera_jugador_id` | `uuid UNIQUE` | Perfil **dueño** (origen) preferido |
| `created_at` | `timestamptz` | |

### `riviera_official_player_profile_link`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | `uuid PK` | |
| `official_player_key` | `uuid` | |
| `riviera_jugador_id` | `uuid UNIQUE` | Cada perfil local enlazado una vez |
| `organizer_id` | `uuid` | Denormalizado |
| `link_source` | `text` | `owner` \| `granted_origin` \| `granted_local` \| `manual_admin` |
| `organizer_player_access_id` | `uuid` nullable | Si viene de Fase 1 |
| `created_at` | `timestamptz` | |

### `riviera_official_player_totals`

| Campo | Tipo |
|-------|------|
| `official_player_key` | `uuid PK` |
| `points_total` | `integer` |
| `last_activity_at` | `timestamptz` |
| `updated_at` | `timestamptz` |

---

## 3. Identidad del jugador sin `global_players`

Hasta implementar Fase 2A, usar **`official_player_key`** como UUID estable:

1. Al **primer** movimiento oficial de un perfil dueño (`organizador_id` = dueño del registro, sin grant como origen), crear `official_player_key` nuevo y fila en `riviera_official_player_identity` con `canonical_riviera_jugador_id = ese id`.
2. Cada `riviera_jugador_id` que deba acumular al mismo deportista → fila en `riviera_official_player_profile_link` con el mismo `official_player_key`.

Función central (futura RPC):

```text
resolve_official_player_key(p_local_jugador_id uuid) → uuid
```

Algoritmo:

1. Si existe link en `riviera_official_player_profile_link` → devolver key.
2. Si existe `organizer_player_access` activo con `local_jugador_id = p` → key del `jugador_id` (origen).
3. Si existe grant con `jugador_id = p` (perfil origen concedido en otro club) → key del origen o crear desde origen.
4. Si es perfil dueño sin grant → crear key nueva (caso jugador nativo del club).
5. Si no se puede resolver con certeza → **no escribir ledger** (fail safe).

---

## 4. ¿Usar jugador origen Fase 1 como `official_player_key` temporal?

**Recomendación: no usar directamente `jugador_id` origen como PK del ledger**, sino un **UUID dedicado** (`official_player_key`) con `canonical_riviera_jugador_id` apuntando al origen.

| Opción | Pros | Contras |
|--------|------|---------|
| `official_player_key = jugador_id origen` | Simple | Si origen se archiva/duplica, ledger acoplado; concedidos sin origen claro |
| **UUID dedicado + canonical** | Reversible, migrable a `global_players.id` | Una tabla puente más |

Migración futura a `global_players`: `official_player_key` se reemplaza o mapea 1:1 a `global_players.id`.

---

## 5. Jugadores concedidos → origen (Aaron en Hack)

```
organizer_player_access
  jugador_id = A (Riviera, dueño)
  local_jugador_id = B (Hack)
  grantee = Hack

riviera_official_player_profile_link
  A → official_player_key K (link_source: owner o granted_origin)
  B → official_player_key K (link_source: granted_local, access_id: opa.id)
```

Participación en Hack con `jugador_id = B`:

1. Ranking interno Hack: `jugador_stats(B)` (+80).
2. Resolver `K = resolve_official_player_key(B)` → mismo K que A.
3. Insert ledger: `official_player_key = K`, `source_local_jugador_id = B`, `participacion_id = …`, `points = 80`.

Aaron acumula **580** en oficial Riviera sin tocar `jugador_stats(A)`.

---

## 6. Caso inverso: jugador de otro club cedido a Riviera

Misma lógica, roles invertidos:

- Origen: perfil en Club X (`jugador_id = X1`).
- Local en Riviera: `local_jugador_id = R1` vía `organizer_player_access` (owner = Club X, grantee = Riviera).

Enlaces:

- `X1 → K`
- `R1 → K`

Liga jugada **en Riviera** escribe participación en `R1`, ledger con `source_organizer_id = Riviera`, puntos suman a **K** (oficial multi-club). Ranking interno Riviera usa `jugador_stats(R1)`. Club X no recibe esos puntos en su ranking interno.

---

## 7. Flags necesarios

### Organizador (`organizador_game_modes` o tabla nueva)

| Flag | Propósito | Default |
|------|-----------|---------|
| `visible_ranking_oficial` | Ya existe: publicar **listado por club** en rivieraopen.com | `false` |
| **`emite_puntos_oficiales_riviera`** (nuevo) | Gate 1: este club puede emitir movimientos al ledger multi-club | `false` |

Separar **visibilidad en sitio** de **emisión de puntos oficiales**. Un club puede emitir puntos sin publicar su ranking de club, o viceversa (decisión de producto).

### Evento (por modalidad)

| Entidad | Flag sugerido |
|---------|----------------|
| `ligas` | `cuenta_ranking_oficial_riviera boolean DEFAULT false` |
| `liga_jornadas` | opcional override; si null, hereda de liga |
| `torneo_express` | `cuenta_ranking_oficial_riviera` |
| `tournaments` (reta) | idem |
| Futuro: `americanos` | idem |

Gate 2: solo eventos con flag `true` alimentan el ledger.

### Jugador / acceso

| Flag | Dónde | Propósito |
|------|-------|-----------|
| `suma_ranking` | `riviera_jugadores` | Ya existe: perfil local acumula ranking interno |
| `visible_publico` | `riviera_jugadores` | Visibilidad en sitio (mostrar, no necesariamente sumar) |
| **`suma_ranking_oficial_riviera`** (nuevo) | `riviera_jugadores` o identity link | Gate 3: este perfil puede alimentar ledger oficial |
| `is_public_ranking` | `organizer_player_access` | Ya existe al conceder; puede mapear a `suma_ranking_oficial_riviera` del clon local |

**Propuesta Gate 3:** el jugador suma al oficial si **cualquiera** es true:

- `suma_ranking_oficial_riviera` en el perfil local, o
- existe link activo a un `official_player_key` cuyo canonical tiene permiso, o
- admin explícito en identity link.

Default conservador: **no sumar** hasta opt-in.

---

## 8. Dónde enganchar la escritura

### Recomendado: RPC dedicado invocado desde app (no trigger ciego en `jugador_participaciones`)

```text
try_write_riviera_official_ledger(p_participacion_id uuid) → jsonb
```

Llamado **después** de `registrar_participacion_jugador` exitoso, desde:

| Punto | Archivo | Motivo |
|-------|---------|--------|
| **Principal** | `syncParticipaciones.ts` → `safeRegistrar` / `upsertParticipacionRanking` | Un solo camino para liga, reta, torneo, americano |
| Secundario | RPC `registrar_participacion_jugador` (SQL) | Solo si se garantiza que **toda** participación pasa por el RPC y no hay inserts directos |

**No recomendado como único mecanismo:** trigger AFTER INSERT en `jugador_participaciones` sin contexto de gates de evento (el trigger no sabe si la liga era oficial sin joins pesados). Mejor: **RPC orquestador** que el cliente llama, o trigger que llama función con resolución completa de gates.

### Flujo propuesto

```
registrarParticipacion(jugadorId local B, …)
  → RPC registrar_participacion_jugador
  → rebuildJugadorStats(B)                    // interno club (igual que hoy)
  → try_write_riviera_official_ledger(participacion_id)
       → lee participación + metadata
       → resuelve evento (liga/torneo) + flags
       → evalúa gates 1-5
       → INSERT ledger ON CONFLICT (participacion_id) DO NOTHING
       → UPSERT riviera_official_player_totals
```

`aplicar_rating_partido`: **sin cambios** para el ledger de puntos.

---

## 9. Evitar doble conteo

| Mecanismo | Descripción |
|-----------|-------------|
| `UNIQUE(participacion_id)` | Una participación local → máximo una fila oficial |
| `ON CONFLICT DO NOTHING` | Re-sync idempotente de jornadas |
| No duplicar fila en `jugador_participaciones` | El ledger referencia la existente |
| Puntos derivados del mismo `puntos_obtenidos` | No recalcular con reglas distintas salvo producto explícito |
| Ajuste manual negativo | **No** escribir al ledger oficial (o escribir 0); puntos oficiales solo suben |

---

## 10. Recalcular y consultar ranking oficial acumulado

### Consulta en tiempo real (auditoría)

```sql
SELECT official_player_key, SUM(points) AS points_total
FROM riviera_official_points_ledger
WHERE counts_for_official_ranking = true
GROUP BY official_player_key;
```

### Producción (rápido)

- `riviera_official_player_totals.points_total` mantenido por trigger/RPC.
- RPC `riviera_ranking_oficial_acumulado(p_categoria, p_genero, p_limit)`:
  - JOIN `canonical_riviera_jugador_id` → `riviera_jugadores` para categoría/género **del perfil canonical** (o regla explícita).
  - ORDER BY `points_total DESC`.
  - Filtro visibilidad pública separado (quién **aparece** vs quién **acumula**).

### Recálculo completo (admin / migración)

```text
admin_rebuild_riviera_official_totals() 
  → TRUNCATE totals + INSERT SELECT SUM FROM ledger
```

No tocar `jugador_stats` de clubes.

---

## 11. Desglose en UI

### Datos

```sql
-- Por club (oficial)
SELECT source_organizer_id, source_club_name, SUM(points)
FROM riviera_official_points_ledger
WHERE official_player_key = :K
GROUP BY source_organizer_id, source_club_name;
```

### Presentación sugerida (ficha / ranking)

```
Ranking oficial Riviera: 580 pts
├── Riviera Open: 500 pts
├── Hack Padel: 80 pts
└── Padelito: 0 pts

Ranking interno Hack (solo en club): 80 pts
```

- **Total oficial** = `riviera_official_player_totals`.
- **Por club** = agregado del ledger (o tabla `riviera_official_points_by_club`).
- **Interno Hack** = `jugador_stats(B)` — etiquetado distinto para no confundir.

---

## 12. Eventos privados no suman

Cadena **AND** (todas true):

1. `organizador_game_modes.emite_puntos_oficiales_riviera = true`
2. `ligas.cuenta_ranking_oficial_riviera = true` (o torneo equivalente)
3. `resolve_official_player_key(local_id)` ≠ null
4. `suma_ranking_oficial_riviera` (o regla de permiso jugador) = true
5. `participacion_id` no existe ya en ledger
6. `puntos_obtenidos >= 0` (clamp; ignorar ajustes manuales negativos)

Club independiente con todos los flags en `false` → solo ranking interno local; ledger no recibe filas.

---

## 13. Rating vs puntos oficiales

| Concepto | Comportamiento |
|----------|----------------|
| **Puntos ranking interno club** | `jugador_stats` del perfil local; sin cambio |
| **Puntos ranking oficial multi-club** | Solo `riviera_official_points_ledger`; nunca negativos |
| **Rating** | `aplicar_rating_partido` sobre perfil local del club anfitrión; sube/baja; **no** se agrega al ledger de puntos |
| **Rating global futuro** | Fuera de alcance de esta capa (Fase 2E opcional) |

Confirmación: **rating y puntos oficiales son sistemas separados**.

---

## 14. Plan por fases

### Fase ROMC-1 — Esquema + identidad puente (sin dual-write)

- Tablas: `riviera_official_player_identity`, `riviera_official_player_profile_link`, `riviera_official_points_ledger`, `riviera_official_player_totals`.
- Flag organizador: `emite_puntos_oficiales_riviera`.
- RPC: `resolve_official_player_key`, `admin_link_official_player_profile` (manual + desde `organizer_player_access`).
- **Sin** escritura automática aún.
- Criterio: links Aaron A↔B resueltos; build OK.

### Fase ROMC-1 — Esquema base ✅ **APROBADO** (pendiente validación en Supabase)

- [x] Script SQL: `supabase/riviera-official-multi-club-romc1.sql`
- [ ] **Tú:** ejecutar en Supabase (staging → producción)
- [ ] **Tú:** checklist manual `docs/ROMC-1-CHECKLIST.md` (7 criterios)
- **Sin** dual-write, sin flags evento/club, sin UI, sin cambios TS

### Fase ROMC-2 — Ledger oficial (emisores + dual-write) ✅ **IMPLEMENTADO**

- [x] Script SQL: `supabase/riviera-official-multi-club-romc2.sql`
- [x] RPC `try_write_riviera_official_ledger`
- [x] Enganche en `syncParticipaciones.ts` post-`registrarParticipacion`
- [ ] **Tú:** validación E2E Aaron/Hack en producción (liga Hack → ledger + totals)
- Gate v1: emisores en `riviera_official_ranking_emitters` (no flag por evento aún)

### Fase ROMC-3 — Consulta ranking acumulado + UI

- RPC `riviera_ranking_oficial_acumulado`.
- UI: total oficial + desglose por club en ficha/ranking público.
- Separar «ranking por club en sitio» vs «ranking acumulado ecosistema».

### Fase ROMC-4 — Backfill opt-in (admin)

- Job que recorre `jugador_participaciones` históricas elegibles y escribe ledger idempotente.
- Solo eventos/clubes con flags; nunca automático al desplegar.

### Fase ROMC-5 — Convergencia con `global_players` (cuando se apruebe Fase 2A)

- `official_player_key` → `global_players.id` o columna `global_player_id` en ledger.
- `player_organizer_profiles` reemplaza o fusiona con `riviera_official_player_profile_link`.

**Orden:** ROMC-1 → ROMC-2 → ROMC-3; ROMC-4 y 2A en paralelo opcional tras validación en torneos reales.

---

## 15. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Doble conteo oficial | `UNIQUE(participacion_id)` + RPC idempotente |
| Perfil local sin link a identidad | Fail safe: no escribir ledger; log admin |
| Concedido mal vinculado | Links explícitos desde `organizer_player_access`; admin repair UI |
| Confundir ranking interno vs oficial en UI | Etiquetas claras; dos números distintos en ficha |
| Club privado suma por error | Gates por defecto `false`; tests por modalidad |
| `getOrCreateJugadorId` sin `resolveJugadorIdForOrganizer` | Resolver key desde `participacion.jugador_id` vía link table, no por nombre |
| Ajuste manual negativo afecta oficial | Excluir `subtipo = ajuste_manual` del ledger |
| Recalcular stats club al tocar ledger | Ledger **no** modifica `jugador_stats` |
| Prematura migración a `global_players` | `official_player_key` dedicado como puente |
| Visibilidad vs acumulación | Flags separados; jugador puede acumular 580 sin aparecer en web |

---

## Relación con documentos existentes

| Documento | Relación |
|-----------|----------|
| `RANKING-OFICIAL-RIVIERAOPEN.md` | Sigue vigente para ranking **por club** en sitio; esta capa añade **acumulado multi-club** |
| `JUGADOR-GLOBAL-FASE-2.md` | Carrera/historial global; ROMC es subset (puntos oficiales) compatible con identidad futura |
| Fase 1 `organizer_player_access` | Fuente de verdad para enlazar perfiles local ↔ origen |

---

## Criterios de aceptación (cuando se implemente)

1. Liga oficial Hack: Aaron +80 interno Hack y +80 oficial (500→580).
2. Liga privada mismo club: solo +80 interno.
3. Re-finalizar jornada: sin duplicar ledger.
4. Perfil Riviera A: `jugador_stats(A)` sin cambio por liga en Hack.
5. Rating Hack en B sube/baja; ledger puntos no negativo.
6. Club sin `emite_puntos_oficiales_riviera`: cero filas ledger.
7. DROP ledger tables: ranking interno por club sigue igual (reversibilidad parcial).

---

*No implementar hasta aprobación explícita del producto.*
