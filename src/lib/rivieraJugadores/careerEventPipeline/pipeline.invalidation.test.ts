/**
 * Verifica que cerrar un evento (processCareerEvent) invalida careerIdentityCache
 * para exactamente los jugadores tocados (touchedJugadorIds), y playersPoolCache
 * del organizador. No prueba la lógica de carrera/puntos — eso ya está cubierto
 * en otros tests del pipeline (preCloseGuards.test.ts, careerEventPipeline.e2e.test.ts).
 */
jest.mock("../../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock("../careerIdentity", () => ({
  ensureRivieraIdentity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../orphanProfileLink", () => ({
  requireOfficialProfileLinkForParticipacion: jest.fn().mockResolvedValue({
    linked: true,
    confidence: "OK",
    reason: "perfil ya enlazado",
    officialPlayerKey: "opk-test",
    rivieraId: "RIV-00000001",
  }),
}));

jest.mock("../jugadorIdResolver", () => ({
  prepareParticipacionIdentityForOrganizer: jest.fn().mockResolvedValue(undefined),
  resolveJugadorIdForParticipacion: jest.fn().mockImplementation(
    async ({ jugadorId }: { jugadorId?: string }) => jugadorId ?? null
  ),
}));

jest.mock("../syncParticipaciones", () => ({
  syncDuelo2v2Participaciones: jest.fn(),
  collectJugadorIdsForCareerEvent: jest.fn(),
}));

jest.mock("../rivieraJugadoresService", () => ({
  rebuildJugadorStats: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./assertions", () => ({
  assertCareerEventIntegrity: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../organizer/organizerDisplayName", () => ({
  clearOrganizerDisplayNameCache: jest.fn(),
}));

import { supabase } from "../../supabaseClient";
import { processCareerEvent } from "./pipeline";
import { syncDuelo2v2Participaciones } from "../syncParticipaciones";
import {
  clearCareerIdentityCache,
  getOrLoadCareerIdentityBundle,
  type CareerIdentityBundle,
} from "../careerIdentityCache";
import {
  buildRivieraListCacheKey,
  clearPlayersPoolCacheForTests,
  getCachedRivieraJugadoresList,
  setCachedRivieraJugadoresList,
} from "../playersPoolCache";
import type { Duelo2v2 } from "../../duelo2v2/types";
import type { RivieraJugadorWithStats } from "../types";

const ORG = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const J1 = "4ac495d2-9fa4-48fd-887c-0259d6276f53";
const J2 = "27bc3397-c049-4617-9fda-f536e604055a";
const OTHER_ORG_UNTOUCHED = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_PLAYER_UNTOUCHED = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const DUEL_ID = "1a19e1a0-38e4-4539-b10c-0afb2cf4873d";

function dueloFixture(): Duelo2v2 {
  return {
    id: DUEL_ID,
    organizador_id: ORG,
    nombre: "Duelo test",
    descripcion: null,
    cancha: null,
    programado_en: null,
    programado_hasta: null,
    estado: "finalizado",
    pareja_a_j1_id: J1,
    pareja_a_j2_id: J2,
    pareja_a_j1_nombre: "J1",
    pareja_a_j2_nombre: "J2",
    pareja_b_j1_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    pareja_b_j2_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    pareja_b_j1_nombre: "J3",
    pareja_b_j2_nombre: "J4",
    sets_pareja_a: 2,
    sets_pareja_b: 0,
    detalle_sets: [{ a: 6, b: 3 }],
    ganador: "a",
    created_at: "2026-07-08T00:00:00Z",
    updated_at: "2026-07-08T00:00:00Z",
    finalizado_at: "2026-07-08T00:00:00Z",
  };
}

function bundle(): CareerIdentityBundle {
  return {
    identity: {} as unknown as CareerIdentityBundle["identity"],
    participaciones: [],
  };
}

function mockSupabaseFrom() {
  (supabase.from as jest.Mock).mockImplementation(() => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    return chain;
  });
}

describe("processCareerEvent invalida caché de identidad/carrera", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCareerIdentityCache();
    clearPlayersPoolCacheForTests();
    mockSupabaseFrom();

    (syncDuelo2v2Participaciones as jest.Mock).mockResolvedValue({
      touchedJugadorIds: [J1, J2],
      participacionEventoId: DUEL_ID,
    });
  });

  it("invalida careerIdentityCache solo para los jugadores tocados por el evento", async () => {
    await getOrLoadCareerIdentityBundle(
      ORG,
      J1,
      jest.fn().mockResolvedValue(bundle())
    );
    await getOrLoadCareerIdentityBundle(
      ORG,
      J2,
      jest.fn().mockResolvedValue(bundle())
    );
    // Jugador de otro organizador, no tocado por este evento: debe seguir en caché.
    await getOrLoadCareerIdentityBundle(
      OTHER_ORG_UNTOUCHED,
      OTHER_PLAYER_UNTOUCHED,
      jest.fn().mockResolvedValue(bundle())
    );

    const result = await processCareerEvent({
      kind: "duelo_2v2",
      organizadorId: ORG,
      duelo: dueloFixture(),
      options: { skipAssertions: true },
    });

    expect(result.touchedJugadorIds).toEqual([J1, J2]);

    const loaderJ1 = jest.fn().mockResolvedValue(bundle());
    const loaderJ2 = jest.fn().mockResolvedValue(bundle());
    const loaderUntouched = jest.fn().mockResolvedValue(bundle());

    await getOrLoadCareerIdentityBundle(ORG, J1, loaderJ1);
    await getOrLoadCareerIdentityBundle(ORG, J2, loaderJ2);
    await getOrLoadCareerIdentityBundle(
      OTHER_ORG_UNTOUCHED,
      OTHER_PLAYER_UNTOUCHED,
      loaderUntouched
    );

    // Tocados: se recargan (miss tras invalidación).
    expect(loaderJ1).toHaveBeenCalledTimes(1);
    expect(loaderJ2).toHaveBeenCalledTimes(1);
    // No tocado: sigue en caché, no se llama el loader (no se invalidó todo).
    expect(loaderUntouched).not.toHaveBeenCalled();
  });

  it("invalida playersPoolCache del organizador del evento", async () => {
    const key = buildRivieraListCacheKey(ORG);
    expect(key).toBeTruthy();
    setCachedRivieraJugadoresList(key!, [
      { id: J1, nombre: "J1", organizador_id: ORG } as RivieraJugadorWithStats,
    ]);
    expect(getCachedRivieraJugadoresList(key!)).not.toBeNull();

    await processCareerEvent({
      kind: "duelo_2v2",
      organizadorId: ORG,
      duelo: dueloFixture(),
      options: { skipAssertions: true },
    });

    expect(getCachedRivieraJugadoresList(key!)).toBeNull();
  });
});
