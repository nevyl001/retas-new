/**
 * Marcadores multi-set y clasificación — Torneo Express
 *
 * Migración requerida (ya aplicada en producción):
 * `supabase/torneo-express-partidos-sets-resultado.sql`
 *
 * Reglas a nivel evento (clasificación + formato):
 * `supabase/migrations/0047_torneo_express_evento_clasificacion.sql`
 *
 * ## Formato de partido (evento)
 *
 * Configurado en el Evento (`partido_formato`) y aplica a todas las categorías:
 *
 * - **flexible** (default): 1 set o mejor de 3; marcadores 0–99.
 * - **bo3_super_muerte**: mejor de 3; si van 1–1, el Set 3 debe ser súper
 *   tiebreak (a 10 con 2 de ventaja).
 *
 * En flexible:
 * - **1 set:** el organizador captura un solo set y guarda → partido a un set.
 * - **Mejor de 3:** al pulsar «+ Añadir set» el partido pasa a BO3.
 * - Máximo 3 sets. Si van 1-1 se exige el tercero. 2-0 no pide tercer set.
 *
 * ## Fuente de verdad
 *
 * - `sets_resultado` (JSONB `[{local, visitante}, ...]`) es la fuente de verdad.
 * - `ganador_id` se deriva siempre de los sets al guardar.
 * - `puntos_local` / `puntos_visitante` solo compatibilidad:
 *   - 1 set → games del set;
 *   - BO3 → sets ganados (2-0 / 2-1).
 * - Lectura histórica sin JSON: se sintetiza 1 set desde `puntos_*`
 *   (salvo tally 2-1 legacy de eliminatoria).
 *
 * ## Clasificación (evento → todos los grupos)
 *
 * Preset en `torneo_express_evento.clasificacion_modo`:
 *
 * - **dif_puntos** (default): **FAV → DIF → PG → H2H → seed**
 * - **setto_pg**: **PG → H2H (solo si exactamente 2 empatados) → DIF sets →
 *   DIF games → más sets ganados → más games ganados → seed**
 *
 * FAV/CON suman games de todos los sets cuando existe `sets_resultado`.
 * Misma lógica en tabla de grupo, tabla general, clasificados, mejores terceros
 * y seeding del bracket.
 *
 * Americano / Reta conservan: FAV → DIF → H2H → PG.
 *
 * ## Corrección
 *
 * - Permitida mientras la fase sea editable (grupos en fase grupos;
 *   eliminatoria en fase eliminatoria).
 * - Torneo cerrado/finalizado: bloqueado en UI y servicio
 *   (`isTorneoExpressClosed` / `assertTorneoExpressNotClosed`).
 * - No hay «Reabrir partido»: «Corregir resultado» sobrescribe el mismo id.
 *
 * ## Limitaciones actuales
 *
 * 1. Propagación de llave al cambiar ganador: UPDATEs secuenciales en cliente
 *    (no RPC transaccional). Si un update downstream falla, se lanza error,
 *    no se aplica rating y el hook hace `reload()` para reflejar BD.
 *    Mejora futura: RPC atómica (ver comentario en `saveEliminatoriaResultado`).
 * 2. Tras generar eliminatoria, resultados de grupos no son editables.
 *    Mensaje UI: reiniciar fase eliminatoria primero.
 * 3. Sin replay de career/ranking tras cerrar torneo.
 *
 * ## Archivos clave
 *
 * - `src/lib/torneoExpress/partidoSets.ts`
 * - `src/lib/torneoExpress/standings.ts`
 * - `src/lib/torneoExpress/clasificacionModo.ts`
 * - `src/lib/torneoExpress/bracket.ts` / `bracketRounds.ts`
 * - `src/services/torneoExpressService.ts`
 * - UI: `EventoDetalle`, `PartidoSetsResultModal`, `PartidosGrupo`, `PartidosEliminatoria`
 */
