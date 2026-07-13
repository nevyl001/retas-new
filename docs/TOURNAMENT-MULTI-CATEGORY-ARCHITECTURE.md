# Arquitectura: Torneo multi-categoría + agenda

**Estado:** documento de arquitectura (sin implementación).  
**Stack:** React 18 + TypeScript + CRA + Supabase.  
**Módulo actual:** `src/components/torneo-express`, `src/services/torneoExpressService.ts`, `src/lib/torneoExpress`, router `TorneoExpressRouter.tsx` (`/torneo-express/...`).  
**Fechas:** `src/lib/matchDate` (`APP_TIMEZONE` = `America/Mexico_City`); presentación/helpers de partido en `src/lib/torneoExpress/partidoSchedule.ts`.

---

## Regla central

> **La categoría propone el bloque horario; cada partido conserva siempre su propia fecha, hora y cancha editables.**

---

## 1. Diferencia entre horario de evento, de categoría y de partido

| Nivel | Entidad | Rol |
|-------|---------|-----|
| **Evento** | Tabla nueva `torneo_express_evento` | Contenedor organizativo: identidad pública, branding, zona horaria IANA, canchas del venue (lista de texto), ciclo de vida propio. **No** programa partidos individuales. |
| **Categoría (= Torneo en UI)** | Una fila de `torneo_express` con `evento_id` | Competencia aislada. Propone **defaults** de ventana tentativa (fecha(s), hora inicio/fin tentativas, canchas permitidas, duración estimada, intervalo, prioridad). Organiza y estima; **no** es restricción irreversible. |
| **Partido** | `torneo_express_partidos` **o** `torneo_express_eliminatoria_partidos` | Fuente de verdad de agenda: `programado_en`, `programado_fin` (nuevo, nullable), `cancha` (texto libre existente), `schedule_source`, `schedule_locked`. Siempre editable por partido. |

Un Evento sin categorías o un `torneo_express` legacy sin `evento_id` siguen siendo válidos. Un “Torneo” chico = una sola categoría; uno grande = Evento con varias categorías.

---

## 2. Fuente de verdad y prioridad de overrides

**Prioridad:** programación del partido **>** defaults de la categoría **>** (opcional) contexto del evento.

```
effectiveMatchStart =
  match.programado_en
  ?? propuestaGeneradaDesdeCategoria
```

- Tras guardar la agenda, **cada partido lee sus propios valores**.
- Regenerar o actualizar la ventana de categoría **no** debe sobrescribir ediciones manuales (`schedule_locked = true`).
- No existen hoy `court_id`, `scheduled_start` ni `scheduled_end`. Se reutiliza `programado_en` como inicio efectivo y se añade `programado_fin` nullable en ambas tablas de partidos.

---

## 3. Nomenclatura: “Torneo” (UI) vs `torneo_express` (interno)

| Cara al usuario | Interno (NO renombrar) |
|-----------------|------------------------|
| Producto: **Torneo** | Tablas: `torneo_express`, `torneo_express_partidos`, `torneo_express_grupos`, `torneo_express_eliminatoria_partidos` |
| Menú, títulos, botones: “Torneo” (deja de decir “Torneo Express” en UI) | Servicio: `torneoExpressService` |
| Jerarquía: Evento → Torneo/Categoría → Partidos | Rutas: `/torneo-express/...` |
| | Carpeta: `src/components/torneo-express` |
| | Tipos/API interna actuales |

**Regla dura:** no renombrar tablas, columnas, servicios, tipos ni rutas existentes. Renombrar la capa técnica sería una migración destructiva (rompe torneos existentes y la compatibilidad hacia atrás). El cambio de nombre es **solo presentación**.

`torneo_express` permanece el **nombre en clave del motor**.

---

## 4. Modelo conceptual (nombres reales del repo)

### 4.1 Evento

- Tabla nueva: `torneo_express_evento`.
- Agrupa categorías; no mezcla datos deportivos.

### 4.2 Categoría

