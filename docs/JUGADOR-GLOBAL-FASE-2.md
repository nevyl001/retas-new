# Jugador global, perfiles locales y rankings — Diagnóstico y roadmap Fase 2

**Estado:** 🔒 **CONGELADO** — solo referencia de diseño. **No implementar** Fase 2A ni 2B sin aprobación explícita del producto.  
**Fase 1:** ✅ **Cerrada y estable** (`supabase/organizer-player-access.sql` + extensiones de ranking/UI concedidos).  
**Última actualización:** 2026-06-24  
**Relacionado:** `supabase/organizer-player-access.sql` (Fase 1), `docs/RANKING-OFICIAL-RIVIERAOPEN.md`, `docs/RANKING-OFICIAL-MULTI-CLUB.md`

### Regla de gobernanza (vigente)

Antes de **cualquier** cambio en arquitectura de jugadores (tablas, RPCs, dual-write, identidad global, carrera deportiva):

1. Entregar **diagnóstico + plan** (sin implementar).
2. Esperar **aprobación explícita**.
3. No avanzar automáticamente a la siguiente fase aunque esté documentada aquí.

Durante el uso en torneos reales se prioriza detectar necesidades funcionales; la visión de carrera deportiva se define antes de retomar Fase 2.

---

## 1. Regla de producto (no negociable)

Un jugador **cedido / con acceso concedido** no es un «jugador de segunda». Es el **mismo deportista** con:

- **Una sola identidad / carrera deportiva global** que acumula todo su historial.
- **Uno o más perfiles locales por organizador** que acumulan solo lo jugado en ese club.
- **Rankings internos independientes** por club (propios + concedidos que compiten ahí).
- **Ranking oficial Riviera Open / sitio web** gobernado por visibilidad explícita, no automática.

Al ceder un jugador **no** debe:

- perder su historial en Riviera Open;
- empezar desde cero en su carrera global;
- mezclarse el ranking de Hack Pádel con el de Riviera Open;
- aparecer automáticamente en todos los rankings oficiales sin permiso.

---

## 2. Modelo conceptual (tres capas)

```
┌─────────────────────────────────────────────────────────────┐
│  CAPA GLOBAL — Carrera deportiva / identidad única          │
│  Acumula: historial, puntos globales, rating global (opt.)  │
└───────────────────────────┬─────────────────────────────────┘
                            │ 1:N
┌───────────────────────────▼─────────────────────────────────┐
│  CAPA LOCAL — Perfil por organizador (riviera_jugadores)      │
│  Acumula: partidos, puntos y rating SOLO en ese club          │
└───────────────────────────┬─────────────────────────────────┘
                            │ alimenta
┌───────────────────────────▼─────────────────────────────────┐
│  CAPA RANKING — Vista competitiva por club / sitio oficial    │
│  Interno club → stats locales │ Oficial → flags de visibilidad│
└─────────────────────────────────────────────────────────────┘
```

| Capa | Qué es | Qué acumula | Qué NO hace |
|------|--------|-------------|-------------|
| **Global / carrera** | Identidad deportiva única del jugador | Todo el historial, totales de carrera, eventos de todos los clubes | No sustituye el ranking interno de cada club |
| **Perfil local** | Fila `riviera_jugadores` bajo un `organizador_id` | Partidos, `jugador_stats`, rating jugados **en ese club** | No borra ni reemplaza el perfil del club origen |
| **Ranking interno** | Orden competitivo del club | Puntos del perfil local de ese club | No mezcla puntos de otros clubes en el orden |
| **Ranking oficial** | Sitio público Riviera Open | Solo jugadores con visibilidad aprobada | No incluye a todos los concedidos por defecto |

---

## 3. Ejemplo de referencia: Aaron Duran

### Estado inicial (Riviera Open)

| Atributo | Valor |
|----------|-------|
| Historial | 30 partidos |
| Puntos ranking Riviera | 500 |
| Rating | 1450 |
| Perfil | `riviera_jugadores` con `organizador_id = Riviera Open` |

### Acción: Admin Principal concede acceso a Hack Pádel

Aaron **conserva** su historial Riviera. Se crea (o se prepara) un vínculo operativo; en Fase 1 el perfil local de Hack puede existir con stats en cero hasta que juegue allí.

### Aaron juega una liga en Hack Pádel

#### A) Perfil global / Carrera deportiva

Debe mostrar **todo junto**:

