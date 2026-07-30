# Fase 3.5 — Saneamiento de datos (2026-07-29)

Análisis completo de los registros huérfanos detectados en la auditoría de
Fase 2 (RANK-002). Metodología: para cada categoría, se investigó el origen
real antes de decidir qué hacer — no se asumió que "huérfano" implica
"bug a reparar". Cero eliminaciones de datos reales en esta fase.

## Resultado

| Categoría | Cantidad | Clasificación | Acción tomada |
|---|---|---|---|
| `riviera_official_player_totals` desalineados del ledger | 4 | **Auto-reparable** | ✅ Reparado (`fix-fase35-ledger-totals-desalineados-20260729.sql`) |
| `jugador_participaciones` de Liga sin evento padre | 2 | **Falso positivo** | Ninguna — funcionan como se diseñó |
| `jugador_participaciones` de Reta sin evento padre | 25 | **Requiere decisión manual** | Ninguna — documentado abajo |
| `jugador_participaciones` de Duelo 2v2 sin evento padre | 10 | **Requiere decisión manual** (mixto) | Ninguna — documentado abajo |
| `rating_historial` de Reta sin partido válido | 60 | **Requiere decisión manual** | Ninguna — documentado abajo |
| `rating_historial` de Duelo 2v2 sin partido válido | 19 | **Requiere decisión manual** | Ninguna — documentado abajo |

## 1. Auto-reparado: totales de ledger desalineados

**Causa raíz determinada**: 4 jugadores tenían `points_total` por encima de
lo que su propio ledger sustenta (ej. total=40, suma real del ledger=20).
Consistente con el bug ya cerrado en Fase 1 (RANK-001): antes de ese fix,
`try_write_riviera_official_ledger()` usaba `ON CONFLICT DO NOTHING`, así
que una corrección de puntos hecha alguna vez por SQL directo sobre el
ledger (fuera del RPC) pudo haber dejado el total sin el ajuste
correspondiente.

**Por qué es seguro repararlo automáticamente**: `points_total` es un campo
*derivado* — una suma agregada simple de `riviera_official_points_ledger`,
sin problema de encadenamiento secuencial (a diferencia del rating). El
ledger en sí es la fuente autoritativa y no se tocó; solo se recalculó el
campo cacheado. Verificado con `ROLLBACK` antes de aplicar en serio.

**SQL**: `backup-fase35-ledger-totals-desalineados-20260729.sql` (snapshot
exacto de las 4 filas) → `fix-fase35-ledger-totals-desalineados-20260729.sql`
(aplicado) → `verify-fase35-ledger-totals-desalineados-20260729.sql`
(confirmado: 0 desalineados tras el fix) → `rollback-...sql` disponible.

## 2. Falso positivo: 2 participaciones de Liga

Ambas tienen `evento_nombre` = *"Ajuste manual (+30 pts): admin"* y
*"Ajuste manual (-30 pts): test"* — son registros de **ajuste manual de
puntos** (`metadata->>'subtipo' = 'ajuste_manual'`), una función legítima
del panel de administración. Por diseño, `try_write_riviera_official_ledger()`
excluye explícitamente estos registros del ledger
(`IF v_subtipo = 'ajuste_manual' THEN RETURN ... 'skipped'`) precisamente
porque **nunca tienen un evento real como padre** — el `evento_id` es un
valor sintético, no una referencia rota. No requieren ninguna acción.

Recomendación para el futuro: si se vuelve a auditar "participaciones sin
evento padre", excluir `metadata->>'subtipo' = 'ajuste_manual'` del
universo de búsqueda para evitar este falso positivo recurrente.

## 3. Requiere decisión manual: 25 participaciones de Reta

Los 25 registros corresponden a exactamente 3 torneos (`tournaments`)
históricos cuya fila padre ya no existe:

| `evento_id` | Nombre | Participaciones | Fecha | Notas |
|---|---|---|---|---|
| `99a9e83c-2fd5-4701-8602-7093235cbe8e` | Remontada Final | 12 | 2026-06-08/09 | Roster propio (7 jugadores), sin solapamiento con el otro evento del mismo nombre |
| `52d338ec-77a7-4b40-9714-8728db183974` | Remontada Final | 8 | 2026-06-08 | Roster propio (8 jugadores), **evento genuinamente distinto** del anterior — mismo nombre, no duplicado |
| `6f85c8d1-cd90-42cc-b551-5db92b35ad7f` | Hack Padel | 5 | 2026-06-04 | — |

**Ya investigado previamente por el equipo**: existe
`supabase/audit-remontada-final-duplicate-eventos.sql`, un script de
auditoría de solo lectura ya en el repo que investiga exactamente estos dos
`evento_id` de "Remontada Final". Se volvió a ejecutar en esta fase (sin
cambios) y confirma: **los rosters no se solapan en absoluto** — no son un
evento duplicado, son dos torneos reales distintos que coincidieron en
nombre. Ambas filas `tournaments` fueron eliminadas en algún momento antes
de que existiera el trigger `_block_hard_delete_event_with_career()`
(actualmente instalado, ver más abajo), que hoy **impediría** que esto
volviera a pasar.

**Por qué no se auto-repara**:
- Los nombres de jugadores involucrados (Nevyl, Marlon, Duran, Ferro,
  Devyl, Irving, Paco, Sebastian, Ricardo S, etc.) corresponden a cuentas
  que aparecen consistentemente en datos reales a lo largo de todo este
  proyecto — no son cuentas de prueba.
