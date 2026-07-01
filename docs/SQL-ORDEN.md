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
| `rating-sistema.sql` | RPC `aplicar_rating_partido` |
| `duelos-2v2.sql` | Tabla y esquema duelo 2 vs 2 |
| `delete-riviera-jugador.sql` | RPC eliminar jugador con limpieza |
| `organizer-display-name.sql` | RPC nombre del club |
| `liga-partidos-set-scores.sql` | Sets en partidos de liga |
| `tournament-public-config-americano.sql` | Config pública americano |
| `tournament-public-config-championship.sql` | Config remontada final RR |
| `rls-enable-public-schema.sql` | Habilitar RLS (Security Advisor) |
| `fix-security-definer-views.sql` | Corregir vistas SECURITY DEFINER |
| `ranking-sitio-oficial-global.sql` | Sitio oficial solo por `visible_publico` + trigger auto-sync club + RPC global |

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

### Orden recomendado (esquema nuevo)

1. `admin-master-controls.sql`
2. `organizer-player-access.sql`
3. `riviera-official-multi-club-romc1.sql` (ROMC-1)
4. `riviera-official-multi-club-romc2.sql` (ROMC-2)
5. Validación ROMC-1: `docs/ROMC-1-CHECKLIST.md`

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
