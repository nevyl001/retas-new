# DIAGNÓSTICO MULTI-CLUB — Riviera Open (Fase 1)

**Fecha:** 2026-06-24  
**Alcance:** Auditoría read-only del código y SQL versionado en el repositorio.  
**Estado:** Diagnóstico — **sin implementación**. Esperar aprobación para Fase 2.

---

## Resumen ejecutivo

Riviera Open opera como **ecosistema** con múltiples clubes (organizadores). Cada club tiene perfiles locales en `riviera_jugadores`, ranking interno (`jugador_participaciones` → `jugador_stats`), branding opcional (Club Experience) y, para clubes emisores autorizados, un **ledger oficial multi-club** (ROMC-1/ROMC-2).

El flujo de **otorgar acceso** (Admin Maestro → `organizer_player_access`) está implementado y, según el código, no es el punto de fallo principal.

El problema reportado (“después de que el jugador ya tiene acceso y el club cierra un evento, algo deja de funcionar”) se explica por **desacoples en el pipeline post-cierre**, no por el grant en sí:

| Efecto esperado | Estado en código | Evidencia principal |
|-----------------|------------------|---------------------|
| Historial del club | Parcial / depende del cierre correcto y del `jugador_id` usado | `syncParticipaciones.ts` |
| Ranking interno del club | Parcial — stats no siempre se recalculan | `safeRegistrar` vs `refreshJugadorStatsBatch` |
| Rating global/local | **Funciona** | `aplicar_rating_partido` |
| Historial global Riviera | **ROMC ledger** — solo si identidad oficial + emisor + puntos > 0 | `try_write_riviera_official_ledger` |
| Ranking global Riviera | Ledger/totals ROMC; sitio oficial separado | `riviera_official_player_totals`, RPC sitio oficial |
| Actividad reciente / stats públicas | Dependen de `rebuildJugadorStats` y participaciones visibles | `rebuildJugadorStats.ts`, `historialDisplay.ts` |

**Causa raíz transversal más probable (jugadores concedidos):** el cierre de eventos usa `getOrCreateJugadorId` y, en duelos, IDs almacenados en el evento **sin** pasar por `resolveJugadorIdForOrganizer`. Eso puede escribir historial/rating/ledger en un perfil distinto al que muestra el listado concedido.

---

# 1. Arquitectura actual

## 1.1 Capas del sistema

```
┌─────────────────────────────────────────────────────────────────┐
│  Riviera Open (ecosistema)                                        │
│  - Manifiesto default: riviera-default                            │
│  - Admin Maestro: grants, ROMC admin RPCs (SQL only)              │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Club / Organizador (auth.users.id = organizador_id)              │
│  - riviera_jugadores (perfiles locales)                           │
│  - jugador_participaciones + jugador_stats (ranking interno)      │
│  - Modos: reta, duelo, liga, americano, torneo express            │
│  - Branding premium: Club Experience (manifest + CSS)             │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Multi-club oficial (ROMC) — opcional por club emisor             │
│  - riviera_official_player_identity (official_player_key)         │
│  - riviera_official_player_profile_link                           │
│  - riviera_official_points_ledger + riviera_official_player_totals│
│  - riviera_official_ranking_emitters (quién puede emitir)         │
└─────────────────────────────────────────────────────────────────┘
```

## 1.2 Identidad del jugador (qué existe en código)

