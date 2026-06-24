# Ranking oficial — arquitectura appriviera + rivieraopen.com

## Quién hace qué

| Pieza | Rol |
|-------|-----|
| **appriviera** (`retas-new-main`) | Plataforma completa: Supabase, admin maestro, ranking, perfiles, retas |
| **www.rivieraopen.com** | Sitio de marketing; **depende de appriviera** para ranking y jugadores (enlaces, iframe o redirect) |

**No hay lógica de ranking duplicada en rivieraopen.com.** El admin vive solo en appriviera (`AccountControlsPanel.tsx`).

---

## URLs canónicas (appriviera)

| Recurso | URL |
|---------|-----|
| Ranking oficial global (multi-club) | `https://appriviera.rivieraopen.com/ranking` |
| Ranking femenil | `https://appriviera.rivieraopen.com/ranking/femenil` |
| Perfil jugador | `https://appriviera.rivieraopen.com/players/{riviera_jugadores.id}` |
| Ranking de un club (vista previa) | `https://appriviera.rivieraopen.com/ranking/o/{organizador_id}` |

www.rivieraopen.com debe **enlazar o embeber** esas URLs, no reimplementar consultas propias.

---

## Reglas de visibilidad (admin maestro)

Un jugador aparece en el ranking/perfil oficial solo si:

1. `organizador_game_modes.visible_ranking_oficial = true` — toggle «Publicar club en ranking oficial»
2. `riviera_jugadores.suma_ranking = true` — **Ranking**
3. `riviera_jugadores.visible_publico = true` — **Público**
4. `riviera_jugadores.estado = 'activo'`

Implementación en appriviera:

- `/ranking` sin `/o/{id}` → `listOfficialSiteJugadoresRanking()` (vista `riviera_jugadores_sitio_oficial`)
- `/players/{uuid}` → `getRivieraJugadorPublicById()` + RPC `is_jugador_visible_sitio_oficial`

---

## SQL en Supabase

1. `admin-master-controls.sql`
2. `ranking-oficial-sitio-web.sql`

---

## Qué pedirle a Cursor en rivieraopen.com (marketing)

> rivieraopen.com **no** consulta Supabase para rankings. Depende de appriviera.
>
> 1. En `/rankings` y enlaces de jugadores, usar URLs de appriviera:
>    - Ranking: `https://appriviera.rivieraopen.com/ranking`
>    - Perfil: `https://appriviera.rivieraopen.com/players/{id}`
> 2. Opciones: redirect 302, `window.location`, iframe, o botón «Ver ranking en Riviera App».
> 3. **Eliminar** (si existen) `rankingService.ts` / `playerService.ts` con queries directas a Supabase y `NEXT_PUBLIC_RANKING_ORGANIZADOR_ID`.
> 4. El control de quién aparece lo hace el admin en appriviera; no hace falta admin de jugadores en rivieraopen.com.

---

## Variables de entorno

```env
# appriviera (.env)
REACT_APP_PUBLIC_URL=https://appriviera.rivieraopen.com
REACT_APP_RIVIERA_OFFICIAL_URL=https://www.rivieraopen.com
```