- Los puntos ya escritos en el ledger para varias de estas participaciones
  siguen contribuyendo al ranking oficial de esos jugadores. Revertirlos
  eliminaría puntos reales de personas reales sin saber si esa era la
  intención.
- No hay forma de determinar desde los datos si la eliminación de estos 3
  torneos fue una limpieza intencional (ej. torneos de prueba con nombres
  reales, o retas descartadas por error de captura) o un error operativo.
  Es una decisión de producto/negocio, no técnica.

**Estrategia de resolución recomendada** (elegir una, requiere tu decisión):
1. **Dejar como está** (recomendado si se confirma que la eliminación fue
   intencional): estos registros seguirán siendo técnicamente "huérfanos"
   pero no dañan nada activamente — no hay ningún trigger, RPC ni vista que
   falle por su causa. `_block_hard_delete_event_with_career()` ya impide
   que se repita el patrón hacia adelante.
2. **Recrear una fila `tournaments` mínima** para cada uno de los 3
   `evento_id` (con el `nombre`/`fecha` ya conocidos desde
   `jugador_participaciones`, y `user_id`/`organizador_id` a determinar —
   no está en los datos actuales) para restaurar la integridad referencial
   completa, sin alterar ningún punto ya otorgado.
3. **Revertir por completo** (borrar las participaciones + su rating/ledger
   asociado con el mismo mecanismo transaccional de RANK-002) — solo si se
   confirma que estos 3 torneos fueron datos de prueba y los puntos
   otorgados deben desaparecer del ranking real.

## 4. Requiere decisión manual: 10 participaciones de Duelo 2v2

Dos grupos claramente distintos:

**Grupo A — eventos históricos reales (5 filas)**: *"Hack Padel 5ta
Fuerza"* (4, 2026-06-23) y *"Reta 5ta Fuerza"* (1, 2026-06-30, 0 puntos).
Mismo patrón que la sección 3 — nombre reconocido
(`diagnose-career-event-host-organizer.mjs` ya lo lista como evento
histórico conocido). Misma recomendación: **dejar como está** salvo
decisión explícita de recrear el padre o revertir.

**Grupo B — datos de prueba, identificados con alta confianza (5 filas)**:
*"retetes3"* (1, jugador real: Devyl — **no se puede confirmar si es cuenta
personal de alguien del equipo o un jugador real**, se deja en el mismo
grupo que A por precaución), *"Test 2"* (2, jugadores **"TestplayerCT1" y
"TestplaCT2"**), *"TEST1"* y *"TES2"* (2, jugador **"TestPlaRO2"** en
ambos). Estos 3 últimos nombres de jugador son inequívocamente cuentas de
prueba (no personas reales) — sus puntos en el ledger no afectan el ranking
de ningún jugador real, así que no es urgente, pero es limpieza de higiene
de datos legítima para una fase futura dedicada a datos de prueba (fuera
del alcance de "integridad de datos reales" de esta auditoría).

**Estrategia recomendada**: mismas 3 opciones que la sección 3 para el
Grupo A. Para el Grupo B (cuentas `Test*` confirmadas), es seguro revertir
por completo en cualquier momento sin riesgo — se recomienda incluirlo en
una futura limpieza de datos de prueba, no como parte de un saneamiento de
integridad "urgente".

## 5. Requiere decisión manual: 79 filas de `rating_historial` (60 Reta + 19 Duelo 2v2)

**Causa raíz distinta de las secciones 3-4**: estas no están ligadas a los
mismos 3-4 eventos — hacen referencia a `matches`/`duelos_2v2` individuales
(muchos IDs distintos, ~15-20 partidos distintos con 4 filas cada uno) cuya
fila fue eliminada, no necesariamente el torneo/duelo completo. Root cause
más probable: regeneración de fixture, corrección de bracket, o borrado de
un partido individual sin pasar por el mecanismo de reversión de rating.

**Por qué NO se auto-repara, a diferencia del fix del ledger (sección 1)**:
revertir rating tiene el mismo problema de encadenamiento documentado en
`fix-rank001-rating-ledger-reconciliation-20260729.sql` — si alguno de los
jugadores afectados jugó *otro* partido después del que ahora falta,
restaurar `rating_antes` a ciegas pisaría el efecto de ese partido
posterior, dejando el rating actual del jugador **peor** que antes de
"reparar" nada. No hay forma de saberlo sin re-simular cronológicamente
todo el historial de cada jugador afectado — un proyecto propio, no un
saneamiento puntual.

**Estrategia recomendada**: dejar estas filas como están (no afectan
ninguna operación activa del sistema — son registros históricos huérfanos,
no bloquean nada). Si se decide investigar a fondo, el primer paso sería
identificar, para cada uno de los ~15-20 `match_id`/`duelo_id` involucrados,
si el jugador tuvo partidos posteriores (lo que determinaría si es seguro
revertir ese rating puntual o si requiere re-simulación completa).

## Validación cruzada post-reparación

Confirmado en vivo tras aplicar el único fix de esta fase:

| Chequeo | Resultado |
|---|---|
| `riviera_official_player_totals` desalineados del ledger | **0** (antes: 4) |
| `riviera_official_points_ledger` con jugador local eliminado | 0 (sin cambios, ya estaba en 0) |
| Filas del ledger tras el fix | 233 (sin cambios — solo se tocó el total derivado) |
| Participaciones/rating huérfanos documentados en este archivo | Sin cambios (decisión pendiente, no tocados) |

## Commit

`fix(data-integrity): Fase 3.5 -- recalcula totales de ledger desalineados
+ documenta huérfanos pendientes de decisión` (ver git log).