| Concepto | ¿Existe? | Qué representa en este repo |
|----------|----------|----------------------------|
| **`riviera_jugadores.id`** | Sí | **Identidad principal operativa** por club. Todo ranking interno, participaciones y rating local apuntan aquí. |
| **`players.id` (legacy)** | Sí | Pool legacy retas/torneos. Enlazado vía `riviera_jugadores.legacy_player_id`. |
| **`liga_jugadores`** | Sí | Pool liga. Enlazado vía `legacy_liga_jugador_id`. |
| **`organizer_player_access`** | Sí | Grant Admin Maestro: comparte jugador origen (`jugador_id`) con otro organizador (`grantee_organizer_id`). Clon lazy: `local_jugador_id`. |
| **`official_player_key`** | Sí (ROMC) | Identidad acumuladora del ranking oficial multi-club. |
| **`canonical_riviera_jugador_id`** | Sí (ROMC) | Perfil canónico en `riviera_official_player_identity`. |
| **`profile_id`** | **No** | No aparece en el código. |
| **`local_player` / `canonical_player`** | **No** (nombres literales) | Equivalentes: `local_jugador_id`, `canonical_riviera_jugador_id`, `pickCanonicalRivieraRow()`. |
| **`global_players` / `global_player_activity`** | **No** (solo docs) | Diseño en `docs/JUGADOR-GLOBAL-FASE-2.md`; **no implementado** en SQL/TS del repo. |

**Regla práctica del código:** cada club opera sobre filas `riviera_jugadores` donde `organizador_id = auth.users.id` del club anfitrión. Los grants añaden una segunda fila local (`local_jugador_id`) o una fila virtual en UI si aún no existe clon.

## 1.3 Club Experience (branding)

| Pieza | Archivo | Rol |
|-------|---------|-----|
| Manifiestos | `src/club-experience/manifests/*.ts` | Colores, logos, copy, assets |
| Binding org → club | `src/club-experience/organizadorClubIndex.ts` | UUID Hack Padel → `hack-padel` |
| Resolver | `src/club-experience/manifestResolver.ts` | `resolveClubManifest(organizadorId)` |
| Provider sesión | `src/club-experience/ClubExperienceContext.tsx` | Tema global `<html>` para usuario logueado |
| Scope público | `ClubExperienceScope` | Tema scoped en vistas públicas sin mutar documento |
| Bootstrap temprano | `public/club-theme-early.js`, `src/club-experience/clubExperienceBootstrap.ts` | Anti-flash antes de React |
| UI marca | `src/club-experience/components/ClubIdentity.tsx` | Logo + atribución |

## 1.4 SQL versionado (orden documentado)

`docs/SQL-ORDEN.md`:

1. `supabase/admin-master-controls.sql`
2. `supabase/organizer-player-access.sql`
3. `supabase/riviera-official-multi-club-romc1.sql`
4. `supabase/riviera-official-multi-club-romc2.sql`

**Nota:** El DDL base de `riviera_jugadores`, `jugador_participaciones`, `jugador_stats` y el cuerpo de `registrar_participacion_jugador` **no están en el repo**; solo grants y RPCs incrementales (`supabase/riviera-jugadores-refresh-stats-grant.sql`).

---

# 2. Flujo completo (resultado → frontend)

## 2.1 Pipeline compartido post-cierre

Todos los modos que sincronizan convergen en:

```
Cierre de evento (UI)
  ↓
Servicio del modo (actualiza tablas del evento)
  ↓
[Rating opcional por partido — ver §2.8]
  ↓
sync*Participaciones (syncParticipaciones.ts)
  ↓
getOrCreateJugadorId (jugadorIdResolver.ts)   ← NO usa resolveJugadorIdForOrganizer
  ↓
registrarPuntosRanking / upsertParticipacionRanking
  ↓
safeRegistrar (insert) o UPDATE directo (upsert)
  ↓
registrarParticipacion → RPC registrar_participacion_jugador
  ↓
jugador_participaciones
  ↓
tryWriteRivieraOfficialLedger → RPC try_write_riviera_official_ledger (best-effort)
  ↓
riviera_official_points_ledger + riviera_official_player_totals (si no skipped)
  ↓
rebuildJugadorStats / refreshJugadorStatsBatch (según ruta — ver §4)
  ↓
jugador_stats
  ↓
Lectura: listInternalClubJugadoresRanking, listParticipacionesPublic, fichas
```

**No hay triggers SQL** en el repo que escriban participaciones o ledger al confirmar resultados. El hook ROMC-2 es **cliente**, después del RPC (`syncParticipaciones.ts` L290–291, L401).

**Errores silenciados:** `safeRegistrar` envuelve todo en `try/catch` y solo hace `console.error` (`syncParticipaciones.ts` L296–298). Un fallo de participación no bloquea la UI de cierre.

