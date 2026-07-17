import {
  LegacyLinkUnverifiableError,
  linkLegacyOnSelectForReta,
  syntheticEmailForRivieraJugadorId,
  type LinkLegacyOnSelectDeps,
  type PlayerWithOwner,
  type RivieraJugadorLegacyLinkRow,
} from "./linkLegacyOnSelectForReta";

function makePlayer(
  id: string,
  name: string,
  email: string,
  userId?: string
): PlayerWithOwner {
  return {
    id,
    name,
    email,
    created_at: "2026-01-01T00:00:00Z",
    user_id: userId,
  };
}

function makeRj(
  partial: Partial<RivieraJugadorLegacyLinkRow> &
    Pick<RivieraJugadorLegacyLinkRow, "id" | "organizador_id">
): RivieraJugadorLegacyLinkRow {
  return {
    id: partial.id,
    organizador_id: partial.organizador_id,
    nombre: partial.nombre ?? "Jugador",
    email: partial.email ?? null,
    legacy_player_id: partial.legacy_player_id ?? null,
    foto_url: partial.foto_url ?? null,
    rating: partial.rating ?? 3,
  };
}

describe("linkLegacyOnSelectForReta (Bloque 1)", () => {
  it("Test 1 — jugador propio con legacy visible: 0 inserts, 0 links, created:false", async () => {
    const org = "org-club-a";
    const rjId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const existing = makePlayer("legacy-own", "Ana", "a@example.com", org);
    let insertCount = 0;
    let linkCount = 0;
    let resolveCalls = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async (_o, id) => {
        resolveCalls += 1;
        return id;
      },
      fetchRivieraJugadorById: async (id) =>
        makeRj({
          id,
          organizador_id: org,
          nombre: "Ana",
          email: "a@example.com",
          legacy_player_id: existing.id,
        }),
      fetchPlayerById: async (id) => (id === existing.id ? existing : null),
      insertPlayerRow: async () => {
        insertCount += 1;
        throw new Error("no debe insertar");
      },
      linkLegacyPlayerId: async () => {
        linkCount += 1;
      },
    };

    const result = await linkLegacyOnSelectForReta(org, rjId, deps);
    expect(resolveCalls).toBe(1);
    expect(insertCount).toBe(0);
    expect(linkCount).toBe(0);
    expect(result.created).toBe(false);
    expect(result.player.id).toBe(existing.id);
    expect(result.requestedRivieraJugadorId).toBe(rjId);
    expect(result.resolvedLocalRivieraJugadorId).toBe(rjId);
  });

  it("Test 2 — jugador propio sin legacy: inserta 1 vez, vincula mismo perfil", async () => {
    const org = "org-club-a";
    const rjId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    let legacyId: string | null = null;
    let insertCount = 0;
    let linkedRj: string | null = null;
    const players = new Map<string, PlayerWithOwner>();

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async (_o, id) => id,
      fetchRivieraJugadorById: async (id) =>
        makeRj({
          id,
          organizador_id: org,
          nombre: "Ana",
          email: null,
          legacy_player_id: legacyId,
        }),
      fetchPlayerById: async (id) => players.get(id) ?? null,
      insertPlayerRow: async ({ name, email, userId }) => {
        insertCount += 1;
        expect(userId).toBe(org);
        const p = makePlayer(`player-${insertCount}`, name, email, userId);
        players.set(p.id, p);
        return p;
      },
      linkLegacyPlayerId: async (rj, playerId) => {
        linkedRj = rj;
        legacyId = playerId;
      },
    };

    const result = await linkLegacyOnSelectForReta(org, rjId, deps);
    expect(insertCount).toBe(1);
    expect(result.created).toBe(true);
    expect(linkedRj).toBe(rjId);
    expect(result.player.user_id).toBe(org);
    expect(result.rivieraJugadorId).toBe(rjId);
  });

  it("Test 3 — concedido con perfil local + legacy visible: reutiliza local, no toca origen", async () => {
    const org = "org-dest";
    const ownerOrg = "org-owner";
    const sourceId = "ssssssss-ssss-ssss-ssss-ssssssssssss";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    const localLegacy = makePlayer("legacy-local", "Yusuke", "y@x.com", org);
    const sourceLegacy = makePlayer(
      "legacy-source",
      "Yusuke",
      "y@owner.com",
      ownerOrg
    );
    let insertCount = 0;
    let linkCount = 0;
    let fetchedPlayerIds: string[] = [];
    let fetchedRjIds: string[] = [];

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => localId,
      fetchRivieraJugadorById: async (id) => {
        fetchedRjIds.push(id);
        if (id === localId) {
          return makeRj({
            id: localId,
            organizador_id: org,
            nombre: "Yusuke",
            legacy_player_id: localLegacy.id,
          });
        }
        if (id === sourceId) {
          return makeRj({
            id: sourceId,
            organizador_id: ownerOrg,
            nombre: "Yusuke",
            legacy_player_id: sourceLegacy.id,
          });
        }
        return null;
      },
      fetchPlayerById: async (id) => {
        fetchedPlayerIds.push(id);
        if (id === localLegacy.id) return localLegacy;
        if (id === sourceLegacy.id) return sourceLegacy;
        return null;
      },
      insertPlayerRow: async () => {
        insertCount += 1;
        throw new Error("no debe insertar");
      },
      linkLegacyPlayerId: async () => {
        linkCount += 1;
      },
    };

    const result = await linkLegacyOnSelectForReta(org, sourceId, deps);
    expect(insertCount).toBe(0);
    expect(linkCount).toBe(0);
    expect(result.created).toBe(false);
    expect(result.player.id).toBe(localLegacy.id);
    expect(result.requestedRivieraJugadorId).toBe(sourceId);
    expect(result.resolvedLocalRivieraJugadorId).toBe(localId);
    expect(fetchedRjIds[0]).toBe(sourceId);
    expect(fetchedRjIds).toContain(localId);
    expect(fetchedPlayerIds).toContain(sourceLegacy.id);
    expect(fetchedPlayerIds).toContain(localLegacy.id);
  });

  it("Test 4 — concedido local sin legacy: inserta y vincula SOLO el local (no origen)", async () => {
    const org = "org-dest";
    const ownerOrg = "org-owner";
    const sourceId = "ssssssss-ssss-ssss-ssss-ssssssssssss";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    const sourceLegacyId = "legacy-of-owner-club";
    const sourceLegacy = makePlayer(
      sourceLegacyId,
      "Yusuke",
      "y@owner.com",
      ownerOrg
    );
    let localLegacyId: string | null = null;
    let insertCount = 0;
    const linkCalls: Array<{ rj: string; player: string }> = [];
    const players = new Map<string, PlayerWithOwner>([
      [sourceLegacyId, sourceLegacy],
    ]);

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => localId,
      fetchRivieraJugadorById: async (id) => {
        if (id === localId) {
          return makeRj({
            id: localId,
            organizador_id: org,
            nombre: "Yusuke",
            legacy_player_id: localLegacyId,
          });
        }
        if (id === sourceId) {
          return makeRj({
            id: sourceId,
            organizador_id: ownerOrg,
            nombre: "Yusuke",
            legacy_player_id: sourceLegacyId,
          });
        }
        return null;
      },
      fetchPlayerById: async (id) => players.get(id) ?? null,
      insertPlayerRow: async ({ name, email, userId }) => {
        insertCount += 1;
        expect(userId).toBe(org);
        const p = makePlayer(`dest-player-${insertCount}`, name, email, userId);
        players.set(p.id, p);
        return p;
      },
      linkLegacyPlayerId: async (rj, playerId) => {
        linkCalls.push({ rj, player: playerId });
        if (rj === localId) localLegacyId = playerId;
      },
    };

    const result = await linkLegacyOnSelectForReta(org, sourceId, deps);
    expect(insertCount).toBe(1);
    expect(result.created).toBe(true);
    expect(linkCalls).toEqual([{ rj: localId, player: result.player.id }]);
    expect(linkCalls.every((c) => c.rj !== sourceId)).toBe(true);
    expect(result.requestedRivieraJugadorId).toBe(sourceId);
    expect(result.resolvedLocalRivieraJugadorId).toBe(localId);
    expect(result.player.user_id).toBe(org);
    expect(result.player.email).toBe(syntheticEmailForRivieraJugadorId(localId));
  });

  it("Caso 6 — RLS oculta legacy (data null): fail-closed, 0 inserts, 0 links", async () => {
    const org = "org-dest";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    let insertCount = 0;
    let linkCount = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => localId,
      fetchRivieraJugadorById: async (id) =>
        makeRj({
          id,
          organizador_id: org,
          nombre: "Yusuke",
          legacy_player_id: "hidden-under-rls",
        }),
      fetchPlayerById: async () => null,
      insertPlayerRow: async () => {
        insertCount += 1;
        throw new Error("no debe insertar");
      },
      linkLegacyPlayerId: async () => {
        linkCount += 1;
      },
    };

    await expect(
      linkLegacyOnSelectForReta(org, localId, deps)
    ).rejects.toBeInstanceOf(LegacyLinkUnverifiableError);
    expect(insertCount).toBe(0);
    expect(linkCount).toBe(0);
  });

  it("error de red/permisos al leer players: 0 inserts, 0 links", async () => {
    const org = "org-a";
    const rjId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let insertCount = 0;
    let linkCount = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => rjId,
      fetchRivieraJugadorById: async (id) =>
        makeRj({
          id,
          organizador_id: org,
          nombre: "Ana",
          legacy_player_id: "some-legacy",
        }),
      fetchPlayerById: async () => {
        throw new Error("network down");
      },
      insertPlayerRow: async () => {
        insertCount += 1;
        throw new Error("no");
      },
      linkLegacyPlayerId: async () => {
        linkCount += 1;
      },
    };

    await expect(linkLegacyOnSelectForReta(org, rjId, deps)).rejects.toThrow(
      /verificar el vínculo legacy/i
    );
    expect(insertCount).toBe(0);
    expect(linkCount).toBe(0);
  });

  it("nunca usa legacy del perfil origen cuando local no tiene legacy", async () => {
    const org = "org-dest";
    const ownerOrg = "org-owner";
    const sourceId = "ssssssss-ssss-ssss-ssss-ssssssssssss";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    const sourceLegacyId = "owner-legacy";
    const sourceLegacy = makePlayer(
      sourceLegacyId,
      "Yusuke",
      "y@owner.com",
      ownerOrg
    );
    const fetchedPlayerIds: string[] = [];
    let insertCount = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => localId,
      fetchRivieraJugadorById: async (id) => {
        if (id === localId) {
          return makeRj({
            id: localId,
            organizador_id: org,
            nombre: "Yusuke",
            legacy_player_id: null,
          });
        }
        return makeRj({
          id: sourceId,
          organizador_id: ownerOrg,
          nombre: "Yusuke",
          legacy_player_id: sourceLegacyId,
        });
      },
      fetchPlayerById: async (id) => {
        fetchedPlayerIds.push(id);
        if (id === sourceLegacyId) return sourceLegacy;
        return null;
      },
      insertPlayerRow: async ({ name, email, userId }) => {
        insertCount += 1;
        return makePlayer("new-local-player", name, email, userId);
      },
      linkLegacyPlayerId: async (rj) => {
        expect(rj).toBe(localId);
      },
    };

    await linkLegacyOnSelectForReta(org, sourceId, deps);
    expect(insertCount).toBe(1);
    // Se lee el legacy del origen solo para detectar daño (Caso 10), no para reutilizarlo.
    expect(fetchedPlayerIds).toContain(sourceLegacyId);
  });

  it("dos clubes distintos: cada uno su local + players propios", async () => {
    const sourceId = "ssssssss-ssss-ssss-ssss-ssssssssssss";
    const localA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const localB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const orgA = "org-a";
    const orgB = "org-b";
    const ownerOrg = "org-owner";
    const sourceLegacy = makePlayer(
      "legacy-owner",
      "Yusuke",
      "y@owner.com",
      ownerOrg
    );
    const legacyByLocal = new Map<string, string | null>([
      [localA, null],
      [localB, null],
    ]);
    const players = new Map<string, PlayerWithOwner>([
      [sourceLegacy.id, sourceLegacy],
    ]);
    const links: Array<{ org: string; rj: string; player: string }> = [];

    function depsFor(
      org: string,
      localId: string
    ): Partial<LinkLegacyOnSelectDeps> {
      return {
        resolveJugadorIdForOrganizer: async () => localId,
        fetchRivieraJugadorById: async (id) => {
          if (id === sourceId) {
            return makeRj({
              id: sourceId,
              organizador_id: ownerOrg,
              nombre: "Yusuke",
              legacy_player_id: sourceLegacy.id,
            });
          }
          return makeRj({
            id,
            organizador_id: org,
            nombre: "Yusuke",
            legacy_player_id: legacyByLocal.get(id) ?? null,
          });
        },
        fetchPlayerById: async (id) => players.get(id) ?? null,
        insertPlayerRow: async ({ name, email, userId }) => {
          expect(userId).toBe(org);
          const p = makePlayer(`${org}-p-${players.size}`, name, email, userId);
          players.set(p.id, p);
          return p;
        },
        linkLegacyPlayerId: async (rj, playerId) => {
          links.push({ org, rj, player: playerId });
          legacyByLocal.set(rj, playerId);
        },
      };
    }

    const a = await linkLegacyOnSelectForReta(
      orgA,
      sourceId,
      depsFor(orgA, localA)
    );
    const b = await linkLegacyOnSelectForReta(
      orgB,
      sourceId,
      depsFor(orgB, localB)
    );

    expect(a.player.id).not.toBe(b.player.id);
    expect(a.resolvedLocalRivieraJugadorId).toBe(localA);
    expect(b.resolvedLocalRivieraJugadorId).toBe(localB);
    expect(links).toEqual([
      { org: orgA, rj: localA, player: a.player.id },
      { org: orgB, rj: localB, player: b.player.id },
    ]);
    expect(links.every((l) => l.rj !== sourceId)).toBe(true);
  });

  it("Caso 11 — homónimos: dos locales distintos → dos players, sin merge por nombre", async () => {
    const rjA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const rjB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const legacyByRj = new Map<string, string | null>([
      [rjA, null],
      [rjB, null],
    ]);
    const players = new Map<string, PlayerWithOwner>();
    let insertCount = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async (_o, id) => id,
      fetchRivieraJugadorById: async (id) =>
        makeRj({
          id,
          organizador_id: "org-1",
          nombre: "Yusuke",
          legacy_player_id: legacyByRj.get(id) ?? null,
        }),
      fetchPlayerById: async (id) => players.get(id) ?? null,
      insertPlayerRow: async ({ name, email, userId }) => {
        insertCount += 1;
        const p = makePlayer(`p-${insertCount}`, name, email, userId);
        players.set(p.id, p);
        return p;
      },
      linkLegacyPlayerId: async (rj, playerId) => {
        legacyByRj.set(rj, playerId);
      },
    };

    const a = await linkLegacyOnSelectForReta("org-1", rjA, deps);
    const b = await linkLegacyOnSelectForReta("org-1", rjB, deps);
    expect(insertCount).toBe(2);
    expect(a.player.id).not.toBe(b.player.id);
    expect(a.player.email).toBe(syntheticEmailForRivieraJugadorId(rjA));
    expect(b.player.email).toBe(syntheticEmailForRivieraJugadorId(rjB));
  });

  it("guardrail estático: sin ensure/find-by-name/email lookup", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "linkLegacyOnSelectForReta.ts"),
      "utf8"
    ) as string;
    const codeOnly = src
      .split("\n")
      .filter((line: string) => {
        const t = line.trim();
        return (
          !t.startsWith("*") &&
          !t.startsWith("/*") &&
          !t.startsWith("//") &&
          !t.startsWith("/**")
        );
      })
      .join("\n");
    expect(codeOnly).not.toMatch(/ensureLegacyPlayerForRivieraJugador/);
    expect(codeOnly).not.toMatch(/findLegacyPlayerForRiviera/);
    expect(codeOnly).not.toMatch(/findLegacyPlayerExisting/);
    expect(codeOnly).not.toMatch(/\.eq\(\s*["']name["']/);
    expect(codeOnly).not.toMatch(/\.eq\(\s*["']email["']/);
    expect(codeOnly).not.toMatch(/\.ilike\(\s*["']name["']/);
    expect(codeOnly).toMatch(/resolveJugadorIdForOrganizer/);
  });

  it("legacy existente no verificable → fail closed (no repara huérfano)", async () => {
    const org = "org-1";
    const rjId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    let insertCount = 0;
    let linkCount = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => rjId,
      fetchRivieraJugadorById: async (id) =>
        makeRj({
          id,
          organizador_id: org,
          nombre: "Yusuke",
          legacy_player_id: "dead-orphan-or-rls-hidden",
        }),
      fetchPlayerById: async () => null,
      insertPlayerRow: async () => {
        insertCount += 1;
        throw new Error("no");
      },
      linkLegacyPlayerId: async () => {
        linkCount += 1;
      },
    };

    await expect(
      linkLegacyOnSelectForReta(org, rjId, deps)
    ).rejects.toMatchObject({ code: "RIVIERA_LEGACY_NOT_VERIFIABLE" });
    expect(insertCount).toBe(0);
    expect(linkCount).toBe(0);
  });

  it("resolveJugadorIdForOrganizer corre antes de leer legacy / insert", async () => {
    const org = "org-dest";
    const ownerOrg = "org-owner";
    const sourceId = "ssssssss-ssss-ssss-ssss-ssssssssssss";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    const order: string[] = [];

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => {
        order.push("resolve");
        return localId;
      },
      fetchRivieraJugadorById: async (id) => {
        order.push(`fetchRj:${id}`);
        if (id === sourceId) {
          return makeRj({
            id: sourceId,
            organizador_id: ownerOrg,
            nombre: "Yusuke",
            legacy_player_id: null,
          });
        }
        return makeRj({
          id,
          organizador_id: org,
          nombre: "Yusuke",
          legacy_player_id: null,
        });
      },
      fetchPlayerById: async () => {
        order.push("fetchPlayer");
        return null;
      },
      insertPlayerRow: async ({ name, email, userId }) => {
        order.push("insert");
        return makePlayer("p1", name, email, userId);
      },
      linkLegacyPlayerId: async () => {
        order.push("link");
      },
    };

    await linkLegacyOnSelectForReta(org, sourceId, deps);
    expect(order[0]).toBe("resolve");
    expect(order).toContain(`fetchRj:${localId}`);
    expect(order.indexOf("resolve")).toBeLessThan(order.indexOf("insert"));
  });

  it("seleccionar ×2 mismo id → idempotente (1 insert)", async () => {
    const rivieraId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let legacyId: string | null = null;
    let insertCount = 0;
    const players = new Map<string, PlayerWithOwner>();

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async (_o, id) => id,
      fetchRivieraJugadorById: async (id) =>
        makeRj({
          id,
          organizador_id: "org-club-test",
          nombre: "Yusuke",
          email: null,
          legacy_player_id: legacyId,
          foto_url: "https://example.com/y.jpg",
        }),
      fetchPlayerById: async (id) => players.get(id) ?? null,
      insertPlayerRow: async ({ name, email, userId }) => {
        insertCount += 1;
        const p = makePlayer(`player-${insertCount}`, name, email, userId);
        players.set(p.id, p);
        return p;
      },
      linkLegacyPlayerId: async (_rjId, playerId) => {
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
  });

  it("Caso 9 — legacy local apunta a otro org → fail-closed, 0 inserts", async () => {
    const org = "org-dest";
    const rjId = "llllllll-llll-llll-llll-llllllllllll";
    const foreign = makePlayer("foreign-p", "Yusuke", "y@x.com", "org-other");
    let insertCount = 0;
    let linkCount = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => rjId,
      fetchRivieraJugadorById: async (id) =>
        makeRj({
          id,
          organizador_id: org,
          nombre: "Yusuke",
          legacy_player_id: foreign.id,
        }),
      fetchPlayerById: async () => foreign,
      insertPlayerRow: async () => {
        insertCount += 1;
        throw new Error("no");
      },
      linkLegacyPlayerId: async () => {
        linkCount += 1;
      },
    };

    await expect(
      linkLegacyOnSelectForReta(org, rjId, deps)
    ).rejects.toMatchObject({ code: "RIVIERA_LOCAL_LEGACY_CROSS_ORG" });
    expect(insertCount).toBe(0);
    expect(linkCount).toBe(0);
  });

  it("Caso 10 — source legacy apunta al grantee → detecta y fail-closed", async () => {
    const org = "org-dest";
    const ownerOrg = "org-owner";
    const sourceId = "ssssssss-ssss-ssss-ssss-ssssssssssss";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    const damaged = makePlayer(
      "stolen-or-overwritten",
      "Yusuke",
      syntheticEmailForRivieraJugadorId(sourceId),
      org
    );
    let insertCount = 0;
    let linkCount = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => localId,
      fetchRivieraJugadorById: async (id) => {
        if (id === sourceId) {
          return makeRj({
            id: sourceId,
            organizador_id: ownerOrg,
            nombre: "Yusuke",
            legacy_player_id: damaged.id,
          });
        }
        return makeRj({
          id: localId,
          organizador_id: org,
          nombre: "Yusuke",
          legacy_player_id: null,
        });
      },
      fetchPlayerById: async (id) => (id === damaged.id ? damaged : null),
      insertPlayerRow: async () => {
        insertCount += 1;
        throw new Error("no debe insertar");
      },
      linkLegacyPlayerId: async () => {
        linkCount += 1;
      },
    };

    await expect(
      linkLegacyOnSelectForReta(org, sourceId, deps)
    ).rejects.toMatchObject({
      code: "RIVIERA_SOURCE_LEGACY_CROSS_ORG",
      message: expect.stringMatching(/daño cross-org/i),
    });
    expect(insertCount).toBe(0);
    expect(linkCount).toBe(0);
  });

  it("A — Source oculto por RLS + perfil local seguro: solo escribe local", async () => {
    const org = "org-dest";
    const ownerOrg = "org-owner";
    const sourceId = "ssssssss-ssss-ssss-ssss-ssssssssssss";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    const sourceLegacyId = "owner-private-legacy";
    let insertCount = 0;
    const linkCalls: Array<{ rj: string; player: string }> = [];

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => localId,
      fetchRivieraJugadorById: async (id) => {
        if (id === sourceId) {
          return makeRj({
            id: sourceId,
            organizador_id: ownerOrg,
            nombre: "Yusuke",
            legacy_player_id: sourceLegacyId,
          });
        }
        return makeRj({
          id: localId,
          organizador_id: org,
          nombre: "Yusuke",
          legacy_player_id: null,
        });
      },
      // Legacy del owner no visible bajo RLS del grantee.
      fetchPlayerById: async () => null,
      insertPlayerRow: async ({ name, email, userId }) => {
        insertCount += 1;
        return makePlayer("local-only-player", name, email, userId);
      },
      linkLegacyPlayerId: async (rj, playerId) => {
        linkCalls.push({ rj, player: playerId });
      },
    };

    const result = await linkLegacyOnSelectForReta(org, sourceId, deps);
    expect(result.created).toBe(true);
    expect(insertCount).toBe(1);
    expect(linkCalls).toEqual([
      { rj: localId, player: "local-only-player" },
    ]);
    expect(linkCalls.every((c) => c.rj !== sourceId)).toBe(true);
    expect(result.resolvedLocalRivieraJugadorId).toBe(localId);
  });

  it("A2 — Error al leer legacy del source: no bloquea; continúa en local", async () => {
    const org = "org-dest";
    const ownerOrg = "org-owner";
    const sourceId = "ssssssss-ssss-ssss-ssss-ssssssssssss";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    let insertCount = 0;
    const linkCalls: string[] = [];

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => localId,
      fetchRivieraJugadorById: async (id) => {
        if (id === sourceId) {
          return makeRj({
            id: sourceId,
            organizador_id: ownerOrg,
            nombre: "Yusuke",
            legacy_player_id: "owner-legacy",
          });
        }
        return makeRj({
          id: localId,
          organizador_id: org,
          nombre: "Yusuke",
          legacy_player_id: null,
        });
      },
      fetchPlayerById: async () => {
        throw new Error("permission denied reading owner players");
      },
      insertPlayerRow: async ({ name, email, userId }) => {
        insertCount += 1;
        return makePlayer("local-p", name, email, userId);
      },
      linkLegacyPlayerId: async (rj) => {
        linkCalls.push(rj);
      },
    };

    const result = await linkLegacyOnSelectForReta(org, sourceId, deps);
    expect(result.created).toBe(true);
    expect(insertCount).toBe(1);
    expect(linkCalls).toEqual([localId]);
  });

  it("B — Local oculto por RLS con legacy definido: fail-closed, 0 escrituras", async () => {
    const org = "org-dest";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    let insertCount = 0;
    let linkCount = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => localId,
      fetchRivieraJugadorById: async (id) =>
        makeRj({
          id,
          organizador_id: org,
          nombre: "Yusuke",
          legacy_player_id: "local-legacy-hidden",
        }),
      fetchPlayerById: async () => null,
      insertPlayerRow: async () => {
        insertCount += 1;
        throw new Error("no");
      },
      linkLegacyPlayerId: async () => {
        linkCount += 1;
      },
    };

    await expect(
      linkLegacyOnSelectForReta(org, localId, deps)
    ).rejects.toMatchObject({ code: "RIVIERA_LEGACY_NOT_VERIFIABLE" });
    expect(insertCount).toBe(0);
    expect(linkCount).toBe(0);
  });

  it("D — Resolución local con organizador incorrecto: fail-closed, 0 escrituras", async () => {
    const org = "org-dest";
    const wrongLocal = "llllllll-llll-llll-llll-llllllllllll";
    let insertCount = 0;
    let linkCount = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => wrongLocal,
      fetchRivieraJugadorById: async (id) =>
        makeRj({
          id,
          organizador_id: "org-other",
          nombre: "Yusuke",
          legacy_player_id: null,
        }),
      fetchPlayerById: async () => null,
      insertPlayerRow: async () => {
        insertCount += 1;
        throw new Error("no");
      },
      linkLegacyPlayerId: async () => {
        linkCount += 1;
      },
    };

    await expect(
      linkLegacyOnSelectForReta(org, wrongLocal, deps)
    ).rejects.toBeInstanceOf(LegacyLinkUnverifiableError);
    expect(insertCount).toBe(0);
    expect(linkCount).toBe(0);
  });

  it("D2 — id de perfil ≠ resolvedLocal: fail-closed antes de insert", async () => {
    const org = "org-dest";
    const resolvedId = "llllllll-llll-llll-llll-llllllllllll";
    let insertCount = 0;
    let linkCount = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      resolveJugadorIdForOrganizer: async () => resolvedId,
      fetchRivieraJugadorById: async () =>
        makeRj({
          id: "mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm",
          organizador_id: org,
          nombre: "Yusuke",
          legacy_player_id: null,
        }),
      fetchPlayerById: async () => null,
      insertPlayerRow: async () => {
        insertCount += 1;
        throw new Error("no");
      },
      linkLegacyPlayerId: async () => {
        linkCount += 1;
      },
    };

    await expect(
      linkLegacyOnSelectForReta(org, resolvedId, deps)
    ).rejects.toBeInstanceOf(LegacyLinkUnverifiableError);
    expect(insertCount).toBe(0);
    expect(linkCount).toBe(0);
  });

  it("rechaza perfil operativo de otro organizador (nunca escribe en origen)", async () => {
    const org = "org-dest";
    const sourceId = "ssssssss-ssss-ssss-ssss-ssssssssssss";
    let insertCount = 0;
    let linkCount = 0;

    const deps: Partial<LinkLegacyOnSelectDeps> = {
      // Simula resolve fallido / sin clon: devuelve el origen.
      resolveJugadorIdForOrganizer: async () => sourceId,
      fetchRivieraJugadorById: async (id) =>
        makeRj({
          id,
          organizador_id: "org-owner",
          nombre: "Yusuke",
          legacy_player_id: null,
        }),
      fetchPlayerById: async () => null,
      insertPlayerRow: async () => {
        insertCount += 1;
        throw new Error("no");
      },
      linkLegacyPlayerId: async () => {
        linkCount += 1;
      },
    };

    await expect(
      linkLegacyOnSelectForReta(org, sourceId, deps)
    ).rejects.toBeInstanceOf(LegacyLinkUnverifiableError);
    expect(insertCount).toBe(0);
    expect(linkCount).toBe(0);
  });
});
