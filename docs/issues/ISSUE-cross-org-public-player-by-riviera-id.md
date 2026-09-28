# Issue: Resolver jugador público cross-org por UUID local usando Riviera ID/career linkage

**Estado:** Abierto (backlog)  
**Relacionado:** Cierre puntos multi-club (dedupe `attachCareerPuntosToJugador`) — **fuera de alcance de este issue**  
**Repo:** `nevyl001/retas-new`

---

## Problema

Un jugador con **UUID local de un club** (p. ej. perfil en Club Test) no puede abrirse desde la ficha pública con `?org=` de **otro club**, aunque tenga **Riviera ID** y carrera deportiva enlazada.

### Caso reproducible: Terry

| Campo | Valor |
|-------|--------|
| Nombre | Terry |
| Riviera ID | `RIV-00000086` |
| UUID local Club Test | `6eaf0141-f09e-41ce-b06d-7aae7d925d63` |
| UUID local Riviera Open | `7dcb1728-8e67-4a24-8899-5803acc86d69` (no resuelve público cross-org) |

**Funciona:**

```
/public/jugadores/6eaf0141-f09e-41ce-b06d-7aae7d925d63?org=cd45cea7-a8ac-4596-b0ee-24959b4cbb5d
→ 345 pts, ranking #15, historial visible
```

**Falla (jugador no encontrado / ficha vacía):**

```
/public/jugadores/6eaf0141-f09e-41ce-b06d-7aae7d925d63?org=e724de97-3552-4a01-a269-f621e6f1ed26   (Hackpadel)
/public/jugadores/6eaf0141-f09e-41ce-b06d-7aae7d925d63?org=2770b522-9064-4c7b-a729-4a0ea7e3f6e8   (Riviera Open)
```

### Lectura anon actual (evidencia)

Para `6eaf0141…` con cliente anon:

- `get_public_riviera_id_for_jugador` → `null`
- `get_public_career_jugador_ids` → `[]`
- `riviera_list_career_participaciones_public` → `0` filas

El linkage existe en datos de admin, pero la **resolución pública cross-org por UUID local** no está cableada.

---

## Comportamiento esperado

1. Cualquier UUID local de un perfil con **Riviera ID / carrera pública** debe abrir ficha desde **cualquier `?org=`** válido (branding + ranking local del contexto).
2. La URL puede seguir usando el UUID pegado (local o canónico); el backend resuelve la identidad vía `official_player_key` / `profile_link` / career RPC.
3. **Historial y carrera global** deben ser los mismos independientemente del `?org=` (ya validado para Sebastian tras fix de dedupe).
4. **No cambiar reglas de puntos** ni el algoritmo de `careerPuntosByClub` — solo resolución de jugador / lectura pública.

---

## Fuera de alcance

- Recalcular o corregir totales multi-club (cerrado).
- Cambios en UI de desglose de puntos.
- Ranking interno por club.

---

## Áreas técnicas a revisar

| Área | Archivos / RPC |
|------|----------------|
| Carga ficha pública | `getPublicPlayerProfileData.ts`, `getRivieraJugadorInternalClubById`, `getRivieraJugadorPublicById` |
| Resolución cross-org | `resolveJugadorIdForOrganizer`, `findGrantedAccessMetaForJugador`, `fetchGrantedJugadorForInternalClub` |
| Career / identity público | `get_public_riviera_ids_for_jugadores`, `get_public_career_jugador_ids`, `riviera_official_player_profile_link`, `riviera_official_player_identity` |
| Gate `visible_publico` | SQL career público — puede excluir clones locales sin perfil público propio |

**Hipótesis:** `getPublicPlayerProfileData` asume que el UUID de la URL pertenece al club de `?org=` o al canónico visible; no hace fallback “UUID local → Riviera ID → perfil operativo para org anfitrión”.

---

## Criterios de aceptación

- [ ] Terry `6eaf0141…` abre desde Club Test, Hackpadel y Riviera Open con la **misma carrera/historial**.
- [ ] `get_public_riviera_id_for_jugador(6eaf0141…)` responde `RIV-00000086` para anon (o equivalente vía RPC desplegado).
- [ ] `get_public_career_jugador_ids` incluye perfiles enlazados de Terry cuando al menos un perfil de la carrera es público.
- [ ] Sebastian / David R sin regresión en los 3 contextos ya validados.
- [ ] Tests de resolución cross-org (unit o integración con mocks RPC).

---

## Crear en GitHub

```bash
gh auth login   # si aún no hay sesión
gh issue create --repo nevyl001/retas-new \
  --title "Resolver jugador público cross-org por UUID local usando Riviera ID/career linkage" \
  --body-file docs/issues/ISSUE-cross-org-public-player-by-riviera-id.md \
  --label "bug,public-profile,multiclub"
```

---

## Referencias

- Validación puntos multi-club: Sebastian `c7440f26` / `RIV-00000024` — 25+25=50 en todas las orgs.
- Evidencia Terry: capturas locales de QA (no versionadas; `scripts/capture-validation-screenshots.mjs` → `tmp/visual-qa/`).
- Script validación: `scripts/validate-career-totals-ui.mjs`
