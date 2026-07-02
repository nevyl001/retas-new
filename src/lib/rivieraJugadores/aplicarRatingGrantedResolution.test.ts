jest.mock("./organizerPlayerAccess", () => ({
  resolveJugadorIdForOrganizer: jest.fn(),
  resolveJugadorIdForRating: jest.fn(),
}));

jest.mock("./jugadorIdResolver", () => ({
  resolveJugadorIdForParticipacion: jest.fn(),
}));

import {
  resolveJugadorIdForOrganizer,
  resolveJugadorIdForRating,
} from "./organizerPlayerAccess";
import {
  resolveDuelo2v2RatingPlayerIds,
  resolverRivieraIdsDesdePair,
} from "./aplicarRatingPartido";
import { resolveJugadorIdForParticipacion } from "./jugadorIdResolver";

const mockResolveOrg = resolveJugadorIdForOrganizer as jest.MockedFunction<
  typeof resolveJugadorIdForOrganizer
>;
const mockResolveRating = resolveJugadorIdForRating as jest.MockedFunction<
  typeof resolveJugadorIdForRating
>;
const mockResolveParticipacion =
  resolveJugadorIdForParticipacion as jest.MockedFunction<
    typeof resolveJugadorIdForParticipacion
  >;

describe("rating grant resolution", () => {
  beforeEach(() => {
    mockResolveOrg.mockReset();
    mockResolveRating.mockReset();
    mockResolveParticipacion.mockReset();
  });

  it("resolveDuelo2v2RatingPlayerIds usa perfil origen para rating de cedidos", async () => {
    const sourceA = "source-chaparro";
    const localA = "local-chaparro-clone";
    const sourceB = "source-diego";
    const localB = "local-diego-clone";

    mockResolveRating.mockImplementation(async (_org, id) => {
      if (id === localA) return sourceA;
      if (id === localB) return sourceB;
      return id;
    });

    const result = await resolveDuelo2v2RatingPlayerIds("club-test", {
      pareja_a_j1_id: localA,
      pareja_a_j2_id: "local-native-1",
      pareja_b_j1_id: localB,
      pareja_b_j2_id: "local-native-2",
    });

    expect(result).toEqual({
      j1: sourceA,
      j2: "local-native-1",
      j3: sourceB,
      j4: "local-native-2",
    });
  });

  it("participaciones van al clon local; rating al perfil origen del cedido", async () => {
    const organizadorId = "club-test";
    const sourceId = "source-chaparro";
    const localId = "local-chaparro-clone";

    mockResolveOrg.mockImplementation(async (_org, id) =>
      id === sourceId ? localId : id
    );
    mockResolveRating.mockImplementation(async (_org, id) =>
      id === localId ? sourceId : id
    );

    const ratingIds = await resolveDuelo2v2RatingPlayerIds(organizadorId, {
      pareja_a_j1_id: localId,
      pareja_a_j2_id: "local-2",
      pareja_b_j1_id: "local-3",
      pareja_b_j2_id: "local-4",
    });

    const participacionId = await resolveJugadorIdForOrganizer(
      organizadorId,
      sourceId
    );

    expect(participacionId).toBe(localId);
    expect(ratingIds?.j1).toBe(sourceId);
    expect(ratingIds?.j1).not.toBe(participacionId);
  });

  it("resolverRivieraIdsDesdePair resuelve participación y rating canónico", async () => {
    mockResolveParticipacion
      .mockResolvedValueOnce("local-j1")
      .mockResolvedValueOnce("local-j2");
    mockResolveRating.mockImplementation(async (_org, id) =>
      id === "local-j1" ? "source-j1" : "source-j2"
    );

    const result = await resolverRivieraIdsDesdePair("club-test", {
      player1_id: "legacy-1",
      player2_id: "legacy-2",
      player1_name: "A",
      player2_name: "B",
    });

    expect(result).toEqual(["source-j1", "source-j2"]);
    expect(mockResolveParticipacion).toHaveBeenCalledTimes(2);
    expect(mockResolveRating).toHaveBeenCalledWith("club-test", "local-j1");
    expect(mockResolveRating).toHaveBeenCalledWith("club-test", "local-j2");
  });
});
