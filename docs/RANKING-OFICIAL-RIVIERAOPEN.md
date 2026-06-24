# Ranking oficial — arquitectura appriviera + rivieraopen.com

## Quién hace qué

| Pieza | Rol |
|-------|-----|
| **appriviera** (`retas-new-main`) | Plataforma completa: Supabase, admin maestro, ranking, perfiles, retas |
| **www.rivieraopen.com** | Sitio de marketing; **depende de appriviera** para ranking y jugadores (enlaces, iframe o redirect) |

**No hay lógica de ranking duplicada en rivieraopen.com.** El admin vive solo en appriviera (`AccountControlsPanel.tsx`).

---

## URLs canónicas

| Pieza | URL |
|-------|-----|
| **Ranking interno del club (app)** | `https://appriviera.rivieraopen.com/ranking/o/{organizador_id}` |
| **Sitio oficial (solo jugadores «Público»)** | `https://www.rivieraopen.com/rankings?org={organizador_id}` |
| **Perfil jugador** | `https://appriviera.rivieraopen.com/players/{riviera_jugadores.id}` |

**No existe ranking global mezclado.** Cada organizador tiene su listado; rivieraopen.com filtra por `organizador_id`.

---

## Reglas de visibilidad (admin maestro)

Un jugador aparece en el ranking/perfil oficial solo si:

1. `organizador_game_modes.visible_ranking_oficial = true` — toggle «Publicar club en ranking oficial»
2. `riviera_jugadores.suma_ranking = true` — **Ranking**
3. `riviera_jugadores.visible_publico = true` — **Público**
4. `riviera_jugadores.estado = 'activo'`

Implementación en appriviera:

- `/ranking` sin `/o/{id}` → índice de clubs (`riviera_organizadores_ranking_oficial`)
- `/ranking/o/{organizador_id}` → `listOfficialSiteJugadoresRanking(organizadorId, …)` (RPC `riviera_ranking_sitio_oficial_por_organizador`)
- `/players/{uuid}` → `getRivieraJugadorPublicById()` + RPC `is_jugador_visible_sitio_oficial`; posición en ranking del **club del jugador**, no global

---

## SQL en Supabase

Ejecutar en este orden:

1. `admin-master-controls.sql`
2. `ranking-oficial-sitio-web.sql`

### Endpoints para consumo externo (rivieraopen.com u otros)

| Recurso | Tipo | Uso |
|---------|------|-----|
| `riviera_organizadores_ranking_oficial()` | RPC | Lista clubs con `visible_ranking_oficial = true` |
| `riviera_ranking_sitio_oficial_por_organizador(p_organizador_id, p_categoria, p_genero)` | RPC | Ranking de un solo club |
| `riviera_jugadores_sitio_oficial` | Vista | Base filtrada; **siempre** filtrar por `organizador_id` |
| `is_organizador_ranking_publico(p_org_id)` | RPC | ¿Club publicado? |
| `is_jugador_visible_sitio_oficial(p_jugador_id)` | RPC | ¿Jugador visible en sitio oficial? |

Ejemplo PostgREST (anon key):

```
POST /rest/v1/rpc/riviera_organizadores_ranking_oficial

POST /rest/v1/rpc/riviera_ranking_sitio_oficial_por_organizador
Body: { "p_organizador_id": "uuid-del-club", "p_categoria": "open", "p_genero": "M" }
```

`p_organizador_id` es el UUID del organizador (`public.users.id`), no un slug de jugador.

---

## Qué pedirle a Cursor en rivieraopen.com (marketing)

> rivieraopen.com **no** consulta Supabase para rankings mezclados. Depende de appriviera.
>
> 1. En `/rankings`, mostrar clubs publicados o enlazar al índice:
>    - Índice: `https://appriviera.rivieraopen.com/ranking`
>    - Club Nevyl (ejemplo): `https://appriviera.rivieraopen.com/ranking/o/{organizador_id}`
>    - Perfil: `https://appriviera.rivieraopen.com/players/{id}`
> 2. Si rivieraopen.com consulta Supabase directamente, usar solo los RPC por `organizador_id`; **no** leer `riviera_jugadores_sitio_oficial` sin filtro de club.
> 3. Opciones de integración: redirect 302, iframe, o botón «Ver ranking en Riviera App».
> 4. El control de quién aparece lo hace el admin en appriviera; no hace falta admin de jugadores en rivieraopen.com.

---

## Variables de entorno

```env
# appriviera (.env)
REACT_APP_PUBLIC_URL=https://appriviera.rivieraopen.com
REACT_APP_RIVIERA_OFFICIAL_URL=https://www.rivieraopen.com
```
