# Auditoría de Branding Multi-Tenant — Fase 1

**Fecha:** 2026-06-30  
**Alcance:** Solo lectura — sin cambios de código en esta fase.  
**Proyecto:** retas-new-main (appriviera)

---

## 0. Diagnóstico bloqueante — RPC `get_organizador_display_name`

### Estado en el repositorio

| Pieza | Estado |
|-------|--------|
| SQL versionado | ✅ `supabase/organizer-display-name.sql` |
| Llamada desde frontend | ✅ `src/lib/organizer/organizerDisplayName.ts` L75-77 |
| GRANT a `anon` y `authenticated` | ✅ En el SQL del repo |

La función en el repo:

```sql
CREATE OR REPLACE FUNCTION public.get_organizador_display_name(p_organizador_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
-- Lee public.users.name / email, fallback 'Club'
```

### Por qué puede devolver 404 en producción

PostgREST devuelve **404 / PGRST202** cuando la función **no existe en la BD de Supabase** (migración no ejecutada) o el nombre del parámetro no coincide.

**Acción requerida (bloqueante antes de Fase 2):** ejecutar en Supabase SQL Editor:

```
supabase/organizer-display-name.sql
```

Luego verificar en Network que `POST /rest/v1/rpc/get_organizador_display_name` responde **200** con el nombre del club.

### Qué hace el código cuando el RPC falla

**Archivo:** `src/lib/organizer/organizerDisplayName.ts`

| Línea | Comportamiento |
|-------|----------------|
| 41, 54, 62, 83 | Fallback síncrono/async → `RIVIERA_PRODUCT_NAME` = **"Riviera Open"** |
| 67-68 | Si el org tiene premium branding (`isClubBrandedOrganizer`) → usa manifiesto, **no llama RPC** |
| 75-81 | RPC exitoso → `rememberOrganizerDisplayName()` |
| 83 | RPC falla → **"Riviera Open"** |

**Hook afectado:** `src/club-experience/useOrganizerDisplayName.ts`

1. **Primer render:** `useState(() => getOrganizerDisplayNameSync(...))` → puede mostrar **"Riviera Open"** de inmediato (L22-26).
2. **useEffect:** llama `resolveOrganizerDisplayName()` → si RPC falla, el nombre **no cambia** (sigue "Riviera Open").
3. Si RPC llega después con éxito → `setName(resolved)` → **flash de nombre**.

**Conclusión:** El 404 del RPC **sí puede causar flash** en clubes sin manifiesto premium (Riviera, Padelito, etc.): primero "Riviera Open", luego el nombre real si el RPC funciona. Si el RPC nunca existe, se queda en "Riviera Open" para siempre.

---

## 1. Mapa completo — dónde vive el branding hoy

### 1.1 Capa temprana (antes de React)

| Archivo | Qué hace | Persistencia | Se limpia en logout |
|---------|----------|--------------|---------------------|
| `public/club-theme-early.js` | Aplica tokens CSS + favicon por `ORG_BRAND` hardcodeado (solo Hack UUID) | Escribe `ro_club_experience_v1` en localStorage | ❌ No (solo React lo limpia después) |
| `public/club-theme-early.css` | Estilos anti-flash para `data-club=hack-padel` | — | — |
| `public/index.html` L6-7 | Carga early script/CSS antes de React | — | — |

**Orden de resolución en early.js:** URL `/ranking/o/{uuid}` → sesión Supabase en localStorage → caché `ro_club_experience_v1`.

### 1.2 Bootstrap React (síncrono, pre-render)

| Archivo | Qué hace | Persistencia |
|---------|----------|--------------|
| `src/index.tsx` L8 | `bootstrapClubExperienceTheme()` antes de `createRoot().render()` | Lee sesión + caché |
| `src/club-experience/clubExperienceBootstrap.ts` | `resolveBootstrapOrganizadorId()`, `applyClubExperienceForOrganizador()` | Lee/escribe `ro_club_experience_v1` |

**Nota:** React **no espera** async branding — monta inmediatamente después del bootstrap síncrono.

### 1.3 Provider / Context (durante React)

| Archivo | Rol | Duplicado / alias |
|---------|-----|-------------------|
| `src/club-experience/ClubExperienceContext.tsx` | Provider principal: manifest, `isClubBranded`, `organizadorId` | `BrandProvider`, `useBrand` (deprecated) |
| `src/club-experience/ClubExperienceScope` | Branding scoped en contenedor (vistas públicas TE) sin mutar `<html>` | `BrandScope` |
| `src/contexts/ThemeContext.tsx` | Light/dark (`data-theme`), **no** branding de club | Separado — `padel-tournament-theme` en localStorage |

