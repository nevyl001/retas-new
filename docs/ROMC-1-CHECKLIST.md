# ROMC-1 — Checklist de despliegue y validación

**Estado:** ✅ Esquema aprobado — pendiente ejecución y pruebas en Supabase.  
**ROMC-2:** ✅ Implementado en código + SQL (`riviera-official-multi-club-romc2.sql`); validación E2E Aaron/Hack pendiente en producción.

**Script:** `supabase/riviera-official-multi-club-romc1.sql`  
**Ejecutar después de:** `organizer-player-access.sql`  
**Diseño:** `docs/RANKING-OFICIAL-MULTI-CLUB.md`

---

## Orden de ejecución

1. `rls-enable-public-schema.sql` (si aplica)
2. `admin-master-controls.sql`
3. `organizer-player-access.sql`
4. **`riviera-official-multi-club-romc1.sql`** ← ROMC-1

---

## Qué hace ROMC-1

- Crea 4 tablas: identidad, links, ledger (vacío), totals (0).
- RLS: solo Admin Principal (`is_master_admin()`).
- 5 RPCs admin para identidad/vínculos.
- **No** escribe en ledger por participaciones.
- **No** modifica `jugador_stats`, `jugador_participaciones`, rankings ni sync.

---

## Pruebas manuales (SQL Editor como admin)

### 1. Crear identidad desde jugador Riviera (A)

```sql
SELECT public.admin_create_official_player_identity_from_jugador(
  '<riviera_jugador_id_A>'::uuid
);
```

Esperado: `official_player_key`, `points_total: 0`, un perfil `owner`.

### 2. Vincular perfil local Hack (B)

```sql
SELECT public.admin_link_official_player_profile(
  '<official_player_key>'::uuid,
  '<local_jugador_id_B>'::uuid,
  'granted_local',
  '<organizer_player_access_id>'::uuid  -- opcional
);
```

### 3. Consultar identidad

```sql
SELECT public.admin_get_official_player_identity_by_jugador(
  '<riviera_jugador_id_A>'::uuid
);
```

Esperado: `profiles` con A y B, `points_total: 0`.

### 4. Desvincular perfil erróneo (no canonical)

```sql
SELECT public.admin_unlink_official_player_profile(
  '<profile_link_id_B>'::uuid
);
```

### 5. Ledger vacío

```sql
SELECT count(*) FROM public.riviera_official_points_ledger;
-- Debe ser 0 tras ROMC-1 (sin ROMC-2)
```

---

## Regresión: jugador_stats y jugador_participaciones no cambiaron

Ejecutar **antes** y **después** de aplicar ROMC-1 para un jugador de prueba:

```sql
-- Snapshot A (origen Riviera)
SELECT js.* FROM public.jugador_stats js
WHERE js.jugador_id = '<riviera_jugador_id_A>';

SELECT count(*), coalesce(sum(puntos_obtenidos), 0)
FROM public.jugador_participaciones
WHERE jugador_id = '<riviera_jugador_id_A>';

-- Snapshot B (local Hack, si existe)
SELECT js.* FROM public.jugador_stats js
WHERE js.jugador_id = '<local_jugador_id_B>';

SELECT count(*), coalesce(sum(puntos_obtenidos), 0)
FROM public.jugador_participaciones
WHERE jugador_id = '<local_jugador_id_B>';
```

Los valores deben ser **idénticos** antes y después de ROMC-1.

### Ranking interno sin cambio

```sql
SELECT * FROM public.riviera_ranking_interno_por_organizador(
  '<hack_organizador_id>'::uuid,
  '5ta_fuerza',
  'M'
);
```

Mismo orden y puntos antes/después.

---

## Reversibilidad

```sql
DROP TABLE IF EXISTS public.riviera_official_points_ledger CASCADE;
DROP TABLE IF EXISTS public.riviera_official_player_totals CASCADE;
DROP TABLE IF EXISTS public.riviera_official_player_profile_link CASCADE;
DROP TABLE IF EXISTS public.riviera_official_player_identity CASCADE;
DROP FUNCTION IF EXISTS public._resolve_official_player_key(uuid);
DROP FUNCTION IF EXISTS public.admin_create_official_player_identity_from_jugador(uuid);
DROP FUNCTION IF EXISTS public.admin_link_official_player_profile(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.admin_unlink_official_player_profile(uuid);
DROP FUNCTION IF EXISTS public.admin_get_official_player_identity_by_jugador(uuid);
DROP FUNCTION IF EXISTS public.admin_list_official_player_profiles(uuid);
```

La app debe funcionar igual (rankings, ligas, fichas).

---

## Build app

```bash
npm run build
```

ROMC-1 no toca código TypeScript; el build confirma que el repo sigue sano.
