# RIVIERA 2.1.3 — UI mínima agregar jugador existente — Checklist

**Componente:** `src/components/jugadores/AgregarJugadorExistenteModal.tsx`  
**Integración:** `src/components/jugadores/JugadoresLista.tsx`  
**Servicios:** `src/lib/rivieraJugadores/playerMembership.ts`  
**Prerrequisitos:** SQL 2.1.2 desplegado + al menos un jugador con `riviera_id`

---

## Alcance

| Incluido | Excluido |
|----------|----------|
| Modal en Registro de jugadores | Búsqueda por nombre/correo/teléfono |
| Flujo resolve → preview → add | QR |
| Sync pool legacy/liga post-add | Ranking / rating / torneos |
| Errores legibles | Perfil público |

---

## Flujo manual

### U1 — Abrir modal
- [ ] Ir a **Registro de jugadores** (`/jugadores/...`)
- [ ] Botón **Agregar jugador existente** visible junto a «+ Nuevo jugador»
- [ ] Modal abre con título y campo Riviera ID

### U2 — Formato inválido
- [ ] Ingresar `RIV-1` o `riv-00000001` → error de formato
- [ ] No llama RPC (network tab)

### U3 — ID inexistente
- [ ] Ingresar `RIV-99999999` (válido formato, no en DB)
- [ ] Clic **Buscar jugador** → mensaje «No encontramos…»
- [ ] Sin preview

### U4 — Preview encontrado
- [ ] Ingresar Riviera ID real (ej. de staging)
- [ ] Preview muestra: nombre, Riviera ID, Organizador de Registro
- [ ] Estado «Disponible para agregar»

### U5 — Agregar
- [ ] Clic **Agregar a mi organizador**
- [ ] Mensaje de éxito
- [ ] Modal se cierra
- [ ] Jugador aparece en lista del registro (badge cedido si aplica)
- [ ] Disponible en retas/liga (pool legacy sincronizado)

### U6 — Ya miembro
- [ ] Repetir U4+U5 con mismo ID
- [ ] Preview: «Ya pertenece a tu organizador»
- [ ] Botón deshabilitado / error si se intenta add

### U7 — Propio registro
- [ ] Como org de registro del jugador, intentar add su propio ID
- [ ] Error limpio (RPC: organizador de registro)

### U8 — Regresión
- [ ] Crear jugador nuevo (modal existente) sigue funcionando
- [ ] Búsqueda por nombre en lista local sin cambios
- [ ] Torneos/retas sin cambios de código

---

## Tests automáticos

```bash
npm test -- playerMembership --watchAll=false
```

- [ ] `mapPlayerMembershipUiError` cubre errores comunes
- [ ] Tests 2.1.2 siguen green

---

## Archivos entregados

| Archivo | Acción |
|---------|--------|
| `src/components/jugadores/AgregarJugadorExistenteModal.tsx` | Creado |
| `src/components/jugadores/JugadoresLista.tsx` | Botón + modal + pool sync |
| `src/components/jugadores/riviera-jugadores.css` | Estilos preview |
| `src/lib/rivieraJugadores/playerMembership.ts` | `mapPlayerMembershipUiError` |
| `src/lib/rivieraJugadores/playerMembership.test.ts` | Tests error mapper |
| `docs/RIVIERA-PLAYER-MEMBERSHIP-2.1.3-CHECKLIST.md` | Este doc |

---

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| 0 jugadores con `riviera_id` en prod | Probar en staging primero; assign via ensure |
| RPC 2.1.2 no desplegada | Error RPC en UI; desplegar SQL antes |
| Clon local sin legacy player | `ensureLegacyPlayerForRivieraJugador` en onAdded |
| Género tabs filtran lista | Clon hereda género del origen; verificar tab correcto |
| Usuario confunde con búsqueda nombre | Copy explícito en modal |
| Enumeración IDs | Solo preview tras ID exacto ingresado |

---

## Criterios de aceptación

- [ ] Flujo U1–U7 PASS en staging
- [ ] Sin búsqueda por nombre en modal
- [ ] Tests TS green
- [ ] Sin cambios torneos/rating/ranking