---

## 2.2 Retas / Round Robin

```
MatchCardWithResults.finishMatch()
  ↓
database.updateMatch (matches.status = finished)
  ↓
aplicarRatingDesdePairs → RPC aplicar_rating_partido
  ↓
[Torneo no cerrado aún — sin historial Riviera]

TournamentManager.handleFinishTournament()
  ↓
updateTournament(is_finished: true)
  ↓
syncRetaParticipaciones → syncRetaParticipacionesInner
  ↓
getOrCreateJugadorId (por legacy player / nombre)
  ↓
registrarPuntosRanking (subtipo: reta_cierre)
  ↓
refreshJugadorStatsBatch(touchedJugadorIds)
```

| Capa | Archivo / artefacto |
|------|---------------------|
| UI confirmar partido | `src/components/MatchCardWithResults.tsx` |
| UI cerrar reta | `src/components/TournamentManager.tsx` |
| Sync | `src/lib/rivieraJugadores/syncParticipaciones.ts` → `syncRetaParticipaciones` |
| Tablas evento | `tournaments`, `matches`, `games`, `pairs` |
| Tablas jugador | `jugador_participaciones`, `jugador_stats` |
| Rating | `src/lib/rivieraJugadores/aplicarRatingPartido.ts` |

---

## 2.3 Duelo 2 vs 2

```
Duelo2v2ScoreEditor → updateDuelo2v2Score
  ↓
duelos_2v2 (sets, ganador — estado NO finalizado)
  ↓
[Sin sync participaciones]

Duelo2v2Gestionar.handleFinalizar → finalizarDuelo2v2
  ↓
duelos_2v2.estado = finalizado
  ↓
syncDuelo2v2Participaciones
  ↓
Slot usa duelo.pareja_*_j*_id SI existe; si no, getOrCreateJugadorId
  ↓
aplicarRatingDuelo2v2 (usa IDs del duelo directamente)
  ↓
registrarPuntosRanking (subtipo: duelo_2v2_cierre)
  ↓
rebuildJugadorStats por jugador (explícito, L2083)
```

| Capa | Archivo |
|------|---------|
| UI | `src/components/duelo-2v2/Duelo2v2Gestionar.tsx`, `DueloPairBuilder.tsx` |
| Servicio | `src/services/duelo2v2Service.ts` |
| Tabla | `duelos_2v2` |

**Hallazgo duelo + grants:** `DueloPairBuilder` lista jugadores vía `listRivieraJugadores` (puede devolver `jugador_id` **origen** si no hay `local_jugador_id`). Ese UUID se guarda en `duelos_2v2.pareja_*_j*_id`. El sync lo reutiliza tal cual (L2024–2029). Rating también usa esos IDs (`aplicarRatingDuelo2v2`).

---

## 2.4 Liga

```
LigaJornada.saveScore / saveScoreParejasFijas
  ↓
ligaService.updateScore*
  ↓
liga_partidos (completed) + recalcularPuntosLiga → liga_inscripciones.puntos
  ↓
aplicarRatingLigaPartido
  ↓
[Sin historial Riviera hasta finalizar jornada]

LigaJornada.handleFinalizarJornada → finishJornada
  ↓
syncLigaJornada
  ↓
getOrCreateJugadorId (legacy_liga_jugador_id cuando aplica)
  ↓
registrarPuntosRanking (subtipo: liga_jornada)
  ↓
refreshJugadorStatsBatch

LigaGestionar.finishLiga
  ↓
syncLigaFinalPodio (subtipo: liga_podio_final)
  ↓
[Sin refreshJugadorStatsBatch al final de syncLigaFinalPodio]
```

| Capa | Archivo |
|------|---------|
| UI jornada | `src/components/liga/LigaJornada.tsx` |
| UI cierre liga | `src/components/liga/LigaGestionar.tsx` |
| Servicio | `src/services/ligaService.ts` |
| Tablas | `ligas`, `liga_jornadas`, `liga_partidos`, `liga_inscripciones`, `liga_jugadores` |

