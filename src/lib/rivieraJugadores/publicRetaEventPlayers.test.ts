jest.mock("../supabaseClient", () => ({
  supabasePublicRead: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { supabasePublicRead } from "../supabaseClient";
import {
  assignEventPlayersToPair,
  resolvePublicRetaTournamentPairPlayers,
  type RetaEventPlayerRow,
} from "./publicRetaEventPlayers";

jest.mock("./publicPlayerAvatars", () => ({
  resolvePlayerPublicProfiles: jest.fn().mockResolvedValue({}),
}));

import { resolvePlayerPublicProfiles } from "./publicPlayerAvatars";

describe("assignEventPlayersToPair", () => {
  const davidRus: RetaEventPlayerRow = {
    jugadorId: "rj-david-rus",
    legacyPlayerId: "legacy-david-rus",
    nombre: "David Rus",
  };
  const davidR: RetaEventPlayerRow = {
    jugadorId: "rj-david-r",
    legacyPlayerId: "legacy-david-r",
    nombre: "David R",
  };
  const itsi: RetaEventPlayerRow = {
    jugadorId: "rj-itsi",
    legacyPlayerId: "legacy-itsi",
    nombre: "Itsi M",
  };

  it("asigna David Rus al slot aunque pairs tenga legacy id de David R", () => {
    const pair = {
      player1_id: "legacy-david-r",
      player2_id: "legacy-itsi",
      player1_name: "David R",
      player2_name: "Itsi M",
    };

    const [slot1, slot2] = assignEventPlayersToPair(pair, [davidRus, itsi]);

    expect(slot1?.nombre).toBe("David Rus");
    expect(slot2?.nombre).toBe("Itsi M");
  });

  it("prioriza legacy id cuando coincide", () => {
    const pair = {
      player1_id: "legacy-david-r",
      player2_id: "legacy-itsi",
      player1_name: "David R",
      player2_name: "Itsi M",
      player1: { name: "David R" },
      player2: { name: "Itsi M" },
    };

    const [slot1, slot2] = assignEventPlayersToPair(pair, [davidR, itsi]);

    expect(slot1?.jugadorId).toBe("rj-david-r");
    expect(slot2?.jugadorId).toBe("rj-itsi");
  });

  it("no roba jugadores de otra pareja cuando hay muchos en el pool", () => {
    const pairDavid = {
      player1_id: "legacy-david-r",
      player2_id: "legacy-itsi",
      player1_name: "David R",
      player2_name: "Itsi M",
    };
    const pairMario = {
      player1_id: "legacy-mario",
      player2_id: "legacy-claudia",
      player1_name: "Mario A",
      player2_name: "Claudia G",
    };

    const mario: RetaEventPlayerRow = {
      jugadorId: "rj-mario",
      legacyPlayerId: "legacy-mario",
      nombre: "Mario A",
    };
    const claudia: RetaEventPlayerRow = {
      jugadorId: "rj-claudia",
      legacyPlayerId: "legacy-claudia",
      nombre: "Claudia G",
    };

    const used = new Set<string>();
    const take = (pair: typeof pairDavid, pool: RetaEventPlayerRow[]) => {
      const available = pool.filter((p) => !used.has(p.jugadorId));
      const slots = assignEventPlayersToPair(pair, available);
      if (slots[0]) used.add(slots[0].jugadorId);
      if (slots[1]) used.add(slots[1].jugadorId);
      return slots;
    };

    const pool = [davidRus, itsi, mario, claudia];
    const [d1, d2] = take(pairDavid, pool);
    const [m1, m2] = take(pairMario, pool);

    expect(d1?.nombre).toBe("David Rus");
    expect(d2?.nombre).toBe("Itsi M");
    expect(m1?.nombre).toBe("Mario A");
    expect(m2?.nombre).toBe("Claudia G");
  });

  it("usa pair_id del metadata cuando está disponible", async () => {
    (supabasePublicRead.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          jugador_id: "rj-david-rus",
          legacy_player_id: "legacy-david-rus",
          canonical_legacy_player_id: "legacy-david-rus",
          nombre: "David Rus",
          foto_url: null,
          rating: 3.15,
          pair_id: "pair-1",
          pair_slot: 1,
        },
        {
          jugador_id: "rj-itsi",
          legacy_player_id: "legacy-itsi",
          nombre: "Itsi M",
          foto_url: null,
          rating: 3.15,
          pair_id: "pair-1",
          pair_slot: 2,
        },
      ],
      error: null,
    });

    const pairs = [
      {
        id: "pair-1",
        player1_id: "legacy-david-r",
        player2_id: "legacy-itsi",
        player1_name: "David R",
        player2_name: "Itsi M",
        tournament_id: "t1",
        created_at: "",
      },
    ];

    const map = await resolvePublicRetaTournamentPairPlayers(
      "org-1",
      "t1",
      pairs as never,
      { publicOnly: true }
    );

    expect(map["pair-1"]?.[0]?.id).toBe("legacy-david-rus");
    expect(map["pair-1"]?.[0]?.name).toBe("David Rus");
    expect(map["pair-1"]?.[0]?.rating).toBe(3.15);
    expect(map["pair-1"]?.[0]?.fotoUrl).toBeNull();
    expect(resolvePlayerPublicProfiles).toHaveBeenCalledWith(
      "org-1",
      expect.arrayContaining([
        { id: "legacy-david-rus", name: "David Rus" },
        { id: "legacy-itsi", name: "Itsi M" },
      ]),
      { publicOnly: true }
    );
  });

  it("no devuelve pareja resuelta si falta un jugador de participaciones", async () => {
    (supabasePublicRead.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          jugador_id: "rj-itsi",
          legacy_player_id: "legacy-itsi",
          nombre: "Itsi M",
          foto_url: null,
          rating: 3.15,
        },
      ],
      error: null,
    });

    const pairs = [
      {
        id: "pair-1",
        player1_id: "legacy-david-r",
        player2_id: "legacy-itsi",
        player1_name: "David R",
        player2_name: "Itsi M",
        tournament_id: "t1",
        created_at: "",
      },
    ];

    const map = await resolvePublicRetaTournamentPairPlayers(
      "org-1",
      "t1",
      pairs as never,
      { publicOnly: true }
    );

    expect(map["pair-1"]).toBeUndefined();
  });
});
