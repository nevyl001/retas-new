import { GAME_MODES } from "../components/home/gameModesConfig";
import { getDuelos2v2 } from "../services/duelo2v2Service";
import type { Duelo2v2 } from "./duelo2v2/types";
import { getTournaments, Tournament } from "./database";
import { filterRetasForHomeDisplay } from "./gameModeMapping";
import {
  formatTournamentCourtsLabel,
  getTournamentCourtsCount,
  getTournamentGroupNames,
  getTournamentModeBadge,
  getTournamentStatusBadge,
  type TournamentModeBadge,
  type TournamentStatusBadge,
} from "./tournamentDisplay";

export type HomeRetaItem =
  | { kind: "tournament"; tournament: Tournament }
  | { kind: "duelo-2v2"; duelo: Duelo2v2 };

export type RetaFilterId = "all" | "active" | "finished";

export async function loadUserRetasForHome(userId: string): Promise<HomeRetaItem[]> {
  const [tournaments, duelos] = await Promise.all([
    getTournaments(userId).catch(() => [] as Tournament[]),
    getDuelos2v2().catch(() => [] as Duelo2v2[]),
  ]);

  const items: HomeRetaItem[] = [
    ...filterRetasForHomeDisplay(tournaments ?? []).map((tournament) => ({
      kind: "tournament" as const,
      tournament,
    })),
    ...(duelos ?? []).map((duelo) => ({
      kind: "duelo-2v2" as const,
      duelo,
    })),
  ];

  return items.sort(
    (a, b) =>
      new Date(getRetaCreatedAt(b)).getTime() - new Date(getRetaCreatedAt(a)).getTime()
  );
}

export function getRetaId(item: HomeRetaItem): string {
  return item.kind === "tournament" ? item.tournament.id : item.duelo.id;
}

export function getRetaCreatedAt(item: HomeRetaItem): string {
  return item.kind === "tournament" ? item.tournament.created_at : item.duelo.created_at;
}

export function getRetaName(item: HomeRetaItem): string {
  return item.kind === "tournament" ? item.tournament.name : item.duelo.nombre;
}

export function getRetaDescription(item: HomeRetaItem): string | null | undefined {
  return item.kind === "tournament"
    ? item.tournament.description
    : item.duelo.descripcion;
}

export function matchesRetaFilter(item: HomeRetaItem, filter: RetaFilterId): boolean {
  if (filter === "all") return true;
  if (item.kind === "tournament") {
    if (filter === "finished") return item.tournament.is_finished;
    return item.tournament.is_started && !item.tournament.is_finished;
  }
  if (filter === "finished") return item.duelo.estado === "finalizado";
  return item.duelo.estado === "en_juego" || item.duelo.estado === "configuracion";
}

export function getRetaModeBadge(item: HomeRetaItem): {
  variant: TournamentModeBadge;
  label: string;
} {
  if (item.kind === "duelo-2v2") {
    const config = GAME_MODES.find((m) => m.id === "duelo-2v2");
    return { variant: "mode-torneo", label: config?.title ?? "Duelo 2 vs 2" };
  }
  return getTournamentModeBadge(item.tournament);
}

export function getRetaStatusBadge(item: HomeRetaItem): {
  variant: TournamentStatusBadge;
  label: string;
} {
  if (item.kind === "duelo-2v2") {
    if (item.duelo.estado === "finalizado") {
      return { variant: "finished", label: "Finalizada" };
    }
    if (item.duelo.estado === "en_juego") {
      return { variant: "active", label: "En curso" };
    }
    return { variant: "pending", label: "Configuración" };
  }
  return getTournamentStatusBadge(item.tournament);
}

export function getRetaMetaLine(item: HomeRetaItem): string {
  if (item.kind === "duelo-2v2") {
    const d = item.duelo;
    const parejaA = `${d.pareja_a_j1_nombre} / ${d.pareja_a_j2_nombre}`;
    const parejaB = `${d.pareja_b_j1_nombre} / ${d.pareja_b_j2_nombre}`;
    if (d.estado === "finalizado") {
      return `${parejaA} vs ${parejaB} · ${d.sets_pareja_a}–${d.sets_pareja_b} sets`;
    }
    return `${parejaA} vs ${parejaB}`;
  }
  return formatTournamentCourtsLabel(getTournamentCourtsCount(item.tournament));
}

export function getRetaGroupNames(item: HomeRetaItem): string[] {
  if (item.kind === "tournament") {
    return getTournamentGroupNames(item.tournament);
  }
  return [];
}

export function isRetaActive(item: HomeRetaItem): boolean {
  if (item.kind === "duelo-2v2") return item.duelo.estado === "en_juego";
  return Boolean(item.tournament.is_started && !item.tournament.is_finished);
}

export function isRetaFinished(item: HomeRetaItem): boolean {
  if (item.kind === "duelo-2v2") return item.duelo.estado === "finalizado";
  return item.tournament.is_finished;
}
