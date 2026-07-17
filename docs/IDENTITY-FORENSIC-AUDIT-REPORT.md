# IDENTITY FORENSIC AUDIT REPORT

**Proyecto:** Riviera Open (padel-app)  
**Dominio:** identidad multi-club / proyecciones legacy / carrera  
**Fecha de cierre del audit (herramientas):** 2026-07-17  
**Estado del documento:** cierre de Fase 1 + Fase 1.5 (medición). Atribución forense por grupo = fase siguiente.

---

## 1. Resumen ejecutivo

### Objetivo del audit

Determinar si, en producción, existen casos históricos donde **dos o más** `public.riviera_jugadores.id` distintos comparten la misma proyección legacy (`legacy_player_id` y/o `legacy_liga_jugador_id`), y si esa fusión es:

1. **solo estructural** (proyección compartida indebida), o  
2. ya **contaminó carrera** (`jugador_participaciones`, `rating_historial`, `riviera_official_points_ledger`) y/o historial operativo (pairs / liga_*).

El bug **nuevo** de sobrescritura cross-org de legacy al seleccionar concedidos ya fue bloqueado en código (Bloque 1 Reta + Fase 3 modos). Este audit midió **daño histórico**, no reabrió ese bug.

### Metodología

| Fase | Qué se hizo | Artefacto (congelado) |
|------|-------------|------------------------|
| **Fase 1** | Inventario de esquema real (repo: SQL, servicios, tipos). Mapa de referencias fuertes a `riviera_jugadores.id`, `players.id`, `liga_jugadores.id`. | Entrega en conversación (tablas A–E); sin SQL de reparación |
| **Fase 1.5** | Medición de impacto de fusiones: inventario de grupos, conteos de referencias, clasificación de carrera por grupo (`UNKNOWN` / `SINGLE_OWNER` / `MULTI_OWNER`). Validación previa vía `information_schema`. | `supabase/audit-fase15-impacto-fusiones-readonly.sql` |
| **Forense 1-grupo** | Dump read-only de filas reales para un `group_key` (preparado; atribución = fase 2). | `supabase/audit-forense-un-grupo-readonly.sql` |

Clasificación de capas (Fase 1.5):

- **SOLO_PLAYERS** — ≥2 Riviera IDs → mismo `legacy_player_id`; el set de IDs **no** coincide exactamente con un grupo Liga.
- **SOLO_LIGA** — ≥2 Riviera IDs → mismo `legacy_liga_jugador_id`; set no idéntico a un grupo players.
- **PLAYERS_Y_LIGA (JOINT)** — mismos sets de `riviera_jugadores.id` en ambas capas (arrays iguales).

Clasificación de carrera (por grupo; **no** es atribución de propiedad):

- **UNKNOWN** — ningún miembro del grupo tiene filas en participaciones / rating / ledger.
- **SINGLE_OWNER** — exactamente un `riviera_jugadores.id` del grupo tiene carrera.
- **MULTI_OWNER** — dos o más tienen carrera → **mezcla potencial**.

### Restricciones (read only)

Durante todo el audit de datos:

- Solo `SELECT` / `WITH` / `information_schema` / `to_regclass`.
- `BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK;` en scripts de impacto/forense.
- Prohibido: INSERT, UPDATE, DELETE, DDL, migraciones, RPC de escritura, commit, deploy, SQL de reparación.

### Criterio de identidad

```text
Identidad canónica = public.riviera_jugadores.id
```

- Nombre, slug, email y similitud textual = **display**, nunca identidad.
- Dos `riviera_jugadores.id` distintos **nunca** deben compartir la misma proyección legacy.
- Evidencia fuerte admitida: IDs Riviera, OPA (`jugador_id` / `local_jugador_id`), `legacy_player_id`, `legacy_liga_jugador_id`, IDs de evento/liga/pareja/equipo/inscripción, columnas FK de carrera/ledger.

### Evidencia utilizada