- **Una categoría = una fila de `torneo_express`** con columna nueva `evento_id` (nullable).
- **No** crear tabla `tournament_categories`.
- Defaults de horario tentativo: columnas nuevas **sobre `torneo_express`** (nullable): fechas del bloque, hora tentativa inicio/fin, canchas permitidas (lista de texto), duración estimada por partido, intervalo, prioridad/orden en el evento.
- **No** existe tabla de canchas; “canchas permitidas” = lista de strings, no FK.

### 4.3 Partidos (dos tablas, una capa lógica)

| Tabla | Uso |
|-------|-----|
| `torneo_express_partidos` | Fase de grupos |
| `torneo_express_eliminatoria_partidos` | Eliminatoria |

Campos de agenda **ya existentes** (auditar esquema real antes de migrar): `cancha` (texto libre), `programado_en` (timestamp ISO).

Campos nuevos previstos (nullable, aditivos, con `isMissingColumnError`): `programado_fin`, `schedule_source`, `schedule_locked`.

Marcador multi-set: columna `sets_resultado` (JSONB). Detalle operativo en `docs/TORNEO-EXPRESS-SETS-Y-CLASIFICACION.md`. Migración: `supabase/torneo-express-partidos-sets-resultado.sql`.

**No** fusionar tablas ni crear una tercera tabla de partidos.

### 4.4 Migraciones

- Aditivas y tolerantes (patrón `isMissingColumnError` ya usado en `torneoExpressService.ts`).
- Columnas nuevas nullable.
- Torneos legacy **sin** `evento_id` siguen funcionando idénticos.

> **Auditar la tabla real en Supabase antes de migrar** (columnas presentes, RLS, defaults).

---

## 5. Aislamiento de categoría (regla dura)

- Cada fila de `torneo_express` vinculada por `evento_id` es una categoría **independiente**.
- Grupos, participantes, clasificación, eliminatorias y partidos quedan aislados por esa fila.
- El contexto deportivo **siempre** se consulta por `torneo_express.id` de la categoría.
- **Nunca** filtrar datos deportivos solo por `evento_id`.
- `evento_id` sirve únicamente para agrupar y presentar el evento general; jamás para mezclar partidos o standings entre categorías.

---

## 6. Origen de jugadores y Riviera ID (regla dura)

El armador de categorías **solo selecciona** jugadores del pool existente de la cuenta:

`getPlayers(userId)` → `buildLegacyPlayersFromRivieraRegistry`.

**Nunca** crea ni modifica jugadores dentro del flujo de torneo.

Tres caminos de entrada al pool:

1. **Jugador propio del club** — ya está en el pool; se selecciona.
2. **Jugador cedido** (`playerSharingRequests`) — tras la cesión aparece en el pool; se selecciona igual; acumula en el **mismo** Riviera ID (carrera global no se parte) y genera historial **local** en este club.
3. **Jugador nuevo sin ID** — alta en área de jugadores (`JugadoresLista` → `createRivieraJugador`). Nunca en el armador de torneos.

Invariables: identidad global por Riviera ID; historial local por club; cero duplicación de ID; participación y resultados siempre contra el Riviera ID existente.

---

## 7. Ranking y puntos (no tocar)

Cadena intacta:

partido → resultado → cierre → participación individual → ranking local → ledger global → Ranking Oficial Riviera.

Horario, cancha y categoría son **solo contexto operativo**; jamás afectan el cálculo de puntos.

**No tocar** (verificados en el repo): `finalizeCareerEvent`, `careerEventPipeline`, `syncParticipaciones`, rating, Riviera ID, `metadata.organizador_id`, ranking local, Ranking Oficial Riviera.

Cambiar hora / cancha / fecha **nunca** modifica: participantes, equipos, grupo, ronda, marcador, resultado, ganador, clasificación, bracket, puntos, rating, participaciones ni carrera.

Solo tras auditar compatibilidad se puede **añadir** a metadata como contexto (no como fuente de cálculo): `tournament_category_id`, `category_name`, `court_name`, `scheduled_start`.

---

## 8. Estado “por definir” válido y errores bloqueantes

### Válido (no bloquea)