**Dos rankings de liga:** puntos en `liga_inscripciones` (interno liga) vs puntos Riviera en `jugador_stats` (solo tras `syncLigaJornada`).

---

## 2.5 Americano

```
RoundView.commitRoundScores / nextRound (useAmericanoDinamico)
  ↓
Estado en memoria + storage; rating por partido
  ↓
Fase finished → syncAmericanoParticipaciones
  ↓
getOrCreateJugadorId
  ↓
registrarPuntosRanking (subtipo: americano_cierre)
  ↓
refreshJugadorStatsBatch
```

| Capa | Archivo |
|------|---------|
| UI | `src/components/AmericanoDinamico/RoundView.tsx`, `AmericanoDinamicoScreen.tsx` |
| Hook | `src/hooks/useAmericanoDinamico.tsx` |

---

## 2.6 Torneo Express

```
PartidosGrupo / PartidosEliminatoria → savePartidoResultado / saveEliminatoriaResultado
  ↓
torneo_express_partidos / torneo_express_eliminatoria_partidos
  ↓
aplicarRatingTorneoExpress*Partido
  ↓
[Sin historial hasta cerrar torneo]

GestionGrupos → finalizarTorneoEliminatoria
  ↓
cerrarTorneoEliminatoria (torneo_express cerrado/finalizado)
  ↓
syncTorneoExpressParticipaciones (async void, no bloquea UI)
  ↓
flushTorneoExpressPlayerAgg → getOrCreateJugadorId
  ↓
registrarPuntosRanking (subtipo: express_cierre)
  ↓
[Sin refreshJugadorStatsBatch en flushTorneoExpressPlayerAgg]
```

| Capa | Archivo |
|------|---------|
| UI | `src/components/torneo-express/GestionGrupos.tsx`, `PartidosGrupo.tsx` |
| Servicio | `src/services/torneoExpressService.ts` |

**Gap documentado:** `finalizeTorneoExpress()` existe pero la UI de cierre con sync usa `finalizarTorneoEliminatoria`. Torneos express **solo grupos** sin eliminatoria no tienen ruta de sync encontrada en `src/`.

---

## 2.7 Otorgar acceso (flujo que NO debe rediseñarse)

```
AccountControlsPanel (admin)
  ↓
GrantPlayerAccessModal
  ↓
adminGrantOrganizerPlayerAccess() — organizerPlayerAccess.ts
  ↓
RPC admin_grant_organizer_player_access
  ↓
INSERT/UPDATE organizer_player_access
  (UNIQUE grantee_organizador_id + jugador_id)

Primera operación del club concesionario:
  ↓
resolveJugadorIdForOrganizer / ensureGrantedPlayerLocal
  ↓
RPC ensure_granted_player_local
  ↓
INSERT riviera_jugadores (clon local) + jugador_stats vacío
  ↓
UPDATE organizer_player_access.local_jugador_id
```

| Prevención duplicados (grants) | Mecanismo |
|--------------------------------|-----------|
| Mismo grant | `UNIQUE (grantee_organizador_id, jugador_id)` + RPC cuenta `skipped` |
| Mismo clon local | `ensure_granted_player_local` idempotente si `local_jugador_id` ya existe |

**Listado UI:** `listRivieraJugadores` → `mergeGrantedJugadoresIntoList` (`rivieraJugadoresService.ts` L257–319).

---

## 2.8 Pipeline del rating (funciona)

```
Confirmación de partido / cierre
  ↓
aplicarRatingPartido* (modo específico)
  ↓
RPC aplicar_rating_partido (rating-sistema.sql)
  ↓
rating_historial (UNIQUE jugador_id + partido_ref)
  ↓
UPDATE riviera_jugadores.rating, rating_partidos, rating_fiabilidad
```

**Por qué funciona:** se ejecuta en el momento del partido, usa `partido_ref` idempotente, y en retas resuelve IDs vía `getOrCreateJugadorId` / pares legacy **en el contexto del organizador del evento**. No depende del ledger ROMC ni de `suma_ranking` para aplicar Elo.

