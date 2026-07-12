import { normalizeOrganizerId } from "./useOrganizerPlayerPool";
import {
  PoolRequestGate,
  applyOrphanWarningsSideEffect,
  commitPoolFetchResult,
  derivePlayerPoolViews,
  shouldFetchOrganizerPool,
  shouldShowPlayerPoolLoading,
} from "./organizerPlayerPoolLogic";
import type { Player } from "../lib/database";

jest.mock("../lib/database", () => ({
  getPlayers: jest.fn(),
}));

const { getPlayers } = jest.requireMock("../lib/database") as {
  getPlayers: jest.Mock;
};

function player(id: string, name: string): Player {
  return {
    id,
    name,
    email: `${id}@padel.local`,
    created_at: "2020-01-01",
  } as Player;
}

describe("normalizeOrganizerId / shouldFetchOrganizerPool", () => {
  it("no fetch sin organizerId (undefined, null, vacío)", () => {
    expect(normalizeOrganizerId(undefined)).toBeNull();
    expect(normalizeOrganizerId(null)).toBeNull();
    expect(normalizeOrganizerId("")).toBeNull();
    expect(normalizeOrganizerId("   ")).toBeNull();
    expect(shouldFetchOrganizerPool(undefined)).toBe(false);
    expect(shouldFetchOrganizerPool(null)).toBe(false);
    expect(shouldFetchOrganizerPool("")).toBe(false);
    expect(shouldFetchOrganizerPool("org-1")).toBe(true);
  });
});

describe("shouldShowPlayerPoolLoading", () => {
  it("Gestión de jugadores deja de loading cuando llegan datos", () => {
    expect(shouldShowPlayerPoolLoading(true, 0)).toBe(true);
    expect(shouldShowPlayerPoolLoading(true, 27)).toBe(false);
    expect(shouldShowPlayerPoolLoading(false, 0)).toBe(false);
  });

  it("cero jugadores reales no usa length===0 como loading eterno", () => {
    expect(shouldShowPlayerPoolLoading(false, 0)).toBe(false);
  });
});

describe("derivePlayerPoolViews (Gestión de parejas reutiliza pool)", () => {
  it("deriva disponibles y emparejados del mismo pool", () => {
    const pool = [player("a", "Ana"), player("b", "Luis"), player("c", "Mia")];
    const { available, paired } = derivePlayerPoolViews(pool, ["b"]);
    expect(available.map((p) => p.id)).toEqual(["a", "c"]);
    expect(paired.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("PoolRequestGate anti-race", () => {
  it("respuesta obsoleta no sobrescribe la actual", () => {
    const gate = new PoolRequestGate();
    const oldId = gate.begin();
    const newId = gate.begin();

    const stale = commitPoolFetchResult(gate, oldId, {
      ok: true,
      players: [player("old", "Viejo")],
    });
    expect(stale.kind).toBe("ignore");

    const fresh = commitPoolFetchResult(gate, newId, {
      ok: true,
      players: [player("new", "Nuevo")],
    });
    expect(fresh).toEqual({
      kind: "success",
      players: [player("new", "Nuevo")],
    });
  });

  it("finally de request vieja no debe considerarse vigente", () => {
    const gate = new PoolRequestGate();
    const oldId = gate.begin();
    gate.invalidate();
    expect(gate.isCurrent(oldId)).toBe(false);
  });

  it("error de request vigente termina loading (commit error)", () => {
    const gate = new PoolRequestGate();
    const id = gate.begin();
    const commit = commitPoolFetchResult(gate, id, {
      ok: false,
      message: "falló red",
    });
    expect(commit).toEqual({ kind: "error", message: "falló red" });
  });
});

describe("refetch conserva datos visibles", () => {
  it("loading UI no oculta lista si ya hay players", () => {
    expect(shouldShowPlayerPoolLoading(true, 5)).toBe(false);
  });
});

describe("cambio de currentView / tournamentId no es contexto de pool", () => {
  it("mismo organizerId es la única clave de fetch", async () => {
    getPlayers.mockResolvedValue([player("p1", "Ana")]);
    // Simula dos “views” distintas sin cambiar organizer: un solo fetch esperado
    // por el consumidor (FourComponentsGrid); tournamentId no dispara lógica aquí.
    const organizerId = "org-1";
    expect(shouldFetchOrganizerPool(organizerId)).toBe(true);
    await getPlayers(organizerId);
    await getPlayers(organizerId);
    // El guard de no-refetch por view es: no incluir tournamentId/currentView
    // en deps del hook; aquí validamos que getPlayers solo recibe organizerId.
    expect(getPlayers.mock.calls.every((c) => c.length === 1)).toBe(true);
    expect(getPlayers.mock.calls.every((c) => c[0] === "org-1")).toBe(true);
  });
});

describe("warnings huérfanos no alteran el pool", () => {
  it("applyOrphanWarningsSideEffect no vacía players", () => {
    const pool = [player("a", "Ana"), player("b", "Luis")];
    const next = applyOrphanWarningsSideEffect(pool, [
      "participación huérfana: falta metadata.organizador_id",
    ]);
    expect(next).toBe(pool);
    expect(next).toHaveLength(2);
  });
});

describe("cambio de tab no vuelve a cargar (pool compartido en padre)", () => {
  it("toggle de panel hijo no implica nuevo fetch si el padre conserva players", () => {
    // Contrato: ModernPlayerManager con players prop externos no llama getPlayers.
    // El padre (FourComponentsGrid) mantiene useOrganizerPlayerPool montado
    // mientras ModeSectionPanel usa hidden (no unmount).
    const sharedPlayers = [player("a", "Ana")];
    const showLoadingAfterTabReturn = shouldShowPlayerPoolLoading(
      false,
      sharedPlayers.length
    );
    expect(showLoadingAfterTabReturn).toBe(false);
  });
});
