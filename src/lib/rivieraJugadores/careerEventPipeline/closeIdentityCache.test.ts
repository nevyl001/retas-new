/**
 * closeIdentityCache memoiza operaciones idempotentes (resolución de
 * jugador, ensure_riviera_identity, ensure_official_profile_link) para UN
 * cierre (incidente 2026-08-06). Estos tests verifican el contrato de
 * memoización en sí -- no la lógica de negocio de las funciones envueltas
 * (esas ya tienen sus propios tests, p.ej. jugadorIdResolver.email.test.ts).
 */
import { createCloseIdentityCache } from "./closeIdentityCache";
import { resolveJugadorIdForParticipacion } from "../jugadorIdResolver";
import { ensureRivieraIdentity } from "../careerIdentity";
import { ensureOfficialProfileLinkForParticipacion } from "../orphanProfileLink";
import { listRevokedGrantLocalJugadorIds } from "../organizerPlayerAccess";

jest.mock("../jugadorIdResolver", () => ({
  resolveJugadorIdForParticipacion: jest.fn(),
}));
jest.mock("../careerIdentity", () => ({
  ensureRivieraIdentity: jest.fn(),
}));
jest.mock("../orphanProfileLink", () => ({
  ensureOfficialProfileLinkForParticipacion: jest.fn(),
}));
jest.mock("../organizerPlayerAccess", () => ({
  listRevokedGrantLocalJugadorIds: jest.fn(),
}));

const mockResolve = resolveJugadorIdForParticipacion as jest.Mock;
const mockEnsureIdentity = ensureRivieraIdentity as jest.Mock;
const mockEnsureLink = ensureOfficialProfileLinkForParticipacion as jest.Mock;
const mockListRevoked = listRevokedGrantLocalJugadorIds as jest.Mock;

const ORG = "org-1";

beforeEach(() => {
  jest.clearAllMocks();
  mockListRevoked.mockResolvedValue(new Set<string>());
});

describe("createCloseIdentityCache — resolveJugadorId", () => {
  it("memoiza: dos llamadas con la misma clave solo invocan la función real una vez", async () => {
    mockResolve.mockResolvedValue("jugador-1");
    const cache = createCloseIdentityCache(ORG);

    const params = { organizadorId: ORG, legacyPlayerId: "legacy-1" };
    const a = await cache.resolveJugadorId(params);
    const b = await cache.resolveJugadorId(params);

    expect(a).toBe("jugador-1");
    expect(b).toBe("jugador-1");
    expect(mockResolve).toHaveBeenCalledTimes(1);
  });

  it("claves distintas (legacyPlayerId distinto) invocan la función real de forma independiente", async () => {
    mockResolve
      .mockResolvedValueOnce("jugador-1")
      .mockResolvedValueOnce("jugador-2");
    const cache = createCloseIdentityCache(ORG);

    const a = await cache.resolveJugadorId({
      organizadorId: ORG,
      legacyPlayerId: "legacy-1",
    });
    const b = await cache.resolveJugadorId({
      organizadorId: ORG,
      legacyPlayerId: "legacy-2",
    });

    expect(a).toBe("jugador-1");
    expect(b).toBe("jugador-2");
    expect(mockResolve).toHaveBeenCalledTimes(2);
  });

  it("llamadas concurrentes con la misma clave deduplican a una sola llamada real", async () => {
    let resolveOnce: (v: string | null) => void;
    mockResolve.mockImplementation(
      () => new Promise((resolve) => (resolveOnce = resolve))
    );
    const cache = createCloseIdentityCache(ORG);
    const params = { organizadorId: ORG, legacyPlayerId: "legacy-1" };

    const p1 = cache.resolveJugadorId(params);
    const p2 = cache.resolveJugadorId(params);
    resolveOnce!("jugador-1");

    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe("jugador-1");
    expect(b).toBe("jugador-1");
    expect(mockResolve).toHaveBeenCalledTimes(1);
  });

  it("una resolución fallida (rechazo) no queda cacheada: un reintento vuelve a llamar la red", async () => {
    mockResolve
      .mockRejectedValueOnce(new Error("blip transitorio"))
      .mockResolvedValueOnce("jugador-1");
    const cache = createCloseIdentityCache(ORG);
    const params = { organizadorId: ORG, legacyPlayerId: "legacy-1" };

    await expect(cache.resolveJugadorId(params)).rejects.toThrow("blip transitorio");
    const retried = await cache.resolveJugadorId(params);

    expect(retried).toBe("jugador-1");
    expect(mockResolve).toHaveBeenCalledTimes(2);
  });
});

describe("createCloseIdentityCache — ensureIdentity", () => {
  it("memoiza por jugadorId", async () => {
    mockEnsureIdentity.mockResolvedValue({ officialPlayerKey: "k1" });
    const cache = createCloseIdentityCache(ORG);

    await cache.ensureIdentity("jugador-1");
    await cache.ensureIdentity("jugador-1");
    await cache.ensureIdentity("jugador-2");

    expect(mockEnsureIdentity).toHaveBeenCalledTimes(2);
    expect(mockEnsureIdentity).toHaveBeenNthCalledWith(1, "jugador-1");
    expect(mockEnsureIdentity).toHaveBeenNthCalledWith(2, "jugador-2");
  });
});

describe("createCloseIdentityCache — ensureProfileLink", () => {
  it("memoiza por (jugadorId, organizadorId)", async () => {
    mockEnsureLink.mockResolvedValue({ linked: true, confidence: "OK" });
    const cache = createCloseIdentityCache(ORG);

    await cache.ensureProfileLink("jugador-1", ORG);
    await cache.ensureProfileLink("jugador-1", ORG);
    await cache.ensureProfileLink("jugador-1", "org-2");

    expect(mockEnsureLink).toHaveBeenCalledTimes(2);
  });
});

describe("createCloseIdentityCache — revokedLocalIds", () => {
  it("se precomputa una sola vez al crear el caché", async () => {
    mockListRevoked.mockResolvedValue(new Set(["revoked-1"]));
    const cache = createCloseIdentityCache(ORG);

    const first = await cache.revokedLocalIds;
    const second = await cache.revokedLocalIds;

    expect(first).toBe(second);
    expect(first.has("revoked-1")).toBe(true);
    expect(mockListRevoked).toHaveBeenCalledTimes(1);
  });
});
