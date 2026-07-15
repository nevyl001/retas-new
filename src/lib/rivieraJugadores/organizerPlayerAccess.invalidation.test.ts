jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
  supabasePublicRead: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("../waitForSupabaseSession", () => ({
  waitForSupabaseSession: jest.fn().mockResolvedValue(undefined),
}));

import { supabase } from "../supabaseClient";
import {
  adminGrantOrganizerPlayerAccess,
  adminRevokeOrganizerPlayerAccess,
} from "./organizerPlayerAccess";
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

const SOURCE_ORG = "11111111-1111-4111-8111-111111111111";
const GRANTEE_ORG = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG_UNTOUCHED = "99999999-9999-4999-8999-999999999999";
const J_SOURCE = "33333333-3333-4333-8333-333333333333";
const J_LOCAL_CLONE = "44444444-4444-4444-8444-444444444444";
const OTHER_PLAYER_UNTOUCHED = "88888888-8888-4888-8888-888888888888";

function bundle(): CareerIdentityBundle {
  return { identity: {} as unknown as CareerIdentityBundle["identity"], participaciones: [] };
}

function jugador(id: string, org: string): RivieraJugadorWithStats {
  return { id, nombre: id, organizador_id: org } as RivieraJugadorWithStats;
}

describe("organizerPlayerAccess invalida cachés en grant/revoke", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPlayersPoolCacheForTests();
    clearCareerIdentityCache();
  });

  it("adminGrantOrganizerPlayerAccess invalida el jugador origen y el organizador receptor", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { granted: 1, reactivated: 0, skipped: 0 },
      error: null,
    });

    const keyGrantee = buildRivieraListCacheKey(GRANTEE_ORG);
    setCachedRivieraJugadoresList(keyGrantee!, [jugador(J_LOCAL_CLONE, GRANTEE_ORG)]);

    await getOrLoadCareerIdentityBundle(
      SOURCE_ORG,
      J_SOURCE,
      jest.fn().mockResolvedValue(bundle())
    );
    await getOrLoadCareerIdentityBundle(
      OTHER_ORG_UNTOUCHED,
      OTHER_PLAYER_UNTOUCHED,
      jest.fn().mockResolvedValue(bundle())
    );

    const result = await adminGrantOrganizerPlayerAccess([J_SOURCE], GRANTEE_ORG);
    expect(result.granted).toBe(1);

    // playersPoolCache del receptor: ya se invalidaba antes de esta tarea.
    expect(getCachedRivieraJugadoresList(keyGrantee!)).toBeNull();

    // Jugador origen: invalidado por id preciso.
    const loaderSource = jest.fn().mockResolvedValue(bundle());
    await getOrLoadCareerIdentityBundle(SOURCE_ORG, J_SOURCE, loaderSource);
    expect(loaderSource).toHaveBeenCalledTimes(1);

    // Otro organizador/jugador no relacionado: sigue en caché (no clear total).
    const loaderUntouched = jest.fn().mockResolvedValue(bundle());
    await getOrLoadCareerIdentityBundle(
      OTHER_ORG_UNTOUCHED,
      OTHER_PLAYER_UNTOUCHED,
      loaderUntouched
    );
    expect(loaderUntouched).not.toHaveBeenCalled();
  });

  it("adminGrantOrganizerPlayerAccess sin cambios (skipped) no invalida nada", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { granted: 0, reactivated: 0, skipped: 1 },
      error: null,
    });

    await getOrLoadCareerIdentityBundle(
      SOURCE_ORG,
      J_SOURCE,
      jest.fn().mockResolvedValue(bundle())
    );

    await adminGrantOrganizerPlayerAccess([J_SOURCE], GRANTEE_ORG);

    const loaderSource = jest.fn().mockResolvedValue(bundle());
    await getOrLoadCareerIdentityBundle(SOURCE_ORG, J_SOURCE, loaderSource);
    expect(loaderSource).not.toHaveBeenCalled();
  });

  it("adminRevokeOrganizerPlayerAccess invalida origen y clon local cuando se conocen los ids", async () => {
    (supabase.from as jest.Mock).mockImplementation(() => {
      const chain: Record<string, jest.Mock> = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.maybeSingle = jest.fn().mockResolvedValue({
        data: {
          grantee_organizer_id: GRANTEE_ORG,
          jugador_id: J_SOURCE,
          local_jugador_id: J_LOCAL_CLONE,
        },
        error: null,
      });
      return chain;
    });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

    const keyGrantee = buildRivieraListCacheKey(GRANTEE_ORG);
    setCachedRivieraJugadoresList(keyGrantee!, [jugador(J_LOCAL_CLONE, GRANTEE_ORG)]);
    await getOrLoadCareerIdentityBundle(
      SOURCE_ORG,
      J_SOURCE,
      jest.fn().mockResolvedValue(bundle())
    );
    await getOrLoadCareerIdentityBundle(
      GRANTEE_ORG,
      J_LOCAL_CLONE,
      jest.fn().mockResolvedValue(bundle())
    );

    await adminRevokeOrganizerPlayerAccess("access-1");

    expect(getCachedRivieraJugadoresList(keyGrantee!)).toBeNull();

    const loaderSource = jest.fn().mockResolvedValue(bundle());
    const loaderLocal = jest.fn().mockResolvedValue(bundle());
    await getOrLoadCareerIdentityBundle(SOURCE_ORG, J_SOURCE, loaderSource);
    await getOrLoadCareerIdentityBundle(GRANTEE_ORG, J_LOCAL_CLONE, loaderLocal);
    expect(loaderSource).toHaveBeenCalledTimes(1);
    expect(loaderLocal).toHaveBeenCalledTimes(1);
  });

  it("una lectura (sin mutación) no invalida ninguna entrada", async () => {
    await getOrLoadCareerIdentityBundle(
      SOURCE_ORG,
      J_SOURCE,
      jest.fn().mockResolvedValue(bundle())
    );

    // Lectura pura: no debería tocar ninguna caché.
    const loaderAfterRead = jest.fn().mockResolvedValue(bundle());
    await getOrLoadCareerIdentityBundle(SOURCE_ORG, J_SOURCE, loaderAfterRead);
    expect(loaderAfterRead).not.toHaveBeenCalled();
  });
});