- historial Riviera Open (30 partidos previos);
- nueva liga en Hack Pádel;
- puntos obtenidos en Hack Pádel;
- rating / eventos correspondientes;
- **totales acumulados de carrera** (partidos, puntos globales, etc.).

#### B) Ranking interno Hack Pádel

- Aaron **aparece** en el ranking Hack Pádel.
- Compite con los **puntos ganados en Hack Pádel** (perfil local Hack).
- Puede mostrarse también su referencia de origen (ej. «Riviera Open: 500 pts») como **información**, sin que esos puntos ordenen el ranking Hack.

#### C) Ranking interno Riviera Open

- **No se mezcla** con Hack Pádel.
- Riviera conserva su ranking local (500 pts de Aaron en Riviera).
- Los puntos de la liga Hack **no** suben el ranking interno de Riviera.

#### D) Ranking oficial público Riviera

- Aaron aparece **solo si** la configuración lo permite:
  - `visible_publico` en su perfil Riviera;
  - `visible_ranking_oficial` del organizador / modo de juego;
  - `is_public_ranking` en el acceso concedido (cuando aplica al perfil local creado en destino);
  - reglas del RPC `riviera_ranking_sitio_oficial_por_organizador` y vista sitio oficial.

**No** aparece en el ranking oficial solo por estar concedido a Hack Pádel.

---

## 4. Qué hace Fase 1 hoy (y por qué es correcto como puente)

Fase 1 (`organizer_player_access`) implementa **acceso operativo seguro**, no identidad global.

### Implementado

| Pieza | Comportamiento |
|-------|----------------|
| `organizer_player_access` | Vincula jugador origen (`jugador_id`) ↔ organizador destino (`grantee_organizer_id`) |
| RLS lectura origen | El destino puede **ver** jugador, participaciones y stats del dueño (solo lectura) |
| `ensure_granted_player_local` | Crea `riviera_jugadores` local en destino + `jugador_stats` vacío (`_create_empty_jugador_stats`) |
| `local_jugador_id` | Enlaza explícitamente origen ↔ perfil local del club destino |
| `resolveJugadorIdForOrganizer` | Al inscribir en torneo/liga en destino, usa el id local operativo |
| UI ranking Hack (extensión Fase 1) | Muestra concedidos en ranking interno + referencia de puntos origen (solo visual) |
| `is_public_ranking` | Flag admin al conceder; al crear perfil local, define `visible_publico` / `suma_ranking` del clon |

### Explícitamente NO implementado (por diseño Fase 1)

- Tabla `global_players` ni carrera unificada.
- Dual-write de participaciones a capa global.
- Recálculo histórico ni migración de historial al destino.
- Mezcla de rankings entre clubes en el cálculo.
- Promoción automática al ranking oficial.

### Lectura correcta de Fase 1

> El perfil local con stats en cero **no** significa que Aaron «empiece de nuevo» como deportista. Significa que **el ranking interno de Hack Pádel** arranca en cero hasta que juegue allí, mientras su **carrera global** (aún no modelada) y su **historial Riviera** permanecen intactos y visibles en lectura.

Fase 1 deja el **gancho** `organizer_player_access.local_jugador_id` + `jugador_id` listo para Fase 2.

---

## 5. Estado actual del código (puntos de enganche)

Flujos que Fase 2 debe interceptar con dual-write **solo en eventos nuevos**:

| Evento | Entrada actual | Tablas / RPC afectados |
|--------|----------------|------------------------|
| Cierre de partido / reta | `syncParticipaciones.ts` | `jugador_participaciones`, metadata |
| Registro de participación | RPC `registrar_participacion_jugador` | `jugador_participaciones` |
| Puntos ranking club | `rivieraRankingPoints.ts` → `rebuildJugadorStats` / `refresh_jugador_stats` | `jugador_stats` por `jugador_id` local |
| Rating partido | `aplicarRatingPartido.ts` → RPC `aplicar_rating_partido` | `riviera_jugadores.rating*`, historial rating |
| Ranking interno club | RPC `riviera_ranking_interno_por_organizador` | Filtra por `organizador_id` + stats locales |
| Ranking oficial | RPC `riviera_ranking_sitio_oficial_por_organizador` + `visible_publico` | Opt-in explícito |
| Acceso concedido | `admin_grant_organizer_player_access`, `ensure_granted_player_local` | `organizer_player_access`, clon local |
| Resolución id en torneo | `resolveJugadorIdForOrganizer` en `playerPoolSync.ts` | Determina qué `jugador_id` recibe la participación |

