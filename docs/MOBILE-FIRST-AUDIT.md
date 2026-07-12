# AppRiviera — Auditoría Mobile First (Etapa 1)

**Fecha:** 2026-07-11  
**Alcance:** UX móvil y arquitectura responsive — **sin cambios funcionales** en esta etapa.  
**Validación ejecutada:**

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` | ✅ OK |
| `CI=true npm test -- --watchAll=false` | ⚠️ 1 fallo preexistente (`duelo2v2CreateDraft.test.ts` — borrador localStorage, no relacionado con mobile) |
| `npm run build` | ✅ OK |

**Breakpoints oficiales propuestos (a estandarizar):**

| Token | Valor | Uso |
|-------|-------|-----|
| Base | 0–479px | Diseño por defecto |
| `sm` | 480px | Teléfonos grandes |
| `md` | 768px | Tablet |
| `lg` | 1024px | Escritorio pequeño |
| `xl` | 1200px | Escritorio amplio |

Hoy el repo usa **15+ breakpoints ad hoc** (340, 380, 540, 560, 600, 640, 900, 968, 1100…) mezclados con los anteriores.

---

## 1. Inventario de pantallas

### 1.1 Autenticación y shell

| # | Pantalla | Ruta / disparador | Componente principal | CSS principal |
|---|----------|-------------------|----------------------|---------------|
| 1 | Login / registro | Cualquier ruta privada sin sesión | `AuthPage.tsx` | `AuthPage.css`, `AuthForms.css` |
| 2 | Auth callback | `/auth/callback` | `AuthCallback.tsx` | — |
| 3 | Reset password | `/auth/reset-password` | (auth) | `AuthForms.css` |
| 4 | Header global privado | Todas las vistas privadas | `UserHeader.tsx` | `UserHeader.css`, `MobileUserMenu.css` |
| 5 | Home | `/` sin reta activa | `HomeDashboard.tsx` | `home.css`, `riviera-app-shell.css` |
| 6 | Mis eventos (retas) | Home → ver todas | `TournamentManager.tsx` | `mis-retas/mis-retas.css`, `reta-responsive.css` |

### 1.2 Modos de juego (organizador)

| # | Pantalla | Ruta | Componente | Shell / CSS |
|---|----------|------|------------|-------------|
| 7 | Crear / gestionar Reta RR | `/`, `/reta/:id` | `TournamentDetails.tsx`, `MainLayout.tsx` | `features/reta/*`, `riviera-organizer*.css` |
| 8 | Americano dinámico | `/americano-dinamico` | `AmericanoDinamicoScreen.tsx` | `AmericanoDinamicoScreen.css` |
| 9 | Duelo 2v2 home / nuevo / gestionar | `/duelo-2v2/*` | `Duelo2v2Home`, `Duelo2v2Nuevo`, `Duelo2v2Gestionar` | `duelo2v2-page.css` |
| 10 | Liga home / nueva / gestionar / jornada | `/liga/*` | `LigaHome`, `LigaNueva`, `LigaGestionar`, `LigaJornada` | `liga-page.css`, `liga-tokens.css` |
| 11 | Torneo Express inicio / gestión | `/torneo-express/*` | `TorneoExpressInicio`, `GestionGrupos` | `te-inicio-page.css`, `torneo-express.css` |

### 1.3 Partidos y resultados

| # | Pantalla | Componente | Notas |
|---|----------|------------|-------|
| 12 | Captura resultados Reta | `MatchCardWithResults`, `ModernMatchCard` | Grid 4 componentes en `TournamentDetails` |
| 13 | Standings tiempo real Reta | `RealTimeStandingsTable.tsx` | Tabla + `StandingsMobileCards` en ≤640px |
| 14 | Americano rondas / ranking | `RoundView`, `LiveRanking` | Cards móvil en ranking |
| 15 | Liga jornada (tablas) | `LigaJornada.tsx` | Tablas `liga-ranking-table` sin variante card |
| 16 | TE gestión (grupos / bracket) | `GestionGrupos`, bracket CSS | `min-width: 640px` en tablas |

### 1.4 Jugadores y ranking

| # | Pantalla | Ruta | Componente | CSS |
|---|----------|------|------------|-----|
| 17 | Registro jugadores | `/jugadores/*` | `JugadoresLista.tsx` | `riviera-jugadores.css` (cards móvil) |
| 18 | Ficha privada | `/jugadores/:slug` | `JugadorFicha.tsx` | `riviera-jugadores.css` |
| 19 | Ranking público club | `/ranking/o/:orgId` | `JugadoresPublicRanking.tsx` | `riviera-jugadores-public-ranking.css` (cards) |
| 20 | Perfil público | `/public/jugadores/:slug` | `JugadorPublicFicha.tsx` | `riviera-jugadores-public-ficha.css` |
| 21 | Ranking cómo funciona | `/ranking/como-funciona` | `RankingComoFuncionaPage.tsx` | `ranking-como-funciona.css` |

### 1.5 Vistas públicas (espectador)

| # | Pantalla | Ruta | Componente |
|---|----------|------|------------|
| 22 | Reta pública | `/public/:tournamentId` | `PublicTournamentView` |
| 23 | Americano público | `/public/americano/:id` | `PublicAmericanoView` |
| 24 | Liga pública / jornada | `/public/liga/*` | `LigaDetallePublica`, `LigaJornadaPublica` |
| 25 | Duelo público | `/public/duelo-2v2/:id` | `Duelo2v2Publica` |
| 26 | TE público | `/torneo-express/:id/*` | `VistaPublicaGrupo`, `VistaPublicaGeneral`, etc. |

### 1.6 Modales, sheets y estados transversales

| Área | Componentes |
|------|-------------|
| UI base | `Modal.tsx`, `Button.tsx`, `Input.tsx`, `LoadingProgressHint.tsx` |
| Platform | `ActionBar`, `EmptyState`, `GameModeShell`, `ModeHeader`, `ModeCard`, `RankingCard` |
| Home | `QuickStartSheet` (Modal sheet) |
| Jugadores | `NuevoJugadorModal`, `AgregarJugadorExistenteModal`, `JugadorAjustePuntosModal` |
| Estados | `LoadingFallback`, `ErrorBoundary`, confirmaciones `window.confirm` dispersas |

---

## 2. Problemas por pantalla (resumen)

Leyenda severidad:

- **P0** — Bloquea uso móvil o viola estándar crítico (touch, viewport, datos ilegibles).
- **P1** — Fricción alta para usuario nuevo; workaround posible.
- **P2** — Mejora de claridad / consistencia.
- **P3** — Pulido visual o deuda técnica.

### 2.1 Login y registro

| ID | Problema | Sev. | Archivos | Riesgo |
|----|----------|------|----------|--------|
| AUTH-01 | Inputs usan `--ro-text-body` (14px) → zoom automático iOS | P0 | `riviera-open-tokens.css`, `riviera-primitives.css`, `AuthForms.css` | Bajo — solo CSS |
| AUTH-02 | Hero visual ocupa ~42vh antes del formulario; scroll hasta CTA en móvil pequeño | P1 | `AuthPage.css` | Bajo |
| AUTH-03 | Split desktop (`min-width: 968px`) no alinea con breakpoints oficiales | P2 | `AuthPage.css` | Bajo |
| AUTH-04 | Safe-area top/bottom presente pero no unificada con tokens globales | P2 | `AuthPage.css`, `ios-pwa.css` | Bajo |

### 2.2 Home

| ID | Problema | Sev. | Archivos | Riesgo |
|----|----------|------|----------|--------|
| HOME-01 | Sin navegación inferior; acceso a Jugadores/Ranking/Eventos requiere scroll + links secundarios | P0 | `HomeDashboard.tsx`, `UserHeader.tsx` | Medio — nuevo componente nav |
| HOME-02 | Grid de modos + quick links + recientes: mucho scroll antes de acción si usuario vuelve de otro modo | P1 | `home.css`, `GameModesGrid.tsx` | Bajo |
| HOME-03 | Texto extenso en tarjetas de modo (`ModeCard`) | P2 | `riviera-open-components.css` | Bajo |
| HOME-04 | Breakpoints 540/640/960 vs estándar 480/768/1200 | P2 | `home.css` | Bajo |
| HOME-05 | `QuickStartSheet` usa Modal sheet pero footer sin `env(safe-area-inset-bottom)` explícito en primitivo | P1 | `riviera-primitives.css`, `home.css` | Bajo |

### 2.3 Mis eventos / Crear Reta

| ID | Problema | Sev. | Archivos | Riesgo |
|----|----------|------|----------|--------|
| RETA-01 | `four-components-grid` apila en 1 col (≤768px) pero cada sección es larga; siguiente acción no destacada | P1 | `TournamentDetails.tsx`, `reta-layout.css` | Medio — layout only |
| RETA-02 | Botones setup 32×32px (`reta-setup.css`, `reta-layout.css`) | P0 | `features/reta/reta-setup.css`, `reta-layout.css` | Bajo |
| RETA-03 | Standings: tabla `min-width: 820px` en wrapper móvil → scroll horizontal | P0 | `ModernStandingsTable.css`, `standings-table-mobile.css` | Bajo — ya existe `StandingsMobileCards` |
| RETA-04 | `StandingsMobileCards` solo en `RealTimeStandingsTable` y `LiveRanking`; no en todas las vistas de clasificación | P1 | `RealTimeStandingsTable.tsx` | Bajo |
| RETA-05 | Instrucciones header con 4 pasos y texto técnico (“Round Robin”, “parejas”) | P2 | `TournamentDetails`, `reta-responsive.css` | Bajo |
| RETA-06 | Acciones destructivas (reset/finalizar) mezcladas con primarias en mismas zonas | P1 | `TournamentStatusContent`, organizer CSS | Medio — UX only |

### 2.4 Partidos y captura de resultados

| ID | Problema | Sev. | Archivos | Riesgo |
|----|----------|------|----------|--------|
| MATCH-01 | Controles de score con fuentes 10–11px en organizer matches | P1 | `riviera-organizer-matches.css` | Bajo |
| MATCH-02 | Inputs numéricos posiblemente &lt;16px en legacy match cards | P1 | `reta-matches.css` | Bajo |
| MATCH-03 | Teclado puede tapar footer de acciones (sin sticky footer unificado) | P1 | Varios modos | Medio |

### 2.5 Americano

| ID | Problema | Sev. | Archivos | Riesgo |
|----|----------|------|----------|--------|
| AMER-01 | Ranking usa `StandingsMobileCards` ✅ | — | `LiveRanking.tsx` | — |
| AMER-02 | Registro jugadores / rondas: densidad alta en `PlayerRegistration.css` | P2 | `PlayerRegistration.css` | Bajo |
| AMER-03 | Flujo crear vs reanudar depende de sheet + navegación implícita | P1 | `HomeDashboard.tsx`, `AmericanoDinamicoScreen.tsx` | Medio |

### 2.6 Duelo 2v2

| ID | Problema | Sev. | Archivos | Riesgo |
|----|----------|------|----------|--------|
| DUEL-01 | Página larga; `ActionBar` + formulario sin wizard ni sticky CTA | P1 | `Duelo2v2Nuevo.tsx`, `duelo2v2-page.css` | Medio |
| DUEL-02 | Breakpoint `901px` / `560px` no estándar | P2 | `duelo2v2-page.css` | Bajo |
| DUEL-03 | Safe-area bottom en page ✅ parcial | P2 | `duelo2v2-page.css` | Bajo |

### 2.7 Liga

| ID | Problema | Sev. | Archivos | Riesgo |
|----|----------|------|----------|--------|
| LIGA-01 | Rankings en gestión/jornada son `<table>` sin variante card móvil | P0 | `LigaJornada.tsx`, `liga-page.css` | Medio — presentación |
| LIGA-02 | `overflow-x: auto` en ranking pantalla pública | P1 | `liga-public-pantalla.css` | Bajo |
| LIGA-03 | Shell distinto a Reta/TE pero con `LigaPageShell` — OK parcial | P2 | `liga-page.css` | Bajo |

### 2.8 Torneo Express

| ID | Problema | Sev. | Archivos | Riesgo |
|----|----------|------|----------|--------|
| TE-01 | Tablas gestión `min-width: 640px` → scroll horizontal en 360px | P0 | `torneo-express.css` | Medio |
| TE-02 | Botones `min-height: 36px`, iconos 32px | P1 | `te-inicio-page.css`, `te-gestion-page.css` | Bajo |
| TE-03 | Múltiples archivos CSS (te-*, torneo-express*, riviera-torneo-express) | P2 | `components/torneo-express/` | Bajo |

### 2.9 Registro de jugadores

| ID | Problema | Sev. | Archivos | Riesgo |
|----|----------|------|----------|--------|
| JUG-01 | Lista usa cards en móvil ✅ (`rj-card`) | — | `JugadoresLista.tsx` | — |
| JUG-02 | Botones `rj-btn` ~32–36px; acciones editar/borrar pequeñas | P1 | `riviera-jugadores.css` | Bajo |
| JUG-03 | Filtros + tabs + backfill en header competido en 360px | P1 | `JugadoresLista.tsx` | Medio |
| JUG-04 | Modales creación sin patrón sheet unificado | P2 | `NuevoJugadorModal` | Bajo |
| JUG-05 | Lenguaje técnico: “backfill historial”, “legacy”, “Riviera ID” en UI admin | P2 | `JugadoresLista.tsx` | Bajo |

### 2.10 Perfil privado / público

| ID | Problema | Sev. | Archivos | Riesgo |
|----|----------|------|----------|--------|
| PER-01 | Ficha pública: tabs + gráfico + participaciones; scroll largo | P2 | `JugadorPublicFicha.tsx` | Bajo |
| PER-02 | `overflow-x: auto` en bloques de historial | P1 | `riviera-jugadores-public-ficha.css` | Bajo |
| PER-03 | Ficha privada: muchas acciones admin sin agrupar en overflow menu | P1 | `JugadorFicha.tsx` | Medio |

### 2.11 Ranking privado / público

| ID | Problema | Sev. | Archivos | Riesgo |
|----|----------|------|----------|--------|
| RNK-01 | Ranking público club usa cards (`rjp-ranking-card`) ✅ | — | `JugadoresPublicRanking.tsx` | — |
| RNK-02 | Picker de categorías 7 chips — en 360px grid 3 col; labels abreviados | P2 | `riviera-jugadores-public-ranking.css` | Bajo |
| RNK-03 | Safe-area inconsistente vs reta pública (documentado en brief interno) | P1 | `riviera-jugadores-public-ranking.css` | Bajo |
| RNK-04 | Ranking interno (lista jugadores) mezcla posición/puntos/partidos — OK en card | P2 | — | — |

### 2.12 Modales, navegación y transversal

| ID | Problema | Sev. | Archivos | Riesgo |
|----|----------|------|----------|--------|
| NAV-01 | **No hay bottom tab bar**; navegación principal oculta en menú avatar (solo logout/perfil) | P0 | `UserHeader.tsx`, `MobileUserMenu.tsx` | Medio |
| NAV-02 | Cada modo implementa su propio back (`ActionBar`, links, `navigateAppTo`) | P1 | `platform/ActionBar.tsx`, routers | Medio |
| UI-01 | `riviera-btn--sm` = 36px (bajo estándar 44px) | P1 | `riviera-primitives.css` | Bajo |
| UI-02 | Modal `max-height: 90vh` sin `100dvh` ni safe-area en sheet footer | P1 | `riviera-primitives.css` | Bajo |
| UI-03 | `window.confirm` para acciones críticas — nativo OK en móvil pero inconsistente | P2 | `JugadoresLista`, `JugadorFicha`, reta | Bajo |
| UI-04 | Hover como única pista en standings recalculate / cards legacy | P2 | `ModernStandingsTable.css` | Bajo |
| UI-05 | `overflow-x: clip` global ✅ en `riviera-open-mobile-polish.css` | — | — | — |

---

## 3. Ancho conceptual (360–1280px)

| Ancho | Hallazgos principales |
|-------|---------------------|
| **360px** | Scroll horizontal en tablas TE/Liga/standings legacy; chips ranking 3-col; filtros jugadores apretados; touch targets &lt;44px en reta/jugadores |
| **375px** | Similar a 360; Auth hero + form OK con scroll |
| **390px** | Ranking público legible con cards; reta setup usable con scroll largo |
| **430px** | Home mode grid 2 col en algunos breakpoints; menos fricción en tablas con scroll |
| **768px** | Cambio a layouts 2-col (reta grid, home); `UserHeader` alterna desktop/mobile |
| **1024px** | Liga sidebar layout; TE gestión 2 columnas |
| **1280px** | `max-width` shells (home, liga); experiencia desktop estable ✅ |

---

## 4. CSS duplicado o contradictorio

| Tema | Ubicaciones | Conflicto |
|------|-------------|-----------|
| Breakpoints | `home.css` (540, 640, 960), `liga-page.css` (600, 900), `duelo2v2-page.css` (560, 901), `AuthPage.css` (968), `riviera-open-components.css` (540, 960) | No alineados a 480/768/1024/1200 |
| Botones | `riviera-primitives.css` (`.riviera-btn*`), `riviera-jugadores.css` (`.rj-btn*`), `home.css`, legacy `App.css` / reta | Tamaños y radios distintos |
| Standings móvil | `standings-table-mobile.css`, `standings-mobile-cards.css`, `ModernStandingsTable.css` | Tabla vs cards; min-widths distintos |
| Safe-area | `ios-pwa.css`, `riviera-app-shell.css`, `home.css`, `UserHeader.css`, por modo | Sin token único `--safe-*` |
| Shell padding | `riviera-app-shell.css` vs `GameModeShell` vs cada `*-page.css` | Padding horizontal variable |
| Touch 44px | `riviera-open-mobile-polish.css` (≤768px) fuerza algunos botones; no cubre `.rj-btn`, reta 32px | Parcial |
| Inputs 16px | Tokens `--ro-text-body: 0.875rem` contradice estándar iOS | Global |

---

## 5. Componentes existentes reutilizables

| Propuesto | Equivalente existente | Acción recomendada |
|-----------|----------------------|-------------------|
| `MobilePageHeader` | `ModeHeader`, `ActionBar`, `HomeHeader` | Extender `ModeHeader` + slot acciones |
| `MobileActionBar` | `ActionBar` | Extender con sticky + safe-area |
| `MobileBottomSheet` | `Modal` (`sheet` prop) + `QuickStartSheet` | Extender `Modal` footer safe-area |
| `MobileEmptyState` | `EmptyState` | Reutilizar |
| `MobileMatchCard` | `MatchCard` (platform), `ModernMatchCard` | Unificar estilos, no duplicar |
| `MobileStandingsCard` | `StandingsMobileCards` | **Reutilizar** en Liga/TE |
| `MobileConfirmDialog` | `Modal` + `Button` danger | Reemplazar `window.confirm` gradualmente |
| `MobileStickyFooter` | Parcial en `home.css` (quick start) | Extraer a componente |
| `MobileAppNavigation` | **No existe** | Crear en Fase 2 |
| `MobileWizardLayout` | Parcial `QuickStartSheet` | Generalizar después de Fase 1 |
| `MobileFormSection` | `riviera-field` en primitives | Documentar patrón |
| `MobileOverflowMenu` | `MobileUserMenu` (solo logout) | Generalizar patrón dropdown |

**Base UI:** `src/components/ui/` — `Button`, `Input`, `Modal`, `Card`, `Badge`  
**Platform:** `src/components/platform/` — shells, `ModeCard`, `RankingCard`, `StatusBadge`

---

## 6. Navegación inferior propuesta — evaluación

| Criterio | Evaluación |
|----------|------------|
| Solo pantallas privadas principales | ✅ Factible vía wrapper en `App.tsx` / `MainLayout` excluyendo public routers |
| No en vistas públicas | ✅ `App--public-full-width` ya separa contexto |
| No interferir modales/resultados | ⚠️ Requiere ocultar barra con flag `data-modal-open` o ruta denylist (`/reta/:id` gestión activa opcional) |
| Safe-area | ✅ Con `padding-bottom: env(safe-area-inset-bottom)` |
| Rutas actuales | ✅ Solo `navigateAppTo` — sin cambiar paths |
| Estado eventos activos | ✅ Nav no debe desmontar `MainLayout` state — implementar como overlay fijo |

**Recomendación:** Fase 2 (después de fundación CSS). Riesgo medio de regresión en retas en curso si la barra compite con footers locales.

---

## 7. Plan de migración por fases

### Fase 1 — Fundación táctil y tokens (implementar primero)

**Objetivo:** Cero cambio de flujos; eliminar P0 táctiles/viewport más baratos.

1. Tokens breakpoints oficiales en `riviera-open-tokens.css`
2. Inputs ≥16px en viewport ≤479px (`riviera-primitives.css`)
3. Refuerzo touch 44px para `.rj-btn`, reta controls, `riviera-btn--sm` en `riviera-open-mobile-polish.css`
4. Modal sheet: `100dvh` fallback + safe-area footer (`riviera-primitives.css`)
5. Utilities `--safe-page-x`, `--safe-page-bottom` en tokens

**No incluye:** bottom nav, wizards, refactor de pantallas.

### Fase 2 — Navegación móvil primaria

1. `MobileAppNavigation` (5 tabs)
2. Integración en shell privado con denylist
3. Home simplificado: CTA “Crear evento” + accesos rápidos

### Fase 3 — Consistencia por modo de juego

1. `MobilePageHeader` unificado (estado + siguiente acción)
2. `StandingsMobileCards` en Liga + TE gestión
3. Sticky footer Atrás/Continuar en creación (Duelo, Liga nueva, TE)

### Fase 4 — Rankings y tablas

1. Eliminar `min-width` tablas en móvil o forzar card view ≤479px
2. Ranking cómo funciona: cards ya responsive ✅ mantener

### Fase 5 — Copy y accesibilidad

1. Reemplazar `window.confirm` → `MobileConfirmDialog`
2. aria-labels en icon-only
3. Simplificar copy técnico en jugadores/reta

---

## 8. Fase 1 exacta (primera implementación)

### Archivos a cambiar

| Archivo | Cambio |
|---------|--------|
| `src/styles/riviera-open-tokens.css` | Breakpoints CSS vars; safe-area tokens; `--ro-text-input: 16px` móvil |
| `src/styles/riviera-primitives.css` | Input font-size móvil; modal sheet safe-area; opcional `sm` button → 44px en base |
| `src/styles/riviera-open-mobile-polish.css` | Extender overrides `.rj-btn`, reta 32px buttons, TE 36px |
| `docs/MOBILE-FIRST-AUDIT.md` | Este documento |

### Archivos que NO deben tocarse (Fase 1)

| Área | Archivos / módulos |
|------|-------------------|
| Negocio ranking/rating/puntos | `syncParticipaciones.ts`, `rivieraRankingPoints.ts`, `aplicarRatingPartido.ts` |
| Cierre eventos | `careerEventPipeline/*`, `finalizeCareerEvent` |
| Identidad jugadores | `rivieraJugadoresService.ts`, `organizerPlayerAccess.ts`, RPC SQL |
| Rutas | `appRouting.ts`, routers path strings |
| Branding club | `club-experience/*`, `brand/*` |
| Cálculos standings | `standings.ts`, `useTournamentData.tsx` (lógica) |

### Riesgos de regresión Fase 1

| Riesgo | Mitigación |
|--------|------------|
| Inputs más grandes desalinean layouts | Solo `font-size` + `min-height` en ≤479px |
| Botones más altos rompen grids | `min-height` sin cambiar width; probar 360px |
| Desktop afectado | Todo detrás de `@media (max-width: 479px)` o `min-width` escalado |

---

## 9. Checklist de pruebas manuales

Probar en **360px**, **390px**, **768px** (Chrome DevTools + iOS Safari real si posible).

### Fundación (Fase 1)

- [ ] Login: foco en input no hace zoom iOS
- [ ] Home: sin scroll horizontal
- [ ] Modal QuickStart: footer visible con safe-area (iPhone con notch)
- [ ] Botones reta setup ≥44px táctiles
- [ ] Jugadores: botones primarios ≥44px
- [ ] Desktop 1280px: sin cambios visuales relevantes

### Navegación (Fase 2)

- [ ] Tab activo correcto en Home, Eventos, Jugadores, Ranking
- [ ] Barra oculta en `/public/*` y durante modal abierto
- [ ] Reta en curso: estado preservado al cambiar tab y volver

### Por modo (Fase 3+)

- [ ] Crear reta → parejas → iniciar → cargar resultado → standings visibles sin scroll horizontal
- [ ] Americano: ranking en cards
- [ ] Duelo: crear y guardar borrador
- [ ] Liga jornada: ranking legible en móvil
- [ ] TE: gestión grupos sin scroll horizontal crítico
- [ ] Borrar jugador: confirmación clara, botón destructivo separado

### Público

- [ ] Ranking público 360px: cards tap → ficha
- [ ] Reta pública: standings legibles

---

## 10. Pruebas automatizadas recomendadas

| Tipo | Herramienta | Qué cubrir |
|------|-------------|------------|
| Visual regression | Playwright + screenshots 360/768/1280 | Home, Auth, JugadoresLista, PublicRanking |
| A11y | axe-core en Playwright | aria-labels, contrast, focus trap modales |
| CSS unit | Opcional — documentar tokens breakpoints | `riviera-open-tokens.css` |
| E2E smoke móvil | Playwright `viewport: { width: 360, height: 740 }` | Login → Home → Jugadores → volver |
| Touch targets | Playwright locator boundingBox | assert `height >= 44` en CTAs principales |

**No requerido en Fase 1:** cambios en tests de negocio existentes.

---

## 11. Top 10 problemas más graves

| # | ID | Problema | Sev. |
|---|-----|----------|------|
| 1 | NAV-01 | Sin navegación inferior; descubrimiento de secciones pobre | P0 |
| 2 | AUTH-01 / UI | Inputs 14px → zoom iOS | P0 |
| 3 | RETA-03 | Tabla standings `min-width: 820px` en móvil | P0 |
| 4 | LIGA-01 | Liga jornada/gestión solo tablas HTML | P0 |
| 5 | TE-01 | TE tablas `min-width: 640px` | P0 |
| 6 | RETA-02 | Controles reta 32px | P0 |
| 7 | HOME-01 | Home sin CTA único “Crear evento” above the fold | P1 |
| 8 | UI-01 | `riviera-btn--sm` 36px usado en acciones | P1 |
| 9 | JUG-02 | Acciones card jugadores &lt;44px | P1 |
| 10 | NAV-02 | Patrones de navegación/back inconsistentes entre modos | P1 |

---

## 12. Archivos que necesitan atención inmediata

1. `src/styles/riviera-open-tokens.css` — tokens base
2. `src/styles/riviera-primitives.css` — inputs, modales, botones
3. `src/styles/riviera-open-mobile-polish.css` — overrides globales móvil
4. `src/components/ModernStandingsTable.css` — min-width tabla
5. `src/components/torneo-express/torneo-express.css` — min-width 640px
6. `src/components/liga/LigaJornada.tsx` + `liga-page.css` — cards vs tabla
7. `src/features/reta/reta-setup.css` — touch targets
8. `src/components/jugadores/riviera-jugadores.css` — `.rj-btn`
9. `src/components/UserHeader.tsx` — candidato integración nav Fase 2
10. `src/components/home/HomeDashboard.tsx` — jerarquía home Fase 2

---

## 13. Resumen ejecutivo

AppRiviera tiene **buena base mobile-first parcial**: `overflow-x: clip`, shells `.rv-page`, cards en jugadores/ranking público/americano standings, Auth con `100dvh`, y capa `riviera-open-mobile-polish.css`.

**Brechas principales:** navegación móvil inexistente, inputs sub-16px, tablas con min-width en Liga/TE/standings legacy, touch targets heterogéneos, breakpoints no estandarizados.

**Estrategia:** cambios pequeños y reversibles — primero tokens + táctil + viewport (Fase 1), luego bottom nav (Fase 2), luego unificación por modo (Fase 3+). Sin tocar negocio, ranking, identidad ni pipelines de cierre.

---

## 14. Estado de implementación — Fase 1

*Implementado: 2026-07-11. Solo archivos autorizados: `riviera-open-tokens.css`, `riviera-primitives.css`, `riviera-open-mobile-polish.css`.*

### Cambio 1 — Tokens responsive

| Ítem | Estado | Notas |
|------|--------|-------|
| `--ro-breakpoint-sm/md/lg/xl` documentados | Implementado | 480 / 768 / 1024 / 1200 px — solo referencia, no en `@media` |
| `--ro-safe-top/right/bottom/left` | Implementado | `env(safe-area-inset-*, 0px)` |
| `--ro-mobile-page-padding` | Implementado | `clamp(14px, 3.8vw, 18px)` |
| `--ro-touch-target-min` | Implementado | 44px |
| `--ro-input-font-size-mobile` | Implementado | 16px |
| Tokens tipográficos escritorio | No aplicable | Sin cambios |
| Eliminar breakpoints legacy en otros archivos | Pendiente | Fase posterior |

### Cambio 2 — Inputs móviles (≤479px)

| Ítem | Estado | Notas |
|------|--------|-------|
| `.riviera-input`, `.riviera-textarea`, `select.riviera-input` → 16px | Implementado | `riviera-primitives.css` |
| `input` / `select` / `textarea` base con exclusiones | Implementado | Excluye checkbox, radio, range, color, hidden, file |
| Sin zoom / transform / scale | Implementado | Solo `font-size` |
| Inputs especializados fuera de alcance | Parcial | `.home-sheet__input` ya 16px en `home.css` (no tocado) |
| `.elegant-player-edit-input` (reta) | Implementado | Cubierto por selector `input` genérico excluido |

### Cambio 3 — Touch targets (≤479px)

| Ítem | Estado | Notas |
|------|--------|-------|
| `.riviera-btn`, `.riviera-btn--sm` | Implementado | `min-height: 44px` |
| `.rj-btn` | Implementado | `min-height: 44px` |
| Reta: `.elegant-delete-btn`, `.elegant-edit-btn`, save/cancel, `.reta-btn-delete` | Implementado | `min-width/min-height: 44px` |
| Jugadores: `.rj-card__edit`, `.rj-card__delete` | Implementado | Icon buttons 44×44 |
| TE inicio/gestión `.riviera-btn` (36px legacy) | Implementado | Override en `riviera-open-mobile-polish.css` |
| Icon buttons: `.riviera-btn-danger-icon`, `.riviera-modal__close`, `.te-bracket-modal__close` | Implementado | 44×44 |
| `!important` | No aplicable | No se usó en Fase 1 |
| `.instruction-number` (decorativo, no botón) | No aplicable | No es control interactivo |
| `.home-sheet__courts-step`, `.home-sheet__mini-step` | Pendiente | Definidos en `home.css` — fuera de alcance |
| `.MobileUserMenu` (36px) | Pendiente | `MobileUserMenu.css` — fuera de alcance |
| Controles TE bracket restantes | Parcial | Solo botones `.riviera-btn` y close; inputs numéricos bracket sin override táctil |

### Cambio 4 — Modal sheet y viewport (≤479px)

| Ítem | Estado | Notas |
|------|--------|-------|
| `.riviera-modal-overlay--sheet` → `100vh` + `100dvh` | Implementado | Fallback progresivo |
| Flex: header/footer `flex-shrink: 0`, body scroll | Implementado | `overflow-y: auto` solo en body |
| Footer safe-area inferior | Implementado | `padding-bottom: calc(var(--space-4) + var(--ro-safe-bottom))` |
| Desktop modal sin cambios | Implementado | Reglas solo ≤479px |
| `QuickStartSheet` (`home-sheet`) | Parcial | Ya usa `88dvh` + safe-area en `home.css`; no usa `sheet` prop — fuera de alcance |
| Evitar doble scroll body/modal | Implementado | `overflow: hidden` en contenedor sheet |

### Cambio 5 — Safe area unificada

| Ítem | Estado | Notas |
|------|--------|-------|
| Tokens `--ro-safe-*` en `:root` | Implementado | `riviera-open-tokens.css` |
| Reemplazo en 3 archivos autorizados | Implementado | `riviera-open-mobile-polish.css` (4 usos) |
| Resto del repositorio | Pendiente | Fase posterior |

### Cambio 6 — Compatibilidad

| Ítem | Estado |
|------|--------|
| Desktop sin cambios visuales | Implementado (reglas ≤479px) |
| Tablets 768px sin overrides Fase 1 nuevos | Implementado |
| Sin dependencias nuevas | Implementado |
| Sin componentes React tocados | Implementado |
| Sin lógica de negocio tocada | Implementado |

### Problemas que permanecen abiertos (fases posteriores)

| Ítem | Estado |
|------|--------|
| Navegación inferior (bottom nav) | Pendiente — Fase 2 |
| Home con CTA principal | Pendiente — Fase 2 |
| Tabla standings Reta 820px | Pendiente — Fase 3+ |
| Rankings de Liga | Pendiente — Fase 3+ |
| Tablas de Torneo Express | Pendiente — Fase 3+ |
| Navegación y back inconsistentes | Pendiente — Fase 2+ |
| Wizard de creación | Pendiente — Fase 2+ |
| `window.confirm` | Pendiente — Fase 4 |
| Breakpoints ad hoc en 15+ archivos | Pendiente — Fase posterior |

### Validación automatizada (Fase 1)

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` | ✅ Pasa |
| `CI=true npm test -- --watchAll=false` | ✅ 84 suites OK; 1 fallo preexistente (`duelo2v2CreateDraft.test.ts`) — sin fallos nuevos |
| `npm run build` | ✅ Pasa (+482 B CSS gzip) |

### Checklist manual Fase 1

| Prueba | Estado |
|--------|--------|
| Login: input sin zoom iOS (≤479px) | Implementado (CSS) — verificar en dispositivo |
| Home: sin scroll horizontal | Parcial — reglas preexistentes en mobile-polish |
| QuickStart: footer visible + safe-area | Parcial — `home.css` preexistente; primitivo sheet para modales genéricos |
| Botones reta setup ≥44px | Implementado (CSS) |
| Jugadores: botones ≥44px | Implementado (CSS) |
| Desktop 1280px sin cambios | Implementado (CSS scoped ≤479px) |

---

*Fase 1 implementada.* Fase 2 implementada (ver §15).

---

## 15. Estado de implementación — Fase 2

*Implementado: 2026-07-11.*

### Bottom navigation

| Ítem | Estado | Notas |
|------|--------|-------|
| `MobileAppNavigation` (5 tabs) | Implementado | `src/components/navigation/MobileAppNavigation.tsx` |
| Solo ≤767px | Implementado | CSS `display: none` desde 768px |
| Solo área privada autenticada | Implementado | `shouldShowMobileAppNavigation()` en `App.tsx` |
| Touch 44px + texto + icono | Implementado | Tokens Fase 1 |
| `aria-label` + `aria-current` | Implementado | |
| z-index bajo modales | Implementado | `--ro-z-sticky` (50) vs modal 1000 |
| Safe-area inferior | Implementado | `padding-bottom: var(--ro-safe-bottom)` |

### Rutas por tab (sin rutas nuevas)

| Tab | Destino | Mecanismo |
|-----|---------|-----------|
| Inicio | `/` | `navigateToAppHome()` |
| Eventos | `/?mis-eventos=1` | Query en ruta existente → `TournamentManager` |
| Jugadores | `/jugadores/M` | `navigateJugadores()` |
| Ranking | `/ranking/o/{userId}/varonil` | `buildInternalClubRankingUrl()` — ranking interno del club |
| Más | Sheet modal | `MobileUserMenu` + enlace legal existente |

**Decisión ranking:** No existe ruta privada distinta; se reutiliza `/ranking/o/{orgId}/varonil` (vista interna del organizador, compartible). Excepción en visibilidad de nav para org autenticado.

### Tab activo

| Ítem | Estado |
|------|--------|
| Función centralizada `resolveMobileNavTab()` | Implementado |
| `/` sin query → Inicio | Implementado |
| `?mis-eventos=1`, `/reta/:id`, modos privados → Eventos | Implementado |
| `/jugadores/*` → Jugadores | Implementado |
| `/ranking/o/*` → Ranking | Implementado |
| Sheet Más abierto → Más activo | Implementado (estado local) |

### Exclusiones (nav oculta)

| Contexto | Estado |
|----------|--------|
| Login / registro / auth callback / reset | Implementado |
| Rutas `/public/*` espectador | Implementado |
| Ranking público anónimo (`/ranking` sin org) | Implementado |
| Admin | Implementado |
| Winner / legal fullscreen | Implementado |
| Modales | Implementado — nav queda debajo (z-index) |

### Safe-area y espacio inferior

| Ítem | Estado |
|------|--------|
| `--mobile-app-navigation-height: 56px` | Implementado — `riviera-app-shell.css` |
| `--mobile-app-navigation-offset` | Implementado |
| Clase `.has-mobile-app-navigation` en `App` | Implementado |
| Padding en shells privados | Implementado — `.main-layout`, `.liga-page`, `.torneo-express-page`, `.duelo2v2-page`, `.rj-page`, `.americano-screen`, `.mis-retas-page` |

### Home mobile-first

| Ítem | Estado |
|------|--------|
| CTA principal «Crear evento» | Implementado — `HomeCreateEventCta.tsx` |
| Picker de modalidades → `handleModeSelect` / QuickStartSheet | Implementado |
| Eventos activos/recientes antes del grid | Implementado — `RecentRetasSection` reordenado |
| Tarjetas modo más compactas en móvil | Implementado — `home.css` |
| Accesos duplicados ocultos en móvil | Implementado — `.home-quick-links--secondary { display: none }` |
| Desktop sin cambios relevantes | Implementado |

### Header / duplicación

| Ítem | Estado |
|------|--------|
| Menú móvil del header eliminado | Implementado — cuenta/logout en tab «Más» |
| Branding + avatar en header móvil | Implementado |
| Desktop UserHeader intacto | Implementado |

### Tests

| Ítem | Estado |
|------|--------|
| `src/lib/mobileAppNavigation.test.ts` | Implementado — 18 tests |
| Tab activo, visibilidad, navegación, 5 tabs, aria-current | Implementado |

### Validación automatizada (Fase 2)

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` | ✅ Pasa |
| `CI=true npm test -- --watchAll=false` | ✅ 85 suites OK (+1 nueva); 1 fallo preexistente `duelo2v2CreateDraft.test.ts` |
| `npm run build` | ✅ Pasa |

### Pendientes Fase 4+

| Ítem | Estado |
|------|--------|
| Wizard de creación | Pendiente |
| Copy completo y confirm dialogs globales | Pendiente |
| Todos los breakpoints legacy | Pendiente |
| Accesibilidad completa del sistema | Pendiente |
| Perfil público / historial de jugador | Pendiente |
| Navegación interna LigaGestionar (tabs completos) | Parcial — cards en jornada; gestión principal sin tabs |
| Borrador no guardado al cambiar tab | Documentado — paneles montados con `hidden`, sin desmontar |
| Query `?mis-eventos=1` en URL | Aceptado — sin ruta nueva |

---

## Estado de implementación — Fase 3

**Objetivo:** UX móvil dentro de modos activos (navegación interna, resumen, siguiente acción, cards, sticky actions) sin tocar cálculos, persistencia ni reglas de competencia.

### Reta — Implementado

| Ítem | Estado |
|------|--------|
| Navegación interna (Resumen / Partidos / Clasificación / Jugadores / Config.) | Implementado — `RetaMobileOrganizerLayout` |
| Header compacto + siguiente acción | Implementado — `ModeEventHeader` + `resolveRetaNextAction` |
| Clasificación móvil con cards | Implementado — `StandingsMobileCards` en `RealTimeStandingsTable` |
| Tabla desktop | Conservada — clase `standings-table-desktop` |
| Acciones destructivas separadas | Implementado — tab Config → `reta-danger-zone` |
| Sticky action | Implementado — iniciar torneo / ver partidos |
| MobileAppNavigation | Oculta — `isActiveEventManagementScreen` |
| Componentes reutilizados | `ModeSectionTabs`, `ModeSectionPanel`, `MobileStickyActionFooter`, `StandingsMobileCards` |
| `min-width: 820px` en móvil | Mitigado — cards visibles; CSS tabla sin min-width forzado |

### Liga — Implementado (parcial en gestión principal)

| Ítem | Estado |
|------|--------|
| Cards en `LigaRanking` | Implementado |
| Cards en `LigaJornada` (4 tablas del aside) | Implementado — `LigaSimpleRankingDual` |
| Tabla desktop | Conservada |
| Navegación interna en `LigaGestionar` | Pendiente Fase 4 |
| Sticky action | No aplica en jornada |
| MobileAppNavigation | Oculta en rutas `/liga/:id` privadas |

### Torneo Express — Implementado

| Ítem | Estado |
|------|--------|
| Navegación interna móvil | Implementado — `GestionGrupos` tabs (Resumen / Grupos / Partidos / Eliminación / Config.) |
| Clasificación por grupo en cards | Implementado — `TablaGrupo` + `StandingsMobileCards` |
| Tabla desktop | Conservada — `te-standings-table-desktop` |
| Bracket con scroll contenido | Implementado — `te-bracket-scroll-container` + hint |
| Acciones destructivas | Separadas en tab Config |
| Sticky action | Implementado — registrar resultados / finalizar fase / finalizar torneo |
| MobileAppNavigation | Oculta en gestión privada |

### Duelo 2 vs 2 — Implementado

| Ítem | Estado |
|------|--------|
| Navegación interna | Implementado — Resumen / Equipos / Partidos / Resultado |
| Equipos diferenciados | Implementado — cards A/B |
| Sticky finalizar | Implementado cuando hay ganador pendiente de cierre |
| MobileAppNavigation | Oculta en `/duelo-2v2/*` gestión |

### Americano — Implementado

| Ítem | Estado |
|------|--------|
| Navegación en fase playing | Implementado — Ronda / Partidos / Ranking / Jugadores |
| Ranking existente | Reutilizado — `LiveRanking` + `StandingsMobileCards` |
| Lista jugadores compacta | Implementado — tab Jugadores |
| Siguiente acción | Implementado — `resolveAmericanoNextAction` |
| MobileAppNavigation | Oculta en `/americano-dinamico` |

### Infraestructura compartida (Fase 3)

| Componente / archivo | Rol |
|---------------------|-----|
| `src/hooks/useMobileViewport.ts` | Detección ≤767px |
| `src/components/platform/ModeSectionTabs.tsx` | Tabs accesibles |
| `src/components/platform/ModeSectionPanel.tsx` | Paneles montados (`hidden`) |
| `src/components/platform/ModeEventHeader.tsx` | Header + CTA recomendado |
| `src/components/platform/MobileStickyActionFooter.tsx` | Footer sticky |
| `src/styles/mode-mobile-shell.css` | Tabs, header, dual table/cards, sticky offset |
| `src/lib/modePresentation/*.ts` | Presentación de siguiente acción por modo |
| `src/lib/modePresentation/standingsRowAdapters.ts` | Adaptadores Liga/TE → cards |
| `src/components/liga/LigaSimpleRankingDual.tsx` | Tabla + cards Liga |
| `src/lib/mobileAppNavigation.ts` | `isActiveEventManagementScreen()` |

### Siguiente acción — cómo se determina

Solo funciones de **presentación** que leen estados ya existentes (`is_started`, `fase_torneo`, `estado` partido, `ganador`, `phase`, etc.). No hay lógica paralela de negocio ni recálculo de standings.

### MobileAppNavigation vs sticky footer

- En pantallas de gestión activa, `shouldShowMobileAppNavigation` retorna `false`.
- Cuando hay acción principal (`has-mobile-sticky-action`), el shell añade `padding-bottom: var(--mobile-sticky-action-offset)`.
- No coexisten dos barras inferiores en la misma pantalla.

### Tests (Fase 3)

| Archivo | Cobertura |
|---------|-----------|
| `src/lib/modePresentation/modePresentation.test.ts` | Reta/TE/Duelo/Americano next action, adaptadores, orden standings, gestión activa |
| `src/lib/mobileAppNavigation.test.ts` | +2 tests gestión activa |

### Validación automatizada (Fase 3)

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` | ✅ Pasa |
| `CI=true npm test -- --watchAll=false` | ✅ 86 suites OK; 1 fallo preexistente `duelo2v2CreateDraft.test.ts` |
| `npm run build` | ✅ Pasa |

### Riesgos pendientes (Fase 3)

| Riesgo | Estado |
|--------|--------|
| LigaGestionar sin tabs móviles | Pendiente Fase 4 |
| Pérdida de estado al cambiar tab | Mitigado — paneles no se desmontan |
| Bracket eliminatorio muy ancho | Contenido en wrapper con scroll local |
| Accesibilidad tabs en todos los modos | Parcial — `role="tablist"` en tabs internos |

### Archivos tocados (Fase 3)

Ver entrega final en conversación / diff. Principales: `RetaMobileOrganizerLayout`, `GestionGrupos`, `LigaJornada`, `LigaRanking`, `TablaGrupo`, `Duelo2v2Gestionar`, `AmericanoDinamicoScreen`, `mode-mobile-shell.css`, `modePresentation/*`.

### Pendientes Fase 4

- Tabs móviles en `LigaGestionar` (Resumen / Jornada / Tabla / Participantes / Config.)
- Wizard general de creación
- Confirm dialogs unificados (sustituir `window.confirm`)
- Perfil público e historial de jugador mobile-first
- Revisión manual en 360×740 y 390×844 de todos los flujos

---

*Fase 3 implementada.* Siguiente paso: Fase 4 (Liga gestión, wizard, copy, accesibilidad global).