### 1.4 Aplicación de variables CSS

| Archivo | Alcance |
|---------|---------|
| `src/club-experience/applyClubExperienceTheme.ts` | `document.documentElement.style.setProperty(--brand-*)` |
| `src/club-experience/applyClubExperienceTheme.ts` | `clearClubExperienceTheme()` — `removeProperty` de lista fija |
| `src/club-experience/applyClubExperienceTheme.ts` | `getClubExperienceScopeStyle()` — inline en contenedor scoped |

### 1.5 Resolución de manifiesto (colores, logos, copy)

| Archivo | Fuente de datos |
|---------|-----------------|
| `src/club-experience/organizadorClubIndex.ts` | Bindings estáticos UUID → `brandingKey` (solo Hack Padel hoy) |
| `src/club-experience/manifestRegistry.ts` | Registro de manifiestos |
| `src/club-experience/manifests/riviera-default.ts` | Default Riviera (tokens `--ro-*`) |
| `src/club-experience/manifests/hack-padel.ts` | Hack Padel premium |
| `src/club-experience/manifestResolver.ts` | `resolveClubManifest()`, `isClubBrandedOrganizer()` |
| `src/club-experience/manifestSource.ts` | Abstracción; futuro runtime desde Supabase |

### 1.6 Nombre visible del club (display name)

| Archivo | Fuente |
|---------|--------|
| `src/lib/organizer/organizerDisplayName.ts` | RPC + manifiesto + caché en memoria (`Map`) |
| `src/club-experience/useOrganizerDisplayName.ts` | Hook React — sync primero, async después |
| `supabase/organizer-display-name.sql` | RPC `get_organizador_display_name` |

### 1.7 Hooks y componentes de UI

| Archivo | Uso |
|---------|-----|
| `src/club-experience/components/ClubIdentity.tsx` | Logo + nombre en headers |
| `src/club-experience/useClubModeEyebrow.ts` | Eyebrow de modo de juego |
| `src/club-experience/components/PublicClubModeEyebrow.tsx` | Eyebrow público |
| `src/club-experience/experienceFormatters.ts` | Formateo de textos con nombre org |
| `src/club-experience/resolveClubLogo.ts` | URL de logo |
| `src/club-experience/motherBrand.ts` | Constantes madre: `RIVIERA_PRODUCT_NAME`, etc. |

### 1.8 CSS global

| Archivo | Variables |
|---------|-----------|
| `src/index.css` | `:root` con `--ro-*` (Riviera default) |
| `src/styles/brand-tokens.css` (si existe) | Tokens base |
| Componentes `*.css` | Mezcla `--brand-*` y `--ro-*` |

### 1.9 Cachés y almacenamiento

| Key / Store | Archivo | Contenido branding | Limpieza logout |
|-------------|---------|-------------------|-----------------|
| `ro_club_experience_v1` | localStorage | `{ organizadorId, brandingKey }` | ✅ `clearClubExperienceCache()` en `signOut` |
| `organizerNameCache` | Map en memoria (módulo TS) | UUID → nombre display | ❌ **Nunca se limpia** |
| `padel-tournament-theme` | localStorage | light/dark | ❌ No relacionado a club |
| Sesión `sb-*-auth-token` | localStorage | user id (usado para bootstrap) | ✅ Supabase `signOut` |

### 1.10 Sin Zustand / Redux / React Query para branding

No hay store global de branding fuera de `ClubExperienceContext` y el `Map` de `organizerDisplayName.ts`.

---

## 2. Strings hardcodeados con nombre de club (JSX / UI)

### Críticos para multitenancy (deben migrarse en Fase 3)

