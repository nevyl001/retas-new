# Participaciones huérfanas (`metadata.organizador_id`)

Documento de incidente y prevención. **Solo lectura / documentación** — no es un script de migración.

## Estado

| Incidente | Estado |
|-----------|--------|
| Test interclubes (3 participaciones + 3 ledger) | **CERRADO** — eliminados; backups `…_orphan_backup_20260713_160744` |
| Marco M / Reta 5ta Fuerza | **CERRADO** — `metadata.organizador_id = e724de97-3552-4a01-a269-f621e6f1ed26` |
| Deuda histórica 30 huérfanas (padre ausente, sin ledger) | **CERRADO** — eliminadas 2026-07-13 (COMMIT) |

Síntoma original: warning en consola (dev) `[riviera-jugadores] participación huérfana…`  
Criterio app: `participacionesOrganizadorScope.ts` → `metadata.organizador_id` vacío ⇒ excluida de atribución por club.

## Causa raíz

1. Participaciones sin `metadata.organizador_id`.
2. Eventos de prueba borrados dejaron filas huérfanas (+ a veces ledger).
3. Borrar solo por “huérfana + padre ausente” **no es seguro** si hay ledger o historial real (caso Marco).
4. Las **30** restantes: padre inexistente **y** sin ledger → **no hay fuente confiable** para reconstruir organizador; se aprobó eliminarlas (desaparecen del historial del jugador).

## Qué se reparó (Marco)

| Campo | Valor |
|-------|--------|
| `participacion_id` | `c46767cf-74fd-4e03-9e39-5c5773319f20` |
| Evento | Reta 5ta Fuerza |
| Acción | `jsonb_set` solo `metadata.organizador_id` |
| Valor | `e724de97-3552-4a01-a269-f621e6f1ed26` |
| Script | `repair-marco-reta-5ta-fuerza-organizador.sql` |

## Qué se eliminó — Test interclubes (cerrado)

| Orden | Tabla | Filas |
|-------|--------|------|
| 1 | `riviera_official_points_ledger` | 3 |
| 2 | `jugador_participaciones` | 3 |

Backups:

- `jugador_participaciones_orphan_backup_20260713_160744`
- `riviera_official_points_ledger_orphan_backup_20260713_160744`

Script de delete aplicado: `delete-test-interclubes-from-backup-20260713.sql`.

## Deuda histórica 30 (padre ausente, sin ledger) — **CERRADO**

Criterio **AND** aplicado:

1. `metadata.organizador_id` ausente  
2. Evento padre inexistente  
3. Sin fila en `riviera_official_points_ledger`  
4. Excluye a Marco  

**Por qué desaparecieron del historial:** sin padre ni ledger no había organizador reconstruible; producto aceptó la pérdida.

| Paso | Resultado |
|------|-----------|
| Backup | `jugador_participaciones_historical_orphan_backup_20260713_16253` (30 filas) |
| Delete | `COMMIT` 2026-07-13 — 30 filas en `jugador_participaciones`; dry-run previo con `ROLLBACK` OK |
| Evidencia post-COMMIT | `backup_rows = 30`, `backup_ids_aun_en_vivo = 0`, `orphan_total_restante = 0`, `marco_sigue_existiendo = 1`, `marco_organizador_id = e724de97-3552-4a01-a269-f621e6f1ed26`, `deleted_rows = 30` |

**Nombre final del backup (completo, tal como existe en Postgres):**

`jugador_participaciones_historical_orphan_backup_20260713_16253`

Nota: el sufijo de timestamp quedó en 63 caracteres (límite de identificadores de Postgres); el nombre generado con segundos completos tenía 64 y se truncó al crear la tabla. Ese nombre truncado es el nombre real de la relación.

Scripts:

| Paso | Archivo |
|------|---------|
| 1 Backup | `backup-historical-orphans-no-parent-no-ledger-20260713.sql` |
| 2 Delete | `delete-historical-orphans-no-parent-no-ledger-20260713.sql` |
| 3 Verify | `verify-historical-orphans-deleted-20260713.sql` (solo lectura; usar el nombre de backup de arriba) |

## Cómo evitar que vuelva a ocurrir

1. Al crear participaciones: escribir siempre `metadata.organizador_id`.  
2. Al borrar eventos: reatribuir o borrar participaciones/ledger en el mismo flujo.  
3. Nunca borrar a ciegas por “huérfana”; separar: con ledger / padre vivo → backfill; sin padre ni ledger → lista explícita + backup + delete aprobado.  
4. El warning en `participacionesOrganizadorScope.ts` debe permanecer.

## Scripts relacionados

| Archivo | Uso |
|---------|-----|
| `diagnose-orphan-participaciones-restantes.sql` | Clasificación AUTO/MANUAL |
| `docs/PARTICIPACIONES-HUERFANAS-RESTANTES-PLAN.md` | Plan previo (backfill vs delete) |
| `audit-cierre-huerfanas-20260713.sql` | Cierre Test interclubes + Marco |
| `cleanup-participaciones-organizador-huerfanas.sql` | Obsoleto |
