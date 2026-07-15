jest.mock("../supabaseClient", () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { supabase } from "../supabaseClient";
import {
  addOrganizerMembershipByRivieraId,
  leaveOrganizerMembership,
} from "./playerMembership";
import {
  clearPlayersPoolCacheForTests,
  getCachedRivieraJugadoresList,
  buildRivieraListCacheKey,
  setCachedRivieraJugadoresList,
} from "./playersPoolCache";
import {
  clearCareerIdentityCache,
  getOrLoadCareerIdentityBundle,
  type CareerIdentityBundle,
} from "./careerIdentityCache";
import type { RivieraJugadorWithStats } from "./types";

const CURRENT_ORG = "11111111-1111-4111-8111-111111111111";
const SOURCE_ORG = "22222222-2222-4222-8222-222222222222";
const J_LOCAL = "33333333-3333-4333-8333-333333333333";
const J_SOURCE = "44444444-4444-4444-8444-444444444444";

function bundle(): CareerIdentityBundle {
  return { identity: {} as unknown as CareerIdentityBundle["identity"], participaciones: [] };
}

function jugador(id: string, org: string): RivieraJugadorWithStats {
  return { id, nombre: id, organizador_id: org } as RivieraJugadorWithStats;
}

describe("playerMembership invalida cachés en vincular/salir", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPlayersPoolCacheForTests();
    clearCareerIdentityCache();
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: CURRENT_ORG } },
    });
  });

  it("addOrganizerMembershipByRivieraId invalida el clon local nuevo y el perfil origen", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        membership_id: "m1",
        local_jugador_id: J_LOCAL,
        source_jugador_id: J_SOURCE,
        riviera_id: "RIV-00000001",
        display_name: "Jugador Test",
        registration_organizer_id: SOURCE_ORG,
        created: true,
        reactivated: false,
        already_member: false,
        profile_link_created: false,
      },
      error: null,
    });

    const key = buildRivieraListCacheKey(CURRENT_ORG);
    setCachedRivieraJugadoresList(key!, [jugador(J_LOCAL, CURRENT_ORG)]);
    await getOrLoadCareerIdentityBundle(
      SOURCE_ORG,
      J_SOURCE,
      jest.fn().mockResolvedValue(bundle())
    );

    const result = await addOrganizerMembershipByRivieraId("RIV-00000001");
    expect(result?.localJugadorId).toBe(J_LOCAL);

    expect(getCachedRivieraJugadoresList(key!)).toBeNull();

    const loaderSource = jest.fn().mockResolvedValue(bundle());
    await getOrLoadCareerIdentityBundle(SOURCE_ORG, J_SOURCE, loaderSource);
    expect(loaderSource).toHaveBeenCalledTimes(1);
  });

  it("leaveOrganizerMembership invalida el clon local y el perfil origen", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        membership_id: "m1",
        local_jugador_id: J_LOCAL,
        source_jugador_id: J_SOURCE,
        left_at: "2026-07-15T00:00:00Z",
      },
      error: null,
    });

    await getOrLoadCareerIdentityBundle(
      CURRENT_ORG,
      J_LOCAL,
      jest.fn().mockResolvedValue(bundle())
    );
    await getOrLoadCareerIdentityBundle(
      SOURCE_ORG,
      J_SOURCE,
      jest.fn().mockResolvedValue(bundle())
    );

    await leaveOrganizerMembership(J_LOCAL);

    const loaderLocal = jest.fn().mockResolvedValue(bundle());
    const loaderSource = jest.fn().mockResolvedValue(bundle());
    await getOrLoadCareerIdentityBundle(CURRENT_ORG, J_LOCAL, loaderLocal);
    await getOrLoadCareerIdentityBundle(SOURCE_ORG, J_SOURCE, loaderSource);
    expect(loaderLocal).toHaveBeenCalledTimes(1);
    expect(loaderSource).toHaveBeenCalledTimes(1);
  });
});
