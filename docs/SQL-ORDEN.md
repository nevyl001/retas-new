# Scripts SQL (Supabase)

El esquema canónico vive en la base de datos de producción. En el repo solo quedan scripts **operativos** (referenciados por la app o útiles para mantenimiento). Los parches incrementales ya aplicados se eliminaron del repositorio.

## Scripts que permanecen en `supabase/`

| Archivo | Uso |
|---------|-----|
| `reset-datos-operativos.sql` | Vaciar datos operativos (no borra cuentas) |
| `admin-master-controls.sql` | Admin maestro (prerrequisito ROMC) |
| `organizer-player-access.sql` | Grants entre clubes (Fase 1) |
| `riviera-official-multi-club-romc1.sql` | ROMC-1 — identidad + ledger |
| `riviera-official-multi-club-romc2.sql` | ROMC-2 — dual-write ledger |
| `riviera-official-ledger-fix-source-organizador.sql` | ROMC-2 fix — `source_organizer_id` desde metadata |
| `riviera-official-display-puntos-for-jugador.sql` | RPC puente — puntos globales desde `riviera_official_player_totals` |
| `riviera-official-site-ranking-fix-nulls.sql` | Sprint 2.1 — vista sitio oficial sin COALESCE local; `NULLS LAST` en rankings |
| `riviera-career-identity-2.0.1-ddl.sql` | **Sprint 2.0.1** — Riviera ID Foundation (DDL aditivo identity) |
| `riviera-career-identity-2.0.1-validate.sql` | Validación read-only post Sprint 2.0.1 |
| `riviera-career-identity-2.0.2-engine.sql` | **Sprint 2.0.2** — Riviera ID Engine (secuencia + ensure RPC) |
| `riviera-career-identity-2.0.2-validate.sql` | Validación read-only post Sprint 2.0.2 |
| `riviera-career-identity-2.0.2-test-scenarios.sql` | Escenarios de prueba staging Sprint 2.0.2 |
| `riviera-career-identity-2.0.2a-integration.sql` | **Sprint 2.0.2A** — admin_create → ensure (punto único) |
| `riviera-player-sharing-requests-2.1.0.sql` | Sprint 2.1.0 — solicitudes compartir (obsoleto; no desplegar) |
| `riviera-player-membership-2.1.1-schema.sql` | **RIVIERA 2.1.1** — Player Membership schema evolution |
| `riviera-player-membership-2.1.1-validate.sql` | Validación read-only post 2.1.1 |
| `riviera-player-membership-2.1.2-rpcs.sql` | **RIVIERA 2.1.2** — Player Membership RPCs |
| `riviera-player-membership-2.1.2-validate.sql` | Validación read-only post 2.1.2 |
| `rating-sistema.sql` | RPC `aplicar_rating_partido` |
| `duelos-2v2.sql` | Tabla y esquema duelo 2 vs 2 |
| `delete-riviera-jugador.sql` | RPC eliminar jugador con limpieza |
| `organizer-display-name.sql` | RPC nombre del club |
| `liga-partidos-set-scores.sql` | Sets en partidos de liga |
| `tournament-public-config-americano.sql` | Config pública americano |
| `tournament-public-config-championship.sql` | Config remontada final RR |
| `rls-enable-public-schema.sql` | Habilitar RLS (Security Advisor) |
| `fix-security-definer-views.sql` | Corregir vistas SECURITY DEFINER |
| `ranking-sitio-oficial-global.sql` | Sitio oficial solo por `visible_publico` + trigger auto-sync club + RPC global + posición ficha |
| `rating-unificado-cedidos.sql` | Rating e historial unificados para jugadores cedidos (ficha pública por club) |
| `torneo-express-evento-fase1.sql` | **Torneo FASE 1** — tabla `torneo_express_evento` + `torneo_express.evento_id` (nullable) + RLS |
| `torneo-express-evento-flyers-storage.sql` | **Torneo** — bucket Storage `evento-flyers` (flyers públicos del Evento) |
| `torneo-express-partidos-sets-resultado.sql` | **Torneo** — columna `sets_resultado` (JSONB) en partidos de grupos y eliminatoria |

