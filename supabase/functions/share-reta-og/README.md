# Share OG / WhatsApp (reta convocatoria)

## URL exacta que copia la app

Con `REACT_APP_SHARE_OG_BASE_URL` definido:

```
${REACT_APP_SHARE_OG_BASE_URL}?slug=<public_slug>
```

Ejemplo:

```
https://<project-ref>.supabase.co/functions/v1/share-reta-og?slug=ra-abcd1234
```

Sin env (fallback local/testeable):

```
${window.location.origin}/share/reta/<public_slug>
```

(requiere rewrite/proxy hacia la Edge Function en deploy).

## Destino humano

```
${PUBLIC_APP_ORIGIN}/jugar/<public_slug>
```

El HTML OG incluye enlace “Abrir convocatoria” + meta refresh a 8s (no inmediato).

## Variables

| Dónde | Variable | Uso |
|-------|----------|-----|
| FE (CRA) | `REACT_APP_SHARE_OG_BASE_URL` | Base del endpoint share-reta-og |
| Edge | `SUPABASE_URL` | Cliente service |
| Edge | `SUPABASE_SERVICE_ROLE_KEY` | Lectura registro + branding |
| Edge | `PUBLIC_APP_ORIGIN` | Play URL + og image club |
| Edge | `PUBLIC_SHARE_CANONICAL_BASE` | og:url opcional |

## SQL relacionado (aplicar en Supabase, sin deploy FE)

- `supabase/sql/patch-get-organizador-branding-public.sql`
- `supabase/sql/patch-update-tournament-courts-unassign.sql`
- `supabase/sql/verify-tournament-courts-updated-at.sql` (solo lectura)

## Deploy pendiente

```bash
supabase functions deploy share-reta-og
```

No ejecutado en esta fase.