**No toca:** `jugador_participaciones`, `jugador_stats.puntos_totales`, ledger oficial.

---

## 2.9 Pipeline del ranking

### Ranking interno del club

| Lectura | Función | RPC / tabla |
|---------|---------|-------------|
| Lista ranking | `listInternalClubJugadoresRanking` | `riviera_ranking_interno_por_organizador` |
| Posición | `getRankingPosicionEnCategoria` | deriva de lista interna |
| Ruta app | `/ranking/o/{organizador_id}` | `JugadoresPublicRanking.tsx` |

Fuente de puntos: `jugador_stats.puntos_totales` ← `rebuildJugadorStats` ← `jugador_participaciones`.

Filtros internos: `estado = activo`; **no** exige `visible_publico` (a diferencia del sitio oficial).

### Ranking oficial sitio web (por club en rivieraopen.com)

| Lectura | Función | RPC |
|---------|---------|-----|
| Ranking público oficial | `listOfficialSiteJugadoresRanking` | `riviera_ranking_sitio_oficial_por_organizador` |

Gates: `visible_publico`, `suma_ranking`, `estado = activo`, `isOrganizadorRankingPublico`.

**En app:** `listOfficialSiteJugadoresRanking` **no está cableado a ninguna página de ranking** (solo usado dentro de `rivieraJugadoresService.ts`). Rutas `/ranking` redirigen a rivieraopen.com (`RankingOfficialOutbound.tsx`).

### Ranking oficial multi-club acumulado (ROMC)

| Escritura | RPC | Condiciones |
|-----------|-----|-------------|
| Ledger | `try_write_riviera_official_ledger` | puntos > 0, tipo válido, emisor autorizado, `official_player_key` resuelto |

Resolución identidad: `_resolve_official_player_key` — link directo o vía `organizer_player_access.local_jugador_id` → source (`romc1.sql` L143–181).

**ROMC-2 no modifica** `jugador_stats` ni rankings internos (comentario en `romc2.sql` L4).

### Historial

| Lectura | Función | Fuente |
|---------|---------|--------|
| Privado | `listParticipaciones` | `jugador_participaciones` |
| Club / público con org | `listParticipacionesPublic` | RPC `riviera_participaciones_interno` |

### Actividad y estadísticas públicas

| Campo / UI | Origen |
|------------|--------|
| `jugador_stats.ultima_actividad` | `rebuildJugadorStats` / `computeJugadorStatsFromParticipaciones` |
| KPIs ficha pública | `computePublicProfileStats(participaciones)` — cliente |
| Lista “recientes” | orden por `ultima_actividad` en `listRivieraJugadores` |

---

# 3. Infraestructura existente

## 3.1 Qué ya existe y funciona (no tocar sin motivo)

- **`organizer_player_access`** + RPCs admin + `ensure_granted_player_local`
- **Rating** (`aplicar_rating_partido` + hooks por modalidad)
- **Cálculo de puntos** (`rivieraRankingPoints.ts`, schema `riviera_open_v1`)
- **Registro de participaciones** vía `registrarParticipacion` → RPC `registrar_participacion_jugador`
- **Ranking interno por club** (RPC + vista app `/ranking/o/{id}`)
- **Club Experience** (manifiestos, tokens CSS, scope público)
- **ROMC-1/ROMC-2 SQL** (identidad + ledger + emisores)
- **Realtime ranking** (`supabase/riviera-ranking-realtime.sql`)

## 3.2 Qué existe pero está incompleto o desacoplado

- **Ledger ROMC-2:** implementado en SQL + hook TS; depende de bootstrap manual de identidades y emisores (sin UI admin ROMC en `src/`)
- **Ranking oficial en app:** función existe; UX redirige fuera
- **`global_player_activity`:** solo en documentación (`JUGADOR-GLOBAL-FASE-2.md`), **no en código**
- **DDL/RPC base** de participaciones: fuera del repo

## 3.3 Qué no debe reemplazarse en Fase 2 (según requisitos del negocio)

