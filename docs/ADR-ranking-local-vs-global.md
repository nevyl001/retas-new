# ADR — Ranking local (por club) vs ranking global Riviera Open (ROMC)

**Estado:** Aprobado como arquitectura de referencia (documentación).  
**Última actualización:** 2026-07-07  
**Relacionado:** `docs/RANKING-OFICIAL-MULTI-CLUB.md`, `docs/ARCHITECTURE-PLAYER-IDENTITY.md`, `docs/JUGADOR-GLOBAL-FASE-2.md`

---

## Contexto

Este proyecto **ya tiene** un sistema de ranking oficial multi-club (**ROMC**) implementado a nivel de base de datos y cableado parcialmente en TypeScript. Este ADR **no** diseña un sistema paralelo. Documenta las **dos dimensiones** que ya existen, por qué fallan hoy, y las reglas de fuente de verdad.

| Dimensión | Tablas / campos | Pregunta que responde |
|-----------|-----------------|------------------------|
| **LOCAL** | `jugador_participaciones` + `metadata.organizador_id`, `jugador_stats` | ¿En qué club se jugó? ¿Cuántos puntos locales tiene este perfil en ese club? |
| **GLOBAL (ROMC)** | `riviera_official_points_ledger`, `riviera_official_player_totals`, identidad vía `riviera_official_player_identity` / `riviera_official_player_profile_link`, emisores en `riviera_official_ranking_emitters` | ¿Cuánto suma al **Ranking Global Riviera Open**? |

Ambas dimensiones se escriben desde el **mismo cierre de evento** (`finalizeCareerEvent` → `safeRegistrar` → `registrarParticipacion` + `tryWriteRivieraOfficialLedger`), pero son **independientes**: un fallo en el ledger global **no** debe bloquear la participación local.

**Prohibido explícitamente:**

- No mezclar club local, ranking global, perfil home, organizador del evento y overrides administrativos en el mismo campo o cálculo.
- No crear un `ranking_global_id` nuevo tipo string libre. El «Riviera Open» global es el **mismo ecosistema completo** (no un organizador más en `riviera_official_ranking_emitters`). Representarlo como ausencia de `organizador_id` en el contexto global, o como constante de producto documentada — nunca confundirlo con un club adicional.
- No inventar `metadata_participacion_v2` ni `puntos_globales_riviera` en `jugador_participaciones`. El ledger global **ya existe**: `riviera_official_points_ledger`.

---

## PASO 1 — Auditoría de estado real (desde el repositorio)

> **Limitación:** Los ítems marcados «no verificable desde el repo» requieren consulta directa en Supabase (staging/prod). No se inventan cifras.

### 1.1 ¿Migraciones `romc1.sql` y `romc2.sql` aplicadas?

| Artefacto | En repo | Aplicación en Supabase |
|-----------|---------|------------------------|
| `supabase/riviera-official-multi-club-romc1.sql` | Tablas: `riviera_official_player_identity`, `riviera_official_player_profile_link`, `riviera_official_points_ledger`, `riviera_official_player_totals`; RPC `_resolve_official_player_key`; `admin_create_official_player_identity_from_jugador` | **No verificable desde el repo.** `docs/ROMC-1-CHECKLIST.md` indica «pendiente ejecución y pruebas en Supabase». |
| `supabase/riviera-official-multi-club-romc2.sql` | Tabla `riviera_official_ranking_emitters`; `_is_official_ranking_emitter`; `try_write_riviera_official_ledger` | **No verificable desde el repo.** ROMC-2 marcado implementado en código + SQL; validación E2E Aaron/Hack pendiente en producción. |

**Consultas para confirmar en SQL Editor:**

```sql
SELECT to_regclass('public.riviera_official_player_identity') IS NOT NULL AS romc1_identity;
SELECT to_regclass('public.riviera_official_points_ledger') IS NOT NULL AS romc1_ledger;
SELECT proname FROM pg_proc
WHERE proname IN ('try_write_riviera_official_ledger', '_is_official_ranking_emitter');
```

### 1.2 Organizadores con `riviera_official_ranking_emitters.is_active = false`

**Comportamiento en código** (`romc2.sql`, función `_is_official_ranking_emitter`):

- Si el `organizador_id` existe en `public.users` **y** no hay fila con `is_active = false` en `riviera_official_ranking_emitters` → **emite** (default: todos emiten).
- Solo una fila explícita con `is_active = false` **bloquea** un club.

**Conteo en prod:** no verificable desde el repo. Consulta:

```sql
SELECT count(*) FROM public.riviera_official_ranking_emitters WHERE is_active = false;
```

