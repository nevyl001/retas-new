# RivieraApp — Design System (Riviera Open Maestro v1.0)

**Estado:** **Riviera Open Maestro v1.0** — negro `#000000` + blanco `#ffffff` + grises. **Sin dorado.**

Fuente de verdad: [`src/styles/riviera-open-tokens.css`](../src/styles/riviera-open-tokens.css) (`--ro-*`).

Compatibilidad app/módulos legacy: [`src/styles/riviera-tokens.css`](../src/styles/riviera-tokens.css) (aliases `--accent-gold` → `--ro-accent`, etc.).

## Principios

- **Precision Dark:** negro absoluto, tipografía como estructura, **blanco** como acento único.
- Un solo `:root` maestro (`--ro-*`). Sin hex en CSS de features (objetivo).
- Tipografía: **Stack Sans Headline** (títulos) + **Inter** (cuerpo).

## Regla de acento (producto)

1. Máximo **3 acentos blancos** visibles por pantalla pública: kicker, score ganador, CTA primario.
2. El blanco es de alto valor — CTAs primarios, estados live, énfasis único.
3. Todo lo demás: grises o negro. Modos de juego conservan color semántico (verde americano, azul liga, etc.).

## Tokens maestro (`--ro-*`)

| Categoría | Tokens clave |
|-----------|----------------|
| Fondo | `--ro-bg-base`, `--ro-bg-deep`, `--ro-bg-surface`, `--ro-bg-elevated`, `--ro-bg-card` |
| Acento | `--ro-accent`, `--ro-accent-hover`, `--ro-accent-dim` |
| Texto | `--ro-text-primary`, `--ro-text-secondary`, `--ro-text-muted` |
| Estados | `--ro-success`, `--ro-error`, `--ro-pending` |
| Tipo | `--ro-font-heading`, `--ro-font-body` |
| Escala | `--ro-text-hero` … `--ro-text-label`, `--ro-text-score` |
| Espacio | `--ro-space-1` … `--ro-space-16` |
| Radio | `--ro-radius-sm` … `--ro-radius-full` |

### Breakpoints (usar valores fijos en `@media`)

| Nombre | Min-width |
|--------|-----------|
| sm | 480px |
| md | 768px |
| lg | 1024px |
| xl | 1200px |

## Arquitectura CSS

```
src/styles/
  riviera-tokens.css      ← único :root
  riviera-reset.css       ← focus, box-sizing
  theme.css               ← @legacy (sin :root)
  design-system.css       ← @legacy componentes v2
  riviera-design-system.css ← utilidades Gold (legacy)
  riviera-primitives.css    ← botones, cards, inputs, modal
  riviera-utilities.css     ← .riviera-page, motion

src/components/ui/        ← Button, Card, Input, Modal
src/features/reta/        ← CSS legacy modularizado (ex App.css)
```

## Reglas de CSS

- Sin `:root` fuera de `riviera-tokens.css`.
- Sin `!important` en código nuevo.
- Sin imports de Google Fonts en componentes (solo `public/index.html`).
- Sin `style={{}}` para estilos estáticos (excepto valores dinámicos p. ej. `animationDelay`).
- Prefijos: `riviera-*` (global), `te-*` (Torneo Express, no ampliar), `ad-*` (admin, futuro).
- **Prohibido en código nuevo:** `modern-*`, `elegant-*`, `compact-*` (solo legado).

## Archivos legacy

| Archivo | Sunset |
|---------|--------|
| `theme.css` | Fase 3 — mantener aliases hasta migrar App.css |
| `design-system.css` | Fase 3 — badges/chips migrar a primitivos |
| `App.css` | Solo `@import` → `src/features/reta/*.css` |
| `src/features/reta/*` | Legado `modern-*` / `elegant-*` — migrar gradualmente |

## QA visual (cada fase)

Desktop + móvil (375, 768, 1280):

