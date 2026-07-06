# AppRiviera — Player Identity Architecture (Regla permanente)

**Estado:** CONGELADA — hardening cerrado.

No es una sugerencia. Es una regla del proyecto.

Si una implementación futura rompe cualquiera de estas reglas, debe considerarse un **bug crítico**.

Antes de modificar cualquier archivo relacionado con jugadores, ranking, historial, puntos o perfiles públicos, **revisa este documento**. Si el cambio rompe alguna regla, detente y propón una alternativa en lugar de implementar un parche.

---

## Contexto

AppRiviera es una plataforma multi-club.

Los clubes **no** son dueños del jugador.

El jugador tiene una identidad deportiva única llamada **Riviera ID**. Toda su carrera pertenece al Riviera ID. Los clubes solamente representan **contexto**.

Por lo tanto: un jugador puede existir en 2, 5, 20 o 100 clubes y la aplicación debe seguir funcionando exactamente igual.

---

## Regla #1 — Identidad primero

**Nunca** resolver primero por club. **Siempre** resolver primero por identidad.

Flujo obligatorio:

```
URL
  ↓
slug / UUID / Riviera ID
  ↓
resolve_public_player_identity()   [SQL, anon]
  ↓
PlayerIdentityService              [TS]
  ↓
official_player_key
  ↓
linkedJugadorIds
  ↓
Carrera global
  ↓
Historial global
  ↓
Puntos globales
  ↓
Rating global
  ↓
Contexto local (branding + ranking)
```

**Jamás invertir ese flujo.**

---

## Regla #2 — El jugador pertenece a Riviera

Puede cambiar por org:

- branding
- ranking local
- puntos locales (vista por club)

**No** puede cambiar:

- historial
- rating
- movimientos
- carrera
- total global

---

## Regla #3 — Una sola fuente de verdad

Todas las pantallas deben consumir **`PlayerIdentityService`**.

Ningún componente puede reconstruir identidad. Queda **prohibido**.

---

## Servicios oficiales

Únicamente estos resuelven identidad:

| Servicio | Ubicación |
|----------|-----------|
| `resolve_public_player_identity()` | `supabase/riviera-player-identity-public-read.sql` |
| `PlayerIdentityService` | `src/lib/rivieraJugadores/playerIdentityService.ts` |
| `getPublicPlayerProfileData()` | Re-export del motor (`getPublicPlayerProfileData.ts`) |

Todo lo demás **consume** estos servicios. Nunca crear otro algoritmo paralelo.

---

## Prohibido

Nunca:

- buscar jugador por `organizador_id` como primer paso
- buscar jugador por slug del club antes de identidad global
- buscar jugador interno primero (`org-first`)
- resolver identidad desde grants como fuente primaria
- resolver identidad desde `profile_link` como fuente primaria
- recalcular `linkedJugadorIds` fuera del motor
- recalcular carrera fuera del motor
- recalcular historial fuera del motor
- recalcular puntos fuera del motor
- usar `stats.puntos_totales` como total global si existe `careerPuntosByClub`
- usar ranking interno como fuente de verdad global
- filtrar historial por org en ficha pública
- crear otro `PlayerIdentityService`
- duplicar `resolveLinkedJugadorIds`, `careerPointsByClub`, `getPublicPlayerProfileData`

Si necesitas identidad: **`resolvePlayerIdentity()`** y consume el resultado.

---

## Historial

Siempre **global**. Idéntico sin importar Club Test, Hackpadel, Riviera Open o cualquier club futuro.

Nunca filtrar historial por org en ficha pública (`historialMain === historialGlobal`).

---

## Puntos

Siempre calcular desde la **carrera global deduplicada** (`dedupeParticipacionesById`).

Agrupar por `organizador_id`. Mostrar: total global, club actual, otros clubes.

Nunca usar puntos locales como total global.

---

## Ranking

El ranking **sí** depende del club (posición, puntos locales). Eso es correcto.

Nunca debe alterar: historial, rating, movimientos, total global.

---

## Mobile

Toda modificación visual debe respetar:

- no duplicar Riviera ID
- no crear cards gigantes
- no esconder historial
- no romper desktop

---

## Tests obligatorios

Antes de cualquier PR:

```bash
npm run verify:public-player
```

Debe pasar: lint, typecheck, tests, build.

Además validar manualmente o con scripts:

- Sebastian (puntos multi-club)
- Terry (cross-org)
- David R (sin regresión)
- Jugador demo multi-club

Si alguno falla: **no hacer merge**.

Scripts de evidencia: `scripts/validate-hardening-evidence.mjs`, `npm run e2e:public-player-profile`.

---

## Debug

Investigación debe comenzar en:

**`/admin/dev/player-debug`**

(`debugPlayerIdentity` — mismo motor que ficha pública.)

No agregar logs dispersos por la aplicación.

---

## Nuevas funcionalidades

Si una feature necesita saber quién es un jugador, **no** consultar directamente:

- `riviera_jugadores`
- clubes
- grants
- `profile_link`
- participaciones

Debe hacer:

```ts
resolvePlayerIdentity(input, viewingOrganizadorId)
```

y consumir el resultado.

---

## Reglas de desarrollo

Antes de escribir código:

1. Buscar si `PlayerIdentityService` ya resuelve el problema.
2. Si existe una función equivalente: **reutilizarla**.
3. No copiar lógica.
4. No crear variantes.
5. No agregar otro algoritmo.

---

## Si encuentras un bug

**No** crear un parche en el componente.

Primero responder: **¿Está rompiendo la arquitectura?**

Si sí → corregir el **motor**, no el componente.

---

## Checklist antes de cerrar cualquier cambio

- [ ] El jugador sigue resolviendo por Riviera ID
- [ ] El historial es igual en todas las orgs
- [ ] El rating es igual
- [ ] El total global es igual
- [ ] El ranking local cambia correctamente
- [ ] No existen duplicados en carrera/puntos
- [ ] `npm run verify:public-player` pasa
- [ ] Player Debug muestra la identidad correctamente

---

## Regla final

> El jugador no pertenece al club.  
> La carrera deportiva pertenece al Riviera ID.  
> Los clubes solamente representan contexto.

---

## Referencias en código

| Artefacto | Ruta |
|-----------|------|
| Motor TS | `src/lib/rivieraJugadores/playerIdentityService.ts` |
| Entrada ficha pública | `src/lib/rivieraJugadores/getPublicPlayerProfileData.ts` |
| RPC identidad | `supabase/riviera-player-identity-public-read.sql` |
| Puntos carrera | `src/lib/rivieraJugadores/careerPointsByClub.ts` |
| Fallback rating público | `PUBLIC_ORGANIZER_RPC_FALLBACK` en `publicOrganizador.ts` |
| Plan de migración (histórico) | `docs/PLAYER-IDENTITY-HARDENING-PLAN.md` |
| Issue Terry cross-org | `docs/issues/ISSUE-cross-org-public-player-by-riviera-id.md` |