## Volver a empezar (borrar datos, no el esquema)

**`supabase/reset-datos-operativos.sql`** — Vacía retas, jugadores, torneos express, ligas, registro Riviera y notificaciones. **No** borra cuentas (`auth.users` / `public.users`).

1. Ejecutar el script en Supabase SQL Editor (staging primero si aplica).
2. Revisar los mensajes `NOTICE` (conteos antes/después en 0).
3. En el navegador: limpiar `localStorage` del sitio (Americano / reta activa).
4. Opcional: Storage → bucket `jugadores-avatars` → eliminar archivos viejos.

Luego crea jugadores de nuevo en **Registro de jugadores Riviera Open**.

## Cambios de esquema nuevos

Hazlos directamente en el **SQL Editor** de Supabase (o con migraciones de Supabase CLI si las adoptáis más adelante). El esquema canónico vive en la base de datos del proyecto, no en archivos del repo.

### Documentación de arquitectura

| Tema | Archivo |
|------|---------|
| Jugador global, perfiles locales, rankings (Fase 2) | `docs/JUGADOR-GLOBAL-FASE-2.md` |
| Ranking oficial Riviera Open | `docs/RANKING-OFICIAL-RIVIERAOPEN.md` |
| Ranking oficial acumulado multi-club (diseño) | `docs/RANKING-OFICIAL-MULTI-CLUB.md` |
| Acceso concedido entre organizadores (Fase 1) | `supabase/organizer-player-access.sql` |
| **ROMC-1** — esquema identidad + ledger (sin dual-write) | `supabase/riviera-official-multi-club-romc1.sql` |
| **ROMC-2** — dual-write ledger oficial (emisores + RPC) | `supabase/riviera-official-multi-club-romc2.sql` |
| **Sprint 2.0.1** — Riviera ID Foundation (Carrera Deportiva DDL) | `supabase/riviera-career-identity-2.0.1-ddl.sql` |
| Sprint 2.0.1 — checklist de pruebas | `docs/RIVIERA-CAREER-IDENTITY-2.0.1-CHECKLIST.md` |
| **Sprint 2.0.2** — Riviera ID Engine | `supabase/riviera-career-identity-2.0.2-engine.sql` |
| Sprint 2.0.2 — checklist de pruebas | `docs/RIVIERA-CAREER-IDENTITY-2.0.2-CHECKLIST.md` |
| **Sprint 2.0.2A** — Integración ensure con app + admin | `supabase/riviera-career-identity-2.0.2a-integration.sql` |
| Sprint 2.0.2A — checklist | `docs/RIVIERA-CAREER-IDENTITY-2.0.2A-CHECKLIST.md` |
| Sprint 2.1.0 — sharing requests (obsoleto) | `supabase/riviera-player-sharing-requests-2.1.0.sql` |
| **RIVIERA 2.1.1** — Player Membership schema | `supabase/riviera-player-membership-2.1.1-schema.sql` |
| RIVIERA 2.1.1 — checklist | `docs/RIVIERA-PLAYER-MEMBERSHIP-2.1.1-CHECKLIST.md` |
| **RIVIERA 2.1.2** — Player Membership RPCs | `supabase/riviera-player-membership-2.1.2-rpcs.sql` |
| RIVIERA 2.1.2 — checklist | `docs/RIVIERA-PLAYER-MEMBERSHIP-2.1.2-CHECKLIST.md` |
| Torneo multi-categoría + agenda (arquitectura) | `docs/TOURNAMENT-MULTI-CATEGORY-ARCHITECTURE.md` |
| **Torneo** — Sets multi-marcador + clasificación PG→FAV→DIF→H2H | `docs/TORNEO-EXPRESS-SETS-Y-CLASIFICACION.md` |
| **Torneo FASE 1** — Evento (`torneo_express_evento`) | `supabase/torneo-express-evento-fase1.sql` |
| **Torneo** — Storage flyers de Evento | `supabase/torneo-express-evento-flyers-storage.sql` |
| **Torneo** — Sets multi-marcador (`sets_resultado`) | `supabase/torneo-express-partidos-sets-resultado.sql` |