### 1.3 Jugadores con identidad oficial (`official_player_key`)

- Alta manual vía `admin_create_official_player_identity_from_jugador` (definida en `romc1.sql`; delegación en `riviera-career-identity-2.0.2a-integration.sql`).
- **No hay** en el repo evidencia de alta automática al resolver Riviera ID en el cierre de evento.
- **Conclusión documental:** hoy el alta al ranking global ROMC **no es automática** por Riviera ID; requiere acción admin (o scripts de identidad 2.0.x si están desplegados).

**Conteo en prod:** no verificable desde el repo.

```sql
SELECT count(*) FROM public.riviera_official_player_identity;
SELECT count(*) FROM public.riviera_official_player_profile_link;
```

### 1.4 ¿La app lee `riviera_official_player_totals` o `riviera_official_points_ledger`?

**Búsqueda en `src/components/`:**

- No hay componente que consulte directamente esas tablas.
- `RankingPodio.tsx` acepta el campo derivado `officialPuntosGlobal` en el objeto jugador (poblado en capa de servicio, no desde ledger en UI).
- La lectura del ledger vive en **`src/lib/rivieraJugadores/rivieraOfficialActivity.ts`** (RPCs `list_riviera_official_player_activity`, `list_riviera_official_cross_club_activity`, `riviera_official_display_puntos_for_jugador`, etc.) — **no** en componentes de ficha/historial público principal.

**Conclusión:** el ledger **se escribe** (`tryWriteRivieraOfficialLedger` desde `syncParticipaciones.ts`) pero **no hay pantalla dedicada de ranking global ROMC** en componentes; el desglose multiclub en ficha usa suma de participaciones locales (`careerPointsByClub`), no `riviera_official_player_totals` como fuente única.

### 1.5 ¿`tryWriteRivieraOfficialLedger()` inserta o se salta?

**Motivos `skipped` en `try_write_riviera_official_ledger`** (`romc2.sql`):

| `reason` | Significado |
|----------|-------------|
| `null_participacion_id` | ID nulo |
| `participacion_not_found` | Sin fila en `jugador_participaciones` |
| `ajuste_manual` | `metadata.subtipo = ajuste_manual` |
| `invalid_event_type` | Tipo no en lista permitida |
| `no_positive_points` | `puntos_obtenidos <= 0` |
| `missing_local_organizador_id` | Sin `metadata.organizador_id` en la participación (post-fix 2026-07-07) |
| `organizer_not_authorized` | Emisor bloqueado (`is_active = false`) |
| `no_official_identity` | `_resolve_official_player_key` devolvió null |

Otros: `inserted`, `already_exists` (idempotente).

**Hipótesis principal (no medida en prod desde repo):** la mayoría de participaciones nuevas quedan en `skipped` con `no_official_identity` porque no existe `official_player_key` / `profile_link` — independiente de si `metadata.organizador_id` local es correcto.

### 1.6 Resueltos en Sprint 1 (2026-07-07) y deuda pendiente

| Ítem | Estado | Referencia |
|------|--------|------------|
| Fallback a home en `resolveParticipacionOrganizadorId()` | **Resuelto** | `participacionesOrganizadorScope.ts` — retorna `null` + `console.warn` si falta metadata |
| Pipeline sin revisar `result.ok` (reta, americano, duelo, liga, torneo) | **Resuelto** | `TournamentManager.tsx`, `useAmericanoDinamico.tsx`, `duelo2v2Service.ts`, `ligaService.ts`, `torneoExpressService.ts` |
| Ledger ROMC usa perfil home como `source_organizer_id` | **Resuelto** (SQL) | `supabase/riviera-official-ledger-fix-source-organizador.sql` |
| Return temprano en `finalizarDuelo2v2` sin tipo nuevo (build roto post-Sprint 1) | **Resuelto** | `duelo2v2Service.ts` — `return { duelo, careerSyncOk: true }` si ya finalizado |

**Validación Sprint 1:** además de `npm run test:ci`, incluir `npx tsc --noEmit -p tsconfig.json` y `npm run build` — Jest no type-checka imports no ejecutados en el árbol completo.

**Deuda técnica pendiente (post Sprint 2.1):**

| Archivo | Hallazgo |
|---------|----------|
| `src/lib/rivieraJugadores/careerParticipacionesMerge.ts` **L61** | `enrichParticipacionesOrganizadorFromEvents()` infiere org en lectura |
| RPCs SQL | Inyección de `organizador_id` desde duelo/torneo en lectura si falta metadata |

**Resuelto en Sprint 2 Parte C + Sprint 2.1 cierre real (2026-07-07):**