- [ ] Home / Dashboard
- [ ] Login / Register
- [ ] Mis retas
- [ ] Partidos reta activa
- [ ] Público americano
- [x] Público — fondo cancha `.ro-public-view` (`riviera-public-court.css`)
- [ ] Admin (si aplica)

Verificar: sin amber `#f59e0b`, focus Tab visible, hover en cards, glow en botón primario.

## Changelog

### Fase 0 (2026-05-18)

- Creado `riviera-tokens.css` con `--glow-gold` y aliases legacy.
- Creado `riviera-reset.css` (focus global).
- Eliminados bloques `:root` de `theme.css`, `design-system.css`, `riviera-design-system.css`.
- Eliminado import duplicado de `theme.css` en `App.tsx`.
- Fuentes Bebas Neue + Outfit en `public/index.html`.
- Eliminada carga dinámica de fuentes en `PublicTorneoExpressShell`.

### Fase 1 (2026-05-18)

- `riviera-primitives.css` — botones, cards, inputs, badges semánticos, modales.
- Componentes UI: `Button`, `Card`, `Input`, `Textarea`, `Modal`, `Badge` (extendido).
- Migraciones: Home (`QuickStartSheet` + `Modal`), Auth (`Login`/`Register` + `Input`/`Button`), Mis retas (`Card`/`Button`), Americano (`Button`), TE delete modal, `StartTournamentSection`.

### Fase 2 (2026-05-18)

- `App.css` reducido a imports (~10 líneas).
- Módulos: `reta-layout`, `reta-matches`, `reta-setup`, `reta-winner`, `reta-responsive`.

### Fase 3 (2026-05-18)

- `AuthPage.css` / `AuthForms.css` alineados a tokens Gold.
- `AdminLogin` usa `Input` + `Button`.

### Fase 4 (2026-05-18)

- `torneo-express.css`: variables `--te-*` apuntan solo a tokens Riviera (sin fallbacks amber).

### Fase 5 (2026-05-18)

- `riviera-utilities.css`: `.riviera-page`, `.riviera-page--public`, `.sr-only`.

### Fase 6 (2026-05-18)

- Podio público: `data-rank` en JSX + selectores CSS robustos.
- `standings-scoring-help` sin fallback `#f59e0b`.

### Torneo Express — Fase 1 visual (2026-05-22)

- Aliases `--riviera-*` en `riviera-tokens.css`.
- `TePageShell` + offset bajo `UserHeader`.
- Botones/badges Riviera en flujos organizador principales; live en dorado.
- `torneo-express-public.css`: colores migrados a tokens (parcial).

### Riviera Open Maestro v1.0 (2026-06)

- Tokens maestro en `riviera-open-tokens.css` (`--ro-*`).
- Compatibilidad legacy en `riviera-tokens.css`.
- Fuentes: Stack Sans Headline + Inter.
- Fase 2: vistas públicas migradas a `--ro-*`.
- Fase 3: app privada/organizador migrada; `riviera-gold-v3.css` → `riviera-open-patterns.css`.
- Emails TE: acento blanco (`emailTemplates.ts`), sin dorado.

### Unificación visual TE (2026-05-22)

- Tokens `--te-*` como aliases de Riviera Gold v3 (`--accent-gold`, `--bg-deep`, etc.).
- `--medal-silver` / `--medal-bronze` para podios públicos.
- `.torneo-express-btn` alineado a `.riviera-btn` (pill + primary sólido).
- Vista pública TE: sin bloque `:root` duplicado; badge live en dorado.
- `ListaTorneosExpress` usa `<Button>` + `TePageShell`.

### Pendiente (post-sprint)

- Migrar `UserManagement` modal a `<Modal>`.
- Reducir `!important` en `riviera-organizer-reta.css` con selectores `.riviera-organizer`.
- Unificar breakpoints sueltos (430, 520, 967…) hacia sm/md/lg/xl.
- Reemplazar hex en `src/features/reta/*.css` por tokens.
