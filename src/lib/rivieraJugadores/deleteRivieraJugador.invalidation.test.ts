jest.mock("../supabaseClient", () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
  supabasePublicRead: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("./organizerPlayerAccess", () => ({
  isRevokedGrantLocalJugador: jest.fn().mockResolvedValue(false),
  findGrantedAccessMetaForJugador: jest.fn().mockResolvedValue(null),
}));

import { supabase } from "../supabaseClient";
import { deleteRivieraJugador } from "./rivieraJugadoresService";
import {
  clearPlayersPoolCacheForTests,
  buildRivieraListCacheKey,
  getCachedRivieraJugadoresList,
  setCachedRivieraJugadoresList,
} from "./playersPoolCache";
import {
  clearCareerIdentityCache,
  getOrLoadCareerIdentityBundle,
  type CareerIdentityBundle,
} from "./careerIdentityCache";
import type { RivieraJugadorWithStats } from "./types";

const ORG = "11111111-1111-4111-8111-111111111111";
const J_ORIGIN = "22222222-2222-4222-8222-222222222222";
const J_CLONE_A = "33333333-3333-4333-8333-333333333333";
const J_CLONE_B = "44444444-4444-4444-8444-444444444444";
const OTHER_PLAYER_UNTOUCHED = "55555555-5555-4555-8555-555555555555";

function bundle(): CareerIdentityBundle {
  return { identity: {} as unknown as CareerIdentityBundle["identity"], participaciones: [] };
}

function jugador(id: string, org: string): RivieraJugadorWithStats {
  return { id, nombre: id, organizador_id: org } as RivieraJugadorWithStats;
}

describe("deleteRivieraJugador invalida jugador origen y clones reportados", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPlayersPoolCacheForTests();
    clearCareerIdentityCache();
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: ORG } },
    });
  });

  it("invalida el origen y los clones listados en payload.details (RPC cascada)", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        status: "deleted",
        details: [{ jugador_id: J_CLONE_A }, { jugador_id: J_CLONE_B }],
      },
      error: null,
    });

    const key = buildRivieraListCacheKey(ORG);
    setCachedRivieraJugadoresList(key!, [jugador(J_ORIGIN, ORG)]);

    await getOrLoadCareerIdentityBundle(ORG, J_ORIGIN, jest.fn().mockResolvedValue(bundle()));
    await getOrLoadCareerIdentityBundle(ORG, J_CLONE_A, jest.fn().mockResolvedValue(bundle()));
    await getOrLoadCareerIdentityBundle(ORG, J_CLONE_B, jest.fn().mockResolvedValue(bundle()));
    await getOrLoadCareerIdentityBundle(
      ORG,
      OTHER_PLAYER_UNTOUCHED,
      jest.fn().mockResolvedValue(bundle())
    );

    await deleteRivieraJugador(ORG, J_ORIGIN);

    expect(getCachedRivieraJugadoresList(key!)).toBeNull();

    const loaderOrigin = jest.fn().mockResolvedValue(bundle());
    const loaderCloneA = jest.fn().mockResolvedValue(bundle());
    const loaderCloneB = jest.fn().mockResolvedValue(bundle());
    const loaderUntouched = jest.fn().mockResolvedValue(bundle());

    await getOrLoadCareerIdentityBundle(ORG, J_ORIGIN, loaderOrigin);
    await getOrLoadCareerIdentityBundle(ORG, J_CLONE_A, loaderCloneA);
    await getOrLoadCareerIdentityBundle(ORG, J_CLONE_B, loaderCloneB);
    await getOrLoadCareerIdentityBundle(ORG, OTHER_PLAYER_UNTOUCHED, loaderUntouched);

    expect(loaderOrigin).toHaveBeenCalledTimes(1);
    expect(loaderCloneA).toHaveBeenCalledTimes(1);
    expect(loaderCloneB).toHaveBeenCalledTimes(1);
    // No hay clear total: un jugador ajeno al borrado sigue en caché.
    expect(loaderUntouched).not.toHaveBeenCalled();
  });

  it("invalida al menos el origen cuando la RPC no reporta detalles de clones", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { status: "deleted" },
      error: null,
    });

    await getOrLoadCareerIdentityBundle(ORG, J_ORIGIN, jest.fn().mockResolvedValue(bundle()));

    await deleteRivieraJugador(ORG, J_ORIGIN);

    const loaderOrigin = jest.fn().mockResolvedValue(bundle());
    await getOrLoadCareerIdentityBundle(ORG, J_ORIGIN, loaderOrigin);
    expect(loaderOrigin).toHaveBeenCalledTimes(1);
  });
});