- `programado_en = null`
- `programado_fin = null`
- `cancha = null` o vacío  

UI: **“Horario por confirmar”**, **“Cancha por confirmar”**.  
La falta de horario o cancha es **advertencia**, no bloqueo.

### Errores bloqueantes reales

- `programado_fin` anterior a `programado_en`
- Timestamp inválido
- Partido inexistente
- Categoría o torneo inválido

---

## 9. Presentación vs orden interno

Hoy existe `partidoScheduleIso` en `src/lib/torneoExpress/partidoSchedule.ts`:

```ts
programado_en ?? created_at
```

Eso **no** debe usarse como hora pública definitiva.

Responsabilidades futuras (nombres de diseño):

| Helper | Uso |
|--------|-----|
| `getMatchSortTimestamp(match)` | Orden interno estable legacy; puede usar `programado_en ?? created_at`. |
| `getMatchPublicSchedule(match)` | **Solo** `programado_en`; si es `null` → “Horario por confirmar”. |

**Nunca** presentar `created_at` como hora real del partido en vista pública ni administrativa.

---

## 10. `schedule_source` y `schedule_locked`

| Campo | Valores / semántica |
|-------|---------------------|
| `schedule_source` | `category_default` \| `auto_generated` \| `manual` |
| `schedule_locked` | `false` = la agenda automática puede proponer/actualizar; `true` = no puede sobrescribirse por regeneración automática |

- Edición manual de un partido → `schedule_source = "manual"`, `schedule_locked = true`.
- Aceptar propuesta automática → `schedule_source = "auto_generated"`, `schedule_locked = false`.

---

## 11. Flujo de edición manual (v1)

- Edición de agenda por partido vía **modal** (escritorio) / **bottom sheet** (móvil).
- Campos: fecha, hora inicio, hora fin (opcional), cancha (texto).
- Al guardar: marcar `manual` + `schedule_locked = true`.
- **Sin drag and drop en v1** (fase futura).

---

## 12. Conflictos en tres niveles

| Nivel | Qué | Comportamiento |
|-------|-----|----------------|
| **Error imposible** | Fin &lt; inicio; timestamp inválido; partido/categoría inexistente | **Bloquea** guardado |
| **Conflicto confirmable** | Misma cancha + misma franja; mismo jugador en dos partidos solapados (incluso entre categorías del mismo evento) | Pedir **confirmación** explícita |
| **Advertencia** | Fuera de ventana de categoría; cancha no en lista permitida; sin horario/cancha | **Avisa** pero permite guardar |

---

## 13. Protección de ediciones manuales

Al regenerar o actualizar agenda desde la categoría:

1. **“No cambiar la agenda existente”** — opción **predeterminada**.
2. **“Reprogramar solo automáticos”** — solo `schedule_locked = false`; nunca toca manuales.
3. **“Reprogramar todos”** — confirmación explícita; mostrar cuántos partidos **manuales** se afectan; **nunca** silencioso; **nunca** default.

---

## 14. Zona horaria

- El **Evento** define una zona IANA (ej. `America/Mexico_City`).
- Captura de horarios en la zona del evento.
- Persistencia en ISO/UTC según el patrón del repo (`matchDate` / `APP_TIMEZONE`); **no** usar solo la zona local del navegador como fuente de verdad.
- UI pública y privada presenta en la zona del evento.
- **Antes de implementar:** auditar manejo actual en `torneoExpressService.ts` y `src/lib/matchDate.ts` (+ `partidoSchedule.ts`).

**Casos a probar:** conversión UTC; horario de verano; usuario en otra zona; evento de varios días.

---

## 15. Capa de agenda compartida (grupos + eliminatorias)

Interfaz común de presentación/operación — **sin** fusionar tablas ni crear una tercera:

```ts
type SchedulableTournamentMatch = {
  id: string;
  tournamentId: string;   // torneo_express.id (categoría)
  categoryId: string;     // mismo id de categoría
  sourceTable:
    | "torneo_express_partidos"
    | "torneo_express_eliminatoria_partidos";
  programadoEn: string | null;
  programadoFin: string | null;
  cancha: string | null;
  scheduleSource: "category_default" | "auto_generated" | "manual" | null;
  scheduleLocked: boolean;
};
```

