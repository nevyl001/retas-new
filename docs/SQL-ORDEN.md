# Orden sugerido de scripts SQL (Supabase)

Ejecuta en el **SQL Editor** del proyecto que uses en producción. Si un script ya fue aplicado, Supabase puede mostrar errores de “already exists”; en ese caso revisa el mensaje y continúa o adapta con `IF NOT EXISTS` donde aplique.

## Orden base

1. **`database-schema-multi-user.sql`** (o el esquema que definas como canónico)  
   Tablas core: `users`, `tournaments`, `players`, `pairs`, `matches`, `games`, RLS básico.

2. **`tournament-public-config.sql`**  
   Tabla `tournament_public_config` + políticas para lectura anónima y upsert autenticado.  
   Necesario para **enlace público corto** y clasificación por equipos sin `#teams=` en la URL.

3. **`public-access-policies.sql`** o **`fix-public-access.sql`**  
   Ajustes de lectura pública donde apliquen (según tu versión del esquema).

4. **`mark-existing-tournaments-public.sql`**  
   Solo si usas columna `is_public` en `tournaments` y quieres marcar retas existentes.

5. **Políticas de `players` por torneo** (si `players` tiene `tournament_id` y no `user_id`)  
   Las que apliquen `EXISTS (SELECT 1 FROM tournaments t WHERE t.id = players.tournament_id AND t.user_id = auth.uid())` para SELECT/INSERT/UPDATE/DELETE.

## Referencia rápida

| Archivo | Propósito |
|---------|-----------|
| `database-schema.sql` | Esquema más antiguo / referencia |
| `database-schema-multi-user.sql` | Multi-usuario + RLS por `user_id` |
| `tournament-public-config.sql` | Config pública para vista `/public/...` |
| `step-by-step-fix.sql` | Parches incrementales (revisar contenido) |
| `admin-setup.sql` | Panel admin |

Tras cambios en RLS, prueba la app con un usuario normal (no rol `postgres` del Table Editor).

## Volver a empezar (borrar datos, no el esquema)

**`supabase/reset-datos-operativos.sql`** — Vacía retas, jugadores, torneos express, ligas, registro Riviera y notificaciones. **No** borra cuentas (`auth.users` / `public.users`).

1. Ejecutar el script en Supabase SQL Editor (staging primero si aplica).
2. Revisar los mensajes `NOTICE` (conteos antes/después en 0).
3. En el navegador: limpiar `localStorage` del sitio (Americano / reta activa).
4. Opcional: Storage → bucket `jugadores-avatars` → eliminar archivos viejos.

Luego crea jugadores de nuevo en **Registro de jugadores Riviera Open**.

4. **`supabase/riviera-jugadores-en-cancha.sql`** — Campo `en_cancha` (Revés / Drive) en perfiles.