---

## 6. Diseño propuesto Fase 2

### 6.1 Nuevas entidades (concepto)

```text
global_players
  id (uuid, PK)
  canonical_slug, nombre_display, fecha_nacimiento, ...
  created_at, updated_at

player_organizer_profiles  -- o extender organizer_player_access + riviera_jugadores
  id
  global_player_id  → global_players.id
  riviera_jugador_id → riviera_jugadores.id (perfil local)
  organizador_id
  access_type: 'owner' | 'granted_by_admin'
  is_active

global_player_activity  -- ledger append-only de eventos de carrera
  id
  global_player_id
  source_jugador_id      -- perfil local que originó el evento
  source_organizador_id
  participacion_id       -- FK lógica, evita duplicar fila en jp
  event_type, puntos_delta, rating_delta, occurred_at, metadata
```

**Regla:** cada fila en `jugador_participaciones` (nueva, post-Fase-2) genera **una** entrada en `global_player_activity` vía el `global_player_id` resuelto desde el perfil local. No se copia la fila entera; se referencia.

### 6.2 Resolución de identidad

```
riviera_jugadores (origen Riviera, jugador_id = A)
        │
        │ organizer_player_access.jugador_id = A
        │ organizer_player_access.local_jugador_id = B (Hack)
        ▼
riviera_jugadores (local Hack, id = B)
        │
        │ player_organizer_profiles.riviera_jugador_id = A o B
        │ player_organizer_profiles.global_player_id = G
        ▼
global_players (id = G)  ← una sola carrera
```

- Perfil **dueño** (Riviera): `access_type = 'owner'`, se vincula a `G` en migración/backfill controlado.
- Perfil **concedido** (Hack): `access_type = 'granted_by_admin'`, mismo `G`, distinto `riviera_jugador_id` local.
- `organizer_player_access` sigue siendo la fuente de verdad del permiso; `player_organizer_profiles` es el índice identidad.

### 6.3 Principio de escritura dual (solo eventos nuevos)

En cada participación nueva:

1. Escribir en `jugador_participaciones` con `jugador_id` = **perfil local** del club donde se jugó (comportamiento actual post-`ensure_granted_player_local`).
2. Actualizar `jugador_stats` del perfil local → alimenta **ranking interno de ese club**.
3. Insertar en `global_player_activity` → alimenta **carrera global**.
4. Recalcular agregados globales (`global_player_stats` o vista materializada).
5. Rating: actualizar rating del perfil local; opcionalmente rating global según política (sección 6.6).

**No** re-procesar historial antiguo salvo migración explícita opt-in.

---

## 7. Respuestas a las 10 preguntas de diseño

### 1. ¿Cómo se enlaza el jugador original con el perfil local del club?

| Mecanismo | Rol |
|-----------|-----|
| `organizer_player_access.jugador_id` | ID del perfil **origen** (dueño del registro) |
| `organizer_player_access.local_jugador_id` | ID del perfil **operativo** en el club destino (creado por `ensure_granted_player_local`) |
| `player_organizer_profiles` (Fase 2) | Ambos perfiles apuntan al mismo `global_player_id` |
| Perfil dueño sin conceder | `global_player_id` se asigna en migración; `access_type = 'owner'` |

El enlace es **explícito en BD**, no inferido por nombre o slug.

### 2. ¿Cómo se acumula historial global sin mezclar rankings internos?

- **Historial global** = unión ordenada de `global_player_activity` (o vista sobre participaciones referenciadas por `global_player_id`).
- **Ranking interno club X** = solo `jugador_stats` donde `riviera_jugadores.organizador_id = X`.
- Los puntos Riviera de Aaron **no** entran en el orden del ranking Hack; solo en su carrera global y en el ranking interno Riviera.

La UI de ranking Hack puede **mostrar** puntos origen como contexto (Fase 1); el **sort** usa solo stats locales.

### 3. ¿Cómo se actualizan puntos del club destino?

Sin cambio de lógica de negocio respecto a hoy:

1. Participación en torneo/liga Hack → `jugador_id` = perfil local Hack (`local_jugador_id`).
2. `rebuildJugadorStats(local_jugador_id)` / `refresh_jugador_stats`.
3. `jugador_stats.puntos_totales` del perfil Hack aumenta.
4. Ranking interno Hack lee ese valor vía RPC existente + merge de concedidos.

