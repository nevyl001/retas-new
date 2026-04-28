# Despliegue y Supabase (paso a paso)

Guía para tener **un solo proyecto estable**, variables claras en Vercel y base de datos alineada con la app.

## 1. Elegir el proyecto Supabase “oficial”

1. Entra a [Supabase Dashboard](https://supabase.com/dashboard).
2. Abre el proyecto que **sí responde** (URL y Auth funcionando).
3. Anota **Project URL** y **anon public** key: *Settings → API*.

> Si un proyecto antiguo da 503 o DNS falla, no lo uses en producción hasta que Supabase lo restaure. La app debe apuntar solo al proyecto vivo.

## 2. Variables en Vercel (o tu hosting)

En el proyecto de Vercel: **Settings → Environment Variables** (Production y Preview).

| Variable | Descripción |
|----------|-------------|
| `REACT_APP_SUPABASE_URL` | `https://TU_REF.supabase.co` |
| `REACT_APP_SUPABASE_ANON_KEY` | Clave anon (pública, con RLS) |

No configures la **service role** como `REACT_APP_*`: Create React App la inyecta en el bundle y cualquiera puede usarla. Para borrar usuarios en Auth u otras tareas admin, usa el [panel de Supabase](https://supabase.com/dashboard) (Authentication → Users) o una **Edge Function** con la clave solo en secretos del servidor.

Después de guardar: **Deployments → Redeploy** el último build (las variables `REACT_APP_*` se inyectan en **build time**).

### Error `ERR_NAME_NOT_RESOLVED` al iniciar sesión

Casi siempre es **un typo en la URL** (un carácter de más o de menos). Copia la URL desde Supabase con **copiar/pegar**, no a mano.

Ejemplo frecuente: escribir `...jepob...` en lugar de `...jepoob...` (falta una **o**). El dominio incorrecto **no existe** en DNS y el navegador muestra `net::ERR_NAME_NOT_RESOLVED`.

Comprueba que `REACT_APP_SUPABASE_URL` coincida **letra por letra** con **Settings → API → Project URL** en el dashboard de Supabase.

## 3. Limpieza en el navegador (una vez por crisis)

Si cambiaste de proyecto o URL:

1. DevTools → **Application** → Service Workers → **Unregister**.
2. **Clear site data** (caché + storage).
3. Recarga fuerte (`Cmd+Shift+R`).

Así evitas bundles viejos que aún apuntaban a otro host.

## 4. Orden recomendado de SQL en Supabase

Ver [SQL-ORDEN.md](./SQL-ORDEN.md) y ejecuta los scripts en el **SQL Editor** del proyecto oficial, en el orden indicado.

Puntos críticos que ya te afectaron:

- Tabla `tournament_public_config` + RLS (enlace público corto y vista por equipos).
- Políticas de `players` por **dueño del torneo** (`tournaments.user_id`) si usas `tournament_id` en jugadores.

## 5. Fallback de emergencia en código

En `src/lib/supabaseClient.ts` existe un fallback si la URL de build sigue siendo un host caído conocido. Cuando **Vercel ya tenga la URL correcta**, ese camino no se usa.

Objetivo a medio plazo: **no depender de dos proyectos**; un solo `REACT_APP_SUPABASE_URL` correcto y datos migrados si hace falta.

## 6. Verificación rápida post-deploy

1. Login en la app de producción.
2. Crear reta → jugadores → copiar enlace público (debe ser corto: `/public/{uuid}`).
3. Abrir enlace en ventana privada: debe cargar sin login.
4. Consola sin errores `ERR_NAME_NOT_RESOLVED` hacia Supabase.

## 7. Próximos pasos de código (opcional)

- Reducir “compatibilidad multi-esquema” en `src/lib/database.ts` cuando la BD esté fijada a un solo esquema.
- Añadir tests en `src/__tests__/` para crear torneo / jugador (mock Supabase).
