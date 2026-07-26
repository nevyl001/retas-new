# Riesgo residual: concurrencia en `updateScoreParejasFijas` (Liga)

Ver también: [`docs/liga-update-score-atomic.md`](#) *(no existe todavía — referencia al fix ya desplegado de `updateScore` clásico, commit `559cd7b0`, RPC `update_liga_partido_score`)*.

## Situación actual

`updateScoreParejasFijas` (`src/services/ligaService.ts:1269-1310`, vía el helper `updateLigaPartidoScoreParejasFijas`, líneas 1228-1266) guarda el detalle por sets + games totales de un partido de liga en modalidad "parejas fijas" con un `UPDATE` directo (`.from("liga_partidos").update(fullPatch).eq("id", partidoId)`), **sin ningún chequeo previo de `estado`, sin lock, sin condición**.

A diferencia de `updateScore` (el flujo clásico, ya corregido con `update_liga_partido_score` + `SELECT ... FOR UPDATE`), esta función:

- No lee `estado` antes de escribir.
- No tiene parámetro `force` ni noción de "ya completado, confirma para sobrescribir".
- Permite corregir un resultado ya guardado sin fricción — el mensaje de UI (`LigaJornada.tsx:353-357`) dice explícitamente `"Resultado corregido."` cuando `partido.estado === "completed"`. Esto **parece ser comportamiento de producto intencional** (corrección rápida sin diálogo de confirmación), no solo una omisión.

## Riesgo residual (concurrencia entre dos actores)

Dos co-admins (o dos pestañas) guardando el mismo partido casi al mismo tiempo: el segundo `UPDATE` sobreescribe completo al primero — sets, games y `set_scores` se pierden en silencio, sin error, sin aviso a ninguno de los dos. El botón de guardar sí está protegido con `disabled={busy}` contra doble clic **dentro de la misma pestaña**, pero `busy` es estado local de React — no protege entre pestañas/sesiones distintas.

**No hay riesgo de ownership/multi-tenant aquí**: a diferencia de la RPC nueva (`SECURITY DEFINER`, bypassea RLS), este `UPDATE` sigue pasando por el cliente normal de Supabase, protegido por la política RLS existente (`lp_mutate_auth` / `is_liga_owner`) — eso no cambió y no está en riesgo.

## Por qué no se corrige junto con `updateScore`

No comparte código con la RPC nueva (llama a su propio helper privado, payload distinto — sets + `set_scores` jsonb + fallback si la columna no existe). Y sobre todo: antes de diseñar el fix hay que decidir una pregunta de producto, no solo técnica:

**¿Se debe agregar el mismo modelo de "conflicto explícito + `force`" que ya tiene `updateScore`, o solo cerrar la carrera entre dos actores concurrentes sin tocar la posibilidad de que un mismo usuario corrija su propio resultado sin fricción?**

Copiar el patrón de `force` tal cual introduciría fricción nueva donde hoy no la hay — sería un cambio de comportamiento/UX, no un fix invisible.

## Qué NO hacer todavía

- No implementar RPC aquí sin antes decidir la pregunta de arriba.
- No asumir que el modelo de `update_liga_partido_score` (conflicto + force) es el correcto para este flujo solo por consistencia — puede no serlo.

## Estado

**Pendiente de decisión de diseño UX.** Comportamiento actual preservado sin cambios. Auditado el 2026-07-26 (mismo día del fix de `updateScore` clásico).