- Flujo Admin Maestro de grants
- Tabla `organizer_player_access` como mecanismo de compartición
- Modelo de dos rankings: interno club vs oficial acumulado ROMC

---

# 4. Hallazgos

## H1 — Desacople grant vs sync de participaciones

| | |
|---|---|
| **Causa raíz** | `syncParticipaciones.ts` usa exclusivamente `getOrCreateJugadorId`. **Cero** referencias a `resolveJugadorIdForOrganizer`. El pool legacy (`playerPoolSync.ts`) sí usa resolución de grants. |
| **Evidencia** | `grep resolveJugadorIdForOrganizer syncParticipaciones` → 0. Duelo L2024–2029 usa `slot.jugadorId` del evento. Docs: `docs/RANKING-OFICIAL-MULTI-CLUB.md`. |
| **Impacto** | Jugador concedido puede acumular participaciones/rating en perfil **nativo duplicado** o perfil **origen** (otro org), mientras la UI lista el grant enriquecido. Ranking interno e historial del club no reflejan el evento en el perfil esperado. Ledger ROMC puede fallar (`no_official_identity`) si el `jugador_id` de la participación no enlaza a identidad oficial. |

## H2 — Duelo almacena IDs de jugador sin normalizar al clon local

| | |
|---|---|
| **Causa raíz** | `duelos_2v2.pareja_*_j*_id` acepta el UUID seleccionado en UI; puede ser `jugador_id` fuente del grant. |
| **Evidencia** | `syncDuelo2v2Participaciones` L1980–2029; `DueloPairBuilder` + `listRivieraJugadores` con grants sin `local_jugador_id` (push virtual con `source.id`, `rivieraJugadoresService.ts` L288–315). |
| **Impacto** | Rating y participaciones pueden aplicarse al perfil del club **propietario**, no al club Hack que organiza el duelo. Explica “rating funciona” pero ranking/historial del club anfitrión no. |

## H3 — `safeRegistrar` no recalcula stats en insert; errores silenciados

| | |
|---|---|
| **Causa raíz** | `safeRegistrar` inserta participación + ledger; **no** llama `rebuildJugadorStats`. Solo `upsertParticipacionRanking` en UPDATE llama rebuild (L400). |
| **Evidencia** | `syncParticipaciones.ts` L269–298 vs L400. |
| **Impacto** | Primera participación de un evento depende de `refreshJugadorStatsBatch` al final del sync **o** de visita a ficha que dispara rebuild. Si el batch no corre o falla silenciosamente, `puntos_totales` y `ultima_actividad` quedan desactualizados. |

## H4 — Torneo Express y podio liga sin batch de stats

| | |
|---|---|
| **Causa raíz** | `flushTorneoExpressPlayerAgg` termina sin `refreshJugadorStatsBatch`. `syncLigaFinalPodio` igual. |
| **Evidencia** | `flushTorneoExpressPlayerAgg` L1163–1247; `syncLigaFinalPodio` L1633–1679. |
| **Impacto** | Tras cerrar torneo express o podio de liga, ranking interno puede no reflejar puntos hasta rebuild manual o re-sync. |

## H5 — Ledger ROMC: condiciones de skip

| | |
|---|---|
| **Causa raíz** | `try_write_riviera_official_ledger` retorna `skipped` por: sin puntos, `ajuste_manual`, organizador no emisor, sin `official_player_key`, tipo inválido. |
| **Evidencia** | `romc2.sql` L168–223; hook en `rivieraOfficialLedger.ts`. |
| **Impacto** | Puntos 4–5 del modelo de negocio (historial/ranking **global** Riviera acumulado) no se actualizan aunque el ranking **interno** sí. Típico si falta `admin_create_official_player_identity` + links o emisor no registrado. |

## H6 — `jugadorSumaAlRanking` puede poner puntos en 0

