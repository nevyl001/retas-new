# Reta Abierta (v1) → Convocatoria Riviera

La implementación se generalizó. Documentación actual:

→ [`docs/CONVOCATORIA-RIVIERA.md`](./CONVOCATORIA-RIVIERA.md)

Compatibilidad:

- Slugs `/reta-abierta/:slug` siguen funcionando.
- Ruta canónica nueva: `/jugar/:slug`.
- Tablas: mismas `tournament_open_registration(+_entries)` evolucionadas con `mode_type` / `entity_id`.