| Ítem | Estado | Referencia |
|------|--------|------------|
| `officialPuntosGlobal` con 6+ escritores y semánticas distintas | **Resuelto** | `resolveOfficialGlobalPuntos()` en `rivieraOfficialActivity.ts`; escritores migrados |
| RPC `riviera_official_display_puntos_for_jugador` sin DDL en repo | **Resuelto** (SQL; **pendiente ejecutar en Supabase**) | `supabase/riviera-official-display-puntos-for-jugador.sql` |
| Fallback silencioso a suma local en consumidores globales (TS) | **Resuelto** | `rankingPosition.ts`, `grantedRankingDisplay.ts`, `jugadorPuntosBreakdown.ts` |
| `loadRomcOfficialPlayerView` sumaba participaciones como global | **Resuelto** | `rivieraOfficialActivity.ts` |
| Ficha pública mezclaba `career.total` local como puntos “globales” | **Resuelto (2.1)** | `playerPointsBreakdown.ts` (`careerTotalAllClubs` + `officialGlobalPoints`); `JugadorPublicFicha.tsx` + `JugadorOfficialRomcPuntos.tsx` |
| Vista SQL `COALESCE(RPC, jugador_stats)` en ranking sitio oficial | **Resuelto** (SQL; **pendiente ejecutar en Supabase**) | `supabase/riviera-official-site-ranking-fix-nulls.sql` |
| `mapSitioOficialRow` fallback local cuando ROMC null | **Resuelto (2.1)** | `rivieraJugadoresService.ts` |
| Posición # ranking global sin identidad oficial | **Resuelto (2.1)** | `resolveRankingPosicionForPublicFicha` + SQL `riviera_ranking_posicion_sitio_oficial_global` |

**Decisión de diseño ficha (Sprint 2.1):** dos números con nombre distinto:
1. **Total carrera** — `careerTotalAllClubs` (suma local en todos los clubes); siempre visible con ese nombre.
2. **Ranking Oficial Riviera Open** — `officialGlobalPoints` / `resolveOfficialGlobalPuntos()`; `null` → texto «Aún no tiene ranking oficial Riviera Open»; `0` del ledger → «0 pts» (dato real).

**Nota:** `supabase/diagnose-participaciones-organizador-huerfanas.sql` referenciado en brief **no está** en el repo. Usar `supabase/diagnose-career-event-host-organizer.sql`.

---

## Por qué falla hoy (explicación causal)

### (a) LOCAL — atribución de club incorrecta o inferida

Antes del endurecimiento de carrera, cuando faltaba `metadata.organizador_id`, el sistema podía atribuir participaciones al club de origen del perfil (`jugadorHomeOrganizadorId`), apilando puntos en el club donde el jugador se registró aunque hubiera jugado en otro.

**Escritura al cierre:** `hostClubMetadata(organizadorId)` en `syncParticipaciones.ts` escribe `metadata.organizador_id` + `club_name` para las 7 modalidades del pipeline — **correcto para eventos nuevos**.

**Contaminación histórica:** repairs SQL (p. ej. `repair-career-event-host-from-manual-overrides.sql` del 2026-07-06) pueden sobrescribir metadata con overrides no confiables cuando el evento padre fue eliminado.

**Regla objetivo:** si falta metadata y no hay evento padre ni override aprobado → participación **huérfana** (excluir del desglose por club), **nunca** adivinar desde perfil home.

### (b) GLOBAL — ledger ausente aunque el evento cerró bien

Incluso con `metadata.organizador_id` correcto, `tryWriteRivieraOfficialLedger()` → `try_write_riviera_official_ledger` solo inserta si:

1. Puntos > 0 y tipo válido.
2. Club emisor activo (`_is_official_ranking_emitter`).
3. `_resolve_official_player_key(jugador_id)` ≠ null.

Si el jugador no tiene `riviera_official_player_profile_link` / identidad creada (p. ej. nadie ejecutó `admin_create_official_player_identity_from_jugador`), el RPC devuelve `skipped` / `no_official_identity`. La participación local queda; el ranking global no suma.

### (c) Síntoma combinado

«Puntos locales mal atribuidos» (a, parcialmente corregido en diseño + repairs pendientes) y «ranking global incompleto» (b, abierto hasta PASO 2) son **dos fallas distintas** con causas raíz distintas. No presentarlas como un solo bug de campos.

---

## PASO 2 — Decisión de producto

### DECISIÓN PENDIENTE — requiere confirmación de producto

