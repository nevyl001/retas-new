jest.mock("../rivieraJugadores/organizerPlayerAccess", () => ({
  resolveJugadorIdForRating: jest.fn(),
}));

jest.mock("../rivieraJugadores/rivieraJugadoresService", () => ({
  fetchRatingMovimientosByPartidoRef: jest.fn(),
}));

import { resolveJugadorIdForRating } from "../rivieraJugadores/organizerPlayerAccess";
import { fetchRatingMovimientosByPartidoRef } from "../rivieraJugadores/rivieraJugadoresService";
import {
  fetchDuelo2v2RatingBySlot,
  mapRatingMovimientosToDueloSlots,
} from "./duelo2v2RatingDisplay";

const mockResolveRating = resolveJugadorIdForRating as jest.MockedFunction<
  typeof resolveJugadorIdForRating
>;
const mockFetchMoves = fetchRatingMovimientosByPartidoRef as jest.MockedFunction<
  typeof fetchRatingMovimientosByPartidoRef
>;

describe("duelo2v2RatingDisplay", () => {
  beforeEach(() => {
    mockResolveRating.mockReset();
    mockFetchMoves.mockReset();
  });

  it("mapea movimientos del perfil origen al id local del duelo", async () => {
    mockResolveRating.mockImplementation(async (_org, id) =>
      id === "local-clone" ? "source-player" : id
    );

    const mapped = await mapRatingMovimientosToDueloSlots(
      "club-test",
      ["local-clone", "native-1"],
      [
        {
          jugadorId: "source-player",
          ratingAntes: 3,
          ratingDespues: 3.12,
          delta: 0.12,
        },
        {
          jugadorId: "native-1",
          ratingAntes: 3,
          ratingDespues: 3.08,
          delta: 0.08,
        },
      ]
    );

    expect(mapped["local-clone"]?.delta).toBe(0.12);
    expect(mapped["native-1"]?.delta).toBe(0.08);
  });

  it("fetchDuelo2v2RatingBySlot delega en partido_ref del duelo", async () => {
    mockFetchMoves.mockResolvedValue([
      {
        jugadorId: "j1",
        ratingAntes: 3,
        ratingDespues: 3.05,
        delta: 0.05,
      },
    ]);
    mockResolveRating.mockResolvedValue("j1");

    const result = await fetchDuelo2v2RatingBySlot("org-1", "duelo-uuid", ["j1"]);

    expect(mockFetchMoves).toHaveBeenCalledWith("duelo2v2:duelo-uuid");
    expect(result.j1?.delta).toBe(0.05);
  });
});
