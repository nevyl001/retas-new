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

## Seguridad RLS (alerta Supabase)

Si recibes **"Table publicly accessible"** / `rls_disabled_in_public`:

1. Supabase Dashboard → **Database → Security Advisor** (o el botón **Resolve issue** del email).
2. Ejecuta el diagnóstico del inicio de **`supabase/rls-enable-public-schema.sql`**.
3. Aplica el script completo en SQL Editor (staging primero si puedes).
4. Vuelve a correr Security Advisor y prueba: login, reta, TE público, ranking, liga pública.

Sin RLS, cualquiera con la URL del proyecto y la clave **anon** (visible en el bundle de la app) puede leer y modificar datos.
