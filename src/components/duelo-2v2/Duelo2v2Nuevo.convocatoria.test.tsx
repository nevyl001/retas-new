/**
 * Composición: CTA en Nuevo Duelo y ausencia en modos excluidos.
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Duelo2v2Nuevo } from "./Duelo2v2Nuevo";
import * as fs from "fs";
import * as path from "path";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock("../../club-experience", () => ({
  useClubModeEyebrow: () => "Club Test",
}));

jest.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ user: { id: "org-1" }, loading: false }),
}));

jest.mock("../../lib/rivieraJugadores/rivieraJugadoresService", () => ({
  listRivieraJugadores: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../services/duelo2v2Service", () => ({
  createDuelo2v2: jest.fn(),
  ensureDuelo2v2OpenDraft: jest.fn().mockResolvedValue({
    id: "duelo-draft-1",
    nombre: "Duelo",
    cancha: "1",
    programado_en: "2026-07-16T20:00:00.000Z",
    organizador_id: "org-1",
    estado: "configuracion",
  }),
}));

jest.mock("../../lib/retaAbierta/retaAbiertaService", () => ({
  buildRetaAbiertaPublicUrl: (slug: string) => `https://app.test/jugar/${slug}`,
  fetchOpenGameRegistrationConfig: jest.fn().mockResolvedValue(null),
  fetchOpenRegistrationPublic: jest.fn(),
  listOpenGameRegistrationEntries: jest.fn().mockResolvedValue([]),
  promoteOpenRegistrationEntry: jest.fn(),
  removeOpenRegistrationEntry: jest.fn(),
  upsertOpenRegistrationConfig: jest.fn().mockResolvedValue({
    public_slug: "ra-test",
    enabled: true,
    status: "open",
    capacity: 4,
  }),
}));

jest.mock("./DueloPairBuilder", () => ({
  bothPairsReady: () => false,
  DueloPairBuilder: () => <div data-testid="pair-builder">Parejas</div>,
}));

jest.mock("./Duelo2v2PageShell", () => ({
  Duelo2v2PageShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("./duelo2v2Nav", () => ({
  navigateDuelo2v2: jest.fn(),
  duelo2v2GestionarPath: (id: string) => `/duelo-2v2/${id}/gestionar`,
}));

describe("Duelo2v2Nuevo — Lanzar por WhatsApp", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("muestra el CTA en Nuevo duelo 2 vs 2 con parejas vacías", async () => {
    await act(async () => {
      root.render(<Duelo2v2Nuevo />);
    });
    // defer draftReady
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Nuevo duelo 2 vs 2");
    expect(
      container.querySelector('[data-testid="lanzar-por-whatsapp"]')
    ).not.toBeNull();
    expect(container.textContent).toContain("Convocatoria Riviera");
  });
});

describe("Ausencia de CTA en modos excluidos (código fuente)", () => {
  const rootDir = path.join(__dirname, "..");

  it("Liga no importa ConvocatoriaWhatsAppPanel", () => {
    const ligaDir = path.join(rootDir, "liga");
    const files = fs.readdirSync(ligaDir).filter((f) => f.endsWith(".tsx"));
    for (const f of files) {
      const src = fs.readFileSync(path.join(ligaDir, f), "utf8");
      expect(src).not.toMatch(/ConvocatoriaWhatsAppPanel|Lanzar por WhatsApp/);
    }
  });

  it("Torneo Express no importa ConvocatoriaWhatsAppPanel", () => {
    const teDir = path.join(rootDir, "torneo-express");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p));
        else if (entry.name.endsWith(".tsx")) out.push(p);
      }
      return out;
    };
    for (const file of walk(teDir)) {
      const src = fs.readFileSync(file, "utf8");
      expect(src).not.toMatch(/ConvocatoriaWhatsAppPanel|Lanzar por WhatsApp/);
    }
  });

  it("Reta y Americano sí cablean convocatoria", () => {
    const reta = fs.readFileSync(
      path.join(rootDir, "TournamentDetails.tsx"),
      "utf8"
    );
    const retaMobile = fs.readFileSync(
      path.join(rootDir, "reta/RetaMobileOrganizerLayout.tsx"),
      "utf8"
    );
    const americano = fs.readFileSync(
      path.join(rootDir, "AmericanoDinamico/AmericanoDinamicoScreen.tsx"),
      "utf8"
    );
    const organizer = fs.readFileSync(
      path.join(rootDir, "reta-abierta/RetaAbiertaOrganizerPanel.tsx"),
      "utf8"
    );
    expect(reta).toMatch(/RetaAbiertaOrganizerPanel/);
    expect(retaMobile).toMatch(/RetaAbiertaOrganizerPanel/);
    expect(americano).toMatch(/ConvocatoriaWhatsAppPanel/);
    // Remontada Final / Round Robin: mismo panel + championship headline
    expect(organizer).toMatch(/loadChampionshipConfig/);
    expect(organizer).toMatch(/championshipEnabled/);
  });
});
