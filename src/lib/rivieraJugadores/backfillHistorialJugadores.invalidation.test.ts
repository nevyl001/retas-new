/**
 * backfillHistorialJugadores no expone qué jugadores tocó (solo conteos por
 * tipo de evento), así que la invalidación es por organizador. Este test
 * fuerza el "camino vacío" de los 4 sub-backfills (sin torneos/ligas/duelos
 * finalizados) para verificar solo la invalidación, sin ejercitar la lógica
 * de sincronización de participaciones (ya cubierta en otros tests).
 */
jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("./jugadorIdResolver", () => ({
  prepareParticipacionIdentityForOrganizer: jest.fn().mockResolvedValue(undefined),
}));

import { supabase } from "../supabaseClient";
import { backfillHistorialJugadores } from "./syncParticipaciones";
import {
  clearCareerIdentityCache,
  getOrLoadCareerIdentityBundle,
  type CareerIdentityBundle,
} from "./careerIdentityCache";
import {
  buildRivieraListCacheKey,
  clearPlayersPoolCacheForTests,
  getCachedRivieraJugadoresList,
  setCachedRivieraJugadoresList,
} from "./playersPoolCache";
import type { RivieraJugadorWithStats } from "./types";

const ORG = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const OTHER_ORG = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const J1 = "4ac495d2-9fa4-48fd-887c-0259d6276f53";

function bundle(): CareerIdentityBundle {
  return { identity: {} as unknown as CareerIdentityBundle["identity"], participaciones: [] };
}

/**
 * Simula "sin datos" para los 4 sub-backfills (ligas, retas, americano,
 * duelos). Es una Promise real que resuelve a { data: [], error: null },
 * con select/eq/order/limit encadenables agregados encima (igual al builder
 * real de supabase-js: es thenable y chainable al mismo tiempo).
 */
function mockSupabaseEmpty() {
  (supabase.from as jest.Mock).mockImplementation(() => {
    const chain = Promise.resolve({ data: [] as unknown[], error: null }) as unknown as Record<
      string,
      unknown
    >;
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.order = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    return chain;
  });
}

describe("backfillHistorialJugadores invalida por organizador", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCareerIdentityCache();
    clearPlayersPoolCacheForTests();
    mockSupabaseEmpty();
  });

  it("invalida playersPoolCache y careerIdentityCache del organizador importado", async () => {
    const key = buildRivieraListCacheKey(ORG);
    setCachedRivieraJugadoresList(key!, [
      { id: J1, nombre: "J1", organizador_id: ORG } as RivieraJugadorWithStats,
    ]);
    await getOrLoadCareerIdentityBundle(ORG, J1, jest.fn().mockResolvedValue(bundle()));

    await backfillHistorialJugadores(ORG);

    expect(getCachedRivieraJugadoresList(key!)).toBeNull();
    const loaderAfter = jest.fn().mockResolvedValue(bundle());
    await getOrLoadCareerIdentityBundle(ORG, J1, loaderAfter);
    expect(loaderAfter).toHaveBeenCalledTimes(1);
  });

  it("no invalida caché de otros organizadores (no usa clear total)", async () => {
    await getOrLoadCareerIdentityBundle(
      OTHER_ORG,
      J1,
      jest.fn().mockResolvedValue(bundle())
    );

    await backfillHistorialJugadores(ORG);

    const loaderOther = jest.fn().mockResolvedValue(bundle());
    await getOrLoadCareerIdentityBundle(OTHER_ORG, J1, loaderOther);
    expect(loaderOther).not.toHaveBeenCalled();
  });
});
