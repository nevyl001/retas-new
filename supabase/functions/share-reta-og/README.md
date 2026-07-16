## Share OG / WhatsApp (público)

### URLs que debe copiar la app

Convocatoria (`public_slug`):

```
${REACT_APP_SHARE_OG_BASE_URL}?slug=<public_slug>
```

Cualquier otra vista pública (resultados, liga, TE, duelo, etc.):

```
${REACT_APP_SHARE_OG_BASE_URL}?dest=<pathname>
```

Ejemplos `dest`:

- `/public/<tournamentId>`
- `/public/americano/<id>`
- `/public/duelo-2v2/<id>`
- `/public/liga/<id>`
- `/torneo-express/<id>/grupos`

El HTML OG incluye enlace + meta refresh 8s hacia el destino SPA real
(`${PUBLIC_APP_ORIGIN}` + path o `/jugar/:slug`).

### Preview humano

El botón «Ver vista pública» sigue abriendo la URL SPA (`publicUrl`), no el OG.

### Variables

| Dónde | Variable |
|-------|----------|
| FE | `REACT_APP_SHARE_OG_BASE_URL` |
| Edge | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_APP_ORIGIN` |

### Deploy pendiente

```bash
supabase functions deploy share-reta-og
```
