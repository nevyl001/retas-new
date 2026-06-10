# Brief UI — Ranking público Riviera Open

Documento para revisión de diseño (Claude u otro). Describe el estado actual de la **vista pública del ranking de jugadores** para proponer mejoras visuales alineadas con Riviera Gold v3 y tendencias 2026 (shareable, premium deportivo).

---

## 1. Contexto de producto

| Campo | Valor |
|-------|--------|
| **Ruta** | `/ranking/o/{organizadorId}` |
| **Componente principal** | `src/components/jugadores/JugadoresPublicRanking.tsx` |
| **Shell** | `JugadoresPublicShell` → clases `rjp-public rjp-public--ranking` |
| **App wrapper** | `App--jugadores-public ro-public-view` (fondo cancha) |
| **Audiencia** | Jugadores que consultan su posición; el organizador comparte el enlace |
| **Objetivo UX** | Ver ranking por categoría, entender sistema de puntos, abrir ficha del jugador |
| **Objetivo visual** | Premium, oscuro, dorado quirúrgico; digno de compartir en Instagram/stories |

---

## 2. Árbol de componentes

```
App (App--jugadores-public ro-public-view)
└── JugadoresPublicShell [variant=ranking]
    └── .rjp-public__inner
        └── .rjp-ranking
            ├── header.rjp-ranking-header
            │   ├── .rjp-ranking-header__brand      "Riviera Open"
            │   ├── .rjp-ranking-header__title      "Ranking de jugadores"
            │   ├── .rjp-ranking-header__sub
            │   └── a.rjp-ranking-header__cta       → /ranking/como-funciona
            ├── RankingPuntosTeaser (.rjp-ranking-intro)
            │   ├── modalidades (Liga, Torneo, Americano, Reta)
            │   └── grid torneo por fase
            ├── section.rjp-ranking-panel
            │   ├── .rjp-ranking-panel__picker
            │   │   └── .rjp-cat-grid → .rjp-cat-chip (7 categorías)
            │   └── .rjp-ranking-panel__body
            │       └── ul.rjp-ranking-list
            │           └── button.rjp-ranking-card (+ --first para #1)
            │               ├── .rjp-ranking-card__rank (+ --gold)
            │               ├── JugadorAvatar [size=md, 48px]
            │               ├── .rjp-ranking-card__body (nombre + pts)
            │               └── chevron
            └── footer.rjp-ranking-footer
```

---

## 3. Archivos CSS (fuente de verdad)

| Archivo | Rol |
|---------|-----|
| `src/styles/riviera-tokens.css` | Tokens globales Riviera Gold v3 |
| `src/styles/riviera-public-court.css` | Fondo cancha en `.ro-public-view` |
| `src/components/jugadores/riviera-jugadores-public.css` | Shell público jugadores (glass, grain, glow) |
| `src/components/jugadores/riviera-jugadores-public-ranking.css` | **Estilos específicos del ranking** |
| `src/components/jugadores/riviera-jugadores.css` | Avatares `.rj-avatar` |
| `docs/DESIGN_SYSTEM.md` | Reglas de diseño del producto |

---

## 4. Design system global (usar al proponer cambios)

### Tokens principales (`riviera-tokens.css`)

```css
--bg-base: #1c1c1e;
--bg-deep: #0c0c0c;
--accent-gold: #c9a227;
--accent-gold-light: #dbb842;
--accent-gold-dim: rgba(201, 162, 39, 0.12);
--text-primary: #f5f5f7;
--text-secondary: #aeaeb2;
--text-muted: #6e6e73;
--font-display: /* DM Sans o display del proyecto */;
--font-body: /* DM Sans */;
--radius-sm / --radius-md / --radius-lg;
```

### Regla del oro (producto)

- Máximo **3 acentos dorados** visibles por pantalla.
- Oro: CTAs, #1 del ranking, puntos, estados live.
- El resto: blanco / gris / negro.

### Fondo cancha (mantener)

```css
/* App--jugadores-public */
.ro-public-view::before → cancha-riviera.jpg (desktop) / vertical (móvil), opacity ~0.16
.ro-public-view::after  → gradiente oscuro encima
```

### Referencia visual reciente (otra vista pública)

La vista pública de **partidos reta** (`riviera-public-americano.css`) ya tiene:
- Avatares XL con nombre individual debajo
- Tarjetas glass con gradiente sutil
- Safe-area + márgenes responsive (Galaxy S25, iPhone)
- Barra ganador dorada
- Tarjeta “¡Felicidades!” transparente (cristal) sobre la cancha

**Objetivo:** alinear el ranking público con ese nivel de polish sin romper densidad de lista.

---

## 5. Tokens locales del ranking (hoy duplicados)

Definidos en `.rjp-public--ranking` — **no usan** `riviera-tokens.css`:

```css
--rjp-rk-gold: #c9a84c;        /* ≈ accent-gold pero distinto hex */
--rjp-rk-gold-bg: #1e1a0e;
--rjp-rk-gold-border: #c9a84c44;
--rjp-rk-card: #161618;
--rjp-rk-surface: #1a1a1f;
--rjp-rk-border: #2a2a2e;
--rjp-rk-text: #e8e8ec;
--rjp-rk-muted: #7a7a85;
--rjp-rk-muted-2: #4a4a55;
```

**Deuda técnica:** migrar a tokens globales para consistencia con reta/TE.

---

## 6. Layout y breakpoints actuales

| Breakpoint | Comportamiento |
|------------|----------------|
| `≤340px` | Grid categorías 3 columnas |
| `≤380px` | Modalidades en 2 filas |
| `≤899px` | Padding inner `16px 14px`; categorías 4 cols; chip muestra nombre corto |
| `≥900px` | Max-width 760px; categorías 7 cols; nombre completo en chips; hover en cards |