`sourceTable` distingue grupos vs eliminatoria; la UI de agenda opera sobre esta forma unificada.

---

## 16. Estados del Evento

El Evento tiene ciclo de vida **propio**, independiente de las categorías.

| Estado conceptual | Significado |
|-------------------|-------------|
| `draft` | Configuración general, branding, canchas, categorías |
| `published` | Visible públicamente; categorías pueden no haber iniciado |
| `in_progress` | Al menos una categoría iniciada (**derivado**) |
| `completed` | Todas las categorías terminaron correctamente (**derivado**) |
| `archived` | Solo consulta histórica |

Reglas:

- El estado del Evento **nunca** modifica automáticamente el estado deportivo de una categoría.
- Verdad deportiva: `torneo_express.estado` ∈ `pendiente` \| `en_curso` \| `finalizado` (valores actuales del motor).
- `draft` / `published` / `archived` = propios del Evento (visibilidad/branding).
- `in_progress` / `completed` se **derivan** del estado de las categorías; no lo dictan.
- Ejemplo válido: Evento `in_progress` con 4ta `finalizado`, 5ta `en_curso`, Mixtos y Open `pendiente`.

---

## 17. Identidad pública del Evento

Cada Evento tiene identidad pública propia (ej. “Riviera Open Rush Series #4”) y una página pública principal que actúa solo como **contenedor**.

**Rutas conceptuales** (la ruta técnica final se define en implementación respetando el patrón de `TorneoExpressRouter`; **no** asumir que ya existe `/eventos/`):

- Página del evento: `/eventos/{eventoSlug}`
- Página por categoría: `/eventos/{eventoSlug}/{categoriaSlug}` (ej. `/4ta`, `/5ta`, `/mixtos`, `/open`)

El slug de categoría debe ser único **dentro** del evento.

Desde la página del evento se entra a cada categoría; cada categoría tiene página pública independiente.

El Evento **nunca** mezcla entre categorías: standings, brackets, grupos ni resultados.  
`evento_id` agrupa; `torneo_express.id` separa la competencia.

**Design system (público):** tokens `--ro-*`, mobile-first (breakpoints 480 / 768 / 1024), máx. 3 acentos blancos por pantalla pública.

---

## 18. Generación inicial de agenda

| Fase | Alcance |
|------|---------|
| **v1** | Programación **manual asistida**: propuesta editable a partir de defaults de categoría; publicar permitido con horarios “por confirmar”. |
| **Posterior** | Generación automática completa + (opcional) drag and drop. |

La capa de agenda completa es **fase posterior** (ver §22).

---

## 19. Vista pública

- Muestra el **horario individual vigente** del partido (`programado_en` / cancha del partido).
- Si no hay agenda: **“Horario por confirmar”** (nunca `created_at`; nunca la hora de la categoría como definitiva).
- Filtros: categoría, cancha, horario, grupo, fase, estado.
- Actualizar agenda se refleja en público pero **no** cambia resultado, grupo, bracket ni ranking.

---

## 20. UX de agenda (admin)

Tres vistas:

1. **Por categoría**
2. **Por cancha** (línea de tiempo)
3. **Cronológica**

| Superficie | Default v1 |
|------------|------------|
| Móvil | Cronológica + filtros + bottom sheet de edición |
| Escritorio | Por cancha o cronológica; drag and drop = fase futura |

Tarjeta de partido: categoría, fase/grupo, equipos, hora, cancha, estado, acción **“Editar agenda”**.

---

## 21. Casos de prueba (descripción)

1. Categoría con inicio/fin propios (defaults en `torneo_express`).
2. Dos categorías del mismo evento con horarios distintos.
3. Un partido guarda hora y cancha propias.
4. Editar un partido no cambia otros.
5. Editar defaults de categoría no pisa partidos con `schedule_locked = true`.
6. “Reprogramar solo automáticos” solo mueve `schedule_locked = false`.
7. Fuera de ventana = advertencia, no bloqueo.
8. Conflicto de cancha detectado (confirmable).
9. Conflicto de jugador (incluso cross-categoría del evento) detectado.
10. Público muestra horario individual.
11. Sin agenda → “Horario por confirmar”.
12. Público nunca muestra `created_at` como hora.
13. Cambiar agenda no altera resultados.
14. Ni standings.
15. Ni participaciones.
16. Ni puntos/rating.
17. Legacy sin `evento_id` sigue funcionando.
18. Grupos y eliminatorias usan la misma capa vía `sourceTable`.
19. Semifinales/finales reprogramables individualmente.
20. Armador solo selecciona del pool; no crea jugadores.
21. Participación se guarda contra Riviera ID existente.
22. Jugador cedido aparece en el pool y genera historial local sin duplicar ID.
23. Datos deportivos se consultan por `torneo_express.id`, no por `evento_id`.
24. Conversión de zona horaria correcta (UTC, DST, usuario en otra zona, varios días).
25. Estado del Evento no altera el estado deportivo de las categorías.
26. Categorías del mismo evento pueden tener estados distintos a la vez.
27. Renombrado a “Torneo” es solo UI; no rompe tablas, rutas ni servicios internos.

---

## 22. Fase de implementación

Orden explícito:

1. **Primero (estable):** Evento (`torneo_express_evento`) + categorías (`torneo_express.evento_id` + defaults) + vista pública contenedor + páginas por categoría + aislamiento deportivo + nomenclatura UI “Torneo”.
2. **Después (fase posterior):** capa de agenda compartida (`SchedulableTournamentMatch`, `programado_fin`, `schedule_source` / `schedule_locked`, conflictos, protección de manuales, vistas admin de agenda, generación asistida/automática).

La agenda se construye **encima** del Evento + categorías + público ya estables. No invertir el orden.

---

## Principios de arquitectura

1. El Evento organiza.
2. La Categoría compite.
3. El Partido programa.
4. El Riviera ID identifica al jugador.
5. El Club aporta contexto, no identidad.
6. Los horarios nunca modifican el deporte.
7. Los resultados nunca modifican la identidad del jugador.
8. Una categoría nunca comparte standings con otra.
9. `evento_id` agrupa; `torneo_express.id` separa la competencia.
10. Los grupos pertenecen exclusivamente a una categoría.
11. Las eliminatorias pertenecen exclusivamente a una categoría.
12. La agenda es una capa operativa; nunca modifica resultados, ranking, rating, participaciones ni carrera deportiva.
13. La programación manual siempre tiene prioridad sobre la automática.
14. La programación automática nunca sobrescribe silenciosamente una edición manual.
15. El Ranking Oficial Riviera continúa siendo único para todos los jugadores; las categorías solo aportan contexto competitivo.
16. Toda participación se asocia al Riviera ID existente; nunca se crea un Riviera ID dentro del flujo de torneos.
17. Los jugadores cedidos conservan el mismo Riviera ID; solo cambia el contexto de club y torneo.
18. La arquitectura favorece siempre: compatibilidad hacia atrás, migraciones aditivas, cero pérdida de historial, cero duplicación de identidad, cero cambios en el cálculo deportivo existente.
19. “Torneo” es el nombre de producto; `torneo_express` es el nombre en clave del motor y no se renombra.

---

## Visión del producto

La evolución del módulo de Torneos convierte Riviera Open en una plataforma integral de organización deportiva. El objetivo no es solo administrar partidos, sino conectar la cadena:

**Evento → Categorías → Partidos → Resultados → Carrera deportiva → Ranking Local → Ranking Oficial Riviera → Perfil público del jugador.**

Cada torneo fortalece la identidad deportiva del jugador y enriquece su historial permanente. El módulo de torneos nunca debe ser un sistema aislado: se integra con todo el ecosistema Riviera Open manteniendo intacta la arquitectura deportiva existente.

---

> **La categoría propone el bloque horario; cada partido conserva siempre su propia fecha, hora y cancha editables.**