| | |
|---|---|
| **Causa raíz** | Si `suma_ranking = false` o `estado = archivado`, `safeRegistrar` fuerza `puntosObtenidos = 0` pero **sí** inserta participación. |
| **Evidencia** | `syncParticipaciones.ts` L281–285. Grants con `is_public_ranking = false` crean clon con `suma_ranking` false (`ensure_granted_player_local`). |
| **Impacto** | Historial con fila pero sin puntos; ledger skip `no_positive_points`. Coherente con diseño, pero puede percibirse como “no suma al ranking”. |

## H7 — Duplicados visuales en listado de jugadores

| | |
|---|---|
| **Causa raíz** | `mergeGrantedJugadoresIntoList`: si grant **sin** `local_jugador_id`, hace `merged.push(mapped)` con datos del **origen** (`source.id`). Si además existe jugador nativo homónimo, aparecen dos filas. No hay dedup por nombre entre grant virtual y owned. |
| **Evidencia** | `rivieraJugadoresService.ts` L267–315. `getOrCreateJugadorId` crea fila nueva si nombre no coincide exactamente (`ilike` único). |
| **Impacto** | Admin ve duplicados; eventos pueden escribir en tercer perfil creado por nombre. |

## H8 — Flash de branding Riviera → Hack Padel

| | |
|---|---|
| **Causa raíz** | Tema club se aplica en JS **después** del HTML inicial. Aunque existen `club-theme-early.js` y bootstrap, el tema solo se aplica si: cache `ro_club_experience_v1`, sesión Supabase parseable en `localStorage`, o URL `/ranking/o/{uuid}` mapeado en `ORG_BRAND`. Navegador nuevo sin cache: primer paint usa tokens Riviera (`brand-tokens.css` en `:root`). `ClubExperienceProvider` con `!user` llama `resetClubExperienceTheme()` (Riviera). Admin logueado fuerza Riviera global. |
| **Evidencia** | `public/club-theme-early.js`, `clubExperienceBootstrap.ts`, `ClubExperienceContext.tsx` L63–78, `index.css` body transition (mitigado para hack-padel). `ORG_BRAND` solo contiene un UUID hardcodeado. |
| **Impacto** | Flash visual ~ms–100ms; no afecta datos de ranking. |

## H9 — Liga: puntos de jornada en tabla liga sin sync Riviera

| | |
|---|---|
| **Causa raíz** | Completar partidos puede cerrar jornada y actualizar `liga_inscripciones` sin que el organizador pulse “Finalizar jornada”. |
| **Evidencia** | `ligaService.ts` `updateScore` + `recalcularPuntosLiga`; sync solo en `handleFinalizarJornada`. |
| **Impacto** | Ranking liga interno de la competición actualizado; historial/puntos Riviera del jugador **no**. |

## H10 — Historial “global Riviera” distinto del ledger ROMC

| | |
|---|---|
| **Causa raíz** | No existe `global_player_activity` implementado. El “global” en producción hoy es ROMC ledger + sitio oficial por club, no un historial unificado cross-club en app. |
| **Evidencia** | `docs/JUGADOR-GLOBAL-FASE-2.md` (diseño); grep en `src/` y `supabase/` → sin tabla. |
| **Impacto** | Expectativa “punto 4 del modelo de negocio” no tiene implementación única equivalente a participaciones locales agregadas. |

---

# 5. Riesgos

| Módulo | Riesgo si se cambia sin cuidado |
|--------|----------------------------------|
| `getOrCreateJugadorId` / `jugadorIdResolver.ts` | Romper retas/ligas legacy sin `legacy_player_id` |
| `syncParticipaciones.ts` | Punto único de escritura; regresiones en todas las modalidades |
| `organizer_player_access` RLS | Filtrar lectura cross-org; grants dejan de enriquecer UI |
| `try_write_riviera_official_ledger` | Doble conteo si se duplica hook además del cliente |
| `aplicar_rating_partido` | Único pipeline estable; no mezclar con puntos de ranking |
| `mergeGrantedJugadoresIntoList` | Cambios afectan listado, ranking display y badges “Concedido” |
| Club Experience bootstrap | Regresión FOUC o tema incorrecto en Riviera default |
| RPCs no versionados en repo | `registrar_participacion_jugador`, `refresh_jugador_stats` — cambios solo en Supabase sin migración en git |