1. Contexto confirmado por ejecución previa del audit de fusiones (capa players / capa Liga).  
2. Resultado cualitativo de Fase 1.5 en producción: existen grupos **SINGLE_OWNER** y **MULTI_OWNER**.  
3. Priorización explícita del grupo `liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179` como **MULTI_OWNER** con mayor volumen de carrera.  
4. Inventario de esquema Fase 1 (columnas reales, p. ej. ledger = `source_local_jugador_id`).  
5. Endurecimiento de código (Bloque 1 + Fase 3) como control de regresión — **no** como reparación de datos.

**Límite de evidencia en este cierre:** los result sets tabulares completos de `groups_inventory` / `impact_by_group` / `career_counts_per_riviera_id` (todos los `group_key` + conteos por ID) **no quedaron pegados íntegros** en el hilo tras la ejecución exitosa de Fase 1.5. Por honestidad forense, las secciones 2–4 distinguen **confirmado** vs **pendiente de volcado**.

---

## 2. Hallazgos

### 2.1 Cantidades confirmadas (capa)

| Métrica | Valor confirmado | Fuente |
|---------|------------------|--------|
| Grupos con ≥2 Riviera → mismo `legacy_player_id` | **6** | Contexto de producción (pre–Fase 1.5) |
| Grupos con ≥2 Riviera → mismo `legacy_liga_jugador_id` | **6** | Idem |
| `riviera_jugadores` excedentes (capa players) | **6** | Idem (`count(id) − count(DISTINCT legacy)` por capa) |
| `riviera_jugadores` excedentes (capa Liga) | **6** | Idem |

**Nota:** 6 + 6 **no** implica 12 fusiones distintas. JOINT (mismos sets de Riviera IDs en ambas capas) reduce el número de fusiones lógicas. El emparejamiento JOINT **solo** es válido si `riviera_ids` players ≡ `riviera_ids` Liga.

### 2.2 Por `layer_class` (Fase 1.5)

| Clase | Estado en este cierre |
|-------|------------------------|
| **SOLO_PLAYERS** | Detectables por diseño del SQL; **conteo exacto no archivado en este documento** (falta volcado `groups_inventory`). |
| **SOLO_LIGA** | Idem. Al menos **1** confirmado por priorización: `liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179`. |
| **PLAYERS_Y_LIGA (JOINT)** | Posible; **no asumir** que los 6+6 son JOINT. Conteos exactos pendientes de volcado. |

### 2.3 Por clasificación de carrera (Fase 1.5)

| Clase | Estado en este cierre |
|-------|------------------------|
| **UNKNOWN** | Posible en el SQL; presencia no cuantificada aquí. |
| **SINGLE_OWNER** | **Confirmado que existen** (ejecución Fase 1.5 en prod). |
| **MULTI_OWNER** | **Confirmado que existen**; al menos el grupo `liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179`. |

### 2.4 Grupo priorizado (único `group_key` nominado)

| Campo | Valor |
|-------|--------|
| `group_key` | `liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179` |
| `legacy_liga_jugador_id` | `8e3158a6-6180-4bd3-91c3-bb41e56a0179` |
| Capa | **SOLO_LIGA** (formato `liga:`) — sin afirmar JOINT hasta cruzar sets |
| Carrera (Fase 1.5) | **MULTI_OWNER** |
| Motivo de prioridad | Mayor cantidad de carrera entre MULTI_OWNER (confirmación operativa) |
| Atribución fila a fila | **No cerrada** — faltan result sets del forense 1-grupo en el hilo |

### 2.5 Bug nuevo vs histórico

| Tema | Estado |
|------|--------|
| Sobrescritura cross-org de `legacy_player_id` en selección Reta | **Bloqueado en código** (Bloque 1) |
| Same pattern en Americano / Liga / TE / Duelo (ensure local) | **Endurecido en código** (Fase 3); residual nombre en cierre documentado |
| Datos históricos ya fusionados | **No reparados**; solo medidos |

---

## 3. Riesgos

Criterio usado:

