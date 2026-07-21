# Arquitectura de Branding Multi-Tenant — Fase 2

**Fecha:** 2026-06-30  
**Estado:** Infraestructura implementada. Vistas no migradas (Fase 3).

---

## Decisiones de arquitectura confirmadas

| Tema | Decisión |
|------|----------|
| Default sin tenant premium | Identidad madre **Riviera Open** (no splash “vacío”) |
| Premium (ej. Hack) | **Cero flash** Riviera→Hack en primer render |
| Aplicador único | `BrandingService` — eliminados `club-theme-early.js` / `.css` |
| Provider | Un solo provider: `ClubExperienceProvider` evolucionado (+ `useBranding`) |
| ROMC / multiclub | Fuera de alcance |
| RPC prerrequisito | `get_organizador_display_name` ✅ HTTP 200 en producción |

---

## Capas

```
Auth (Supabase session en localStorage)
  ↓
organizerResolver.resolveBootstrapOrganizadorId()
  ↓
BrandingService.resolveAndApplyBranding(orgId)
  ↓
applyBrandingToDocument() → CSS en <html>
  ↓
bootstrapAppBranding() [index.tsx, antes de createRoot]
  ↓
ClubExperienceProvider (consume branding, re-aplica en cambio de sesión)
  ↓
useBranding() / useClubExperience()
```

---

## Módulos nuevos

| Archivo | Rol |
|---------|-----|
| `src/branding/BrandingService.ts` | Único dueño de resolución, aplicación y limpieza |
| `src/branding/organizerResolver.ts` | Org desde URL / sesión / caché |
| `src/branding/bootstrapAppBranding.ts` | Gate pre-render en `index.tsx` |
| `src/branding/types.ts` | `TenantBranding` |
| `src/branding/constants.ts` | `CLUB_EXPERIENCE_CACHE_KEY` |

---

## API principal (`BrandingService`)

```typescript
resolveBrandingSync(orgId)      // Manifiesto + nombre (premium sync; resto caché/Riviera)
resolveBranding(orgId)          // + RPC nombre si no premium
resolveAndApplyBranding(orgId)  // Async + aplica CSS
applyBrandingToDocument(b)      // Solo aplicación
clearTenantBranding()           // Logout: limpia cachés + Riviera madre
clearBrandingCache()            // localStorage nombre + club cache
getAppliedBranding()            // Estado actual
```

---

## Gate antes del primer render

```typescript
// src/index.tsx
void bootstrapAppBranding().then(() => {
  root.render(<App />);
});
```

`bootstrapAppBranding`:
1. Marca `<html class="branding-bootstrapping">` (fondo neutro oscuro inline en `index.html`)
2. Resuelve organizador desde sesión/URL/caché
3. `await resolveAndApplyBranding(orgId)` — premium es **síncrono** en manifiesto
4. Quita clase `branding-bootstrapping`

---

## ClubExperienceProvider (evolucionado)

- **Solo consume** `getAppliedBranding()` vía `subscribeBranding()` — **sin** `useLayoutEffect` que aplique CSS
- Expone `branding: TenantBranding` + hook **`useBranding()`**
- Cambios de sesión: `UserContext.applySession` → `resolveAndApplyBranding` / `clearTenantBranding`
- Admin login/logout: `AdminContext` → `clearTenantBranding()`

## Idempotencia y deduplicación

- `applyBrandingToDocument`: compara con `appliedBranding` (`brandingMatchesApplied`) — **no toca DOM** si coincide
- `resolveAndApplyBranding`: `inflightByOrganizadorId` — una promesa activa por org

## Único aplicador de CSS en `<html>`

Solo `BrandingService.applyBrandingToDocument()` (llamado desde bootstrap, UserContext, facades deprecated).

---

## Limpieza en logout

| Pieza | Limpieza |
|-------|----------|
| `UserContext.signOut` | `clearTenantBranding()` |
| `AdminContext.logoutAdmin` | `clearTenantBranding()` |
| `ro_club_experience_v1` | `removeItem` |
| `organizerNameCache` (memoria) | `clearOrganizerDisplayNameCache()` |
| Variables CSS `--brand-*`, `--ro-accent`, etc. | `clearClubExperienceTheme()` |

