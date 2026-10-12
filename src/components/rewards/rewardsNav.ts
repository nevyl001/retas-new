import { navigateAppTo, normalizeAppPathname } from "../../lib/appRouting";

export type RewardsArea = "campanas" | "premios" | "jugadores" | "estadisticas";

export function navigateRewards(path = "/rewards"): void {
  navigateAppTo(normalizeAppPathname(path));
}

export function isRewardsPath(pathname: string): boolean {
  const path = normalizeAppPathname(pathname);
  return path === "/rewards" || path.startsWith("/rewards/");
}

export function parseRewardsArea(pathname: string): RewardsArea {
  const path = normalizeAppPathname(pathname);
  if (path.endsWith("/premios")) return "premios";
  if (path.endsWith("/jugadores")) return "jugadores";
  if (path.endsWith("/estadisticas")) return "estadisticas";
  return "campanas";
}

export function rewardsAreaPath(area: RewardsArea): string {
  if (area === "campanas") return "/rewards";
  return `/rewards/${area}`;
}