**¿El alta a `official_player_key` pasa a ser AUTOMÁTICA** en el momento en que se resuelve el Riviera ID (alineado con «Identidad global primero, nunca org-first» en `player-identity-architecture.mdc`), eliminando el paso manual `admin_create_official_player_identity_from_jugador`?

**Si se automatiza:** ¿qué pasa con participaciones históricas cuyo ledger quedó `skipped` por `no_official_identity`?

- Opción A: backfill retroactivo (`try_write_riviera_official_ledger` por cada `participacion_id` existente).
- Opción B: solo hacia adelante desde la fecha de automatización.

**No resuelto en este ADR.** Marcar en planning de implementación.

---

## PASO 2.5 — Estrategia de backfill (diseño, **no ejecutado**)

> Pendiente de sesión de implementación aparte. Este ADR solo fija el diseño.

Objetivo: usar las **mismas filas** existentes en `jugador_participaciones` — no reinventar el almacenamiento.

### Corrección dimensión LOCAL (`metadata.organizador_id`)

**Orden de fuentes al reparar** (igual que PASO 2.6):

1. **Evento padre en vivo** — máxima autoridad:
   - `duelo_2v2.organizador_id` / `torneo_express.organizador_id` vía `evento_id`.
   - Reta/americano: `tournaments.user_id`.
   - Liga: `ligas.organizador_id` (vía `liga_jornadas` o `ligas` según `evento_id`).
   - Función existente: `riviera_participacion_expected_host_org` (`repair-career-event-host-organizer.sql`).
2. **Override manual aprobado** — solo si (1) no existe: `career_event_host_manual_overrides` (`approved_by`, `reason`).
3. **Nunca** perfil del jugador (`riviera_jugadores.organizador_id`).

Para huérfanas de `duelo_2v2` / `torneo_express`: el padre suele seguir existiendo aunque falte metadata — recuperables con JOIN (ver `diagnose-career-event-host-organizer.sql`).

Para reta/americano/liga sin padre eliminado: misma función de host esperado.

Si no hay padre ni override verificable: marcar fila como **sin fuente confiable de club local** (huérfana documentada) — preferible a asignar a ciegas.

**Prohibido en backfill:** usar `career_event_host_manual_overrides` del 2026-07-06 como fuente automática sin revisión humana; usar perfil home; usar «el club donde más juega».

### Completar dimensión GLOBAL (ledger)

Una vez el jugador tenga `official_player_key` (según decisión PASO 2):

```text
FOR cada participacion_id del jugador (elegible, puntos > 0, no ajuste_manual):
  SELECT try_write_riviera_official_ledger(participacion_id);
```

Idempotente (`already_exists` si ya estaba). No modifica `jugador_participaciones`.

---

## PASO 2.6 — Fuente de verdad del club LOCAL (jerarquía de precedencia)

**Pregunta única:** ¿cuál es el club LOCAL correcto de esta participación?

`riviera_official_points_ledger` **NO** participa en esta jerarquía. Responde «¿cuánto suma al ranking global?», no «¿cuál es el club local?».

### Orden de precedencia (obligatorio)

```text
evento padre en vivo
  > override manual aprobado (solo si padre eliminado)
  > metadata cacheada (metadata.organizador_id / club_name, si no discrepa con las anteriores)
  > [huérfana — sin club asignado]
```

**El perfil del jugador (`riviera_jugadores.organizador_id` / home) NUNCA gana.** Cero autoridad sobre el club local de una participación específica.

Comportamiento ya reflejado en reparación: `repair-career-event-host-organizer.sql` sobrescribe metadata con el host del evento padre cuando difieren — **nunca al revés**.

### Inmutabilidad vs mutabilidad

| Dato | Tratamiento |
|------|-------------|
| Evento padre en vivo (mientras exista) | Fuente de verdad para club local |
| `career_event_host_manual_overrides` aprobados | Fuente cuando padre eliminado; solo se corrige con **nuevo** override aprobado |
| `metadata.organizador_id` / `metadata.club_name` | **Cache derivado** — puede repararse |
| Perfil home del jugador | **Nunca** fuente para club de participación |

### Regla de lectura única

> Queda prohibido que distintas pantallas o funciones usen fuentes distintas para responder la pregunta «¿en qué club local se jugó esta participación?». Toda lectura debe pasar por `resolveParticipacionOrganizadorId()` (o su sucesor documentado en este ADR) — nunca leer `metadata.organizador_id` directo en un componente ni reconstruir el club con lógica propia.

Excepción temporal documentada: RPCs SQL y `enrichParticipacionesOrganizadorFromEvents` — **deuda técnica** a eliminar en favor de metadata reparada + resolver único.