### 4. ¿Cómo se actualizan puntos globales?

1. Tras registrar participación local, resolver `global_player_id` desde `player_organizer_profiles`.
2. Insertar `global_player_activity` con `puntos_delta` según reglas de ranking (misma fórmula por evento).
3. Mantener `global_player_stats` (totales, por modalidad, última actividad) vía trigger o job incremental.

Los puntos globales son **suma de carrera**, no copia del ranking de un club concreto.

### 5. ¿Cómo se actualiza rating local?

Flujo actual preservado: `aplicar_rating_partido` sobre el `riviera_jugadores` **local** del club donde se jugó el partido. Cada perfil local mantiene su propio `rating`, `rating_partidos`, `rating_fiabilidad`.

### 6. ¿Cómo se actualiza rating global, si aplica?

**Política recomendada (a confirmar en implementación):**

- **Opción A (recomendada):** rating global = función del historial completo (Elo/Glicko sobre `global_player_activity` o partidos agregados). Los ratings locales siguen siendo los que usa cada club en sus torneos.
- **Opción B:** rating global = promedio ponderado por partidos de ratings locales.

Fase 2 debe documentar la opción elegida; no mezclar rating Riviera con rating Hack en el perfil local.

### 7. ¿Cómo se respeta `is_public_ranking` / `visible_publico` / `visible_ranking_oficial`?

| Flag | Ámbito | Efecto |
|------|--------|--------|
| `visible_publico` (perfil `riviera_jugadores`) | Sitio oficial / ficha pública | Opt-in por jugador; default `false` en perfiles locales concedidos |
| `visible_ranking_oficial` (`organizador_game_modes`) | Ranking oficial del organizador en rivieraopen.com | El organizador debe tener el modo visible |
| `is_public_ranking` (`organizer_player_access`) | Al conceder | Al crear perfil local, define si ese clon puede ser público (`ensure_granted_player_local` ya usa esto) |
| Ranking interno app | Sin filtro `visible_publico` | Todos los activos del club + concedidos |

**Regla:** carrera global ≠ ranking oficial. Ver carrera completa es permiso distinto a aparecer en el ranking público Riviera.

### 8. ¿Cómo participa el jugador cedido en rankings internos de todos los clubes donde juegue?

- Por cada club donde tenga perfil local activo (propio o concedido), existe un `jugador_stats` independiente.
- El ranking interno de cada club lista:
  - jugadores con `organizador_id` = ese club;
  - jugadores concedidos sin partido aún (stats 0) si el producto lo requiere;
  - orden por stats **locales** de ese club.
- Aaron puede estar en ranking Hack **y** en ranking Riviera con puntos distintos.

### 9. ¿Cómo se evita duplicar historial?

| Riesgo | Mitigación |
|--------|------------|
| Misma participación escrita dos veces en `jugador_participaciones` | Una sola escritura por evento, siempre en perfil **local del club anfitrión** |
| Misma participación en carrera global dos veces | `global_player_activity.participacion_id` UNIQUE; un evento → una fila global |
| Mostrar historial origen + local duplicado en UI | Carrera global deduplica por `participacion_id`; vista concedida en Fase 1 lee solo origen hasta que Fase 2 unifique la query |
| Backfill histórico | Migración opcional por lotes; no automática al conceder |

### 10. ¿Cómo se muestra la carrera deportiva completa?

**Vista única** (perfil global / ficha «Carrera deportiva»):

- Timeline unificado: participaciones de todos los clubes, etiquetadas por organizador («Riviera Open — Liga X», «Hack Pádel — Torneo Y»).
- Totales: partidos, victorias, puntos de carrera, rating global.
- Desglose por club: puntos y partidos **locales** (enlace a ranking interno de cada club).
- Para concedidos antes de Fase 2: historial pre-existente se asocia al `global_player_id` en backfill o se lee del perfil origen vía `jugador_id` dueño.

---

## 8. Roadmap Fase 2 (sin implementar aún)

### Subfase 2A — Identidad global (fundación)

- [ ] Crear `global_players`, `player_organizer_profiles`, `global_player_activity` (+ índices).
- [ ] RPC `resolve_global_player_id(riviera_jugador_id)`.
- [ ] Migración: asignar `global_player_id` a perfiles dueño existentes (1:1 inicial).
- [ ] Al conceder acceso: crear vínculo `player_organizer_profiles` sin duplicar historial.
- [ ] Tests: Aaron con perfil Riviera + perfil Hack → mismo `global_player_id`.

