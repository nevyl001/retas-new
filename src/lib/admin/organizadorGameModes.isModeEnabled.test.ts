import {
  isGameModeEnabled,
  rowToEnabledModes,
  DEFAULT_ORGANIZADOR_GAME_MODES,
} from "./organizadorGameModes";
import type { GameModeId } from "../../components/home/gameModesConfig";

describe("isGameModeEnabled — sin flash de bloqueo en home", () => {
  it("mientras modes es null (carga), NO bloquea ningún modo", () => {
    const ids: GameModeId[] = [
      "reta-equipos",
      "round-robin",
      "americano",
      "mini-torneo",
      "liga",
      "duelo-2v2",
    ];
    for (const id of ids) {
      expect(isGameModeEnabled(null, id)).toBe(true);
      expect(isGameModeEnabled(undefined, id)).toBe(true);
    }
  });

  it("con mapa cargado respeta false explícito (cuenta restringida)", () => {
    const modes = rowToEnabledModes(DEFAULT_ORGANIZADOR_GAME_MODES);
    expect(isGameModeEnabled(modes, "round-robin")).toBe(true);
    expect(isGameModeEnabled(modes, "duelo-2v2")).toBe(true);
    expect(isGameModeEnabled(modes, "reta-equipos")).toBe(false);
    expect(isGameModeEnabled(modes, "americano")).toBe(false);
    expect(isGameModeEnabled(modes, "liga")).toBe(false);
  });

  it("cuenta premium (todos true) permanece desbloqueada", () => {
    const premium: Record<GameModeId, boolean> = {
      "reta-equipos": true,
      "round-robin": true,
      americano: true,
      "mini-torneo": true,
      liga: true,
      "duelo-2v2": true,
    };
    for (const id of Object.keys(premium) as GameModeId[]) {
      expect(isGameModeEnabled(premium, id)).toBe(true);
    }
  });
});
