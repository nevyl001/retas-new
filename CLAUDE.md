# Riviera Open — instrucciones de proyecto

## Stack

- Aplicación web **React + TypeScript** (Create React App / `react-scripts`), **NO React Native**.
- CSS plano (sin Tailwind, sin styled-components), responsive, **mobile-first**.
- Backend: Supabase (Postgres + RLS + Edge Functions), consumido directamente desde el navegador.

## Arquitectura de producto — SaaS multi-tenant con branding dinámico

Riviera Open es una plataforma multi-club, no una app de un solo club. Cada organizador tiene su propio "branding" (colores, logo, imágenes) según su plan — existe al menos una cuenta real con upgrade de branding activo.

Al proponer o implementar cualquier cambio UX/UI:

- La **estructura** debe ser idéntica entre todos los clubes: layouts, tipografía, tamaños, spacing, componentes (botones, inputs, cards, tablas, modales), iconografía, navegación, estados (hover/active/disabled/loading/error/vacío), responsive, UX en general.
- Solo el **branding** puede variar por cuenta: colores, logo, imágenes, fondos, acentos visuales — vía los tokens dinámicos ya existentes (`--brand-primary`, `--brand-accent`, `--brand-surface`, etc., inyectados en runtime por `src/club-experience/applyClubExperienceTheme.ts` y `src/branding/BrandingService.ts`; alias legacy `--accent-gold`/`--ro-accent` apuntan al mismo valor).
- Si encuentras un color hardcodeado (hex/rgba literal): **no lo reemplaces automáticamente por el dorado de Riviera**. Primero determina si es un color de marca (debe volverse `var(--brand-accent)`/token dinámico existente) o un color semántico de sistema (error/éxito/borde neutro — debe ser un token compartido, igual para todos los clubes). Nunca fijes un color literal como "solución".

### Tokens de branding vs. tokens semánticos

No todo color no-neutro es "de marca". Distinguir siempre entre dos categorías antes de tocar cualquier color:

1. **Tokens de branding** (sí varían por club, vía `var(--brand-*)`/`var(--ro-accent)`/`var(--accent-gold)`): logo, botones, headers, enlaces, fondos, acentos visuales de la interfaz propia del club.
2. **Tokens semánticos** (NUNCA siguen el branding del club, son iguales para todos): oro/plata/bronce (medallas, primer/segundo/tercer lugar), éxito, warning, error, información. Representan semántica universal de competencia o de estado del sistema, no identidad del club.

Ejemplo confirmado en código: `--ro-pub-gold` (acento dorado de vistas públicas: bracket, standings, ranking) y `--ro-medal-gold/silver/bronze` (medallas de podio) son **intencionalmente fijos** — no derivan de `--ro-accent` ni deben hacerlo. Es una decisión de producto explícita (2026-07-26): el dorado de "ganador/marcador destacado" es semántica universal de competencia, no branding del club. Antes de "corregir" un color fijo en contexto de resultados/rankings/medallas, verificar primero si es semántico — no asumir que es un bug de branding.

### Regla crítica: uso restrictivo del dorado (2026-07-27)

El dorado (`--ro-medal-gold`, `--ro-gold`, `--ro-pub-gold`, y el acento propio de la cuenta Riviera Open cuando resuelve a un tono dorado) debe usarse **lo menos posible**. No es un color decorativo de la interfaz — pierde valor si aparece seguido.

**Sí usar dorado cuando hay significado semántico competitivo real**: primer lugar, campeón, medalla de oro, un logro realmente destacado, o un detalle mínimo de identidad Riviera Open cuando sea indispensable.

**Nunca usar dorado para**: botones normales, headers, bordes generales, fondos, inputs, tabs, navegación, cards comunes, iconos sin significado competitivo, estados activos genéricos, decoraciones, focos, hovers, links.

La base visual por defecto debe ser **negro, blanco, marfil, grises**, más los **colores dinámicos del branding de cada club** (que para cuentas con upgrade propio pueden no ser dorado en absoluto — priorizar siempre el branding propio de la cuenta sobre cualquier acento por defecto). Antes de introducir cualquier uso nuevo de dorado, justificar explícitamente qué jerarquía competitiva o significado semántico representa — si no hay una razón clara, usar un token neutro.

## Roadmap UX/UI de toda la plataforma (2026-07-27) — proceso obligatorio por fase

Iniciativa en curso para llevar toda la plataforma (Reta, Reta Abierta, Americano, Liga, Torneo Express, Duelo 2v2, Rankings/Jugadores, Dashboards, Administración, vistas públicas) a un mismo nivel de consistencia visual, ejecutada en fases pequeñas y aprobadas una por una — nunca como cambio masivo. Reglas sin excepción para cada fase:

1. **Solo UX/UI.** No tocar: servicios, hooks, RPC, Supabase, RLS, queries, modelos, validaciones, reducers, estado, navegación, flujos, permisos. Ningún cambio de comportamiento funcional.
2. **El branding nunca se toca.** No reemplazar colores dinámicos por fijos, no eliminar tokens de branding, no hardcodear colores, no convertir el sistema en un tema único. La estructura (layout, spacing, tamaños, tipografía, botones, formularios, cards, badges, modales, estados, navegación, densidad, jerarquía visual, responsive) se unifica entre clubes; el branding (logo, colores, identidad, vía los tokens dinámicos existentes) se conserva automáticamente por cuenta.
3. **Antes de modificar un módulo, analizar qué componentes/clases CSS comparte con otros módulos no incluidos en esa fase**, y proponer el scoping exacto (selector compuesto, className adicional, etc.) antes de implementar — no asumir que un archivo es de un solo módulo. Precedente real: `RatingNivel.css` es compartido entre la ficha admin y la ficha pública; el primer intento de compactar espaciado afectó ambas sin querer, se detectó y se corrigió escribiendo cada regla nueva con el selector compuesto `.rjp-rating-nivel--compact.rjp-rating-nivel--embedded` (único de la ficha admin) antes de hacer commit.
4. **Cada fase debe cerrar con**: `tsc --noEmit` limpio, `eslint` limpio de los archivos tocados, `npm test` sin regresiones (mismo baseline), `npm run build` limpio.
5. Ninguna fase se implementa sin aprobación explícita del roadmap/alcance primero.

## Uso de la skill `ui-ux-pro-max`

Al invocar `.claude/skills/ui-ux-pro-max/scripts/search.py`, usar siempre:

- `--stack react` — **nunca** `react-native`. El `SKILL.md` de la skill trae un texto de plantilla incorrecto ("React Native (this project's only tech stack)"); no aplica a este repo y no se modificó el archivo original para no alterar el paquete vendored.
- Contexto a considerar en cada búsqueda o recomendación: stack React web, TypeScript, CSS responsive, aplicación SaaS multi-tenant, enfoque mobile-first.

Skills instaladas y versionadas en `.claude/skills/`: `ui-ux-pro-max`, `design-system`, `ui-styling`, `brand`. No se instalaron/versionaron `slides`, `banner-design` ni `design` (generación de logos/banners/presentaciones) por no aportar al trabajo sobre la interfaz web del producto.