| Nivel | Criterio |
|-------|----------|
| **BAJO** | Fusión estructural sin carrera en ningún miembro (`UNKNOWN`), o solo proyección sin historial de pairs/liga. |
| **MEDIO** | Carrera en exactamente un Riviera ID (`SINGLE_OWNER`) **o** historial operativo (pairs/liga) sin carrera Riviera. No prueba todavía atribución correcta. |
| **ALTO** | Carrera en ≥2 Riviera IDs del mismo grupo (`MULTI_OWNER`) → riesgo de mezcla / doble conteo / atribución incorrecta. |

### Grupos

| Grupo | Riesgo | Por qué |
|-------|--------|---------|
| `liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179` | **ALTO** | Confirmado **MULTI_OWNER** + mayor carrera; capa Liga implica impacto potencial en `liga_*` + carrera Riviera. |
| Resto de grupos Fase 1.5 (5–11 fusiones lógicas según JOINT) | **ALTO / MEDIO / BAJO** según clase | **Clasificación individual pendiente** de volcar `impact_summary` / `impact_by_group` al archivo de evidencia. Existencia de **SINGLE_OWNER** y **MULTI_OWNER** confirma que hay al menos un ALTO adicional o el mismo, y varios MEDIO posibles. |
| Grupos `UNKNOWN` (si los hay) | **BAJO** (carrera) / **MEDIO** (estructura) | Estructura indebida sigue violando invariante; reparación de proyección puede ser más segura si no hay carrera. |

**Regla de oro:** `SINGLE_OWNER` **no** significa “el dueño correcto”. Solo significa “la carrera está concentrada en un ID”. La atribución forense (OPA, timestamps, eventos) es la fase siguiente.

---

## 4. Estado de la carrera

Solo IDs. Sin nombres.

### 4.1 Grupo priorizado

| `group_key` | participaciones | rating | ledger | Distribución |
|-------------|-----------------|--------|--------|--------------|
| `liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179` | *(conteos por `riviera_jugadores.id` no archivados en hilo)* | idem | idem | **distribuida** (definición Fase 1.5: MULTI_OWNER = ≥2 IDs con carrera) |

Los `riviera_jugadores.id` miembros de este grupo **no** se listan aquí hasta tener el dump forense / `groups_inventory` pegado (evitar inventar UUIDs).

### 4.2 Resto de grupos

| `group_key` | participaciones / rating / ledger | Distribución |
|-------------|-------------------------------------|--------------|
| *(pendiente volcado Fase 1.5)* | pendiente | `UNKNOWN` / `SINGLE_OWNER` (= concentrada) / `MULTI_OWNER` (= distribuida) según result set |

**Definiciones usadas en esta sección:**

- **concentrada** ≡ `SINGLE_OWNER`  
- **distribuida** ≡ `MULTI_OWNER`  
- **desconocida** ≡ `UNKNOWN` **o** result set no archivado  

---

## 5. Conclusiones

### ¿La corrupción es estructural?

**Sí, en parte.**  
Compartir `legacy_player_id` o `legacy_liga_jugador_id` entre ≥2 `riviera_jugadores.id` viola el invariante de proyección (1 Riviera ID → 1 proyección legacy por capa). Eso es corrupción **estructural** de identidad operativa, independiente de si la carrera ya se mezcló.

### ¿Existe mezcla de carrera?

**Sí, al menos potencial confirmada.**  
La clase **MULTI_OWNER** existe en producción. Eso significa que **dos o más** Riviera IDs del mismo grupo de fusión tienen filas en participaciones y/o rating y/o ledger. Eso **no** cierra todavía “quién es el dueño correcto”, pero **sí** demuestra que la carrera no está vacía ni concentrada en un solo ID en esos grupos.

El grupo `liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179` es el caso **ALTO** priorizado.

### ¿Cuántos grupos requieren investigación adicional?