---

# 6. Recomendaciones (descripción only — NO implementar)

> Propuestas mínimas para Fase 2, sujetas a aprobación. Sin código aquí.

### R1 — Unificar resolución de ID en cierre de eventos
Hacer que `syncParticipaciones` (y guardado de duelo) usen `resolveJugadorIdForOrganizer(organizadorId, jugadorIdOrSource)` antes de `getOrCreateJugadorId`, de modo que participaciones/rating/ledger apunten al **clon local** del grant.

### R2 — Normalizar IDs al crear/editar duelo
Al guardar parejas en `duelos_2v2`, persistir siempre el `local_jugador_id` resuelto para el `organizador_id` del duelo.

### R3 — Garantizar rebuild de stats tras todo sync
Añadir `refreshJugadorStatsBatch` al final de `flushTorneoExpressPlayerAgg`, `syncLigaFinalPodio`, y considerar llamada en `safeRegistrar` tras insert (o trigger SQL en `registrar_participacion_jugador` si existe en BD).

### R4 — ROMC operativo
Checklist E2E documentado: emisor en `riviera_official_ranking_emitters`, identidad + links para jugadores que deben acumular oficial, verificar `try_write_riviera_official_ledger` ≠ `skipped`. Opcional: UI admin para ROMC (hoy SQL-only).

### R5 — Duplicados en listado
Al merge de grants sin `local_jugador_id`, no pushear fila virtual si ya existe owned con mismo `jugador_id` origen vinculado; o forzar `ensure_granted_player_local` al seleccionar jugador en torneo.

### R6 — Branding
Mantener early script; extender `ORG_BRAND` desde fuente única compartida con `organizadorClubIndex.ts` (build step o JSON en `public/`) para no duplicar UUIDs.

### R7 — Aclarar producto “historial global”
Decidir si el punto 4 del negocio es **ROMC ledger** (ya existe) o **global_player_activity** (solo diseño). No implementar ambos en paralelo sin decisión.

---

## Apéndice A — Tabla de modalidades (referencia rápida)

| Modalidad | Trigger historial Riviera | Sync function | Stats batch |
|-----------|---------------------------|---------------|-------------|
| Reta RR | Cerrar torneo | `syncRetaParticipaciones` | Sí |
| Duelo 2v2 | Finalizar duelo | `syncDuelo2v2Participaciones` | Per-player rebuild |
| Liga jornada | Finalizar jornada | `syncLigaJornada` | Sí |
| Liga podio | Cerrar liga | `syncLigaFinalPodio` | **No** |
| Americano | Sesión finished | `syncAmericanoParticipaciones` | Sí |
| Torneo Express | Finalizar eliminatoria | `syncTorneoExpressParticipaciones` | **No** en flush |

## Apéndice B — Archivos clave

| Área | Rutas |
|------|-------|
| Sync central | `src/lib/rivieraJugadores/syncParticipaciones.ts` |
| ID resolver | `src/lib/rivieraJugadores/jugadorIdResolver.ts` |
| Grants | `src/lib/rivieraJugadores/organizerPlayerAccess.ts`, `supabase/organizer-player-access.sql` |
| Ledger | `src/lib/rivieraJugadores/rivieraOfficialLedger.ts`, `supabase/riviera-official-multi-club-romc2.sql` |
| Identidad ROMC | `supabase/riviera-official-multi-club-romc1.sql` |
| Rating | `supabase/rating-sistema.sql`, `src/lib/rivieraJugadores/aplicarRatingPartido.ts` |
| Ranking read | `src/lib/rivieraJugadores/rivieraJugadoresService.ts` |
| Stats | `src/lib/rivieraJugadores/rebuildJugadorStats.ts` |
| Admin grants UI | `src/components/admin/AccountControlsPanel.tsx`, `GrantPlayerAccessModal.tsx` |
| Branding | `src/club-experience/`, `public/club-theme-early.js` |

---

**Fin del diagnóstico Fase 1.**  
Esperando autorización explícita para Fase 2 (implementación).