| Archivo | Línea aprox. | Texto |
|---------|--------------|-------|
| `src/components/jugadores/JugadoresLista.tsx` | 146 | `"Registro Riviera Open"` (fallback si no branded) |
| `src/components/jugadores/RankingOfficialOutbound.tsx` | 27, 30 | `"Riviera Open"` |
| `src/components/jugadores/JugadorPublicFicha.tsx` | 477 | `"Riviera Open · Vive el pádel diferente"` |
| `src/components/jugadores/RankingComoFuncionaPage.tsx` | 149, 181, 467 | `"Ranking Riviera Open"`, footer |
| `src/components/AmericanoDinamico/PlayerRegistration.tsx` | 65, 71 | `"Registro Riviera Open"` |
| `src/components/home/HomeDashboard.tsx` | 60, 181, 201 | `"Riviera Open"` en copy |
| `src/components/public/PublicRivieraCelebrateBrand.tsx` | 52 | `"Vive Riviera Open"` |
| `src/components/torneo-express/public/PublicGrupoLeaderCelebrate.tsx` | 86 | `"Vive Riviera Open"` |
| `src/components/duelo-2v2/Duelo2v2CelebrateSection.tsx` | 110-118, 204 | Múltiples `"Riviera Open"` |
| `src/components/legal/AppSiteFooter.tsx` | 41 | `"Riviera Open · Organiza..."` |

### Aceptables como identidad madre (ecosistema, no club tenant)

| Archivo | Notas |
|---------|-------|
| `src/club-experience/motherBrand.ts` | Constantes del ecosistema |
| `src/components/legal/PrivacidadTerminosPage.tsx` | Legal del responsable Riviera Open |
| `supabase/functions/_shared/emailTemplates.ts` | Emails del producto madre |
| `src/club-experience/manifests/hack-padel.ts` | Config del club Hack (datos, no lógica) |

### Condicionales por nombre de club

**No encontrados** del tipo `if (nombre === 'Hack')`. Sí hay condicionales por **UUID** en bindings (`organizadorClubIndex.ts`, `club-theme-early.js` `ORG_BRAND`).

---

## 3. Flujo de logout — qué se limpia y qué no

**Entrada:** `UserContext.signOut()` → `src/contexts/UserContext.tsx` L169-181

| Acción | ¿Se hace? |
|--------|-----------|
| `setUser(null)`, `setSession(null)` | ✅ |
| `supabase.auth.signOut()` | ✅ |
| `resetClubExperienceTheme()` | ✅ |
| → `clearClubExperienceCache()` (`ro_club_experience_v1`) | ✅ |
| → `clearClubExperienceTheme()` (CSS vars) | ✅ |
| → `applyClubKeyToDocument(riviera-default)` | ✅ |
| `organizerNameCache.clear()` | ❌ **No** |
| `data-brand` / `data-club` en `<html>` | Parcial — se pone riviera-default, no se elimina atributo |
| Favicon restaurado a default | ❌ No explícito en reset |
| `club-theme-early.js` tokens (`--ro-accent`, etc.) | ❌ early.js puede haber seteado props que `clearClubExperienceTheme` no lista |
| Admin logout (`AdminContext.logoutAdmin`) | ❌ No llama `resetClubExperienceTheme` |

**Contaminación probable:** usuario A (Hack) → logout → usuario B (Riviera) en **misma pestaña sin hard refresh**:

1. `ro_club_experience_v1` se borra ✅
2. Pero `club-theme-early.js` **ya corrió** al cargar la página con tema Hack
3. `organizerNameCache` puede seguir con nombres del org anterior ❌
4. `ClubExperienceProvider` reaplica tema en `useLayoutEffect` — debería corregir, pero hay ventana de render

---

## 4. Cuándo se aplica el branding en el ciclo de vida

```
index.html
  └─ club-theme-early.js          ← ANTES de cualquier CSS/React (sync)
       └─ club-theme-early.css
            └─ brand-tokens / index.css (:root Riviera)
                 └─ index.tsx
                      └─ bootstrapClubExperienceTheme()  ← ANTES createRoot (sync)
                           └─ createRoot().render(App)
                                └─ ClubExperienceProvider
                                     └─ useLayoutEffect → applyClubExperienceForOrganizador
                                          └─ useOrganizerDisplayName useEffect → RPC async
```

**Evidencia:**

```8:8:src/index.tsx
bootstrapClubExperienceTheme();
```

```62:78:src/club-experience/ClubExperienceContext.tsx
  useLayoutEffect(() => {
    if (isAdminLoggedIn) {
      resetClubExperienceTheme();
      return;
    }
    // ...
    applyClubExperienceForOrganizador(organizadorId);
  }, [...]);
```

**React monta sin gate async** — no hay splash neutro ni `await` antes de `render()`.

---

## 5. Causa más probable del flash (Riviera → Hack o viceversa)

### Hipótesis ordenadas por probabilidad

1. **Caché `ro_club_experience_v1` del club anterior** leída por `club-theme-early.js` o `resolveBootstrapOrganizadorId()` antes de que React aplique el org de la nueva sesión.

