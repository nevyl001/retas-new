import type { Tournament } from "./db/types";
import { resolveTournamentGameMode } from "./gameModeMapping";
import { navigateToAmericanoDinamico } from "./americanoDinamicoStorage";
import { navigateTorneoExpress } from "../components/torneo-express/torneoExpressNav";

export type AppTournamentRoute = "main" | "americano-dinamico" | "torneo-express";

export function getRouteForTournament(
  tournament: Pick<Tournament, "id" | "format">
): AppTournamentRoute {
  const mode = resolveTournamentGameMode(tournament);
  switch (mode) {
    case "americano":
      return "americano-dinamico";
    case "mini-torneo":
      return "torneo-express";
    default:
      return "main";
  }
}

export function continueTournament(
  tournament: Tournament,
  handlers: {
    userId: string;
    onSelectMain: (tournament: Tournament) => void;
  }
): void {
  const route = getRouteForTournament(tournament);

  switch (route) {
    case "americano-dinamico":
      navigateToAmericanoDinamico(tournament.id, handlers.userId);
      break;
    case "torneo-express":
      navigateTorneoExpress(`/torneo-express/${tournament.id}/gestionar`);
      break;
    default:
      handlers.onSelectMain(tournament);
  }
}