### Orden recomendado (esquema nuevo)

1. `admin-master-controls.sql`
2. `organizer-player-access.sql`
3. `riviera-official-multi-club-romc1.sql` (ROMC-1)
4. `riviera-official-multi-club-romc2.sql` (ROMC-2)
5. `riviera-official-ledger-fix-source-organizador.sql` (ROMC-2 fix metadata source org)
6. `riviera-official-display-puntos-for-jugador.sql` (RPC lectura puntos globales ROMC)
7. `riviera-official-site-ranking-fix-nulls.sql` (Sprint 2.1 — ranking sitio oficial sin fallback local)
8. Validación ROMC-1: `docs/ROMC-1-CHECKLIST.md`
6. **`riviera-career-identity-2.0.1-ddl.sql`** (Sprint 2.0.1 — Riviera ID Foundation)
7. Validación Sprint 2.0.1: `riviera-career-identity-2.0.1-validate.sql` + `docs/RIVIERA-CAREER-IDENTITY-2.0.1-CHECKLIST.md`
8. **`riviera-career-identity-2.0.2-engine.sql`** (Sprint 2.0.2 — Riviera ID Engine)
9. Validación Sprint 2.0.2: `riviera-career-identity-2.0.2-validate.sql` + `docs/RIVIERA-CAREER-IDENTITY-2.0.2-CHECKLIST.md`
10. **`riviera-career-identity-2.0.2a-integration.sql`** (Sprint 2.0.2A — integración app)
11. Checklist 2.0.2A: `docs/RIVIERA-CAREER-IDENTITY-2.0.2A-CHECKLIST.md`
12. **`riviera-player-membership-2.1.1-schema.sql`** (RIVIERA 2.1.1 — membership schema)
13. Validación 2.1.1: `riviera-player-membership-2.1.1-validate.sql` + checklist
14. **`riviera-player-membership-2.1.2-rpcs.sql`** (RIVIERA 2.1.2 — membership RPCs)
15. Validación 2.1.2: `riviera-player-membership-2.1.2-validate.sql` + checklist
16. **`torneo-express-evento-fase1.sql`** (Torneo FASE 1 — Evento contenedor; requiere `torneo_express` + RLS TE base)
17. **`torneo-express-evento-flyers-storage.sql`** (bucket público `evento-flyers` + políticas Storage)
18. **`torneo-express-partidos-sets-resultado.sql`** (`sets_resultado` JSONB en partidos TE grupos + eliminatoria)

## Seguridad RLS (alerta Supabase)

Si recibes **"Table publicly accessible"** / `rls_disabled_in_public`:

1. Supabase Dashboard → **Database → Security Advisor** (o el botón **Resolve issue** del email).
2. Ejecuta el diagnóstico del inicio de **`supabase/rls-enable-public-schema.sql`**.
3. Aplica el script completo en SQL Editor (staging primero si puedes).
4. Vuelve a correr Security Advisor y prueba: login, reta, TE público, ranking, liga pública.

Sin RLS, cualquiera con la URL del proyecto y la clave **anon** (visible en el bundle de la app) puede leer y modificar datos.

## Vistas SECURITY DEFINER (Advisor)

Si aparecen alertas en `pairs_with_contact` o `notificaciones_eventos_queue_resumen`:

1. Ejecuta **`supabase/fix-security-definer-views.sql`** en SQL Editor.
2. Prueba el panel de **notificaciones** de un torneo express y un envío de email de prueba.
3. No afecta las vistas públicas `/public/...` del torneo.
