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

## Uso de la skill `ui-ux-pro-max`

Al invocar `.claude/skills/ui-ux-pro-max/scripts/search.py`, usar siempre:

- `--stack react` — **nunca** `react-native`. El `SKILL.md` de la skill trae un texto de plantilla incorrecto ("React Native (this project's only tech stack)"); no aplica a este repo y no se modificó el archivo original para no alterar el paquete vendored.
- Contexto a considerar en cada búsqueda o recomendación: stack React web, TypeScript, CSS responsive, aplicación SaaS multi-tenant, enfoque mobile-first.

Skills instaladas y versionadas en `.claude/skills/`: `ui-ux-pro-max`, `design-system`, `ui-styling`, `brand`. No se instalaron/versionaron `slides`, `banner-design` ni `design` (generación de logos/banners/presentaciones) por no aportar al trabajo sobre la interfaz web del producto.
