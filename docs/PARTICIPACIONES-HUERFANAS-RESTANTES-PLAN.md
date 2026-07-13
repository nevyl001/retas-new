# Plan de reparación — huérfanas restantes (~30)

Tras el cierre del incidente **Test interclubes + Marco** (`orphan_total` ≈ 30).

**No borrar.** Solo backfill de `metadata.organizador_id` cuando haya fuente única y confiable.

Diagnóstico (solo lectura):

`supabase/diagnose-orphan-participaciones-restantes.sql`

---

## Clasificación por causa

| Bucket | Significado | Acción |
|--------|-------------|--------|
| **AUTO_PARENT** | Evento padre vivo y se puede resolver el club anfitrión (`tournaments.user_id` / `duelos_2v2.organizador_id` / `torneo_express.organizador_id` / liga). Si hay ledger, `source_organizer_id` coincide o no existe ledger. | Backfill automático seguro desde el padre |
| **AUTO_LEDGER** | Padre ausente o sin host resoluble, pero existe fila en `riviera_official_points_ledger` con `source_organizer_id` (mismo patrón que Marco). | Backfill desde ledger (fila a fila o lote con preview) |
| **MANUAL_CONFLICT_PARENT_VS_LEDGER** | Padre y ledger discrepan en el organizador. | Revisión humana; no auto |
| **MANUAL_EVENTO_ID_INVALID** | `evento_id` no es UUID. | Revisión / corrección de dato |
| **MANUAL_PARENT_MISSING_NO_SOURCE** | Padre borrado y sin ledger. | Revisión (override manual, o dejar excluida del ranking por club) |
| **MANUAL_REVIEW** | Resto. | Caso a caso |

Criterio de “huérfana” (igual que la app):

```text
NULLIF(trim(COALESCE(metadata->>'organizador_id','')), '') IS NULL
```

Host esperado (igual que `riviera_participacion_expected_host_org`):

| `tipo_evento` | Fuente |
|---------------|--------|
| `reta` / `americano` | `tournaments.user_id` |
| `duelo_2v2` | `duelos_2v2.organizador_id` |
| `torneo_express` | `torneo_express.organizador_id` |
| `liga` | `ligas.organizador_id` vía jornada o liga |

---

## Qué NO hacer

- No borrar estas ~30 filas “porque son huérfanas”.
- No atribuir al `organizador_id` del perfil home del jugador (eso fue el bug histórico que el warning evita).
- No mezclar con el incidente Test interclubes (ya cerrado).
- No tocar puntos, ledger, rating, career ni identidad en el repair — solo `metadata.organizador_id` (y opcionalmente `club_name` si ya hay helper de display).

---

## Plan de reparación seguro (orden)

### Fase 0 — Diagnóstico (ahora)

1. Ejecutar `diagnose-orphan-participaciones-restantes.sql`.
2. Anotar conteos por `repair_bucket` y revisar el detalle AUTO_* / MANUAL_*.
3. Confirmar que Marco **no** aparece (ya tiene `organizador_id`).

### Fase 1 — AUTO_PARENT (prioridad)

1. Script de **preview** (SELECT de `participacion_id` + `proposed_organizador_id`) — sin UPDATE.
2. Script de repair con `jsonb_set` / merge de metadata, **solo** IDs del preview:
   - `BEGIN`
   - BEFORE/AFTER o DIFF por lote
   - `ROLLBACK` en la 1ª corrida
   - `COMMIT` solo si el DIFF muestra únicamente `organizador_id` (y opcional `club_name`)
3. Referencia existente (más amplia, no sustituye el preview):  
   `repair-career-event-host-organizer.sql` y `multiclub-reassign-participaciones.sql` (este último hoy solo duelo/torneo_express; faltaría reta/americano/liga con cast seguro).

### Fase 2 — AUTO_LEDGER

1. Igual que Marco: fuente = `ledger.source_organizer_id`.
2. Lista explícita de `participacion_id` del bucket AUTO_LEDGER.
3. Un repair por lote o por fila, siempre con `ROLLBACK` primero.
4. Si una participación tiene **varios** ledger con `source_organizer_id` distintos → pasa a MANUAL.

### Fase 3 — MANUAL_*

Por cada fila:

1. ¿El evento debería existir? Restaurar/relink o documentar pérdida.
2. ¿Hay override en `career_event_host_manual_overrides`? Usar ese flujo.
3. Si no hay fuente: dejar huérfana (excluida de atribución por club) o decidir override aprobado por admin — **nunca adivinar**.

### Fase 4 — Verificación

1. `orphan_total` debe bajar tras cada fase (idealmente a 0 o solo MANUAL documentadas).
2. Re-correr el diagnose.
3. Smoke: abrir registro de jugadores / ficha y confirmar que el warning de consola ya no lista esas filas.

---

## Entregables siguientes (cuando apruebes)

Scripts **separados**, aún no escritos hasta ver el result set del diagnose:

1. `preview-backfill-orphan-from-parent.sql` (solo SELECT)
2. `repair-orphan-from-parent.sql` (`BEGIN` + `ROLLBACK` default)
3. `preview-backfill-orphan-from-ledger.sql`
4. `repair-orphan-from-ledger.sql` (`BEGIN` + `ROLLBACK` default)

Cada repair: solo metadata; abortar si intentaría tocar más filas de las del preview.

---

## Relación con el incidente cerrado

| Ítem | Estado |
|------|--------|
| Test interclubes (3+3) | Eliminado; backups `…_20260713_160744` |
| Marco / Reta 5ta Fuerza | Reparado (`e724de97-…`) |
| ~30 huérfanas restantes | **Diagnóstico + plan** (este documento); repair pendiente de aprobación |

Ver también: `docs/PARTICIPACIONES-ORGANIZADOR-HUERFANAS.md`.
