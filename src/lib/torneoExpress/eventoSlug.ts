/**
 * Slug base para Evento (UI pública).
 * No garantiza unicidad — la impone UNIQUE(slug) en `torneo_express_evento`.
 */
export function slugifyEvento(nombre: string): string {
  return (
    nombre
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "evento"
  );
}
