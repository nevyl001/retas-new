# RIVIERA 2.1.3B — Riviera ID visible — Checklist

**Componente:** `src/components/jugadores/RivieraIdBadge.tsx`  
**Enriquecimiento:** `src/lib/rivieraJugadores/rivieraIdDisplay.ts`  
**Prerrequisitos:** Jugadores con `riviera_id` asignado en `riviera_official_player_identity` (via ensure/backfill)

---

## Alcance

| Incluido | Excluido |
|----------|----------|
| Badge reutilizable + copiar al portapapeles | SQL / RPCs nuevos |
| Enriquecimiento en `rivieraJugadoresService` | Cambios membership / career / ROMC |
| Registro, ficha privada, ficha pública, ranking | Passport Riviera (futuro) |

---

## Fase 1 — Auditoría (resumen)

| Consulta / RPC | Servicio | Tipo | `riviera_id` |
|----------------|----------|------|--------------|
| `riviera_jugadores` + `JUGADOR_SELECT_BASE` | `rivieraJugadoresService` | `RivieraJugador` | **Ausente** (no está en la tabla) |
| `listRivieraJugadores`, `getRivieraJugadorBySlug` | `rivieraJugadoresService` | `RivieraJugadorWithStats` | **Enriquecido** post-query |
| `getRivieraJugadorPublicBySlug/ById` | `rivieraJugadoresService` | `RivieraJugadorWithStats` | **Enriquecido** post-query |
| `listInternalClubJugadoresRanking` | `rivieraJugadoresService` | `RivieraJugadorWithStats[]` | **Enriquecido** post-query |
| `listOfficialSiteJugadoresRanking*` | `rivieraJugadoresService` | `RivieraJugadorWithStats[]` | **Enriquecido** post-query |
| `riviera_official_player_identity` (canonical) | `rivieraIdDisplay` | Map | Lectura best-effort |
| `riviera_official_player_profile_link` + embed | `rivieraIdDisplay` | Map | Lectura best-effort |
| `list_organizer_memberships` (2.1.2) | `playerMembership` → `rivieraIdDisplay` | Map | **Presente** (SECURITY DEFINER) |

---

## Flujo manual

### U1 — Registro de jugadores
- [ ] Tarjeta muestra `🆔 RIV-00000001` bajo el nombre (si existe)
- [ ] Sin ID → no aparece nada (ni “N/A” ni “Pendiente”)
- [ ] Click copia + toast «Riviera ID copiado»

### U2 — Ficha privada (`/jugadores/.../ficha`)
- [ ] Badge visible junto al nombre
- [ ] Click copia sin navegar

### U3 — Ficha pública (`/public/jugadores/...`)
- [ ] Badge en hero (v1 y v2)
- [ ] Click copia

### U4 — Ranking interno club
- [ ] Podio top 3 y lista #4+ muestran badge cuando aplica

### U5 — Jugador concedido / membership
- [ ] Clon local hereda `riviera_id` del source vía `list_organizer_memberships`

### U6 — Legacy sin identidad
- [ ] Sin badge (componente oculto)

### U7 — Regresión
- [ ] Retas, torneos, liga, duelo, rating sin cambios de lógica

---

## Tests automáticos

```bash
npm test -- rivieraIdDisplay --watchAll=false
npm test -- playerMembership --watchAll=false
```

---

## Archivos entregados

| Archivo | Acción |
|---------|--------|
| `src/lib/rivieraJugadores/rivieraIdDisplay.ts` | Creado |
| `src/lib/rivieraJugadores/rivieraIdDisplay.test.ts` | Creado |
| `src/lib/rivieraJugadores/types.ts` | `riviera_id?` |
| `src/lib/rivieraJugadores/rivieraJugadoresService.ts` | Enriquecimiento central |
| `src/components/jugadores/RivieraIdBadge.tsx` | Creado |
| `src/components/jugadores/JugadoresLista.tsx` | Badge en tarjetas |
| `src/components/jugadores/JugadorFicha.tsx` | Badge ficha privada |
| `src/components/jugadores/JugadorPublicFicha.tsx` | Badge ficha pública |
| `src/components/jugadores/JugadoresPublicRanking.tsx` | Badge ranking lista |
| `src/components/jugadores/RankingPodio.tsx` | Badge podio |
| `src/components/jugadores/riviera-jugadores.css` | Estilos badge |
| `src/components/jugadores/riviera-jugadores-public-*.css` | Ajustes layout |
| `docs/RIVIERA-PLAYER-MEMBERSHIP-2.1.3B-CHECKLIST.md` | Este doc |

---

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| RLS admin-only en `riviera_official_player_identity` | Fallback `list_organizer_memberships`; lectura directa best-effort |
| 0 jugadores con `riviera_id` en prod | Badge oculto hasta backfill/ensure |
| Vistas anon sin sesión | Misma lectura best-effort; puede requerir policy read futura |
