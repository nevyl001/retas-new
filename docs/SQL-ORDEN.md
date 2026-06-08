# Scripts SQL (Supabase)

Las migraciones del proyecto **ya están aplicadas** en el Supabase de producción. No hay archivos `.sql` de migración en el repositorio.

## Volver a empezar (borrar datos, no el esquema)

**`supabase/reset-datos-operativos.sql`** — Vacía retas, jugadores, torneos express, ligas, registro Riviera y notificaciones. **No** borra cuentas (`auth.users` / `public.users`).

1. Ejecutar el script en Supabase SQL Editor (staging primero si aplica).
2. Revisar los mensajes `NOTICE` (conteos antes/después en 0).
3. En el navegador: limpiar `localStorage` del sitio (Americano / reta activa).
4. Opcional: Storage → bucket `jugadores-avatars` → eliminar archivos viejos.

Luego crea jugadores de nuevo en **Registro de jugadores Riviera Open**.

## Cambios de esquema nuevos

Hazlos directamente en el **SQL Editor** de Supabase (o con migraciones de Supabase CLI si las adoptáis más adelante). El esquema canónico vive en la base de datos del proyecto, no en archivos del repo.
