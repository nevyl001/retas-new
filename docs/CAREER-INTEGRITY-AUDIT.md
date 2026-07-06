# Career Integrity Audit

Auditoría permanente de identidad, carrera, puntos y ranking en AppRiviera.

---

## Comandos

| Comando | Cuándo |
|---------|--------|
| `npm run audit:career-integrity` | Diagnóstico local + Supabase (si hay `.env`) |
| `npm run audit:career-integrity -- --offline` | Solo checks de código (CI sin DB) |
| `npm run audit:career-integrity -- --fix` | Repara links huérfanos HIGH vía RPC + indica SQL de metadata |
| `npm run verify:career-integrity` | **Obligatorio pre-deploy** |

`verify:career-integrity` ejecuta:

1. `test:career-pipeline`
2. `test:player-points`
3. `test:career-integrity`
4. `audit:career-integrity --offline`
5. `verify:public-player`

---

## SQL en producción

Orden recomendado:

1. `supabase/diagnose-career-event-host-organizer.sql`
2. `supabase/repair-career-event-host-organizer.sql` (si hay MAL)
3. `supabase/diagnose-orphan-career-profiles.sql`
4. `supabase/repair-orphan-career-profile-links.sql` (solo HIGH)
5. Re-ejecutar diagnósticos → todo OK

---

## Qué valida la auditoría

### Offline (siempre)

- `RankingPtsDisplay` y `JugadorPuntosBreakdown` usan `buildJugadorPuntosBreakdown`
- `playerIdentityService` usa `resolvePlayerPointsBreakdown`
- `resolveJugadorIdForParticipacion` llama `ensureOfficialProfileLinkForParticipacion`
- `finalizeCareerEvent` previene huérfanos
- Scripts SQL de diagnose/repair existen

### Online (con `.env`)

- Perfiles huérfanos HIGH con puntos
- Participaciones con puntos sin `metadata.organizador_id`
- Duplicados en `riviera_official_player_profile_link`
- Carrera fusionada para jugadores objetivo (Daniel N, Sebastian, TestplayerCT1, TestplaCT2, Nevyl)
- Totales HackPadel vs expectativa

### Modo `--fix`

**Permitido:**

- `riviera_repair_orphan_profile_links_high()` (solo HIGH)
- Indicación de ejecutar `repair-career-event-host-organizer.sql` para metadata

**Prohibido:**

- Sumar puntos
- Duplicar participaciones
- Borrar datos
- Cambiar Riviera ID
- Tocar rating

---

## Perfiles huérfanos

### Definición

`riviera_jugadores` con:

- `jugador_participaciones` con `puntos_obtenidos > 0`
- **Sin** fila en `riviera_official_player_profile_link`
- **Fuera** de `get_public_career_jugador_ids` del candidato oficial

### Confianza del match

| Nivel | Criterio |
|-------|----------|
| **HIGH** | Nombre normalizado único + evidencia (grant, legacy, club host, cross-club) |
| **REVIEW** | Múltiples candidatos oficiales con mismo nombre |
| **LOW** | Sin candidato con Riviera ID |

Solo HIGH se repara automáticamente.

### Casos reales (post-repair esperado)

| Jugador | HackPadel | Notas |
|---------|-----------|-------|
| Daniel N | 75 pts | Huérfano HackPadel → link a RIV-00000009 |
| Sebastian | 25 pts | Huérfano HackPadel → link a RIV-00000024 |
| TestplayerCT1 | 50 pts | Ya enlazado |
| TestplaCT2 | 50 pts | Ya enlazado |
| Nevyl | 50+ pts | Separar HackPadel / Riviera Open; duelo huérfano aparte |

---

## Reglas estrictas de auto-link (congelación)

| Confidence | Auto-link | Acción app |
|------------|-----------|------------|
| **OK** | N/A (ya enlazado) | Continúa |
| **HIGH** | Sí, solo con evidencia **fuerte** | `grant_*`, `same_legacy`, `host_club_overlap` |
| **REVIEW** | **No** | `CareerIntegrityException` + log estructurado |
| **LOW** | **No** | `CareerIntegrityException` + log estructurado |

`cross_club_profile` **solo** → siempre **REVIEW**, nunca HIGH.

### Guard pre-participación

```
resolveJugadorIdForParticipacion:
  ensureRivieraIdentity()
  requireOfficialProfileLinkForParticipacion()  → lanza si no OK/HIGH-link
  return finalId   // solo si enlazado
```

### Guard pre-cierre (pipeline)

`validateCareerEventPreClose` antes de sync:

1. Evento padre existe en DB
2. Cada participante resuelto tiene `profile_link` + `official_player_key` + `riviera_id`

Si falla → **no sync**, **no puntos**, **no rating**.

### SQL canónico

Ejecutar en prod: `supabase/career-profile-link-integrity.sql`

### Auditoría diaria

```bash
npm run audit:event-parent-integrity
```


```
jugador_participaciones
  → mergeCareerParticipacionesForIdentity()   [requiere profile_link]
  → computeCareerPointsByClubFromParticipaciones()
  → resolvePlayerPointsBreakdown()
  → attachCareerPuntosToJugador()
  → RankingPtsDisplay / JugadorPublicFicha
```

Si el grafo de links está incompleto, la pérdida ocurre en **merge**, no en UI.

---

## Regla de desarrollo

Cualquier cambio en jugadores, ranking, puntos, participaciones, rating, retas, duelos, torneos, ligas o americanos debe pasar:

```bash
npm run verify:career-integrity
```

Ver también `.cursor/rules/career-integrity.mdc`.