2. **`club-theme-early.js` duplicado/desincronizado** con `organizadorClubIndex.ts` — solo tiene Hack en `ORG_BRAND`; otros clubes premium futuros no tendrán early theme.

3. **RPC `get_organizador_display_name` falla** → primer paint con "Riviera Open" → luego nombre correcto (flash de **texto**, no solo color).

4. **`:root` en `index.css`** siempre pinta tokens Riviera; club premium sobrescribe después en `useLayoutEffect`.

5. **`userLoading` + `bootstrapOrganizadorId`**: mientras carga sesión, se aplica tema del bootstrap (sesión cacheada o URL) que puede no ser el usuario final.

```68:70:src/club-experience/ClubExperienceContext.tsx
    if (userLoading && !user?.id && bootstrapOrganizadorId) {
      applyClubExperienceForOrganizador(bootstrapOrganizadorId);
```

---

## 6. Causa más probable de contaminación entre tenants tras logout/login

1. **`organizerNameCache` (Map en memoria)** — nunca se invalida en logout. Usuario B puede ver nombre de club de usuario A si comparten UI que lee caché por error de ID.

2. **`ro_club_experience_v1`** — si logout falla o usuario cierra pestaña antes de `resetClubExperienceTheme`, la caché persiste para el próximo visitante en el mismo browser (menos común en app con login).

3. **Early script + SPA sin reload** — variables CSS de Hack (`--ro-accent`, etc. en early.js L112-113) no están en la lista de `clearClubExperienceTheme()`.

4. **Solo un club en bindings** — lógica probada para Hack; Riviera/Padelito usan default hasta que React + RPC resuelvan, generando mezcla visual temporal.

---

## 7. Log `TEMP_MULTICLUB_ROMC_2_2_B` en bucle

| Archivo | Función | Cuándo loguea |
|---------|---------|---------------|
| `src/lib/rivieraJugadores/rivieraOfficialActivity.ts` | `logRomcPhase22B` | Cada `fetchOfficialDisplayPuntosForJugador`, `loadRomcOfficialPlayerView`, etc. |
| `src/lib/rivieraJugadores/rivieraOfficialLedger.ts` | Similar prefix `ROMC_2_2` | Escritura ledger |

**No es branding** — es telemetría temporal de ROMC/multiclub. El bucle ocurre cuando:

- `enrichJugadoresWithOfficialPuntos` llama RPC **por cada jugador** en lista (N llamadas → N logs)
- `loadRomcOfficialPlayerView` en fichas con re-renders

**Corrección Fase 3:** eliminar o guardar logs tras `import.meta.env.DEV`; no silenciar sin reducir llamadas redundantes.

---

## 8. Arquitectura actual vs objetivo (Fase 2)

| Hoy | Objetivo (documento prompts) |
|-----|------------------------------|
| `ClubExperienceContext` + bootstrap | `BrandingService` (TS plano) + `TenantBrandProvider` |
| Bindings estáticos en código | Resolver desde Supabase |
| `get_organizador_display_name` RPC | Parte de BrandingService |
| Render sin gate | Splash neutro → await branding → render |
| 3 lugares aplican CSS (early.js, bootstrap, provider) | Un solo aplicador |
| `organizerNameCache` sin limpiar | `clearTenantBranding()` integral |

---

## 9. Checklist antes de Fase 2

- [ ] Ejecutar `supabase/organizer-display-name.sql` en producción
- [ ] Confirmar RPC 200 en DevTools Network
- [ ] Revisar este documento vs comportamiento en pantalla
- [ ] Crear rama `fase-2-tenant-brand-provider`

---

## 10. Archivos clave (referencia rápida)

```
public/club-theme-early.js
public/club-theme-early.css
public/index.html
src/index.tsx
src/club-experience/
  ClubExperienceContext.tsx
  clubExperienceBootstrap.ts
  applyClubExperienceTheme.ts
  organizadorClubIndex.ts
  manifestResolver.ts
  manifests/
src/lib/organizer/organizerDisplayName.ts
src/club-experience/useOrganizerDisplayName.ts
src/contexts/UserContext.tsx
src/contexts/ThemeContext.tsx
supabase/organizer-display-name.sql
```

---

**Fin Fase 1 — Auditoría.**  
Siguiente paso: resolver RPC 404 en Supabase (si aplica) → Fase 2 `TenantBrandProvider` + `BrandingService`.
