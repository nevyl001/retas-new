# RivieraApp — Design System (Riviera Gold v2)

**Estado:** Riviera Gold **v3** — grafito `#1c1c1e` + dorado `#e8c547` + Barlow Condensed / DM Sans.

## Principios

- **Precision Dark:** negro absoluto, tipografía como estructura, oro como acento quirúrgico.
- Un solo `:root` activo. Sin hex en CSS de features (objetivo Fase 2+).
- Referencias de calidad: densidad tipo Linear, dark honesto tipo Vercel, componentes predecibles tipo Stripe.

## Regla del oro (producto)

1. Máximo **3 acentos dorados** visibles por pantalla pública: kicker, score ganador, un acento estructural.
2. El oro (`#d4af37`) es de alto valor — CTAs primarios, scores ganadores, estados live, énfasis único.
3. Todo lo demás: blanco, gris o negro.

## Tokens

Fuente única: [`src/styles/riviera-tokens.css`](../src/styles/riviera-tokens.css)

| Categoría | Tokens clave |
|-----------|----------------|
| Fondo | `--bg-base`, `--bg-card`, `--bg-elevated` |
| Acento | `--accent-gold`, `--accent-gold-light`, `--glow-gold` |
| Texto | `--text-primary`, `--text-secondary`, `--text-muted` |
| Estados | `--win`, `--loss`, `--live`, `--pending` |
| Tipo | `--font-display`, `--font-body` |
| Espacio | `--space-1` … `--space-20` (múltiplos de 4px) |
| Radio | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full` |
| Sombra | `--shadow-1`, `--shadow-2`, `--shadow-3`, `--shadow-gold` |
| Motion | `--motion-fast`, `--motion-base`, `--motion-stagger` |

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

### Riviera Gold v3 (2026-05-18)

- Tokens v3 en `riviera-tokens.css` (preview `riviera_gold_v3_preview.html`).
- Fuentes: Barlow Condensed + DM Sans (`public/index.html`).
- `riviera-gold-v3.css`: patrones match card, kicker, cards, filtros.
- Podio público y summary alineados al preview (`data-rank`, flex, oro solo en 1º).
- Badge “En vivo” en dorado (no rojo).
- Botón primario: texto `--text-on-gold` (`#1c1c1e`).

### Pendiente (post-sprint)

- Migrar `UserManagement` modal a `<Modal>`.
- Reducir `!important` en `riviera-organizer-reta.css` con selectores `.riviera-organizer`.
- Unificar breakpoints sueltos (430, 520, 967…) hacia sm/md/lg/xl.
- Reemplazar hex en `src/features/reta/*.css` por tokens.
