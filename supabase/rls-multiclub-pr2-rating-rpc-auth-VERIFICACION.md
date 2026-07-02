# PR2 — Verificación RPCs rating / cedidos

Ejecutar en **staging** con dos organizadores (Hack, Padelito), un jugador local de Padelito, un grant activo Hack←Padelito, y opcionalmente master admin.

Prerrequisito SQL: `supabase/rls-multiclub-pr2-rating-rpc-auth.sql`

## 1. Anon → Unauthorized

Con **solo** la anon key (sin JWT de usuario):

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "$SUPABASE_URL/rest/v1/rpc/riviera_rating_canonico_para_jugador" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_organizador_id":"...","p_jugador_id":"..."}'
```

**Esperado:** `401` o cuerpo PostgREST con permiso denegado / función no ejecutable como anon.

Repetir para `riviera_rating_historial_unificado` y `riviera_concedidos_ranking_enriquecimiento`.

## 2. Hack sin grant → no lee jugador de Padelito

Sesión JWT de **Hack** (`$HACK_JWT`):

```bash
curl "$SUPABASE_URL/rest/v1/rpc/riviera_rating_canonico_para_jugador" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $HACK_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"p_organizador_id\":\"$PADELITO_ORG\",\"p_jugador_id\":\"$JUGADOR_PADELITO\"}"
```

**Esperado:** error `42501` / "No autorizado para este organizador" o filas vacías en fallback sin datos ajenos.

```bash
# Historial con jugador arbitrario — no debe devolver filas
curl ... riviera_rating_historial_unificado \
  -d "{\"p_organizador_id\":\"$HACK_ORG\",\"p_jugador_id\":\"$JUGADOR_PADELITO\",\"p_limite\":10}"
```

**Esperado:** `[]` o error de autorización (no historial de Padelito).

## 3. Hack con grant → sí lee cedido

Con grant activo (local en Hack, source en Padelito):

```bash
curl ... riviera_rating_canonico_para_jugador \
  -d "{\"p_organizador_id\":\"$HACK_ORG\",\"p_jugador_id\":\"$LOCAL_CEDIDO_HACK\"}"
```

**Esperado:** fila con `source_jugador_id`, `origen_puntos_totales`, rating del origen.

```bash
curl ... riviera_concedidos_ranking_enriquecimiento \
  -d "{\"p_grantee_organizer_id\":\"$HACK_ORG\"}"
```

**Esperado:** mapa de cedidos de Hack (solo grants activos).

## 4. Master admin

JWT de cuenta en `admin_users`:

```bash
curl ... riviera_rating_canonico_para_jugador \
  -d "{\"p_organizador_id\":\"$PADELITO_ORG\",\"p_jugador_id\":\"$JUGADOR_PADELITO\"}"
```

**Esperado:** datos del jugador (admin bypass).

## 5. Historial unificado — sin jugador_id arbitrario

Hack autenticado, `p_jugador_id` de Padelito, `p_organizador_id` = Hack:

**Esperado:** sin filas (jugador no pertenece a Hack y sin grant para ese id).

Hack autenticado, jugador **propio** de Hack, `p_organizador_id` = Hack:

**Esperado:** historial de rating del jugador local.

## 6. Regresión app (manual)

- [ ] Login organizador con cedidos: ranking interno muestra puntos origen/local
- [ ] Ficha jugador autenticada: rating unificado e historial
- [ ] Ficha pública global (`visible_publico`): sigue con `obtenerHistorialRatingPublic` / RLS (sin RPC)
- [ ] `/public/jugadores?org=` sin login: ranking lista (fallback si RPC no disponible)
- [ ] Ranking Riviera global / ROMC sin cambios

## SQL — comprobar grants

```sql
SELECT p.proname, acl.privilege_type, acl.grantee
FROM pg_proc p
JOIN LATERAL aclexplode(p.proacl) acl ON true
JOIN pg_roles r ON r.oid = acl.grantee
WHERE p.proname IN (
  'riviera_rating_canonico_para_jugador',
  'riviera_rating_historial_unificado',
  'riviera_concedidos_ranking_enriquecimiento'
)
AND r.rolname IN ('anon', 'authenticated', 'public');
```

**Esperado:** `EXECUTE` solo para `authenticated` (no `anon`).
