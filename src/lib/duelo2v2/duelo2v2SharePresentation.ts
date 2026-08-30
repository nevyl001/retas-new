import type { Duelo2v2SetDetalle } from "./types";
import type { PublicRetaWinnerAvatar } from "../../components/public/PublicRetaWinnerSection";
import { computeDueloScore } from "./scoring";

export const DUELO2V2_SHARE_WIDTH = 1080;
export const DUELO2V2_SHARE_HEIGHT = 1920;

export type Duelo2v2SharePlace = "winner" | "runner-up";

export type Duelo2v2SharePlayer = {
  id: string;
  name: string;
  fotoUrl: string | null;
  rating?: number | null;
};

export type Duelo2v2ShareSetRow = {
  label: string;
  score: string;
};

export type Duelo2v2SharePresentation = {
  place: Duelo2v2SharePlace;
  positionLabel: string;
  badge: string;
  headline: string;
  teamName: string;
  players: Duelo2v2SharePlayer[];
  setsWin: number;
  setsLoss: number;
  setRows: Duelo2v2ShareSetRow[];
  gamesTotal: string | null;
  message: string;
  dueloNombre: string;
  clubName: string;
  clubLogoUrl: string | null;
  showMotherAttribution: boolean;
};

function toSharePlayer(player: PublicRetaWinnerAvatar): Duelo2v2SharePlayer {
  return {
    id: player.jugadorId ?? player.name,
    name: player.name,
    fotoUrl: player.fotoUrl ?? null,
    rating: player.rating ?? null,
  };
}

function buildSetRows(
  detalle: Duelo2v2SetDetalle[],
  setOutcomes: ReturnType<typeof computeDueloScore>["setOutcomes"],
): Duelo2v2ShareSetRow[] {
  return detalle
    .map((row, index) => ({
      row,
      index,
      outcome: setOutcomes[index] ?? "incompleto",
    }))
    .filter(({ outcome }) => outcome !== "incompleto")
    .map(({ row, index }) => ({
      label: `Set ${String(index + 1).padStart(2, "0")}`,
      score: `${row.a}–${row.b}`,
    }));
}

export function createDuelo2v2SharePresentation(input: {
  place: Duelo2v2SharePlace;
  teamName: string;
  players: PublicRetaWinnerAvatar[];
  setsWin: number;
  setsLoss: number;
  detalle: Duelo2v2SetDetalle[];
  setOutcomes: ReturnType<typeof computeDueloScore>["setOutcomes"];
  gamesWin: number;
  gamesLoss: number;
  message: string;
  dueloNombre: string;
  clubName: string;
  clubLogoUrl: string | null;
  showMotherAttribution: boolean;
}): Duelo2v2SharePresentation {
  const isWinner = input.place === "winner";
  return {
    place: input.place,
    positionLabel: isWinner ? "1.er LUGAR" : "2.º LUGAR",
    badge: isWinner ? "Ganadores" : "Segundo lugar",
    headline: isWinner ? "¡Felicidades!" : "Sigue adelante",
    teamName: input.teamName,
    players: input.players.map(toSharePlayer),
    setsWin: input.setsWin,
    setsLoss: input.setsLoss,
    setRows: buildSetRows(input.detalle, input.setOutcomes),
    gamesTotal:
      input.gamesWin > 0 || input.gamesLoss > 0
        ? `${input.gamesWin}–${input.gamesLoss} juegos totales`
        : null,
    message: input.message,
    dueloNombre: input.dueloNombre,
    clubName: input.clubName,
    clubLogoUrl: input.clubLogoUrl,
    showMotherAttribution: input.showMotherAttribution,
  };
}

export function duelo2v2ShareFileName(data: Duelo2v2SharePresentation): string {
  const slug = `${data.dueloNombre}-${data.positionLabel}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `duelo-2v2-${slug || "resultado"}.png`;
}
