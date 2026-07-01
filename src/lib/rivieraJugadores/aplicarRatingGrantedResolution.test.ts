jest.mock("./organizerPlayerAccess", () => ({
  resolveJugadorIdForOrganizer: jest.fn(),
}));

jest.mock("./jugadorIdResolver", () => ({
  getOrCreateJugadorId: jest.fn(),
}));

import { resolveJugadorIdForOrganizer } from "./organizerPlayerAccess";
import {
  resolveDuelo2v2RatingPlayerIds,
  resolverRivieraIdsDesdePair,
} from "./aplicarRatingPartido";
import { getOrCreateJugadorId } from "./jugadorIdResolver";

const mockResolve = resolveJugadorIdForOrganizer as jest.MockedFunction<
  typeof resolveJugadorIdForOrganizer
>;
const mockGetOrCreate = getOrCreateJugadorId as jest.MockedFunction<
  typeof getOrCreateJugadorId
>;

describe("rating grant resolution", () => {
  beforeEach(() => {
    mockResolve.mockReset();
    mockGetOrCreate.mockReset();
  });

  it("resolveDuelo2v2RatingPlayerIds maps source ids to local clones", async () => {
    const sourceA = "source-chaparro";
    const localA = "local-chaparro-clone";
    const sourceB = "source-diego";
    const localB = "local-diego-clone";

    mockResolve.mockImplementation(async (_org, id) => {
      if (id === sourceA) return localA;
      if (id === sourceB) return localB;
      return id;
    });

    const result = await resolveDuelo2v2RatingPlayerIds("club-test", {
      pareja_a_j1_id: sourceA,
      pareja_a_j2_id: "local-native-1",
      pareja_b_j1_id: sourceB,
      pareja_b_j2_id: "local-native-2",
    });

    expect(result).toEqual({
      j1: localA,
      j2: "local-native-1",
      j3: localB,
      j4: "local-native-2",
    });
  });

  it("duelo 2v2 rating and participaciones resolve cedidos to the same local id", async () => {
    const organizadorId = "club-test";
    const sourceId = "source-chaparro";
    const localId = "local-chaparro-clone";

    mockResolve.mockImplementation(async (_org, id) =>
      id === sourceId ? localId : id
    );

    const ratingIds = await resolveDuelo2v2RatingPlayerIds(organizadorId, {
      pareja_a_j1_id: sourceId,
      pareja_a_j2_id: "local-2",
      pareja_b_j1_id: "local-3",
      pareja_b_j2_id: "local-4",
    });

    const participacionId = await resolveJugadorIdForOrganizer(
      organizadorId,
      sourceId
    );

    expect(ratingIds?.j1).toBe(localId);
    expect(participacionId).toBe(localId);
    expect(ratingIds?.j1).toBe(participacionId);
  });

  it("resolverRivieraIdsDesdePair resolves grants after getOrCreate", async () => {
    mockGetOrCreate
      .mockResolvedValueOnce("raw-j1")
      .mockResolvedValueOnce("raw-j2");
    mockResolve.mockImplementation(async (_org, id) =>
      id === "raw-j1" ? "local-j1" : "local-j2"
    );

    const result = await resolverRivieraIdsDesdePair("club-test", {
      player1_id: "legacy-1",
      player2_id: "legacy-2",
      player1_name: "A",
      player2_name: "B",
    });

    expect(result).toEqual(["local-j1", "local-j2"]);
    expect(mockResolve).toHaveBeenCalledWith("club-test", "raw-j1");
    expect(mockResolve).toHaveBeenCalledWith("club-test", "raw-j2");
  });
});
