import type { OpenRegistrationOrganizerEntry } from "./types";
import {
  buildRosterFromConvocatoriaEntries,
  mergeConvocatoriaIntoRoster,
  sameConvocatoriaRoster,
} from "./convocatoriaRosterSync";
import { getRivieraJugadorPrivateById } from "../rivieraJugadores/rivieraJugadoresService";

jest.mock("../rivieraJugadores/rivieraJugadoresService", () => ({
  getRivieraJugadorPrivateById: jest.fn(),
}));

const mockGetPrivate = getRivieraJugadorPrivateById as jest.MockedFunction<
  typeof getRivieraJugadorPrivateById
>;

function entry(
  partial: Partial<OpenRegistrationOrganizerEntry> &
    Pick<OpenRegistrationOrganizerEntry, "id">
): OpenRegistrationOrganizerEntry {
  return {
    status: "confirmed",
    riviera_id: "RIV-00000001",
    riviera_jugador_id: "rj-1",
    nombre: "Jugador Uno",
    foto_url: null,
    categoria: null,
    rating: null,
    created_at: "2026-01-01T00:00:00Z",
    confirmed_at: "2026-01-01T01:00:00Z",
    cancelled_at: null,
    ...partial,
  };
}

describe("convocatoriaRosterSync", () => {
  beforeEach(() => {
    mockGetPrivate.mockReset();
  });

  it("sameConvocatoriaRoster ignora el orden", () => {
    expect(
      sameConvocatoriaRoster(
        [{ id: "a" }, { id: "b" }],
        [{ id: "b" }, { id: "a" }]
      )
    ).toBe(true);
    expect(sameConvocatoriaRoster([{ id: "a" }], [{ id: "b" }])).toBe(false);
  });

  it("mapea confirmados por legacy_player_id del registro", async () => {
    mockGetPrivate.mockImplementation(async (id) => {
      if (id === "rj-a") {
        return {
          id: "rj-a",
          legacy_player_id: "legacy-a",
        } as Awaited<ReturnType<typeof getRivieraJugadorPrivateById>>;
      }
      if (id === "rj-b") {
        return {
          id: "rj-b",
          legacy_player_id: "legacy-b",
        } as Awaited<ReturnType<typeof getRivieraJugadorPrivateById>>;
      }
      return null;
    });

    const roster = await buildRosterFromConvocatoriaEntries(
      [
        entry({
          id: "e1",
          riviera_jugador_id: "rj-a",
          riviera_id: "RIV-00000001",
          nombre: "Ana",
        }),
        entry({
          id: "e2",
          riviera_jugador_id: "rj-b",
          riviera_id: "RIV-00000002",
          nombre: "Ben",
        }),
      ],
      [
        { id: "legacy-a", name: "Ana Pool", email: "", created_at: "" },
        { id: "legacy-b", name: "Ben Pool", email: "", created_at: "" },
      ]
    );

    expect(roster).toEqual([
      { id: "legacy-a", name: "Ana Pool" },
      { id: "legacy-b", name: "Ben Pool" },
    ]);
    expect(mockGetPrivate).toHaveBeenCalledTimes(2);
  });

  it("cae a riviera_id del pool si falta legacy en registro", async () => {
    mockGetPrivate.mockResolvedValue(null);

    const roster = await buildRosterFromConvocatoriaEntries(
      [
        entry({
          id: "e1",
          riviera_jugador_id: "rj-missing",
          riviera_id: "RIV-00000099",
          nombre: "Carlos",
        }),
      ],
      [
        {
          id: "legacy-c",
          name: "Carlos Pool",
          email: "",
          created_at: "",
          riviera_id: "RIV-00000099",
        },
      ]
    );

    expect(roster).toEqual([{ id: "legacy-c", name: "Carlos Pool" }]);
  });
});

describe("mergeConvocatoriaIntoRoster", () => {
  const p = (id: string) => ({ id, name: id.toUpperCase() });

  it("conserva a los jugadores sumados a mano al llegar confirmados", () => {
    const merged = mergeConvocatoriaIntoRoster(
      [p("manual1"), p("manual2")],
      null,
      [p("conv1")]
    );
    expect(merged.map((x) => x.id)).toEqual(["manual1", "manual2", "conv1"]);
  });

  it("no pisa la selección manual cuando la convocatoria no cambió", () => {
    const merged = mergeConvocatoriaIntoRoster(
      [p("conv1"), p("manual1")],
      new Set(["conv1"]),
      [p("conv1")]
    );
    expect(merged.map((x) => x.id)).toEqual(["conv1", "manual1"]);
  });

  it("quita solo a quien canceló en la convocatoria", () => {
    const merged = mergeConvocatoriaIntoRoster(
      [p("conv1"), p("conv2"), p("manual1")],
      new Set(["conv1", "conv2"]),
      [p("conv1")]
    );
    expect(merged.map((x) => x.id)).toEqual(["conv1", "manual1"]);
  });
});
