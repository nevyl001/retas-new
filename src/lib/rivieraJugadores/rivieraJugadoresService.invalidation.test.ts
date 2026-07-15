if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.randomUUID) {
  // jsdom no expone crypto.randomUUID; solo se usa aquí para el id sintético
  // que genera adjustRankingPuntosManual, no afecta la lógica bajo prueba.
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => "00000000-0000-4000-8000-000000000000" },
    configurable: true,
  });
}

jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
  supabasePublicRead: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

import { supabase } from "../supabaseClient";
import {
  adjustRankingPuntosManual,
  registrarParticipacion,
} from "./rivieraJugadoresService";
import {
  buildRivieraListCacheKey,
  clearPlayersPoolCacheForTests,
  getCachedRivieraJugadoresList,
  setCachedRivieraJugadoresList,
} from "./playersPoolCache";
import {
  clearCareerIdentityCache,
  getOrLoadCareerIdentityBundle,
  type CareerIdentityBundle,
} from "./careerIdentityCache";
import type { RivieraJugadorWithStats } from "./types";

const mockRpc = supabase.rpc as jest.Mock;

function jugador(id: string): RivieraJugadorWithStats {
  return { id, nombre: id, organizador_id: "org-1" } as RivieraJugadorWithStats;
}

function bundle(): CareerIdentityBundle {
  return {
    identity: {} as unknown as CareerIdentityBundle["identity"],
    participaciones: [],
  };
}

describe("rivieraJugadoresService invalidación de cachés", () => {
  beforeEach(() => {
    clearPlayersPoolCacheForTests();
    clearCareerIdentityCache();
    mockRpc.mockReset();
  });

  it("registrarParticipacion invalida careerIdentityCache del jugador", async () => {
    mockRpc.mockResolvedValue({ data: "part-1", error: null });

    await getOrLoadCareerIdentityBundle(
      "org-1",
      "j1",
      jest.fn().mockResolvedValue(bundle())
    );

    await registrarParticipacion({
      jugadorId: "j1",
      tipoEvento: "liga",
      eventoId: "evt-1",
      eventoNombre: "Prueba",
      resultado: "participación",
    });

    const loaderAfter = jest.fn().mockResolvedValue(bundle());
    await getOrLoadCareerIdentityBundle("org-1", "j1", loaderAfter);
    expect(loaderAfter).toHaveBeenCalledTimes(1);
  });

  it("adjustRankingPuntosManual invalida playersPoolCache y careerIdentityCache", async () => {
    mockRpc.mockResolvedValue({ data: "part-2", error: null });

    const key = buildRivieraListCacheKey("org-1");
    expect(key).toBeTruthy();
    setCachedRivieraJugadoresList(key!, [jugador("j1")]);
    expect(getCachedRivieraJugadoresList(key!)).not.toBeNull();

    await getOrLoadCareerIdentityBundle(
      "org-1",
      "j1",
      jest.fn().mockResolvedValue(bundle())
    );

    await adjustRankingPuntosManual("org-1", "j1", 50, "prueba", {
      bypassPermisoCheck: true,
    });

    expect(getCachedRivieraJugadoresList(key!)).toBeNull();

    const loaderAfter = jest.fn().mockResolvedValue(bundle());
    await getOrLoadCareerIdentityBundle("org-1", "j1", loaderAfter);
    expect(loaderAfter).toHaveBeenCalledTimes(1);
  });
});
