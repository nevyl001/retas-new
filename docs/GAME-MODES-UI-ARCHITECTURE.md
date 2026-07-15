# Arquitectura de homogeneización visual — Modos de juego Riviera

**Estado:** documento de arquitectura. **No implementa nada.** Es el insumo para ejecutar la migración por fases descrita en la Sección 10.

**Alcance:** Reta (Round Robin + Reta por Equipos), Liga, Americano, Duelo 2v2, Torneo Express — administración y vistas públicas.

**Referencia visual:** Torneo Express (TE), en su estado ACTUAL (no aspiracional).

**Relación con documentos existentes:**
- [`docs/DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) — define la fuente de tokens `--ro-*` y breakpoints `sm/md/lg/xl` (480/768/1024/1200). Este documento **no la reemplaza**, la extiende con el contrato visual específico de "modo de juego".
- [`docs/MOBILE-FIRST-AUDIT.md`](./MOBILE-FIRST-AUDIT.md) — ya ejecutó Fase 1 (tokens táctiles) y Fase 2 (bottom nav). El shell móvil por modo (`ModeEventHeader`/`ModeSectionTabs`/`ModeSectionPanel`/`MobileStickyActionFooter`, en `src/styles/mode-mobile-shell.css`) es fruto de esa "Fase 3 — Consistencia por modo de juego", **adoptada en 4 de 5 modos** (falta Liga). Este documento continúa exactamente ese trabajo, con Torneo Express como vara de medir.

**Regla de no regresión (aplica a todo el documento):** Torneo Express no puede empeorar. Ningún componente compartido se extrae si obliga a degradar TE. Ver Sección 10 y 12.

**Fuera de alcance (no tocar, en ninguna fase futura):** resultados, standings, ranking, career, identidad Riviera, ROMC, Realtime, URLs, permisos, RLS. Esto es homogeneización **de presentación**, no de lógica.

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Inventario completo](#2-inventario-completo)
3. [Matriz comparativa](#3-matriz-comparativa)
4. [Principales inconsistencias](#4-principales-inconsistencias)
5. [Contrato visual](#5-contrato-visual)
6. [Componentes compartidos](#6-componentes-compartidos)
7. [Tokens](#7-tokens)
8. [Reglas mobile-first](#8-reglas-mobile-first)
9. [Flujo recomendado del organizador](#9-flujo-recomendado-del-organizador)
10. [Plan de migración](#10-plan-de-migración)
11. [Checklist de aceptación](#11-checklist-de-aceptación)
12. [Rollback](#12-rollback)
13. [Definición de "modo listo para lanzamiento"](#13-definición-de-modo-listo-para-lanzamiento)

---

## 1. Resumen ejecutivo

Los 5 modos de juego (Reta, Liga, Americano, Duelo 2v2, Torneo Express) funcionan correctamente pero **no comparten un lenguaje visual único**. Cada uno se construyó en un momento distinto del proyecto y eso se nota en:

- **3 sistemas de max-width distintos por modo** (y a veces 2-3 dentro del mismo modo: admin vs público vs "wide").
- **Un componente de shell móvil compartido** (`ModeEventHeader` + `ModeSectionTabs` + `ModeSectionPanel` + `MobileStickyActionFooter`) que **4 de 5 modos ya adoptaron** (Reta, Duelo, Americano, TE) pero **Liga nunca migró** — Liga tiene su propia implementación de tabs (`.liga-tabs`, sin scroll horizontal, con `flex-wrap`) y no tiene sticky footer.
- **Tokens de color partidos:** existe una familia maestra `--ro-*` (documentada como "Precision Dark, sin dorado" en `DESIGN_SYSTEM.md`) pero en la práctica **el dorado (`#c9a227`) está vivo y es central** en TE, Reta público, Liga público, Americano y Duelo — la documentación existente ya no refleja la realidad visual.
- **3 taxonomías de "badge de estado" paralelas:** `StatusBadge` (platform, usado en headers móviles y públicos), `Badge`/`riviera-badge` (listas, TE), y badges locales por modo (`.liga-badge`, `.duelo2v2-badge`, `.te-badge-*`).
- **"Zona de peligro" (danger zone) solo existe en Reta** (`.reta-danger-zone`, tab Config móvil). Liga, Americano y Duelo mezclan botones destructivos (`variant="danger"` o `window.confirm`) en la misma barra que el CTA primario.
- **Breakpoints no estandarizados:** cada modo introdujo sus propios px (Americano usa 11 valores distintos: 360, 389/390, 480, 559/560, 639, 720, 767, 768, 769, 900, 901, 960).

**El modo mejor logrado es Torneo Express** (confirmado por auditoría): jerarquía clara, densidad de información controlada, shell de gestión (`te-gestion-page.css`) con tabs de 44px, cards consistentes, y separación deliberada entre acciones normales y destructivas (aunque TE tampoco tiene una "danger zone" roja formal — usa `variant="danger"` + confirmación inline).

**El modo más disperso es Liga:** dos sistemas de diseño casi independientes (admin con radios 12-16px/dorado vs público con radios 4-6px/noir), un componente huérfano sin ruta (`LigaDetalle.tsx`), CSS muerto (`.liga-jornada-toolbar` sin JSX que lo use), y el único modo que NO usa el shell móvil compartido.

**La homogeneización propuesta es estrictamente visual.** No se toca ninguna función de negocio: la Sección 10 exige explícitamente "sin tocar lógica" en cada paso, y la Sección 12 define cómo revertir cualquier fase sin arriesgar producción.

---

## 2. Inventario completo

### 2.1 Torneo Express (referencia)

| # | Ruta | Componente | Shell | Clasificación |
|---|------|------------|-------|----------------|
| A1 | `/torneo-express` | `TorneoExpressInicio` | `TePageShell` → `GameModeShell` | creación (hub) |
| A2 | `/torneo-express/nuevo` | `CrearTorneoExpressPage` | `TePageShell` | creación |
| A3 | `/torneo-express/eventos` | `EventosLista` | `TePageShell` | gestión (lista) |
| A4 | `/torneo-express/lista` | `TorneosExpressLista` | `TePageShell` | gestión (lista) |
| A5 | `/torneo-express/evento/:id` | `EventoDetalle` | `TePageShell` | configuración |
| A6 | `/torneo-express/evento/:id/nueva-categoria` | `EventoNuevaCategoria` | `TePageShell` | creación |
| A7 | `/torneo-express/:torneoId/gestionar` | `GestionGrupos` | `TePageShell` (+ shell móvil tabbed) | gestión (grupos/fases/bracket) + cierre |
| B1 | `/eventos/:slug` | `VistaPublicaEvento` | `PublicTorneoExpressShell` | vista pública (flyer) |
| B2 | `/torneo-express/:id/grupos` | `VistaPublicaGrupos` | `PublicTorneoExpressShell` | vista pública |
| B3 | `/torneo-express/:id/grupo/:grupoId` | `VistaPublicaGrupo` | `PublicTorneoExpressShell` | vista pública |
| B4 | `/torneo-express/:id/general` | `VistaPublicaGeneral` | `PublicTorneoExpressShell` | standings público |
| B5 | `/torneo-express/:id/eliminatoria` | `VistaPublicaEliminatoria` | `PublicTorneoExpressShell` (variante) | bracket público / live |

**Carpeta real:** `src/components/torneo-express/` (kebab-case). Router propio: `TorneoExpressRouter.tsx`.

### 2.2 Reta (Round Robin + Reta por Equipos)

**Hallazgo estructural:** no existe `src/pages/**` para Reta ni router dedicado; Round Robin y Reta por Equipos **comparten el 100% de la UI** en `/reta/:id` (se diferencian solo por `tournament.format`). No hay carpeta `retaEquipos`.

| # | Ruta | Componente | Shell | Clasificación |
|---|------|------------|-------|----------------|
| R1 | `/` (modal `QuickStartSheet`) | `QuickStartSheet` | `Modal` (no `GameModeShell`) | creación |
| R2 | `/?mis-eventos=1` | `TournamentManager` | `home-inner` (no `GameModeShell`) | gestión (lista) |
| R3 | `/reta/:id` | `TournamentDetails` → `RetaMobileOrganizerLayout` (móvil) | `GameModeShell` (vía `MainLayout`) | configuración + gestión + resultados + standings + cierre, todo en una ruta |
| R4 | `/public/:id` | `PublicTournamentView` | `PublicTorneoExpressShell` (reutiliza shell de TE) | vista pública |
| R5 | vista `winner` (sin path) | `WinnerScreen` | `.winner-page` propio | cierre / celebración |

### 2.3 Liga

| # | Ruta | Componente | Shell | Clasificación |
|---|------|------------|-------|----------------|
| L1 | `/liga` | `LigaHome` | `LigaPageShell` → `GameModeShell` | gestión (lista) |
| L2 | `/liga/nueva` | `LigaNueva` | `LigaPageShell` | creación |
| L3 | `/liga/:id/gestionar` | `LigaGestionar` | `LigaPageShell` | configuración + gestión |
| L4 | `/liga/:id/jornada/:n` | `LigaJornadaView` | `LigaPageShell` | resultados + standings (admin) |
| L5 | `/public/liga/:id` | `LigaDetallePublica` | `liga-pantalla` + `PublicModeShell` (**no** `LigaPageShell`) | vista pública + ranking + cierre |
| L6 | `/public/liga/:id/jornada/:n` | `LigaJornadaPublica` | `liga-pantalla` + `PublicModeShell` | vista pública resultados |
| L7 | *(sin ruta — huérfano)* | `LigaDetalle` | `LigaPageShell` | no enrutado; header legacy (`.liga-title` directo, sin `ModeHeader`) |

### 2.4 Americano

**Hallazgo estructural:** administración es **una sola URL** (`/americano-dinamico?tournamentId=...`); el contenido cambia por `phase` del hook (`registration` → `playing` → `finished`), no por rutas.

| # | Ruta | Componente | Shell | Clasificación |
|---|------|------------|-------|----------------|
| AM1 | `/americano-dinamico?tournamentId=…` (fase `registration`) | `AmericanoDinamicoScreen` → `PlayerRegistration` | `AmericanoModeShell` → `GameModeShell` | configuración / registro |
| AM2 | misma URL (fase `playing`, desktop) | `RoundView` + `LiveRanking` + `RoundHistory` | idem | gestión (rondas) + standings + historial |
| AM3 | misma URL (fase `playing`, móvil ≤767px) | shell tabbed (Resumen/Ronda/Partidos/Ranking/Jugadores) | idem + shell móvil | gestión tabbed |
| AM4 | misma URL (fase `finished`) | banner + podio + `LiveRanking` + `RoundHistory` | idem | cierre + resultados + standings |
| AM5 | `/public/americano/{id}` | `PublicAmericanoView` | `PublicTorneoExpressShell` (reutiliza TE) | vista pública (en vivo) |
| AM6 | `/public/vista-publica/americano/{id}` | `PublicAmericanoResultsBoard` | shell propio (`.public-americano-board`, **no** TE ni `GameModeShell`) | vista pública / display TV |

### 2.5 Duelo 2v2

| # | Ruta | Componente | Shell | Clasificación |
|---|------|------------|-------|----------------|
| D1 | `/duelo-2v2` | `Duelo2v2Home` | `Duelo2v2PageShell` → `GameModeShell` | listado / entrada |
| D2 | `/duelo-2v2/nuevo` | `Duelo2v2Nuevo` (+ `DueloPairBuilder`) | `Duelo2v2PageShell` | creación + configuración + parejas |
| D3 | `/duelo-2v2/:id/gestionar` | `Duelo2v2Gestionar` (desktop lineal / móvil tabbed) | `Duelo2v2PageShell` | gestión + resultados + cierre |
| D4 | `/public/duelo-2v2/:id` | `Duelo2v2Publica` | `Duelo2v2PageShell` + `PublicModeShell` | vista pública (live + celebración) |

**Nota:** Duelo **no tiene pantalla de standings/ranking propia** — no hay `<table>` de posiciones; solo aplica rating al finalizar. `Duelo2v2SetsBreakdown.tsx` tiene CSS completo pero **no está montado en ninguna pantalla** (código muerto).

### 2.6 Resumen de gaps estructurales por modo

| Modo | ¿Router propio? | ¿Admin multi-ruta? | ¿Comparte shell público con TE? | ¿Usa shell móvil compartido? |
|------|------------------|---------------------|-----------------------------------|-------------------------------|
| Torneo Express | Sí | Sí (11 rutas) | — (es la referencia) | Sí |
| Reta | No (SPA routing manual) | Parcial (todo en `/reta/:id`) | Sí (público) | Sí |
| Liga | Sí | Sí (4 rutas) | No (shell propio `liga-pantalla`) | **No** |
| Americano | No | No (1 sola URL, fases) | Sí (público, parcialmente) | Sí (sin sticky footer) |
| Duelo 2v2 | Sí (parser propio) | Sí (4 rutas) | No (shell propio) | Sí |

---

## 3. Matriz comparativa

Valores **reales** medidos en el código (no aproximados), por modo.

### 3.1 Max-width del contenedor principal

| Modo | Admin | Público (default) | Público (wide/variante) |
|------|-------|--------------------|--------------------------|
| **Torneo Express** | `1200px` (hub/lista/crear/gestión) | `900px` | grupos: `none`; eliminatoria: `min(1600px, 98vw)`; evento con flyer: `920px` |
| **Reta** | `1280px` (`.reta-content` sobre `rv-page` de `1120px`) | reusa TE: `1100px` (`.te-public--reta`) | `none` (`.te-public--reta-wide`) |
| **Liga** | `1100px` (`.liga-page__inner`) | `1320px` (`.liga-pantalla__inner`) | bridge fuerza `min(1180px,100%)` cuando hay `.rv-public-board` |
| **Americano** | `1100px` (`.americano-screen`, sobre `rv-page` 1120px) | `1100px` (override), TV board: `1320px` | `min(1280px, 100%)` (wide) |
| **Duelo 2v2** | `720px` (default) | `min(1400px, 100%)` (`--public`) | `min(1280px, 100%)` (`--wide`) |

**Lectura:** ningún modo coincide exactamente con TE (1200 admin / 900 público). Duelo es el más alejado en admin (720px vs 1200px de TE — 40% más estrecho).

### 3.2 Padding móvil (contenedor de página)

| Modo | Valor |
|------|-------|
| Torneo Express | `--ro-mobile-page-padding: clamp(14px, 3.8vw, 18px)` |
| Reta | mismo token + `.reta-content` propio `clamp(16px, 3vw, 28px)` en X |
| Liga | `.liga-page` `clamp(16px, 4vw, 24px)` en X (móvil ≤768px) |
| Americano | `.americano-screen` `16px` fijo (no clamp) en X, ≤720px |
| Duelo 2v2 | `clamp(1rem, 2.5vw, 2rem)` en X, sin relación directa con `--ro-mobile-page-padding` |

**Lectura:** Americano es el único con un valor **fijo** (no responsive con `clamp`) — reduce menos gradualmente que los demás en pantallas intermedias.

### 3.3 Padding desktop

| Modo | Valor |
|------|-------|
| Torneo Express | `clamp(16-24px)` Y × `clamp(20-32px)` X (inicio); `clamp(0.65rem, 2.5vw, 1.25rem)` X (gestión) |
| Reta | `clamp(20px, 3.5vw, 36px)` Y × `clamp(16px, 3vw, 28px)` X |
| Liga | `clamp(28px, 5vw, 52px)` Y × `clamp(20px, 4vw, 56px)` X (`.liga-page`, doble con `.rv-shell`) |
| Americano | `20px 24px 48px` fijo (`--space-5/6/12`) |
| Duelo 2v2 | `clamp(1rem, 2.5vw, 2rem)` Y × `clamp(1rem, 4vw, 3rem)` X |

### 3.4 Separación vertical entre secciones

| Modo | Valor |
|------|-------|
| Torneo Express | `clamp(20px, 3vw, 28px)` (inicio); `margin-bottom: 1.5rem` (cards gestión) |
| Reta | `clamp(20px, 3vw, 28px)` shell + `clamp(22px, 3vw, 32px) !important` override organizador |
| Liga | `clamp(24px, 6vw, 40px)` header; `32px` fijo entre acciones/tabs/cards |
| Americano | `clamp(20px, 4vw, 32px)` (bridge) vs `clamp(24px, 6vw, 40px)` (override local) — **dos valores compitiendo** |
| Duelo 2v2 | `clamp(1.25rem, 3vw, 2rem)` |

### 3.5 Separación entre cards (gap)

| Modo | Valor |
|------|-------|
| Torneo Express | `10px` (listas), `0.75rem` (categorías/grupos) |
| Reta | `clamp(14px, 2vw, 18px)` (four-components) |
| Liga | `0` explícito en lista (`margin-bottom` por item en su lugar: `16px`) |
| Americano | `8px` (grid registro), `14px` (matches) |
| Duelo 2v2 | `0.85rem` (~13.6px, cards home) |

**Lectura:** ninguno usa exactamente `10px` de TE. Rango real: 0–18px sin unidad de medida común (mezcla px y rem).

### 3.6 Border-radius de cards

| Modo | Radio real | ¿Coincide con `--ro-radius-lg` (14px)? |
|------|-----------|------------------------------------------|
| Torneo Express | `14px` (la mayoría); `18px` (roles evento público); `22px` (bracket wrap) | Sí (base) |
| Reta | `14px` (`component-card`, vía `--radius-lg`) | Sí |
| Liga | `16px` (`--liga-radius-lg`, admin) → **pisa a 14px** solo cuando el nodo también tiene `.rv-card` | **No** (token propio distinto) |
| Americano | `14px` consistente | Sí |
| Duelo 2v2 | `14px` (card base); `16px` (pair-slot); `18px` (roster); `20px` (live team pública) | Parcial |

### 3.7 Elevación (box-shadow)

| Modo | Valor típico |
|------|----------------|
| Torneo Express | `none` en listas; `0 1px 3px rgba(0,0,0,0.5)` (`--ro-shadow-sm`) en aside/gestión |
| Reta | `var(--shadow-card)` (legacy, no auditado a valor px exacto) |
| Liga | `--liga-shadow-card: 0 2px 12px rgba(0,0,0,0.25)` (propio, más difuso que TE) |
| Americano | sin shadow en cards de registro/bloques; bridge añade `--ro-shadow-sm` en match cards |
| Duelo 2v2 | `0 10px 28px rgba(0,0,0,0.22)` (match-meta); `0 12px 40px rgba(0,0,0,0.35)` (live team, mucho más pronunciada que TE) |

### 3.8 Tipografía — títulos de sección/pantalla

| Modo | Título principal (admin) | Eyebrow |
|------|---------------------------|---------|
| Torneo Express | `clamp(1.75rem, 3.2vw, 2.125rem)` (gestión); `clamp(1.9rem, 4.5vw, 2.75rem)` (hub) | `10px` / `600` / `0.12em` |
| Reta | `clamp(1.75rem, 5vw, 3rem)` (`ModeHeader`, genérico) | `0.6875rem` |
| Liga | `clamp(1.75rem, 5vw, 3rem)` (mismo `ModeHeader`) | `0.6875rem` |
| Americano | `clamp(1.75rem, 5vw, 3rem)` (mismo `ModeHeader`) | `0.6875rem` |
| Duelo 2v2 | `clamp(1.5rem, 5vw, 2rem)` (override propio, **más chico** que el resto) | `0.6875rem` |

**Lectura:** Reta/Liga/Americano ya comparten el mismo `ModeHeader` genérico (`clamp(1.75rem,5vw,3rem)`), pero TE tiene su propio título de gestión más contenido, y Duelo definió un tercer tamaño. Ninguno de los 3 "genéricos" iguala exactamente al de TE.

### 3.9 Botones — altura

| Modo | Botón primario típico |
|------|------------------------|
| Torneo Express | `min-height: 44px` (touch target genérico) |
| Reta | `48px` (CTA iniciar), `44px` (touch genérico) |
| Liga | sin altura explícita documentada por encima de `--ro-touch-target-min` (44px) |
| Americano | `48px` (CTA iniciar torneo) |
| Duelo 2v2 | `48px` desktop → `44px` ≤480px (ScoreEditor); botones ronda `~32-36px` (padding `8px 18px`, **por debajo del target táctil**) |

### 3.10 Tabs

| Modo | Implementación | Scroll horizontal | Altura mínima | Estado activo |
|------|-----------------|---------------------|-----------------|-----------------|
| Torneo Express | `ModeSectionTabs` (móvil) + tabs propias de gestión (desktop, `.te-grupos-tab`) | Sí (móvil) | `44px` | fondo `--ro-accent` blanco, texto invertido |
| Reta | `ModeSectionTabs` (solo móvil ≤767px) | Sí | `44px` | borde blanco + fondo `rgba(255,255,255,0.08)` |
| Liga | **implementación propia** `.liga-tabs`/`.liga-tab` | **No** (`flex-wrap`, sin overflow-x) | `~40-44px` implícito (padding `9px 22px`) | fondo gold sólido |
| Americano | `ModeSectionTabs` (solo móvil ≤767px) | Sí | `44px` | igual a Reta |
| Duelo 2v2 | `ModeSectionTabs` (solo móvil ≤767px) | Sí | `44px` | igual a Reta |

**Lectura:** Liga es el único modo cuyas tabs **no** hacen scroll horizontal ni usan el componente compartido — si se agregan más de 3-4 tabs, en pantallas de 320-360px las tabs de Liga se apilan en 2 filas en vez de deslizar.

### 3.11 Formularios

| Modo | Layout desktop | Layout móvil | Altura input |
|------|------------------|----------------|----------------|
| Torneo Express | 2 columnas (main/aside, `min-width: 900px`) | 1 columna | `48px`, `font-size: 16px` (evita zoom iOS) |
| Reta | grid variable por sección | 1 columna | no confirmado explícitamente en móvil (revisar en Fase de implementación) |
| Liga | 2 columnas → 1 col `@max-width: 600px` | 1 columna | `44px` (pool grid) |
| Americano | grid `auto-fit minmax(160px,1fr)` → 1 col `@639px` | 1 columna, `44px`, `font-size: 16px` | Sí cumple regla anti-zoom |
| Duelo 2v2 | 4 cols → 2 (`@900px`) → 1 (`@640px`) | 1 columna | `48px` (formulario), inputs sets no confirmados |

### 3.12 Tablas / standings móviles

| Modo | ¿Tiene mobile-cards? | Breakpoint de swap |
|------|--------------------------|----------------------|
| Torneo Express | Sí (`.te-standings-mobile-cards`) | `767px` |
| Reta | Sí (`StandingsMobileCards`) | `768px` |
| Liga | Parcial: `LigaRanking` y `LigaSimpleRankingDual` sí; `LigaRankingEquipos` (ranking por parejas) **no** — solo tabla con scroll-x | `767px` (donde existe) |
| Americano | Sí (`StandingsMobileCards`) | `768px` |
| Duelo 2v2 | **No aplica** (no hay tabla de standings en este modo) | — |

### 3.13 CTA / sticky footer móvil

| Modo | ¿Monta `MobileStickyActionFooter`? | Altura | Safe-area |
|------|----------------------------------------|--------|-------------|
| Torneo Express | Sí | `64px` | Sí (`env(safe-area-inset-bottom)`) |
| Reta | Sí | `64px` | Sí |
| Liga | **No** (CSS existe pero no se monta en ninguna pantalla) | — | — |
| Americano | **No** (CSS preparado, sin uso) | — | — |
| Duelo 2v2 | Sí (condicional a `ganador && !finalizado`) | `64px` | Sí |

### 3.14 Safe area

Todos los modos que usan `GameModeShell`/shell móvil heredan `--ro-safe-bottom: env(safe-area-inset-bottom, 0px)` a través de `mode-mobile-shell.css`. **Duelo 2v2** además tiene su propio manejo redundante en `.duelo2v2-page` (`max(3rem, env(safe-area-inset-bottom))`). No se detectaron casos sin ningún manejo de safe-area en pantallas con sticky footer.

---

## 4. Principales inconsistencias

Clasificadas como se pidió: **correcta**, **inconsistencia**, **deuda técnica**, **riesgo móvil**, **problema UX**.

| # | Descripción | Modo(s) | Clasificación |
|---|-------------|---------|-----------------|
| 1 | Liga no usa `ModeEventHeader`/`ModeSectionTabs`/`ModeSectionPanel`/`MobileStickyActionFooter` | Liga | **Deuda técnica** |
| 2 | Liga: tabs sin scroll horizontal (`flex-wrap`) — riesgo de 2 filas en pantallas angostas | Liga | **Riesgo móvil** |
| 3 | 5 max-width admin distintos (720 / 1100 / 1100 / 1200 / 1280) sin relación matemática entre ellos | Todos | **Inconsistencia** |
| 4 | Americano: padding móvil fijo (`16px`) en vez de `clamp()` | Americano | **Inconsistencia** |
| 5 | Ningún modo (excepto TE) usa exactamente el gap de cards de `10px` de la referencia | Todos | **Inconsistencia** |
| 6 | `--liga-radius-lg` (16px) diverge de `--ro-radius-lg` (14px); solo se corrige si el nodo también tiene `.rv-card` | Liga | **Deuda técnica** |
| 7 | Solo Reta tiene una "danger zone" visual (`.reta-danger-zone`, roja, separada) — Liga/Americano/Duelo mezclan destructivas junto al CTA primario en la misma barra | Liga, Americano, Duelo | **Problema UX** |
| 8 | Botones de ronda en Americano (`~32-36px`) por debajo del target táctil de 44px | Americano | **Riesgo móvil** |
| 9 | `LigaRankingEquipos` no tiene versión de cards móviles — tabla con scroll horizontal forzado en pantallas de 320-360px | Liga | **Riesgo móvil** |
| 10 | `LigaDetalle.tsx` existe, tiene CSS legacy (`.liga-title`, sin `ModeHeader`) y **no está enrutado** — código muerto que puede confundir a futuros desarrolladores | Liga | **Deuda técnica** |
| 11 | `.liga-jornada-toolbar` definido en CSS (72 líneas) sin ningún JSX que lo use | Liga | **Deuda técnica** |
| 12 | `Duelo2v2SetsBreakdown.tsx` + CSS completo, sin ningún import de uso | Duelo 2v2 | **Deuda técnica** |
| 13 | `MatchCard` (platform) tiene 0 imports externos — cada modo reimplementa su propia match card | Todos | **Deuda técnica / oportunidad** |
| 14 | 3 taxonomías de badge de estado (`StatusBadge`, `Badge`/`riviera-badge`, badges locales por modo) con los mismos colores redefinidos 4 veces | Todos | **Deuda técnica** |
| 15 | `DESIGN_SYSTEM.md` documenta "sin dorado" pero el dorado (`#c9a227`) es central en 4 de 5 modos (todo excepto la ficción "Precision Dark" pura) | Todos (doc vs realidad) | **Problema UX / documentación desalineada** |
| 16 | Alias legacy `--accent-gold` en realidad mapea a blanco (`--ro-accent`), no a dorado — nombre engañoso que ya causó confusión (ver Liga/Americano con dos "dorados" distintos convivientes) | Todos | **Deuda técnica** |
| 17 | Breakpoints sin estandarizar: Americano usa 11 valores propios (360/389/390/480/559/560/639/720/767/768/769/900/901/960) que no coinciden con los 4 breakpoints documentados (480/768/1024/1200) | Americano (y en menor medida todos) | **Deuda técnica** |
| 18 | Caption de `LiveRanking` (Americano) usa tamaño de fuente `1.4rem` display en vez de tamaño de body — desalineado con el resto de captions (`0.8125rem`) | Americano | **Inconsistencia** |
| 19 | Doble padding en Liga: `.liga-page` (shell propio) + `.rv-shell` (heredado de `GameModeShell`) se acumulan en el mismo nodo | Liga | **Deuda técnica** |
| 20 | Reta usa `PublicLinkSection` (legacy, acoplado a `Tournament`) en vez de `PublicShareSection` (compartido) que ya usan Liga/Americano/Duelo | Reta | **Deuda técnica** |
| 21 | Torneo Express (admin) **no** usa `PublicShareSection` ni `StatusBadge` en absoluto — tiene sus propios "copiar enlace" y pills de estado (`.te-badge-*`, `.te-gestion-estado-pill`) a pesar de ser la referencia | Torneo Express | **Inconsistencia** (nota: no forzar TE a cambiar, ver Sección 10) |
| 22 | `RoundHistory` (Americano) usa `#ffd600` hardcodeado para score en vez del token `--ro-gold` (`#c9a227`) | Americano | **Deuda técnica** |
| 23 | 3 umbrales de breakpoint distintos convivendo en la misma pantalla de Americano (`720` para el shell, `767` para tabs, `768` para ranking) — un elemento puede cambiar de layout "a medias" en una ventana de 47px | Americano | **Riesgo móvil** |
| 24 | Vista pública de Americano tiene DOS shells completamente distintos: `PublicAmericanoView` reutiliza `PublicTorneoExpressShell`, pero `PublicAmericanoResultsBoard` (display TV) tiene su propio shell aislado sin relación con el resto | Americano | **Inconsistencia** |
| 25 | `EmptyState` (platform) solo se usa en 1 archivo (`GestionGrupos`, 3 instancias); los demás modos reimplementan su propio empty state (`.elegant-empty-state`, `.liga-empty`, `.home-empty-retas`) | Todos excepto TE | **Deuda técnica** |

---

## 5. Flujo del organizador (análisis mental)

### Reta (Round Robin / Equipos)

```
Quick Start (modal, fuera de shell) → crear con nombre + canchas
        ↓
/reta/:id — TODO en una sola ruta
   Resumen (Start/Public link) → Jugadores/Parejas → Partidos → Clasificación → Config (+ danger zone)
        ↓
Iniciar torneo → Resultados → Cerrar (WinnerScreen, vista separada sin shell)
```

**Problemas detectados:**
- **Acciones escondidas:** el toggle Round Robin vs Equipos vive en el modal de creación (Quick Start), no en la pantalla de gestión — si el organizador quiere revisar la config del formato después, no hay a dónde ir salvo scrollear la sección "Start" de nuevo.
- **Scroll innecesario (desktop):** 5 secciones completas en una sola columna sin tabs — el organizador debe scrollear toda la página para llegar a Clasificación si ya inició el torneo.
- **Zona de peligro bien resuelta en móvil, ausente en desktop:** en desktop, "Resetear reta" vive dentro de la card de estado sin separación visual roja — inconsistente con su propio comportamiento móvil.
- **WinnerScreen es una isla:** no comparte el shell de la gestión; el botón de volver usa su propia clase (`.elegant-winner-back-btn`), rompiendo la continuidad visual justo en el momento de cierre, que debería sentirse como el clímax coherente del flujo.

### Liga

```
Home (lista) → Nueva liga (form) → Gestionar (tabs: Jugadores/Parejas ↔ Jornadas)
        ↓
   Ir a una Jornada → capturar resultados → Recalcular → Finalizar jornada
        ↓
Repetir por cada jornada → Finalizar liga
```

**Problemas detectados:**
- **Acciones destructivas junto al CTA primario:** en `LigaGestionar`, "Iniciar liga" (primary), "Reiniciar liga" (danger) y "Eliminar liga" (danger) viven en la MISMA `ActionBar`, separados solo por `variant`. Un organizador apurado en móvil, con dedos grandes, puede tocar "Eliminar liga" pensando que toca "Iniciar liga" si la fila se reordena por wrap.
- **Información repetida:** el estado de la liga aparece en el `subtitle` del header Y en badges de lista — sin un lugar único de verdad visual.
- **Tabs mal ordenadas para el flujo real:** el orden es Jugadores/Parejas → Jornadas, pero el organizador solo visita "Jugadores/Parejas" una vez al inicio y "Jornadas" repetidamente durante toda la temporada — la tab más usada no es la primera.
- **Pantalla huérfana confusa:** `LigaDetalle.tsx` (sin ruta) sugiere que hubo una versión anterior de esta pantalla que fue reemplazada sin limpiar — riesgo de que alguien la reactive por error o la edite pensando que está viva.

### Americano

```
Quick Start (modal) → crear con nombre + canchas
        ↓
/americano-dinamico (1 sola URL, cambia por fase)
   Registro (elegir jugadores + rondas) → Iniciar torneo
        ↓
   Jugando: Ronda actual → confirmar resultados → Ranking en vivo → Historial
        ↓
Finalizado: podio + ranking final + historial
```

**Problemas detectados:**
- **Demasiadas acciones visibles en desktop "Playing":** ronda + ranking + historial se apilan todos en una sola columna sin tabs (las tabs solo aparecen ≤767px) — en desktop es scroll largo sin manera de "saltar" a Ranking.
- **Botones de ronda pequeños:** `Confirmar resultados` / `Ronda finalizada` tienen altura ~32-36px, por debajo del estándar táctil de 44px que sí cumplen los CTAs principales del mismo flujo — inconsistencia dentro de la MISMA pantalla.
- **Acción "Quitar" jugador sin confirmación visual fuerte:** solo cambia de color (rojo tenue), sin modal ni "zona de peligro" — fácil de tocar por accidente en el grid de selección.
- **Doble vista pública sin relación:** `PublicAmericanoView` (para compartir) y `PublicAmericanoResultsBoard` (para proyectar en TV) tienen shells, headers y tipografías completamente distintas — un organizador que comparte el link normal y luego proyecta el "board" en una pantalla del club verá dos productos visualmente diferentes del mismo torneo.

### Duelo 2v2

```
Home (lista) → Nuevo duelo (form + armar 2 parejas)
        ↓
Gestionar: Resumen/Meta → Equipos (solo lectura) → Editor de resultado (sets)
        ↓
Finalizar y sumar al ranking → Celebración (cierre visual)
```

**Problemas detectados:**
- **Parejas inmutables tras crear:** la tab "Equipos" en Gestionar es solo lectura — si el organizador se equivocó de jugador, debe eliminar el duelo completo y crear uno nuevo. No hay error visible, es simplemente una limitación silenciosa.
- **Sin standings/ranking en el modo:** el texto dice "sumar al ranking" pero no hay ninguna pantalla dentro de Duelo que muestre ese ranking — el organizador tiene que salir del modo para verificar el efecto de su acción.
- **Doble sistema tipográfico dentro de la misma pantalla:** el header usa clases `rv-*` (compartidas), pero el tablero en vivo (`LiveBoard`) y la celebración usan clases `duelo2v2-*` hardcodeadas con su propia escala — se nota un salto visual entre "arriba" (compartido) y "abajo" (propio) en la misma vista de Gestionar.
- **Eliminar sin separación:** en Home, "Eliminar" es un botón ghost dentro del mismo bloque de acciones que "Gestionar", separado solo por un `border-top` — no hay fricción visual acorde a la gravedad de la acción (se pierde historial del duelo).

### Torneo Express (referencia — para comparar contra los anteriores)

```
Inicio (hub) → Eventos (lista) o Torneo Express suelto (lista)
        ↓
Crear evento / Crear torneo → Detalle de evento (branding + categorías)
        ↓
Gestionar (tabs: Resumen/Grupos/Partidos/Eliminación/Config)
        ↓
Grupos → Eliminatoria (bracket) → Finalizar fase → Finalizar torneo
        ↓
Vistas públicas: flyer → grupos → tabla general → bracket en vivo
```

**Por qué funciona mejor:**
- Las acciones destructivas más graves ("Reiniciar eliminatoria") usan `variant="danger"` explícito y además requieren un modal de confirmación dedicado (`TorneoExpressResetEliminatoriaModal`) — dos capas de fricción, no solo una.
- "Finalizar torneo" no es un botón suelto: abre una caja de confirmación inline (`.te-gestion-finalizar-confirm`) con `max-width` acotado, obligando a una decisión consciente antes de ejecutar.
- El orden de tabs (Resumen → Grupos → Partidos → Eliminación → Config) sigue el orden temporal real del torneo.
- Tiene el único ejemplo de patrón "hub" (A1) que ofrece dos caminos claros (Eventos vs Torneo Express suelto) sin ambigüedad — los otros 4 modos no necesitan este patrón por ser de un solo tipo de entidad, pero confirma que TE piensa la jerarquía de navegación de forma más deliberada.

---

## 6. Contrato visual

**Base:** el estado ACTUAL de Torneo Express (Sección 2.1, 3.x). Este contrato distingue explícitamente qué es **patrón global** (candidato a compartirse) vs **patrón exclusivo de TE** (no forzar en otros modos).

### 6.1 Qué es reutilizable vs exclusivo de TE

| Elemento de TE | ¿Reutilizable? | Nota |
|-----------------|------------------|------|
| Shell `TePageShell` → `GameModeShell` | Sí (`GameModeShell` ya es compartido) | El wrapper propio (`torneo-express-page`) NO se fuerza en otros modos |
| Tabs de gestión (`ModeSectionTabs`, móvil) | Sí | Ya compartido; falta Liga |
| Sistema de cards (`torneo-express-card`) | Sí, como patrón (padding/radio/gap) | El nombre de clase NO se comparte, se define un token/patrón neutro |
| `ModeEventHeader` (móvil) | Sí | Ya compartido; falta Liga |
| `MobileStickyActionFooter` | Sí | Ya compartido en 3/5; falta Liga y Americano |
| Bracket / eliminatoria visual | **No** | Exclusivo de TE — no forzar en Reta/Liga/Americano/Duelo |
| Gestión de grupos / fases | **No** | Exclusivo de TE |
| Flyer de evento público | **No** | Exclusivo de TE (aunque Reta y Americano ya reutilizan el SHELL público de TE, no el flyer) |
| Agenda por cancha/horario | **No** | Exclusivo de TE |
| Confirmación inline para "Finalizar" (`.te-gestion-finalizar-confirm`) | Sí, como patrón de interacción | Aplicable a "Finalizar liga", "Finalizar duelo", "Finalizar torneo americano" |
| Modal de confirmación para reset destructivo | Sí, como patrón | Aplicable a cualquier acción irreversible de cualquier modo |

### 6.2 SHELL

Basado en `GameModeShell` (`rv-page rv-shell`) + el patrón de padding de gestión de TE.

| Propiedad | Valor propuesto | Fuente |
|-----------|-------------------|--------|
| `max-width` admin | `1200px` | TE hub/lista/gestión (ya es el valor más frecuente: TE lo usa en 2 contextos) |
| `max-width` público (default) | `900px` | TE público default |
| `max-width` público (wide, cuando el contenido lo pide — grids anchos, brackets) | `min(1600px, 98vw)` o `none` según necesidad | TE eliminatoria / grupos wide |
| padding móvil (X) | `clamp(14px, 3.8vw, 18px)` | Token existente `--ro-mobile-page-padding`, ya usado por TE |
| padding desktop (X) | `clamp(0.65rem, 2.5vw, 1.25rem)` (gestión) o `clamp(16px, 4vw, 28px)` (shell genérico) | TE gestión / `--ro-shell-padding-x` |
| padding desktop (Y) | `clamp(12px, 2vw, 20px)` | `--ro-shell-padding-y` |
| safe area inferior | `env(safe-area-inset-bottom, 0px)` vía `--ro-safe-bottom` | ya token compartido |
| espacio inferior con sticky footer activo | `padding-bottom: var(--mobile-sticky-action-offset)` = `64px + safe-area + 8px` | `mode-mobile-shell.css`, ya token compartido |
| separación vertical entre secciones | `clamp(20px, 3vw, 28px)` | TE inicio |

**Compatibilidad de viewport (verificar en cada fase):** 320, 360, 390, 430, 768px. Ninguna medida del contrato usa unidades fijas menores a esos anchos sin `clamp`/`min`/`%`.

### 6.3 HEADER

**Orden obligatorio (ya es el orden real de `ModeEventHeader`, con un ítem adicional pedido por el usuario que hoy no existe explícito: "información secundaria" al final):**

```
1. volver              → ActionBar + Button variant="back" (fuera del header, en toolbar)
2. eyebrow             → .mode-event-header__eyebrow (0.6875rem, uppercase, tracking 0.08-0.16em)
3. título              → .mode-event-header__title (1.125rem móvil / clamp(1.75rem,3.2vw,2.125rem) desktop TE)
4. estado (badge)      → StatusBadge, junto al título en la misma fila (__top)
5. modalidad           → .mode-event-header__modality (0.8125rem)
6. resumen             → .mode-event-header__summary (0.8125rem)
7. acciones            → botón next-action (mode-event-header__next) o ActionBar con CTAs
8. información secundaria → NUEVO slot a definir en implementación (ej. fecha/hora, cancha, contador) — hoy no existe como slot formal en ningún modo; se recomienda agregarlo como children opcional de ModeEventHeader, sin romper el contrato existente
```

Este orden ya es el implementado por `ModeEventHeader.tsx` en Reta/Duelo/Americano/TE (pasos 2-7). El paso 1 vive fuera del componente (en la `ActionBar` de toolbar) en los 4 modos que sí lo usan. El paso 8 es la única adición nueva del contrato — se implementa en Fase 1 (Sección 10) sin romper compatibilidad porque es un slot opcional.

### 6.4 CARDS

Basado en la gestión de grupos de TE (`torneo-express-card` / `te-grupos-card` / `te-gestion-card`).

| Variante | Uso | Valores base |
|----------|-----|----------------|
| **Primary** | Card de contenido principal (grupo, jornada, ronda, partido) | `padding: 1.25rem 1.5rem 2rem`; `border-radius: 14px` (`--ro-radius-lg`); `border: 0.5-1px solid --ro-border-subtle`; `margin-bottom: 1.5rem` |
| **Subtle** | Card secundaria/informativa (meta, resumen) | mismo radio/padding, `background` un tono más claro que la página, sin `box-shadow` |
| **Interactive** | Card clickeable (item de lista que navega) | igual a Primary + `cursor: pointer` + hover con `border-color` acentuado |
| **Warning** | Alertas no destructivas (ej. "faltan jugadores") | fondo ámbar tenue, borde ámbar, mismo radio |
| **Completed** | Estado finalizado (partido jugado, ronda cerrada) | opacidad reducida en contenido (`0.55-0.7`) manteniendo el radio/padding — **no** cambiar el tamaño |
| **Danger** | Contenedor de zona de peligro (ver 6.5) | fondo rojo tenue `rgba(248,113,113,0.06)`, borde `rgba(248,113,113,0.28)`, mismo radio 14px, `padding: 1rem 0.9rem` — ya existe en Reta (`.reta-danger-zone`), se generaliza |

Gap entre cards en listas: `10px` (valor real de TE).

### 6.5 TABS

Comportamiento de `ModeSectionTabs` (ya implementado, se convierte en obligatorio para los 5 modos):

- `min-height: 44px` por botón.
- `overflow-x: auto` + `-webkit-overflow-scrolling: touch` (scroll horizontal, nunca wrap).
- Estado activo: `border-color: --ro-accent` + `background: rgba(255,255,255,0.08)`.
- Etiquetas cortas (máx. ~10-12 caracteres visibles: "Resumen", "Grupos", "Partidos", "Config.").
- Orden por flujo temporal real del organizador (ver hallazgo de Liga en Sección 5 — su reordenamiento de tabs es parte de la migración).
- Visible solo `@media (max-width: 767px)`; en desktop el contenido se distribuye en secciones verticales o columnas (según Sección 9).

### 6.6 ACCIONES

- **Una sola CTA primaria** visible por pantalla/sección (`variant="primary"`).
- **Máximo dos secundarias visibles** simultáneamente (`variant="secondary"` o `"ghost"`).
- **Destructivas siempre separadas**, nunca en la misma `ActionBar` que el CTA primario:
  - Si es de bajo impacto (ej. quitar un jugador de una lista antes de iniciar) → botón ghost/danger inline, sin necesidad de modal.
  - Si es de alto impacto (eliminar liga/torneo/duelo, reiniciar eliminatoria, resetear reta) → **card "Danger" separada** (patrón `.reta-danger-zone` generalizado) + modal de confirmación cuando la acción es irreversible y afecta a más de una entidad.
- **Sticky footer móvil** cuando exista una acción de progreso claro ("Iniciar", "Finalizar", "Ver resultados") que el usuario deba poder ejecutar sin buscarla — patrón ya implementado en TE/Reta/Duelo, pendiente en Liga/Americano.

### 6.7 FORMULARIOS

- Una columna en móvil, siempre.
- Máximo dos columnas en desktop, y solo si los campos son cortos y relacionados (ej. cancha + horario).
- Inputs con `min-height: 44px` y `font-size: 16px` (evita zoom automático en iOS) — ya cumplido por TE y Americano; pendiente de confirmar en Reta y Duelo durante implementación.
- Errores debajo del campo, no en un bloque separado al final del formulario.
- Botones de formulario con el mismo sistema de `Button` (`variant`/`size`) usado en toda la app — no crear nuevas clases de botón.

### 6.8 ESTADOS

| Estado | Tratamiento visual esperado |
|--------|-------------------------------|
| loading | texto centrado + posible skeleton (TE y Americano ya usan texto simple: "Cargando…") |
| empty | card con ícono + título + descripción + acción opcional (patrón `EmptyState`, hoy infrautilizado) |
| warning | banner con fondo ámbar tenue (ya existe: `.liga-banner--warn`) |
| success | confirmación visual breve (toast/notice), no bloqueante |
| error | mensaje inline en rojo, cerca del punto de fallo, nunca solo en consola |
| pending | `StatusBadge variant="pending"` (gris) |
| completed | `StatusBadge variant="muted"` + card en variante "Completed" (6.4) |
| live | `StatusBadge variant="live"` (verde/dorado según contexto) + posible animación sutil (pulso), ya usado en badges de duelo/americano |

### 6.9 TABLAS

- **Cards en móvil, tabla en desktop** — patrón ya implementado vía `StandingsMobileCards`, con el breakpoint de swap en `767-768px` (unificar a uno solo, ver Sección 7).
- Scroll horizontal **solo** cuando la tabla tenga más columnas de las que el ancho móvil permite sin cards (ej. `LigaRankingEquipos`, que hoy no tiene versión de cards — ver Sección 4 #9, es deuda a resolver, no un patrón a preservar).

### 6.10 JERARQUÍA TIPOGRÁFICA

Basada en los tamaños reales de `ModeHeader`/`ModeEventHeader` de TE, ya vigentes vía tokens `--ro-text-*`:

| Nivel | Tamaño | Selector de referencia |
|-------|--------|--------------------------|
| Título (pantalla, desktop) | `clamp(1.75rem, 3.2vw, 2.125rem)` (gestión) / `clamp(1.9rem, 4.5vw, 2.75rem)` (hub) | `.te-gestion-title` / `ModeHeader` |
| Título sección | `1.125rem` | `.mode-event-header__title` (móvil) |
| Metadata (modalidad/resumen) | `0.8125rem` | `.mode-event-header__modality/__summary` |
| Body | `0.875rem` | `--ro-text-body` |
| Caption | `0.6875rem`–`11px` | `--ro-text-label` / `.te-label-section` |
| Badges | `0.7rem`–`0.8125rem` según variante | `.rv-pill`, `.mode-section-tabs__btn` |
| Valores destacados (scores) | `clamp(2rem, 5-6vw, 4.5rem)` | Duelo/Americano live board (patrón a mantener, es exclusivo de vistas "en vivo") |

---

## 7. Componentes compartidos (propuestos/evaluados)

**Regla:** no se inventa nada que ya exista. Se evalúa el estado actual de cada componente pedido y se marca "ya existe" vs "no existe — proponer".

### 7.1 `ModePageShell`

**Estado:** no existe con ese nombre exacto. Lo más cercano es `GameModeShell` (`src/components/platform/GameModeShell.tsx`), ya usado por los 5 modos (directa o indirectamente vía sus PageShell propios: `TePageShell`, `LigaPageShell`, `Duelo2v2PageShell`, `AmericanoModeShell`).

- **Responsabilidad:** contenedor raíz de página de modo — `max-width`, padding responsive, color base.
- **Props actuales:** `{ children, className }`.
- **Variantes:** hoy solo se diferencia por `className` (cada modo pasa su propia clase de override). No tiene variantes formales (`density`, `wide`, etc.).
- **Accesibilidad:** ninguna consideración especial hoy (es un `div`).
- **Usos actuales:** 5/5 modos (directo o vía wrapper propio).
- **Compatibilidad:** total — ya es el punto de entrada común. **No requiere migración**, solo estandarizar qué `className` recibe cada modo según el contrato de la Sección 6.2.

### 7.2 `ModeEventHeader`

**Estado:** existe (`src/components/platform/ModeEventHeader.tsx`).

- **Responsabilidad:** header de "evento en curso" para la vista tabbed móvil (eyebrow + título + badge + modalidad + resumen + next-action).
- **Props actuales:** `eyebrow?`, `title`, `modality?`, `statusLabel`, `statusVariant?`, `summary?`, `nextActionLabel?`, `onNextAction?`.
- **Variantes:** ninguna formal — el "look" es fijo.
- **Accesibilidad:** usa `h2` para título; el botón next-action es un `<button>` semántico.
- **Usos actuales:** Reta, Duelo, Americano, TE (4/5). **Falta Liga.**
- **Compatibilidad:** alta — es puramente móvil (`display: none` en desktop), agregarlo a Liga no afecta su desktop actual.
- **Gap identificado en este documento:** no tiene slot para "información secundaria" (punto 8 del contrato de header, Sección 6.3) — requiere una prop `children` o `secondaryInfo` opcional, aditiva y no rompiente.

### 7.3 `ModeSectionTabs`

**Estado:** existe (`src/components/platform/ModeSectionTabs.tsx`).

- **Responsabilidad:** tabs móviles con scroll horizontal para navegar secciones de una pantalla de gestión.
- **Props actuales:** `tabs: {id, label}[]`, `activeId`, `onChange`, `ariaLabel`, `className?`.
- **Variantes:** ninguna.
- **Accesibilidad:** requiere verificar en implementación que cada botón tenga `role="tab"`/`aria-selected` (no confirmado en la auditoría — revisar antes de generalizar a Liga).
- **Usos actuales:** Reta, Duelo, Americano, TE (4/5). **Falta Liga** (usa `.liga-tabs` propio, sin scroll horizontal).
- **Compatibilidad:** alta, mismo motivo que 7.2.

### 7.4 `ModeSectionPanel`

**Estado:** existe (`src/components/platform/ModeSectionPanel.tsx`).

- **Responsabilidad:** contenedor de contenido de una tab, con `hidden` cuando no está activo.
- **Props actuales:** `id`, `activeId`, `labelledBy?`, `children`, `className?`.
- **Limitación documentada:** los paneles inactivos permanecen montados en el DOM (`hidden`, no `unmount`) — aceptable para la mayoría de casos, pero a vigilar si algún panel de Liga resulta pesado (ej. tabla completa de standings).
- **Usos actuales:** mismos 4 modos que 7.2/7.3.
- **Compatibilidad:** alta.

### 7.5 `ModeCard`

**Estado:** existe (`src/components/platform/ModeCard.tsx`), pero **su uso real está limitado al home** (`GameModeCard` → grid de modos de juego en la pantalla de inicio), no a las cards internas de gestión de ningún modo.

- **Responsabilidad actual:** card grande de "modo de juego" en el home (título, descripción, ícono, CTA, estado disabled).
- **Props:** `title`, `description`, `typeLabel?`, `icon?`, `ctaLabel?`, `disabled?`, `onClick?`, `className?`, `style?`, `children?`.
- **Gap:** no cubre el caso de uso pedido en el contrato (Sección 6.4: Primary/Subtle/Interactive/Warning/Completed/Danger para cards DENTRO de un modo). Es un componente distinto al que hace falta.
- **Recomendación:** no reusar `ModeCard` para las cards internas — evaluar en Fase 1 (Sección 10) si se necesita un componente nuevo (`ModeCard` variantes internas) o si basta con una clase CSS compartida (`.mode-card`, `.mode-card--danger`, etc.) aplicada sobre el `.rv-card` que ya existe.

### 7.6 `ModeSectionHeader`

**Estado:** no existe como componente. El patrón "título de sección dentro de una card" hoy se resuelve con markup ad-hoc por modo (`<h3>Partidos</h3>` + contador en TE/Reta/Americano, cada uno con su propia clase).

- **Propuesta (para evaluar en implementación, no en este documento):** componente ligero `title + optional badge/count + optional action` para encabezar bloques dentro de una card, sin ser el header de toda la pantalla.
- **Prioridad:** baja frente a los gaps de Liga (Sección 10 no lo prioriza en Fase 1-2).

### 7.7 `ModeEmptyState`

**Estado:** no existe con ese nombre. Existe `EmptyState` (`src/components/platform/EmptyState.tsx`) con props `icon?`, `title`, `description?`, `action?`, `className?` — pero **solo se usa en 1 archivo** (`GestionGrupos.tsx`, 3 instancias).

- **Patrones ad-hoc que lo sustituyen hoy:** `.elegant-empty-state` (Reta), `.liga-empty` (Liga, markup inline), `.home-empty-retas` (home), texto simple en Duelo/Americano.
- **Recomendación:** renombrar/re-exportar `EmptyState` como el "ModeEmptyState" pedido (o simplemente generalizar su adopción sin renombrar, para minimizar el cambio) — es efectivamente el mismo componente, solo con adopción baja.

### 7.8 `ModeInlineNotice`

**Estado:** no existe como componente unificado. Hoy cada modo tiene su propio "banner" (`.liga-banner--warn`, `riviera-inline-error` en Reta, mensajes de sync warning en Americano/Liga).

- **Propuesta:** unificar en un componente con variantes `info/warning/error/success`, reemplazando los banners ad-hoc.
- **Prioridad:** media — no bloquea la Fase 1 de plataforma compartida, pero es candidato natural para la Fase 1 junto con ModeEmptyState.

### 7.9 `ModeFormGrid`

**Estado:** no existe. Cada modo define su propio grid de formulario (`.duelo2v2-form__schedule-row`, `.te-crear-layout`, `.liga-form-row`) con breakpoints propios y no coordinados (ver Sección 3.11).

- **Propuesta:** componente/utility CSS que reciba `columns={1|2}` y aplique automáticamente el colapso a 1 columna en móvil según el contrato 6.7.

### 7.10 `ModeDangerZone`

**Estado:** no existe como componente reutilizable. Existe el patrón CSS `.reta-danger-zone` (solo en Reta, solo en la tab móvil de Config).

- **Propuesta:** generalizar `.reta-danger-zone` a un componente/clase `.mode-danger-zone` (Sección 6.4, variante "Danger") reutilizable en Liga (Eliminar/Reiniciar liga), Americano (no tiene destructivas graves hoy, pero es candidato a futuro), Duelo (Eliminar duelo).
- **Prioridad:** alta — es uno de los "problemas UX" más repetidos en la Sección 4 (#7).

### 7.11 `MobileStickyActionFooter`

**Estado:** existe (`src/components/platform/MobileStickyActionFooter.tsx`).

- **Responsabilidad:** barra de acción fija en la parte inferior en móvil.
- **Props actuales:** `{ children, className? }`.
- **Limitación documentada:** `aria-label` fijo ("Acción principal") — no configurable, podría ser un problema de accesibilidad si dos sticky footers distintos coexistieran (no es el caso hoy).
- **Usos actuales:** Reta, Duelo, TE (3/5). **Faltan Liga y Americano.**
- **Compatibilidad:** alta, requiere que el modo ya tenga clase `has-mobile-sticky-action` en su shell para el padding-bottom correcto (Liga y Americano necesitarán agregar esa clase condicional).

### 7.12 Otros componentes reutilizables ya existentes (no pedidos explícitamente, pero relevantes)

| Componente | Estado | Nota |
|------------|--------|------|
| `ModeHeader` | Existe, usado en ~17 archivos (headers de "entrada"/listas de todos los modos) | Ya es el más adoptado — no confundir con `ModeEventHeader` (este es para vistas de "evento en curso") |
| `ActionBar` | Existe, el más homogéneo (~25 usos en 18 archivos, 5/5 modos) | Sin gaps relevantes |
| `Button` (`ui/Button.tsx`) | Existe, adoptado en ~50 archivos | Coexiste con clases CSS crudas `.riviera-btn*` sin pasar por el componente — deuda menor, no bloqueante |
| `StatusBadge` | Existe, usado en headers móviles + 6 vistas públicas | Ver Sección 4 #14 — coexiste con 2 sistemas de badge más |
| `PublicShareSection` | Existe, usado en Liga/Americano/Duelo (2-4 usos cada uno) | Reta usa legacy `PublicLinkSection`; TE admin no usa ninguno de los dos |
| `PublicModeShell` | Existe, usado en vistas públicas de Liga/Duelo/TE/jugadores | Base del shell público, ya compartido |
| `MatchCard` (platform) | Existe pero **0 imports externos** — código muerto/preparado | Candidato de Fase 2+ para absorber las match cards propias de cada modo |
| `RankingCard` | Existe, solo 1 uso (`LiveRanking`, Americano) | Subutilizado, evaluar en fase de standings |

---

## 8. Tokens

### 8.1 Auditoría de familias existentes

| Familia | Archivo fuente | Rol | Estado |
|---------|-------------------|-----|--------|
| `--ro-*` / `--rv-*` | `src/styles/riviera-open-tokens.css` | Fuente de verdad documentada (`DESIGN_SYSTEM.md`) | Vigente, pero incompleta para el contrato de "modo" (Sección 6) |
| legacy sin prefijo (`--space-*`, `--radius-lg`, `--accent-gold`, `--te-*`, `--mode-*`) | `src/styles/riviera-tokens.css` | Puente de compatibilidad hacia código antiguo | Vigente; **`--accent-gold` mapea a blanco, no a dorado** (fuente de confusión, Sección 4 #16) |
| `--ro-pub-*` | `src/styles/riviera-public-tokens.css` | Scoped a vistas públicas (`.ro-public-view`) | Vigente |
| `--pub-*` (PEDS) | `src/styles/riviera-peds-tokens.css` | Sistema estructural nuevo (density/space/radius/shadow/motion), sin color de marca | **Marcado como "no importar hasta Sprint 2+" en su propio archivo, pero `PublicModeShell` ya lo importa** — inconsistencia interna a resolver antes de construir el contrato sobre él |
| `--liga-*` | `src/components/liga/liga-tokens.css` | Espaciado/radio/color propios de Liga | Duplica `--ro-*` con valores ligeramente distintos (Sección 4 #6) |
| `--liga-pub-*` | scoped en `.liga-pantalla` | Colores/radios de Liga pública (radios 4-6px) | Sistema de diseño paralelo — mayor divergencia detectada en todo el inventario |
| `--te-*` | `riviera-tokens.css` + overrides en `.torneo-express-page` | Alias hacia tokens Riviera + overrides de gestión (`--te-gestion-max`, etc.) | Vigente, funcional |
| `--mobile-sticky-*` | `src/styles/mode-mobile-shell.css` | Altura/offset de sticky footer | Vigente, ya compartido |
| `--brand-*` / `--effective-*` | `brand-tokens.css` / `brand-effective.css` | Overrides multi-club (ej. Hack Pádel) | Fuera de alcance de este contrato — no tocar |
| `--riviera-*` (auth) | `AuthPage.css` | Paleta aislada de autenticación (`--riviera-gold: #d4a843` ≠ `--ro-gold`) | Fuera de alcance — mencionado solo como ejemplo de fragmentación |

### 8.2 Tokens propuestos para el contrato de "modo de juego"

Estos son **nuevos** (no existen hoy) y se proponen como capa encima de `--ro-*`, no como reemplazo:

| Token propuesto | Valor sugerido | Mapea a (hoy) |
|-------------------|------------------|-------------------|
| `--mode-page-padding-mobile` | `clamp(14px, 3.8vw, 18px)` | `--ro-mobile-page-padding` (alias directo, sin valor nuevo) |
| `--mode-page-padding-desktop` | `clamp(16px, 4vw, 28px)` | `--ro-shell-padding-x` (alias directo) |
| `--mode-content-max` | `1200px` | valor real de TE hub/gestión (nuevo, no existía un token unificado) |
| `--mode-content-max-public` | `900px` | valor real de TE público (nuevo) |
| `--mode-section-gap` | `clamp(20px, 3vw, 28px)` | valor real de TE inicio (nuevo) |
| `--mode-card-gap` | `10px` | valor real de TE listas (nuevo) |
| `--mode-card-padding` | `1.25rem 1.5rem 2rem` | valor real de TE gestión (nuevo) |
| `--mode-radius` | `var(--ro-radius-lg)` (14px) | alias directo — **no** crear un valor nuevo, forzar a que Liga deje de usar `--liga-radius-lg` |
| `--mode-sticky-footer-height` | `64px` | `--mobile-sticky-action-height` (alias directo) |
| `--mode-tab-min-height` | `44px` | `--ro-touch-target-min` (alias directo) |
| `--mode-danger-bg` | `rgba(248, 113, 113, 0.06)` | valor real de `.reta-danger-zone` (nuevo, generalizado) |
| `--mode-danger-border` | `rgba(248, 113, 113, 0.28)` | valor real de `.reta-danger-zone` (nuevo, generalizado) |

**Regla de implementación (para la fase de código, no de este documento):** los tokens marcados "alias directo" se declaran como `var(--mode-x, var(--ro-y))` para no duplicar valores — un solo cambio en `--ro-*` sigue propagándose. Los marcados "nuevo" son valores que hoy solo existen como literales dispersos en el CSS de TE y se centralizan por primera vez.

### 8.3 Qué NO se elimina todavía

Por instrucción explícita de la tarea: no se elimina ningún token existente en esta fase de documentación. `--liga-*`, `--te-*`, `--ro-pub-*`, `--pub-*` (PEDS) permanecen intactos. La migración (Sección 10) los **mapea gradualmente** hacia los tokens de modo propuestos, empezando por Liga (el más urgente) sin romper sus propios estilos hasta que la migración visual esté validada pantalla por pantalla.

---

## 9. Reglas mobile-first

Auditoría por viewport: **320, 360, 390, 430, 768px** (los 5 pedidos), sobre los hallazgos reales de cada subauditoría.

### 9.1 Checklist por modo

**Torneo Express**
- [x] Sin scroll horizontal no intencional detectado en la auditoría (scroll horizontal SÍ existe pero es intencional: tabs y tablas anchas).
- [x] Tabs con `min-height: 44px` en todos los casos.
- [x] Inputs `48px`/`font-size: 16px` (sin zoom iOS) en formularios de creación.
- [x] Sticky footer con safe-area correcto.
- [ ] **Verificar en implementación:** bracket visual (`TEPublicBracketVisual`) en 320px — es el elemento de mayor riesgo de overflow de todo el inventario (min-height `min(72vh,780px)` en un ancho de solo 320px puede generar scroll interno difícil de descubrir).

**Reta**
- [x] Shell móvil tabbed ya presente (`RetaMobileOrganizerLayout`), con las 5 tabs esperadas.
- [x] Sticky footer con CTA dinámica ("Iniciar torneo" / "Ver partidos").
- [x] Danger zone separada visualmente en móvil.
- [ ] **Riesgo detectado:** `FourComponentsGrid` en desktop usa grid de 2 columnas con `min-height: 200px` por card — en el breakpoint intermedio 768-900px (antes de que colapse a 1 columna) puede sentirse apretado; revisar en 768px exacto durante implementación.
- [ ] **Pendiente de confirmar:** altura de inputs en formularios de jugadores/parejas — no se confirmó explícitamente `44px`/`16px` en la auditoría.

**Liga**
- [ ] **Riesgo confirmado:** tabs sin scroll horizontal (`flex-wrap`) — en 320-360px con más de 2 tabs (Liga tiene hasta 3: Jugadores/Parejas + Jornadas) puede generar 2 filas de tabs, rompiendo la altura esperada del header.
- [ ] **Riesgo confirmado:** `LigaRankingEquipos` sin cards móviles — tabla con `min-width: 720px` forzando scroll horizontal en cualquier viewport de la lista (320/360/390/430).
- [ ] Sin sticky footer — las acciones de progreso (Iniciar/Finalizar) dependen de que el usuario scrollee hasta encontrarlas.
- [x] Formularios ya colapsan a 1 columna en `600px`.
- [ ] **Verificar:** doble padding (shell propio + `.rv-shell`) puede reducir el área útil de contenido en 320px más de lo necesario — medir en implementación.

**Americano**
- [ ] **Riesgo confirmado:** botones de ronda (`~32-36px`) por debajo del target táctil de 44px — en cualquier viewport móvil, más crítico en 320-360px donde el margen de error del dedo es mayor.
- [x] Formularios de registro colapsan correctamente a 1 columna en `639px`, con `44px`/`16px`.
- [ ] **Riesgo:** 3 breakpoints casi contiguos (720/767/768) en la misma pantalla — un dispositivo de 720-767px de ancho puede mostrar un estado "a medio camino" (shell ya en modo desktop-padding pero tabs aún no aparecen, o viceversa). Verificar específicamente en 720px, 767px y 768px por separado, no solo en los 5 estándar.
- [ ] Sin sticky footer.

**Duelo 2v2**
- [x] Shell móvil tabbed completo, con sticky footer condicional.
- [ ] **Riesgo confirmado:** `.duelo2v2-live-board__arena` usa `grid-template-columns: 1fr auto 1fr` que solo colapsa a 1 columna en `900px` — en 768-899px (zona intermedia) puede verse comprimido antes de colapsar.
- [x] `DueloPairBuilder` con players-grid que colapsa a 2 columnas en `560px` — verificar legibilidad en 320px exacto (2 columnas de un grid `minmax(min(100%,160px),1fr)` en 320px de ancho da columnas de ~150px, ajustado pero probablemente aceptable).
- [ ] Sin standings — no aplica el checklist de tablas.

### 9.2 Checklist transversal (todos los modos)

- [ ] **Texto cortado:** ningún subagente reportó truncamiento de texto explícito, pero ninguno confirmó `text-overflow: ellipsis` sistemático en títulos largos de torneos/ligas/duelos con nombres extensos — validar con nombres reales largos (>30 caracteres) en 320px durante implementación.
- [ ] **Modales:** no se auditó el comportamiento de scroll interno de modales (`CrearEventoModal`, `EventoDeleteModal`, `GrantPlayerAccessModal`, etc.) en 320px — pendiente para una auditoría específica de modales si se decide incluirlos en el contrato visual (hoy no forman parte de los 13 componentes evaluados en Sección 6-7).
- [x] **Safe areas:** cubiertas consistentemente donde hay sticky footer (TE, Reta, Duelo). Liga y Americano no tienen sticky footer, por lo que no aplica aún — se resuelve al agregarlo en Fase 3-4.
- [ ] **Headers duplicados:** no se detectó duplicación de header en la misma pantalla, pero sí "dos sistemas de header" convivientes en la MISMA pantalla en varios modos (ej. Americano: `ModeHeader` desktop + `ModeEventHeader` móvil, que no son el mismo componente sino dos distintos con outputs visuales similares pero no idénticos) — riesgo de que diverjan con el tiempo si se edita uno sin el otro.

---

## 10. Plan de migración

**Orden exacto pedido por la tarea. Ninguna fase toca lógica de negocio (Sección 13 / regla de no-tocar-lógica aplica a todas).**

### Fase 1 — Plataforma compartida

**Extraer del estándar actual de TE (sin copiar su CSS literal):**
- Formalizar tokens de modo (Sección 8.2) como aliases de `--ro-*`, sin eliminar nada existente.
- Agregar slot de "información secundaria" a `ModeEventHeader` (aditivo, no rompe consumidores actuales).
- Generalizar `.reta-danger-zone` → patrón `ModeDangerZone` (componente o clase compartida), manteniendo Reta como primer y único consumidor real hasta validar en las fases siguientes.
- Generalizar `EmptyState` → adoptarlo (sin renombrar necesariamente) en al menos un segundo modo como prueba de compatibilidad antes de expandir.
- Definir (no implementar aún) el componente `ModeInlineNotice` y `ModeFormGrid` como especificación, para tenerlos listos cuando Liga/Americano los necesiten en Fase 2-4.

**Compatibilidad hacia atrás obligatoria:** ningún cambio en esta fase debe alterar el output visual de TE, Reta, Duelo o Americano actuales — son solo adiciones (nuevos tokens/slots opcionales) y generalización de un patrón que hoy solo usa Reta.

### Fase 2 — Liga (el modo más disperso)

Migrar, en este orden interno:
1. **Shell:** ajustar `LigaPageShell` para eliminar el doble padding (Sección 4 #19) — un solo punto de padding, heredado del contrato (Sección 6.2).
2. **Header:** adoptar `ModeEventHeader` en `LigaGestionar` y `LigaJornadaView` (móvil), manteniendo `ModeHeader` en `LigaHome`/`LigaNueva` (ya coherente con Reta/Americano).
3. **Tabs:** reemplazar `.liga-tabs` por `ModeSectionTabs`, reordenando a "Jornadas" primero si el flujo de Sección 5 se confirma en implementación (requiere validación con el organizador real antes de invertir el orden — este documento solo señala el hallazgo, no decide el reordenamiento final).
4. **Cards:** alinear `--liga-radius-lg` (16px) → `--ro-radius-lg` (14px) vía el token `--mode-radius`; alinear `--liga-shadow-card` al patrón de Sección 6.4.
5. **Formularios:** sin cambios funcionales, solo verificar que cumplan `ModeFormGrid` (una columna móvil, ya cumplido; confirmar 44px/16px en inputs).
6. **Jornadas:** sin cambios de lógica; ajustar el layout de 2 columnas (admin) para usar los tokens de gap/padding del contrato.
7. **Ranking:** dar a `LigaRankingEquipos` la misma versión de cards móviles que ya tiene `LigaRanking`/`LigaSimpleRankingDual` (cierra el gap #9 de la Sección 4). **Esto es una migración visual (agregar una vista alternativa ya usada en otro lugar de Liga), no un cambio de cómo se calcula el ranking.**
8. **Acciones:** separar "Reiniciar liga"/"Eliminar liga" del CTA "Iniciar liga" usando `ModeDangerZone` (Fase 1).
9. **Danger zone:** aplicar el patrón generalizado.
10. **Limpieza de código muerto (visual, no de lógica):** decidir explícitamente qué hacer con `LigaDetalle.tsx` (huérfano) y `.liga-jornada-toolbar` (CSS sin uso) — **fuera del alcance de "migración visual"**, se documenta aquí como recomendación pero su eliminación requiere confirmación explícita del usuario en una tarea futura (no asumir borrado).

### Fase 3 — Duelo 2v2

Migrar: header (ya usa `ModeEventHeader`, revisar consistencia de tamaños con el contrato 6.10), tabs (ya usa `ModeSectionTabs`, sin cambios estructurales necesarios), parejas (visual únicamente — sin tocar la regla de negocio de "inmutables tras crear"), resultados (alinear el `ScoreEditor` al sistema de cards del contrato), standings (no aplica, Duelo no tiene), acciones (aplicar `ModeDangerZone` a "Eliminar" en Home).

**Nota:** Duelo ya es, junto con Reta y TE, uno de los modos más alineados con la plataforma compartida — esta fase es la de menor esfuerzo relativo.

### Fase 4 — Americano

Migrar: shell (unificar el padding fijo `16px` móvil → `clamp()` del contrato), registro (ya bien alineado, ajustes menores de token), rondas (elevar los botones de ronda a `44px` mínimo — Sección 4 #8, riesgo móvil confirmado), ranking (ajustar el tamaño de caption anómalo de `LiveRanking`, Sección 4 #18), resultados (sin cambios de lógica), acciones (agregar `MobileStickyActionFooter` para las CTAs de ronda, hoy inline).

**Atención especial:** resolver la convivencia de 3 breakpoints casi contiguos (720/767/768) unificándolos hacia los breakpoints estándar del contrato (Sección 6.2: 320/360/390/430/768) antes de dar por cerrada esta fase.

### Fase 5 — Reta

Migrar **únicamente**, según instrucción explícita de la tarea:
- **Spacing:** alinear `.reta-content`/`.riviera-organizer-reta` a los tokens de modo (Sección 8.2).
- **Cards:** alinear `FourComponentsGrid`/`component-card` al sistema de cards del contrato (Sección 6.4), sin cambiar su contenido funcional.
- **Header:** ya usa `ModeEventHeader`/`ModeHeader` — solo verificar consistencia final de tamaños contra el contrato.
- **Tabs:** ya usa `ModeSectionTabs` — sin cambios estructurales.
- **Sticky footer:** ya implementado — verificar que el CTA dinámico siga el patrón de "una sola CTA primaria" (Sección 6.6).
- **Empty states:** migrar `.elegant-empty-state`/`.new-empty-state` hacia `EmptyState` (Fase 1).

**Mantener su flujo** — no se reordenan las secciones (Resumen → Jugadores → Parejas → Iniciar → Resultados → Clasificación → Cerrar), tal como pide la tarea explícitamente.

### Fase 6 — Torneo Express admin (solo ajustes finos)

- **No degradar.** Cualquier cambio debe compararse antes/después contra los valores de referencia documentados en la Sección 3 (misma metodología que Sección 12).
- **No cambiar:** bracket, grupos, agenda, fases.
- Ajustes candidatos (a validar caso por caso, ninguno obligatorio): adoptar `PublicShareSection`/`StatusBadge` en el admin (hoy TE es el único modo que no los usa — Sección 4 #21), formalizar el uso del token `--mode-card-gap` (10px) explícitamente en vez de valores repetidos.
- **Debe verse igual o mejor** — este es el único criterio de aceptación de esta fase.

### Fase 7 — Vistas públicas

Unificar (visualmente, sin tocar datos):
- **Header:** mismo orden que Sección 6.3 en todas las vistas públicas (hoy Liga/Reta/Americano ya usan variantes de `PublicHero`/header propio con PEDS opcional — consolidar a un solo patrón).
- **Flyer:** exclusivo de TE, no se generaliza (Sección 6.1) — se mantiene como está.
- **Estado:** `StatusBadge` como único sistema de badge en vistas públicas (ya es mayoritario, falta consolidar los últimos badges locales: `.te-badge-*` en TE público, `.liga-badge` restante).
- **Standings:** mismo breakpoint de swap tabla↔cards en todas (unificar 767 vs 768, Sección 4).
- **Bracket:** exclusivo de TE, no se generaliza.
- **Live:** mismo patrón de polling/footer de sincronización (`PublicTorneoExpressSyncFooter` como referencia) — hoy TE eliminatoria y Duelo público tienen footers propios distintos; evaluar consolidación sin romper el polling real (frecuencias distintas por modo son una decisión de producto, no solo visual — señalar en implementación si hay que preservarlas).
- **Footer / share:** consolidar hacia `PublicShareSection` donde aplique.
- **Loading:** mismo texto/tratamiento visual en las 3 vistas de carga detectadas.

**Nota especial — `PublicAmericanoResultsBoard` (display TV):** es la vista pública más aislada de todo el inventario (shell propio, sin relación con TE ni con `PublicAmericanoView`). Su migración debe evaluarse con cuidado porque su propósito (proyección en pantalla grande de club) es distinto al de compartir un link — no forzar el mismo max-width/padding que las vistas de "compartir" sin confirmar que sigue viéndose bien proyectado.

---

## 11. Checklist de aceptación

Por fase, antes de considerarla cerrada:

- [ ] **Visual:** capturas desktop + 320/360/390/430/768px comparadas contra el estado "antes" de la misma pantalla — sin regresión de legibilidad, densidad ni jerarquía.
- [ ] **Torneo Express (control):** las mismas capturas de control en TE muestran output idéntico al de antes de la fase (Sección 12).
- [ ] **Tokens:** ningún valor nuevo hardcodeado que debería ser un token del contrato (Sección 8.2) quedó como literal repetido.
- [ ] **Componentes:** el modo migrado usa los componentes de la Sección 7 en vez de su implementación ad-hoc previa, donde el gap fue identificado.
- [ ] **Mobile-first:** el checklist específico del modo (Sección 9.1) queda con todos sus ítems marcados o con una nota explícita de por qué no aplica.
- [ ] **Sin cambios de lógica:** diff de la fase no incluye cambios en: cálculo de resultados, standings, ranking, career, identidad Riviera, ROMC, Realtime, URLs, permisos, RLS (revisar el diff completo, no solo los archivos `.tsx` de UI — algunos archivos de servicio pueden tener imports que arrastren lógica sin querer).
- [ ] **Tests:** toda la suite de tests existente relacionada al modo sigue pasando sin modificación de sus assertions.
- [ ] **Accesibilidad mínima:** tabs/botones nuevos o migrados mantienen `aria-*` equivalente o mejor al que tenían antes.
- [ ] **Danger zone (si aplica a la fase):** ninguna acción destructiva quedó en la misma fila visual que un CTA primario.
- [ ] **Aprobación explícita del usuario** antes de pasar a la siguiente fase (este plan es por fases justamente para permitir ese punto de control).

---

## 12. Rollback

**Principio:** cada fase de la Sección 10 debe poder revertirse de forma aislada, sin afectar fases anteriores ya aceptadas.

### 12.1 Mecanismo general

- Cada fase se implementa en cambios acotados a: (a) archivos CSS del modo afectado, (b) el/los componentes de `src/components/platform/` tocados (aditivos, no rompientes), (c) tokens nuevos en la capa de alias (Sección 8.2) — nunca modificando `--ro-*` directamente.
- Como los tokens nuevos son *aliases* (`var(--mode-x, var(--ro-y))`), revertir una fase es tan simple como dejar de aplicar la clase/token nuevo en el modo afectado — el fallback siempre cae al valor `--ro-*` u original que ya existía.
- Los componentes de plataforma (`ModeEventHeader`, `ModeSectionTabs`, etc.) **ya existen y ya están en producción en 4/5 modos** — adoptarlos en un modo nuevo (Liga) no es un cambio de la plataforma, es un cambio de qué renderiza ESE modo. Revertir Liga a su implementación anterior no afecta a Reta/Duelo/Americano/TE porque ellos no comparten el estado, solo el componente (sin estado compartido entre instancias).

### 12.2 Rollback por fase

| Fase | Qué revertir si algo sale mal | Riesgo de efecto colateral en otros modos |
|------|----------------------------------|----------------------------------------------|
| 1 — Plataforma compartida | Quitar los nuevos slots/props opcionales de `ModeEventHeader` y el patrón `ModeDangerZone`; los modos que no los usaban vuelven a su estado exacto anterior (nada cambió para ellos, eran aditivos) | Ninguno — es la garantía explícita de la fase |
| 2 — Liga | Revertir `LigaPageShell`, `LigaGestionar`, `LigaJornadaView` a sus wrappers/CSS previos (`.liga-tabs`, sin `ModeEventHeader`) | Ninguno — Liga no comparte estado visual con otros modos |
| 3 — Duelo 2v2 | Revertir cambios de card system y danger zone en Duelo | Ninguno |
| 4 — Americano | Revertir shell padding, altura de botones de ronda, breakpoints | Ninguno; si se tocó `mode-mobile-shell.css` para el sticky footer nuevo, verificar que el cambio sea aditivo (nueva clase, no modificación de la existente) antes de considerar "sin riesgo" |
| 5 — Reta | Revertir spacing/cards a valores previos | Ninguno |
| 6 — TE admin | Revertir cualquier ajuste fino a los valores documentados como "estado actual" en la Sección 3 (que son la fuente de verdad del "antes") | Es la fase de mayor sensibilidad — cualquier regresión aquí bloquea TODO el plan hasta resolverse, porque TE es la referencia de control de todas las demás fases |
| 7 — Vistas públicas | Revertir consolidación de headers/footers públicos modo por modo (son independientes entre sí) | Bajo, salvo el caso ya señalado de `PublicAmericanoResultsBoard` |

### 12.3 Regla dura

Si en cualquier fase se detecta que Torneo Express (control) cambió su output visual sin que esa fuera la fase 6 explícitamente aprobada para tocar TE, **se revierte esa fase completa antes de continuar**, sin excepciones — es la regla de no-regresión pedida en el encabezado de la tarea.

---

## 13. Definición de "modo listo para lanzamiento"

Un modo se considera **listo para lanzamiento** bajo este contrato cuando cumple simultáneamente:

1. **Shell:** usa `GameModeShell` con los tokens de padding/max-width del contrato (Sección 6.2), sin padding duplicado.
2. **Header:** usa `ModeHeader` (pantallas de entrada/lista) y `ModeEventHeader` (pantallas de gestión activa) siguiendo el orden de la Sección 6.3, incluyendo el slot de información secundaria si el modo lo necesita.
3. **Tabs:** si tiene más de una sección de gestión, usa `ModeSectionTabs`/`ModeSectionPanel` con scroll horizontal, nunca wrap.
4. **Cards:** su sistema de cards mapea a las variantes de la Sección 6.4 (Primary/Subtle/Interactive/Warning/Completed/Danger), usando los tokens de la Sección 8.2 en vez de literales.
5. **Acciones:** una sola CTA primaria visible por pantalla, máximo dos secundarias, destructivas siempre en `ModeDangerZone` separada (nunca en la misma barra que el CTA primario).
6. **Sticky footer:** presente en móvil si existe una acción de progreso clara pendiente, con safe-area correcto.
7. **Formularios:** una columna móvil, máximo dos en desktop, inputs ≥44px/16px, errores inline.
8. **Estados:** los 8 estados de la Sección 6.8 están representados con el tratamiento visual esperado (no necesariamente los 8 aplican a todo modo, pero los que aplican siguen el patrón).
9. **Tablas:** swap a cards en móvil en el breakpoint unificado (a definir en implementación, hoy 767 vs 768 según el modo).
10. **Mobile-first:** su checklist específico de la Sección 9.1 está 100% marcado (sin ítems pendientes ni riesgos abiertos).
11. **Sin regresión de lógica:** cero cambios en resultados, standings, ranking, career, identidad, ROMC, Realtime, URLs, permisos o RLS respecto a su estado antes de la migración — verificado con la suite de tests existente sin modificar assertions.
12. **Torneo Express sigue intacto:** el modo de referencia no cambió su output visual salvo en su propia Fase 6, ya aceptada explícitamente.
13. **Aprobación explícita del usuario** sobre las capturas antes/después del modo en los 5 viewports de referencia (320/360/390/430/768) más desktop.

Un modo **parcialmente migrado** (por ejemplo, Liga tras adoptar tabs pero antes de resolver `LigaRankingEquipos`) no se considera "listo para lanzamiento" — se documenta su estado intermedio en el changelog de este archivo (a agregar cuando se ejecute la implementación) hasta cerrar todos los puntos de esta lista.
