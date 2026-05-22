import type { BadgeVariant } from "../ui";

export function torneoEstadoBadgeVariant(estado: string): BadgeVariant {
  if (estado === "en_curso") return "live";
  if (estado === "finalizado") return "finished";
  return "pending";
}
