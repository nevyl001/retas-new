# Baseline local

`public-schema.sql` es la estructura del esquema `public`, sin filas. Se obtuvo con una lectura del catálogo remoto. No contiene jugadores, correos, teléfonos, sesiones ni pagos.

No es una migración operativa. No debe copiarse a `supabase/migrations/` del proyecto enlazado a producción, ni aplicarse con `supabase db push`.

El proyecto local vive en `local-supabase/`. No tiene `project-ref`. Su primera migración es un enlace a este archivo, así que `supabase start` de la carpeta principal sigue sin poder reconstruir el esquema y no puede usar este baseline por accidente. Después del baseline solo entran migraciones posteriores a `0140`.

Arranque:

```bash
./scripts/local-supabase.sh
```

Eso levanta Postgres y la API en `127.0.0.1` y escribe `.env.local`, que ya está ignorado por git. El archivo `.env` de producción no se toca.

`./scripts/local-supabase.sh reset` vuelve a crear la base desde cero.

Las migraciones `0001`–`0140` ya están incorporadas en esta estructura. Una migración nueva, posterior a `0140`, se agrega en `supabase/migrations/` para producción y también hay que colocarla en `local-supabase/supabase/migrations/` después del baseline antes de probarla en local.
