# Convocatoria Riviera — Servicio global

## 1. Mapa de arquitectura

```text
                    ┌─────────────────────────────────────┐
                    │   Convocatoria Riviera (servicio)   │
                    │  UI: ConvocatoriaWhatsAppPanel      │
                    │  Lib: src/lib/retaAbierta/*         │
                    │  RPC: upsert / join / cancel /      │
                    │       promote / get / close         │
                    └──────────────┬──────────────────────┘
                                   │
         ┌─────────────┬───────────┼───────────┬──────────────┐
         ▼             ▼           ▼           ▼              ▼
   Reta equipos   Round Robin  Remontada   Americano     Duelo 2v2
   mode=reta      mode=reta    Final       mode=         mode=
                               mode=reta   americano     duelo_2v2
                               (mismo      entity=       entity=
                               tournament  tournaments   duelos_2v2
                               RR + champ)
```

**Regla:** un solo panel, un solo mensaje WhatsApp, un solo set de RPCs.
Los modos solo aportan adaptadores de contexto / sync de roster-slots.

### Identidad

Riviera ID → `_resolve_identity_by_riviera_id` → membership `organizer_player_access`
(`joined_via=registration`) + clon local. **Sin** puntos / rating / participaciones al unirse.

### Slug

Generado **una vez** en INSERT de `upsert_open_game_registration` vía `_tor_open_reg_slug()`.
`ON CONFLICT (mode_type, entity_id)` **no** regenera slug.

### Cierre al iniciar

`close_open_game_registration` + cliente `closeOpenGameRegistration`:
- Reta / RR / Remontada: `useTournamentActions.startTournament`
- Americano: `AmericanoDinamicoScreen.handleStartTournament`
- Duelo: `startDuelo2v2` (reutiliza borrador `configuracion` → `en_juego`)

Join rechaza si el juego ya empezó (`is_started` / `en_juego`) o status `closed`.

---

## 2. Tabla de cobertura

| Modo (producto) | Pantalla | Entidad | Participantes | RPC comunes | Adaptador sync | Estado | Cobertura |
|-----------------|----------|---------|---------------|-------------|----------------|--------|-----------|
| Reta por Equipos | TournamentDetails + RetaMobile | `tournaments` | Pool entries → admin arma parejas | upsert/join/cancel/promote/get/close | ninguno (pool) | ✅ | CTA + backend `reta` |
| Round Robin | mismas | `tournaments` format=round_robin | Pool → parejas | mismas | ninguno | ✅ | mode_type=`reta` |
| Remontada Final | mismas (championshipEnabled) | mismo tournament RR | Pool → parejas → championship | mismas | ninguno | ✅ | Headline producto; **no** mode_type propio |
| Americano | AmericanoDinamicoScreen | `tournaments` | Roster | mismas | `_open_reg_sync_americano_roster` | ✅ | |
| Duelo 2 vs 2 | Nuevo + Gestionar | `duelos_2v2` | 4 slots | mismas | `_open_reg_sync_duelo_slots` | ✅ | start reutiliza draft |
| Liga | — | — | — | **rechazo RPC** | — | ❌ | UI + `_assert_convocatoria_mode_allowed` |
| Torneo / mini-torneo | — | — | — | **rechazo RPC** | — | ❌ | |
| Torneo Express | — | — | — | **rechazo RPC** | — | ❌ | |

### Confirmación Round Robin

`mode_type = 'reta'` (no existe `round_robin` en open registration).

### Confirmación Remontada Final

No es entidad ni modo de convocatoria aparte. Es la fase championship del Round Robin
(`loadChampionshipConfig` / `championshipEnabled`). Misma convocatoria `reta` del torneo padre.

---

## 3. Inclusiones / exclusiones

✅ Reta · Round Robin · Americano · Duelo 2 vs 2 · Remontada Final  
❌ Liga · Torneo · Torneo Express  

UI: no monta `ConvocatoriaWhatsAppPanel`.  
Backend: `_assert_convocatoria_mode_allowed` + CHECK `mode_type IN ('reta','americano','duelo_2v2')`.

---

## 4. Archivos clave

**Común**
- `src/components/reta-abierta/ConvocatoriaWhatsAppPanel.tsx`
- `src/lib/retaAbierta/*` (service, whitelist, adapters, errors, whatsapp, realtime)
- `supabase/convocatoria-riviera-generalize.sql`
- `supabase/convocatoria-riviera-rpcs.sql`

**SQL preparado (no ejecutado por el agente)**
1. `supabase/sql/hotfix-pgcrypto-extensions-schema.sql`
2. `supabase/sql/patch-convocatoria-servicio-global.sql`
3. `supabase/sql/verify-convocatoria-riviera.sql`
4. `supabase/sql/rollback-convocatoria-riviera.sql`

**Orden apply staging**
1. `reta-abierta-open-registration.sql` (si v1 ausente)
2. `convocatoria-riviera-generalize.sql`
3. `convocatoria-riviera-rpcs.sql`
4. `patch-convocatoria-servicio-global.sql` (si rpcs previos ya corrían)
5. `verify-convocatoria-riviera.sql`

---

## 5. UX

Errores técnicos (`gen_random_bytes`, PGRST, etc.) →  
**"No pudimos crear la convocatoria. Intenta nuevamente."**  
(`mapConvocatoriaUserError`)

---

## 6. Confirmaciones de proceso

- Sin commit.
- Sin deploy.
- Sin ejecutar SQL.
- Sin modificar producción.
