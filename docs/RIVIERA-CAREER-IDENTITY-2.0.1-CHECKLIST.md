# Sprint 2.0.1 — Riviera ID Foundation — Checklist

**Estado:** Listo para ejecutar en Supabase  
**Script:** `supabase/riviera-career-identity-2.0.1-ddl.sql`  
**Prerrequisito:** `riviera-official-multi-club-romc1.sql`  
**Alcance:** Solo DDL aditivo — sin RPCs, sin backfill, sin app

---

## Qué hace Sprint 2.0.1

Agrega columnas nullable a `riviera_official_player_identity`:

| Columna | Tipo | Propósito |
|---------|------|-----------|
| `riviera_id` | text | Riviera ID público (`RIV-00000001`) |
| `riviera_id_serial` | bigint | Componente numérico del Riviera ID |
| `debut_organizer_id` | uuid → auth.users | Organizador de Registro (Debut Riviera) |
| `debut_at` | timestamptz | Fecha de Registro (Debut Riviera) |

Incluye constraints, índices UNIQUE parciales y rollback documentado.

**No asigna valores.** Todas las filas existentes y nuevas (vía ROMC admin) siguen con NULL en estas columnas hasta Sprint 2.0.4+.

---

## Orden de ejecución

1. `admin-master-controls.sql` (si no aplicado)
2. `organizer-player-access.sql`
3. `riviera-official-multi-club-romc1.sql`
4. `riviera-official-multi-club-romc2.sql` (si aplica)
5. **`riviera-career-identity-2.0.1-ddl.sql`** ← este sprint

---

## Pre-vuelo (antes de ejecutar)

- [ ] Confirmar que `riviera_official_player_identity` existe en el proyecto
- [ ] Ventana de baja actividad (ALTER TABLE puede tomar lock breve)
- [ ] Backup/snapshot reciente disponible (recomendado en prod)
- [ ] Ejecutar primero en **staging**

---

## Ejecución

1. Abrir Supabase SQL Editor
2. Pegar contenido completo de `riviera-career-identity-2.0.1-ddl.sql`
3. Ejecutar
4. Verificar NOTICE: `Sprint 2.0.1 OK — riviera_official_player_identity: total=N, con_riviera_id=0, con_debut=0`

---

## Pruebas post-migración (SQL Editor)

### P1 — Columnas presentes y nullable

```sql
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'riviera_official_player_identity'
  AND column_name IN (
    'riviera_id',
    'riviera_id_serial',
    'debut_organizer_id',
    'debut_at'
  )
ORDER BY column_name;
```

**Esperado:** 4 filas, todas `is_nullable = YES`.

### P2 — Sin datos asignados aún

```sql
SELECT
  count(*) AS total,
  count(riviera_id) AS con_riviera_id,
  count(debut_organizer_id) AS con_debut
FROM public.riviera_official_player_identity;
```

**Esperado:** `con_riviera_id = 0`, `con_debut = 0` (inmediatamente post-2.0.1).

### P3 — Constraints activos

```sql
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.riviera_official_player_identity'::regclass
  AND conname IN (
    'ropi_riviera_id_format_chk',
    'ropi_riviera_id_serial_positive_chk',
    'ropi_riviera_id_pair_chk',
    'ropi_debut_pair_chk',
    'ropi_debut_organizer_id_fkey'
  )
ORDER BY conname;
```

**Esperado:** 5 constraints.

### P4 — Índices UNIQUE parciales

```sql
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'riviera_official_player_identity'
  AND indexname IN (
    'ropi_riviera_id_unique_idx',
    'ropi_riviera_id_serial_unique_idx',
    'ropi_debut_organizer_id_idx'
  )
ORDER BY indexname;
```

**Esperado:** 3 índices.

### P5 — Constraint de formato (solo staging — insert de prueba + rollback)

```sql
BEGIN;

INSERT INTO public.riviera_official_player_identity (
  canonical_riviera_jugador_id,
  riviera_id,
  riviera_id_serial
)
SELECT
  rj.id,
  'RIV-INVALID',
  1
FROM public.riviera_jugadores rj
LIMIT 1;

-- Esperado: ERROR ropi_riviera_id_format_chk

ROLLBACK;
```

Si no hay jugadores en staging, omitir P5.

### P6 — Idempotencia (re-ejecutar script)

- [ ] Volver a ejecutar `riviera-career-identity-2.0.1-ddl.sql` completo
- [ ] Sin errores
- [ ] NOTICE final coherente

### P7 — ROMC admin RPCs sin regresión

```sql
-- Solo si existe identidad ROMC de prueba
SELECT public.admin_get_official_player_identity_by_jugador(
  '<riviera_jugador_id_con_identidad>'::uuid
);
```

**Esperado:** Respuesta JSON igual que antes (campos nuevos aún no en JSON de RPC hasta Sprint 2.0.5).

### P8 — Smoke operativo app (manual)

- [ ] Login organizador
- [ ] Crear jugador en registro
- [ ] Abrir reta / torneo / rating — sin errores
- [ ] Panel admin ROMC (si se usa) — sin errores

---

## Rollback

Descomentar y ejecutar bloque **ROLLBACK** al final de `riviera-career-identity-2.0.1-ddl.sql`.

**Efecto:** elimina columnas, constraints e índices de Sprint 2.0.1. ROMC y app vuelven al estado pre-2.0.1.

**No elimina:** filas de `riviera_official_player_identity`, datos en otras columnas, RPCs ROMC.

---

## Fuera de alcance (sprints posteriores)

- Secuencia `riviera_id_serial_seq` → Sprint 2.0.2
- RPC `career_identity_resolve_by_jugador` → Sprint 2.0.3
- RPC `career_identity_ensure_for_jugador` → Sprint 2.0.4
- Asignación de Riviera ID y Debut → Sprint 2.0.4+
- Backfill → Sprint 2.0.6 / 2.0.10
- Servicios TypeScript → Sprint 2.0.7 / 2.0.8
- Temporada de Debut → sprint futuro (derivable de `debut_at` o columna dedicada)

---

## Criterios de aceptación Sprint 2.0.1

- [ ] Script ejecutado en staging sin error
- [ ] P1–P4 pasan
- [ ] P6 idempotencia OK
- [ ] P8 smoke app OK
- [ ] `con_riviera_id = 0` post-migración
- [ ] Producción sin cambio de comportamiento (hasta ejecutar en prod)