---

## Modelo de dos dimensiones (mapeo a lo existente)

### 1. Dimensión LOCAL — club donde se jugó

| Aspecto | Implementación actual |
|---------|----------------------|
| Escritura | `hostClubMetadata(organizadorId)` en `syncParticipaciones.ts` → `metadata.organizador_id`, `club_name` |
| Persistencia | `jugador_participaciones` + `jugador_stats` del perfil local |
| Lectura canónica | `resolveParticipacionOrganizadorId()` en `participacionesOrganizadorScope.ts` |
| Desglose multiclub UI | `computeCareerPointsByClubFromParticipaciones()` en `careerPointsByClub.ts` |
| Regla | Sin metadata ni fuente de precedencia → huérfana; **no** fallback a home |

### 2. Dimensión GLOBAL — Ranking Oficial Riviera Open (ROMC)

| Aspecto | Implementación actual |
|---------|----------------------|
| Ledger | `riviera_official_points_ledger` (append-only, `UNIQUE(participacion_id)`) |
| Totales | `riviera_official_player_totals.points_total` |
| Identidad | `official_player_key` vía `riviera_official_player_identity` + `riviera_official_player_profile_link` |
| Emisores | `riviera_official_ranking_emitters` — default todos emiten; `is_active=false` excluye |
| Escritura | `safeRegistrar()` → `tryWriteRivieraOfficialLedger()` → `try_write_riviera_official_ledger` |
| Ecosistema global | No es un `organizador_id` más; es el acumulado oficial de todo el ecosistema Riviera Open |

### 3. Regla de correspondencia

Una misma participación **siempre** debe:

1. Escribir fila local en `jugador_participaciones` con `metadata.organizador_id` (club donde se jugó).
2. **Intentar** escribir en `riviera_official_points_ledger` si el club es emisor activo **y** el jugador tiene `official_player_key`.

Si (2) falla u omite (`skipped`), **no** bloquea ni revierte (1).

### 4. Contrato de lectura para UI (documentar forma; **no implementar** en esta tarea)

| Vista | Fuente |
|-------|--------|
| Historial jugador | Filas `jugador_participaciones`; club local vía `resolveParticipacionOrganizadorId()` → nombre; booleano «cuenta para Ranking Global» = existe fila en ledger con ese `participacion_id` |
| Ficha jugador | Desglose por club: `computeCareerPointsByClubFromParticipaciones`; total **Riviera Open Global**: `riviera_official_player_totals` (por `official_player_key`), **no** suma manual de clubes locales |
| Ranking de un club | `jugador_stats` + participaciones locales filtradas por org — sin cambio |
| Ranking global Riviera | `riviera_official_player_totals` ordenado por `points_total` |

---

## Referencias de código

| Artefacto | Ruta |
|-----------|------|
| Pipeline cierre | `src/lib/rivieraJugadores/careerEventPipeline/pipeline.ts` |
| Sync + metadata local | `src/lib/rivieraJugadores/syncParticipaciones.ts` |
| Ledger ROMC | `src/lib/rivieraJugadores/rivieraOfficialLedger.ts` |
| ROMC SQL 1 | `supabase/riviera-official-multi-club-romc1.sql` |
| ROMC SQL 2 | `supabase/riviera-official-multi-club-romc2.sql` |
| Repair host local | `supabase/repair-career-event-host-organizer.sql` |
| Overrides manuales | `supabase/career-event-host-manual-overrides.sql` |
| Diseño ROMC original | `docs/RANKING-OFICIAL-MULTI-CLUB.md` |

---

## Historial de cambios

| Fecha | Cambio |
|-------|--------|
| 2026-07-07 | ADR inicial: auditoría repo, dos dimensiones LOCAL/ROMC, jerarquía precedencia, backfill diseño, decisiones pendientes PASO 2 |
| 2026-07-07 | Sprint 1 Parte A+B: fix `resolveParticipacionOrganizadorId`, pipeline `result.ok`, migración `riviera-official-ledger-fix-source-organizador.sql` |
| 2026-07-07 | Post-Sprint 1: fix build TS2739 en `finalizarDuelo2v2`; validación ampliada con `tsc --noEmit` + `npm run build` |
| 2026-07-07 | Sprint 2 Parte C: `resolveOfficialGlobalPuntos`, RPC `riviera-official-display-puntos-for-jugador.sql`, unificación escritores `officialPuntosGlobal` |
| 2026-07-07 | Sprint 2.1: ficha con Total carrera + Ranking Oficial separados; `riviera-official-site-ranking-fix-nulls.sql` |