### Subfase 2B — Dual-write participaciones nuevas

- [ ] Extender `registrar_participacion_jugador` (o wrapper) para insertar `global_player_activity`.
- [ ] Hook en `syncParticipaciones.ts` post-cierre.
- [ ] `global_player_stats` / vista agregada.
- [ ] Verificar: liga en Hack actualiza solo stats Hack + carrera global; stats Riviera sin cambio.

### Subfase 2C — Rankings y visibilidad

- [ ] Confirmar RPC ranking interno: solo stats locales (sin regresión).
- [ ] Ranking oficial: sin cambio de reglas de visibilidad.
- [ ] UI ranking interno: etiqueta dual opcional (club actual + origen) — ya iniciado en Fase 1.
- [ ] Documentar matriz de flags para admins.

### Subfase 2D — Carrera deportiva (UI)

- [ ] Pantalla / pestaña «Carrera deportiva» en ficha global.
- [ ] Timeline unificado con filtro por club.
- [ ] Totales globales vs desglose local.
- [ ] Jugador concedido: misma vista que dueño (una carrera), no dos fichas desconectadas.

### Subfase 2E — Rating global (opcional)

- [ ] Definir política A o B (sección 6.6).
- [ ] Implementar recálculo incremental.
- [ ] Mostrar rating local y global en ficha con etiquetas claras.

### Subfase 2F — Backfill histórico (opcional, controlado)

- [ ] Job admin: importar participaciones pre-Fase-2 a `global_player_activity`.
- [ ] Idempotente por `participacion_id`.
- [ ] No modifica `jugador_stats` históricos por club.

---

## 9. Qué NO hacer en Fase 2

- No fusionar `jugador_stats` de varios clubes en una sola fila.
- No meter puntos Hack en el ranking interno Riviera (ni al revés).
- No publicar automáticamente en rivieraopen.com al conceder acceso.
- No borrar ni mover participaciones del perfil origen al conceder.
- No recalcular todo el historial en el primer deploy.
- No tratar `local_jugador_id` como un jugador distinto en la carrera global.

---

## 10. Matriz resumen Aaron Duran (después de jugar liga en Hack)

| Vista | Partidos | Puntos que importan | Fuente de datos |
|-------|----------|---------------------|-----------------|
| Carrera global | 30 + N | Suma carrera | `global_player_activity` |
| Ranking interno Riviera | 30 | 500 (+ pts solo si juega en Riviera) | `jugador_stats` perfil Riviera |
| Ranking interno Hack | N | Pts ganados en Hack | `jugador_stats` perfil Hack local |
| Ranking oficial Riviera | — | Solo si flags públicos | RPC sitio oficial + `visible_publico` |
| UI ranking Hack (dual) | — | Hack ordena local; Riviera como referencia | Fase 1 UI + stats locales |

---

## 11. Criterios de aceptación Fase 2 (checklist)

1. Conceder acceso no altera participaciones ni stats del perfil origen.
2. Primera participación en club destino crea/usa perfil local y actualiza solo stats de ese club.
3. La misma participación aparece una vez en carrera global y una vez en stats local.
4. Rankings internos de dos clubes muestran puntos distintos para el mismo deportista.
5. Ranking oficial no cambia por conceder; solo por flags explícitos.
6. Ficha carrera muestra historial Riviera + Hack en una sola línea de tiempo.
7. `resolveJugadorIdForOrganizer` sigue resolviendo al perfil local en torneos del destino.
8. Revocar acceso no borra historial global ni el historial ya jugado en destino.

---

## 12. Referencias en el repositorio

| Archivo | Relevancia |
|---------|------------|
| `supabase/organizer-player-access.sql` | Fase 1: acceso, RLS, `ensure_granted_player_local` |
| `src/lib/rivieraJugadores/organizerPlayerAccess.ts` | Cliente acceso y resolución de id |
| `src/lib/rivieraJugadores/grantedRankingDisplay.ts` | UI dual ranking (solo visual, Fase 1) |
| `src/lib/rivieraJugadores/syncParticipaciones.ts` | Punto de enganche dual-write |
| `docs/RANKING-OFICIAL-RIVIERAOPEN.md` | Reglas ranking público |

---

*Este documento es la referencia de producto y arquitectura para Fase 2. Cualquier implementación debe alinearse con las reglas de las secciones 1, 2 y 9 antes de tocar esquema o flujos de participación.*