---

## Eliminado en Fase 2

- `public/club-theme-early.js`
- `public/club-theme-early.css`
- Segundo aplicador de tema duplicado (ORG_BRAND hardcodeado en JS)

Reglas anti-flash Hack movidas a `src/index.css` (`html[data-club="hack-padel"]`).

---

## Modelo `TenantBranding`

```typescript
{
  organizadorId, brandingKey, nombre, logoUrl,
  primaryColor, secondaryColor, background, surface, border,
  fontFamily, manifest, isClubBranded
}
```

**Prohibido** condicionar UI por nombre de club (`if (nombre === 'Hack')`). Solo `branding` / `manifest`.

---

## Prueba manual (Fase 2)

1. Hard refresh logueado como **Hack** → fondo negro + acento lima desde el primer frame
2. Logout → tema Riviera madre
3. Login **Riviera** (sin premium) → nombre vía RPC sin error 404
4. Consola: `getAppliedBranding()` desde DevTools no aplica — usar React DevTools o inspeccionar `data-club` en `<html>`

---

## Pendiente Fase 3

- Migrar hardcodes de tenant en UI (`JugadoresLista`, ranking, etc.)
- Grep acotado (excluir legal, motherBrand, manifiestos)
- No tocar ROMC logs (`TEMP_MULTICLUB_ROMC_2_2_B`) — tarea separada

---

## Archivos modificados (Fase 2)

**Nuevos:** `src/branding/*`, `BRANDING_ARQUITECTURA.md`

**Modificados:**
- `src/index.tsx`
- `src/index.css`
- `public/index.html`
- `src/club-experience/ClubExperienceContext.tsx`
- `src/club-experience/clubExperienceBootstrap.ts`
- `src/club-experience/applyClubExperienceTheme.ts`
- `src/club-experience/index.ts`
- `src/lib/organizer/organizerDisplayName.ts`
- `src/contexts/UserContext.tsx`
- `src/contexts/AdminContext.tsx`

**Eliminados:**
- `public/club-theme-early.js`
- `public/club-theme-early.css`

---

## Contrato de superficies para tenants premium (v2.3)

**Regla:** un manifiesto de tenant premium debe declarar su escala `--ro-*`
**completa** (superficies, texto, bordes, acento), no sólo `--brand-*`.

### Por qué

La identidad de Hack Padel se construyó como un *delta sobre una base oscura*:
declaraba su lima (`--brand-accent`) y su tipografía, y **heredaba** las
superficies negras del sistema (`--ro-bg-*`). Mientras el default global fue
oscuro, funcionó. Cuando la paleta migró a claro (chrome oscuro + contenido
claro), Hack heredó superficies **claras** y conservó su lima → tarjetas crema
sobre negro.

Un tenant premium **no puede depender de que el default global sea oscuro**.

### Cómo se declara (ver `styles/riviera-open-tokens.css`)

1. El scope del tenant se añade al bloque de **superficies oscuras** para heredar
   la escala oscura como base (`--ro-text-primary`, `--ro-shadow-*`, ring, etc.).
2. Un bloque posterior, con los mismos selectores **+ los combinadores
   descendientes** `[data-brand="tenant"] .ro-surface-dark`, restituye lo propio
   del tenant (`--ro-accent`, `--ro-bg-*`, `--ro-border*`). Los combinadores
   garantizan que las islas `.ro-surface-dark` anidadas (login, vistas públicas,
   chrome) también reciban la escala del tenant y no la del chrome madre.
3. La capa de alias (`brand-tokens`, `brand-effective`) incluye el scope del
   tenant en su lista de declaración `:root, .ro-surface-dark, [tenant]` para que
   `--brand-*` y `--effective-*` se re-resuelvan contra los `--ro-*` del tenant.

### Verificación automática

`src/club-experience/premiumTenantScale.test.ts` verifica que, para cada tenant
premium, la escala `--ro-*` en `riviera-open-tokens.css` resuelva a los valores
de su manifiesto (`hack-padel.ts`) y no a los claros de `:root`. El contrato
`publicBrandingFlash` (lógica JS) no detectaba esto porque el problema era CSS.