| Tipo | Estimación en este cierre |
|------|---------------------------|
| Investigación forense 1-grupo (atribución) | **Todos** los grupos con fusión (hasta 12 capas / menos si JOINT); **mínimo 1** ya priorizado |
| Investigación inmediata (ALTO / MULTI_OWNER) | **≥1** confirmado; número exacto de MULTI_OWNER pendiente de volcado |
| Revisión de SINGLE_OWNER | Todos los SINGLE_OWNER (existencia confirmada; conteo pendiente) — verificar que el ID con carrera es el correcto vía OPA/eventos |

### ¿Cuántos parecen reparables sin tocar carrera?

**Solo candidatos `UNKNOWN` (sin carrera)** podrían, en principio, repararse a nivel de proyección legacy **sin** mover participaciones/rating/ledger.  
Cantidad exacta de `UNKNOWN`: **no archivada en este documento**.  

Grupos **SINGLE_OWNER** y **MULTI_OWNER** **no** se consideran “reparables sin tocar carrera” hasta completar atribución: pueden requerir remapeo o consolidación de historial.

### Por qué aún no se reparó nada

1. El bug de escritura nueva ya está mitigado en código.  
2. La reparación de datos históricos es irreversible si se hace mal (pérdida o doble conteo de carrera).  
3. Falta atribución forense por IDs (OPA, timeline, eventos) grupo a grupo.  
4. Política explícita: **medir → atribuir → diseñar reparación reversible → validar → rollback** antes de cualquier DML.

---

## 6. Próxima fase

Estrategia únicamente (sin SQL, sin UPDATE/DELETE, sin migraciones):

1. **Atribución definitiva (1 grupo por ejecución)**  
   Usar el forense congelado `audit-forense-un-grupo-readonly.sql` (mismo criterio para todos).  
   Empezar por `liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179`.  
   Clasificar cada fila: `ATRIBUIBLE_RJ_<uuid>` / `COMPARTIDA_POR_DISENO` / `NO_ATRIBUIBLE` solo con IDs fuertes.

2. **Diseño de reparación reversible**  
   Plan por grupo: qué proyección conservar, qué Riviera ID es canónico/local, qué historial mover o dejar.  
   Cada paso debe ser reversible (backup lógico / tabla de auditoría / orden de undo documentado).

3. **Validaciones**  
   Pre/post: conteos de carrera, ausencia de fusiones residuales, OPA coherente, no doble ledger.

4. **Rollback**  
   Procedimiento explícito si una reparación falla validación — sin “arreglar en caliente” el siguiente grupo.

**No** se escribe SQL de cambio en esta fase de documentación.

---

## 7. Estado

```text
AUDIT COMPLETADO

SIN MODIFICAR PRODUCCIÓN
SIN SQL DE CAMBIO
SIN PÉRDIDA DE INFORMACIÓN
SIN COMMIT
SIN DEPLOY
```

### Artefactos congelados (no modificar)

| Archivo | Rol |
|---------|-----|
| `supabase/audit-fase15-impacto-fusiones-readonly.sql` | Impacto global de fusiones |
| `supabase/audit-forense-un-grupo-readonly.sql` | Dump forense 1 `group_key` + `AUDIT_STATUS` |
| `supabase/audit-fase3-liga-y-fusiones-nombre-readonly.sql` | Detección inicial de fusiones |
| `supabase/audit-reta-link-legacy-cross-org-duplicates-readonly.sql` | Audit Reta/legacy cross-org |

### Código relacionado (fuera del audit de datos; no es reparación)

| Área | Doc / código |
|------|----------------|
| Bloque 1 Reta | `docs/reta-link-legacy-block1-status.md` |
| Fase 3 modos | `docs/fase3-modos-identity-status.md` |

### Pendiente explícito (siguiente trabajo, no este audit)

- Volcar/archivar result sets completos de Fase 1.5 (`groups_inventory`, `impact_by_group`, `impact_summary`, `career_counts_per_riviera_id`) junto a este informe.  
- Completar atribución forense del grupo `liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179` y luego el resto, un grupo por vez.  
- Solo después: diseño de reparación reversible.

---

*Fin del informe de cierre del audit forense de identidad. Ninguna reparación de producción ha sido aplicada.*