**No hay** reglas `safe-area-inset` ni breakpoint `390px+` como en reta pública.

---

## 7. Inventario visual por bloque

### Header
- Brand 10px uppercase dorado apagado
- Título clamp(1.65rem, 5vw, 2rem), weight 800
- Subtítulo 13px muted
- CTA full-width, min-height 48px, borde 0.5px

### RankingPuntosTeaser (intro puntos)
- 4 cards modalidad + grid 2×2 fases torneo
- Mucho contenido **antes** de la lista → scroll largo en móvil
- Labels 10px uppercase

### Panel categorías
- Grid 4×2 en móvil (7 categorías)
- Chip activo: fondo `#1e1a0e`, borde dorado
- Open tiene icono trofeo

### Lista jugadores
- Card: flex row, gap 10px, padding 12px, radius 14px
- Rank badge: círculo 36px; #1 = trofeo dorado sólido
- Avatar: **md = 48px** (pequeño para redes)
- Nombre 15px + puntos 12px dorado
- Solo `#1` tiene estilo especial (`--first`); #2 y #3 sin plata/bronce

### Footer
- 10px uppercase, opacity ~28%

---

## 8. Problemas conocidos / oportunidades

### Móvil (Galaxy S25, iPhone)
- [ ] Padding lateral `14px` — se siente pegado al borde (reta ya usa `safe-area` + 1.2–1.4rem)
- [ ] Intro de puntos ocupa mucho vertical antes del ranking
- [ ] Avatares 48px pequeños si el jugador quiere screenshot
- [ ] Sin podio visual top 3 (solo card #1 ligeramente dorada)

### Consistencia
- [ ] Colores locales vs `--accent-gold` global
- [ ] No usa glass/backdrop como `te-pub-match--wide` o `ro-pub-celebrate--winners`
- [ ] Fondo cancha visible pero panel ranking es opaco sólido `#161618`

### Shareability / 2026
- [ ] Falta jerarquía hero para top 3 (podio, avatares grandes)
- [ ] Nombres truncados con ellipsis — OK en lista, malo en captura
- [ ] Sin animación sutil en cambio de categoría
- [ ] Card #1 podría tener anillo dorado como `ro-pub-celebrate__hero-ring`

### Accesibilidad
- [ ] Chips categoría son `role=tab` — OK
- [ ] Contraste `.rjp-ranking-empty` color `#35353f` puede ser bajo

---

## 9. Datos mostrados por fila

```tsx
// Por jugador en lista:
posición (#N o trofeo si 1°)
foto_url | inicial
pais_codigo (badge)
nombre
stats.puntos_totales + " pts"
// Click → ficha pública /jugadores/{slug}
```

Categorías: `open`, `quinta`, `sexta`, `septima`, `octava`, `novena`, `mixto` (ver `JUGADOR_CATEGORIAS_ORDER`).

---

## 10. Prompt sugerido para Claude

Copia esto junto con este documento:

---

**Rol:** Diseñador UI senior especializado en apps deportivas premium (dark + gold).

**Tarea:** Revisa el ranking público de Riviera Open (pádel) descrito en `RANKING_PUBLIC_UI_BRIEF.md`. Propón mejoras visuales concretas en CSS/React **sin cambiar la lógica de negocio**.

**Restricciones:**
- Mantener fondo de cancha (`ro-public-view`)
- Usar tokens `riviera-tokens.css` donde sea posible
- Máximo 3 acentos dorados por pantalla
- Mobile-first; probar mentalmente 375px, 390px (S25), 768px, 900px+
- Respetar `safe-area-inset` en móvil
- Lista debe seguir siendo scaneable (no solo bonita)
- Alinearse con el polish de `riviera-public-americano.css` (avatares, glass, ganadores)

**Entregables esperados:**
1. Diagnóstico (5–8 bullets) de lo que falla hoy
2. Wireframe textual del layout móvil propuesto (header → teaser → podio opcional → lista)
3. Cambios CSS específicos (selectores + propiedades)
4. Qué componentes TSX tocar (si hace falta podio top 3)
5. Prioridad: P0 (móvil pegado + avatares) / P1 (podio) / P2 (animaciones)

**No hacer:** reescribir todo el sistema de puntos ni quitar el teaser sin alternativa compacta.

---

## 11. Snippets CSS actuales clave

### Card jugador #1
```css
.rjp-ranking-card--first {
  border-color: var(--rjp-rk-gold-border);
  background: linear-gradient(135deg, rgba(30,26,14,0.95) 0%, rgba(26,26,31,0.98) 100%);
}
.rjp-ranking-card__rank--gold {
  background: var(--rjp-rk-gold);
  color: #1a1505;
}
```

### Shell inner móvil
```css
@media (max-width: 899px) {
  .rjp-public--ranking .rjp-public__inner {
    max-width: 100%;
    padding: 16px 14px 2rem;
  }
}
```

### Avatar en ranking
```css
.rjp-public--ranking .rj-avatar {
  border-color: var(--rjp-rk-gold-border);
  color: var(--rjp-rk-gold);
}
/* JugadorAvatar size md = 48×48px */
```

---

## 12. Rutas relacionadas

| Ruta | Vista |
|------|--------|
| `/ranking/o/{id}` | Este ranking |
| `/ranking/como-funciona` | Reglas completas |
| `/jugadores/{slug}` | Ficha pública jugador |

---

*Última actualización: 2026-06-09 — generado para revisión de diseño del ranking público.*
