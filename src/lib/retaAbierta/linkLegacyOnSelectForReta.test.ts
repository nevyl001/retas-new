import {
  linkLegacyOnSelectForReta,
  syntheticEmailForRivieraJugadorId,
  type LinkLegacyOnSelectDeps,
} from "./linkLegacyOnSelectForReta";
import type { Player } from "../db/types";

function makePlayer(id: string, name: string, email: string): Player {
  return {
    id,
    name,
    email,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("linkLegacyOnSelectForReta", () => {
  it("seleccionar ×2 mismo riviera_jugador_id → 1 solo players.id (idempotente)", async () => {
    const rivieraId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let legacyId: string | null = null;
    let insertCount = 0;
    const players = new Map<string, Player>();

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      fetchRivieraJugadorById: async (id) => ({
        id,
        nombre: "Yusuke",
        email: null,
        legacy_player_id: legacyId,
        foto_url: "https://example.com/y.jpg",
        rating: 3,
      }),
      fetchPlayerById: async (id) => players.get(id) ?? null,
      insertPlayerRow: async ({ name, email, userId }) => {
        insertCount += 1;
        const p = makePlayer(`player-${insertCount}`, name, email);
        expect(userId).toBe("org-club-test");
        players.set(p.id, p);
        return p;
      },
      linkLegacyPlayerId: async (rjId, playerId) => {
        expect(rjId).toBe(rivieraId);
        legacyId = playerId;
      },
    };

    const first = await linkLegacyOnSelectForReta(
      "org-club-test",
      rivieraId,
      deps
    );
    const second = await linkLegacyOnSelectForReta(
      "org-club-test",
      rivieraId,
      deps
    );

    expect(insertCount).toBe(1);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.player.id).toBe(second.player.id);
    expect(first.player.id).toBe(legacyId);
  });

  it("DOS HOMÓNIMOS, distinto riviera_jugador_id → DOS players.id (NO fusiona)", async () => {
    const rjA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const rjB = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const legacyByRj = new Map<string, string | null>([
      [rjA, null],
      [rjB, null],
    ]);
    const players = new Map<string, Player>();
    let insertCount = 0;
    const insertNames: string[] = [];

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      fetchRivieraJugadorById: async (id) => ({
        id,
        nombre: "Yusuke", // mismo nombre a propósito
        email: null,
        legacy_player_id: legacyByRj.get(id) ?? null,
        foto_url: null,
        rating: 3,
      }),
      fetchPlayerById: async (id) => players.get(id) ?? null,
      insertPlayerRow: async ({ name, email }) => {
        insertCount += 1;
        insertNames.push(name);
        // Homónimos: emails sintéticos distintos por riviera id → no colisión
        const p = makePlayer(`player-${insertCount}-${email}`, name, email);
        players.set(p.id, p);
        return p;
      },
      linkLegacyPlayerId: async (rjId, playerId) => {
        legacyByRj.set(rjId, playerId);
      },
    };

    const a = await linkLegacyOnSelectForReta("org-1", rjA, deps);
    const b = await linkLegacyOnSelectForReta("org-1", rjB, deps);

    expect(insertCount).toBe(2);
    expect(a.player.id).not.toBe(b.player.id);
    expect(a.rivieraJugadorId).toBe(rjA);
    expect(b.rivieraJugadorId).toBe(rjB);
    expect(insertNames).toEqual(["Yusuke", "Yusuke"]);
    expect(a.player.email).toBe(syntheticEmailForRivieraJugadorId(rjA));
    expect(b.player.email).toBe(syntheticEmailForRivieraJugadorId(rjB));
    expect(a.player.email).not.toBe(b.player.email);
  });

  it("concedido con legacy ya set → 0 inserts", async () => {
    const rivieraId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const existing = makePlayer("legacy-already", "Yusuke", "y@example.com");
    let insertCount = 0;
    let linkCount = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      fetchRivieraJugadorById: async (id) => ({
        id,
        nombre: "Yusuke",
        email: "y@example.com",
        legacy_player_id: existing.id,
        foto_url: null,
        rating: 3,
      }),
      fetchPlayerById: async (id) =>
        id === existing.id ? existing : null,
      insertPlayerRow: async () => {
        insertCount += 1;
        throw new Error("no debe insertar");
      },
      linkLegacyPlayerId: async () => {
        linkCount += 1;
      },
    };

    const result = await linkLegacyOnSelectForReta(
      "org-1",
      rivieraId,
      deps
    );

    expect(insertCount).toBe(0);
    expect(linkCount).toBe(0);
    expect(result.created).toBe(false);
    expect(result.player.id).toBe(existing.id);
  });

  it("legacy_player_id HUÉRFANO (players inexistente) → crea y re-vincula, no falla", async () => {
    const rivieraId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const orphanLegacyId = "dead-orphan-player-id";
    let legacyId: string | null = orphanLegacyId;
    let insertCount = 0;
    let linkCount = 0;
    const players = new Map<string, Player>();

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      fetchRivieraJugadorById: async (id) => ({
        id,
        nombre: "Yusuke",
        email: null,
        legacy_player_id: legacyId,
        foto_url: null,
        rating: 3,
      }),
      // Puntero roto: el id está set pero la fila no existe
      fetchPlayerById: async (id) => players.get(id) ?? null,
      insertPlayerRow: async ({ name, email }) => {
        insertCount += 1;
        const p = makePlayer(`repaired-${insertCount}`, name, email);
        players.set(p.id, p);
        return p;
      },
      linkLegacyPlayerId: async (rjId, playerId) => {
        expect(rjId).toBe(rivieraId);
        expect(playerId).not.toBe(orphanLegacyId);
        legacyId = playerId;
        linkCount += 1;
      },
    };

    const first = await linkLegacyOnSelectForReta("org-1", rivieraId, deps);
    expect(first.created).toBe(true);
    expect(insertCount).toBe(1);
    expect(linkCount).toBe(1);
    expect(first.player.id).toBe(legacyId);
    expect(first.player.id).not.toBe(orphanLegacyId);

    // Segunda selección: ya reparado → idempotente, 0 inserts más
    const second = await linkLegacyOnSelectForReta("org-1", rivieraId, deps);
    expect(second.created).toBe(false);
    expect(insertCount).toBe(1);
    expect(linkCount).toBe(1);
    expect(second.player.id).toBe(first.player.id);
  });

  it("no importa ensure crudo / find-by-name / createRivieraJugador", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "linkLegacyOnSelectForReta.ts"),
      "utf8"
    ) as string;
    const importLines = src
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line))
      .join("\n");
    expect(importLines).not.toMatch(/ensureLegacyPlayerForRivieraJugador/);
    expect(importLines).not.toMatch(/findLegacyPlayerForRiviera/);
    expect(importLines).not.toMatch(/findLegacyPlayerExisting/);
    expect(importLines).not.toMatch(/insertLegacyPlayer/);
    expect(importLines).not.toMatch(/createRivieraJugador/);
  });
});
