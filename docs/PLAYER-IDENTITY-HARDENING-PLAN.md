# Player Identity Hardening — Mapa y plan de migración

**Estado:** Fase A cerrada. Arquitectura congelada en **[ARCHITECTURE-PLAYER-IDENTITY.md](./ARCHITECTURE-PLAYER-IDENTITY.md)**.

**Regla:** El jugador no pertenece al club. Tiene carrera global por Riviera ID. El club solo es contexto.

## 1. Funciones duplicadas (antes)

| Responsabilidad | Ubicaciones duplicadas |
|-----------------|------------------------|
| Resolver linked IDs | `discoverLinkedJugadorIds`, `resolveLinkedJugadorIds` (grant short-circuit), `attachCareerPuntosToJugador` merge |
| Carrera + dedupe + puntos | `attachCareerPuntosToJugador`, `getCareerPointsByClub`, `enrichJugadoresOrganizerScopedStats` |
| Riviera ID | `rivieraIdDisplay.ts` (4 estrategias), `careerIdentity.ts` |
| Carga ficha pública | `getPublicPlayerProfileData.ts` org-first L91–104 |
| Slug/id público | `getRivieraJugadorPublicBySlug`, `getRivieraJugadorInternalClubById` |
| Siblings multiclub | `organizerPlayerAccess.listMulticlubSiblingProfilesForSource`, `listSiblingJugadorIdsViaProfileLink` |
| Ranking ficha | `publicFichaRanking.ts` + `resolveRankingPosicionForPublicFicha` |

## 2. Resolución org-first incorrecta

| Archivo | Líneas | Problema |
|---------|--------|----------|
| `getPublicPlayerProfileData.ts` | 91–104 | `internalClubById(org, uuid)` antes de carrera → Terry cross-org null |
| `getRivieraJugadorPublicBySlug` | 2023–2027 | Con `?org=`, solo slug interno del club |
| `resolveLinkedJugadorIds` | 338–349 | Rama grant omite career RPC → linkedIds distintos por org |
| `get_public_career_jugador_ids` SQL | 50–57 | Gate `visible_publico` excluye carreras sin perfil público |
| `get_public_riviera_id_for_jugador` SQL | — | Gate `visible_publico` en input row |
| Historial split | `getPublicPlayerProfileData` 128–138 | Filtra historial por org (violaba TAREA 5) |

## 3. Plan de migración mínima

### Fase A — Motor único (este PR)

1. **`playerIdentityService.ts`** — única fuente de verdad
2. **`resolve_public_player_identity` RPC** — identidad cross-org anon (SQL nuevo, deploy separado)
3. **`getPublicPlayerProfileData`** → delega al motor
4. **`resolveLinkedJugadorIds`** → delega al motor (sin grant short-circuit)
5. Historial global sin filtro por org en ficha pública
6. Tests + `verify:public-player` + `/admin/dev/player-debug`

### Fase B — Limpieza (follow-up)

- Ranking rows: `enrichJugadoresOrganizerScopedStats` consume `resolvePlayerPoints`
- Admin `loadOrganizerScopedPlayerView` alinea con motor
- Deprecar exports duplicados en `grantedPlayerUnifiedView`

### Flujo obligatorio (implementado)

```
URL slug / UUID / Riviera ID
  → resolvePlayerIdentity()
  → official_player_key + linkedJugadorIds
  → resolvePlayerCareer() [dedupe]
  → resolvePlayerPoints()
  → resolvePlayerHistory()
  → resolvePlayerLocalContext(org) [branding + ranking local]
```

## 4. Guardrails

- `GUARD: No usar stats.puntos_totales local si existe careerPuntosByClub` — `jugadorPuntosBreakdown.ts`
- `GUARD: Historial público = carrera global deduplicada` — `playerIdentityService.ts`
- `GUARD: Totales con dedupeParticipacionesById` — `attachCareerPuntosToJugador`
- `GUARD: UUID local no bloqueado por org` — `resolvePlayerIdentity` home-org fallback
