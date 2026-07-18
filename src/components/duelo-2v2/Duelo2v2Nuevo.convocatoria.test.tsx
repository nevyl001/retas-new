/**
 * Nuevo duelo: sin panel de convocatoria; hint informativo; Guardar crea fila nueva.
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { Duelo2v2Nuevo } from "./Duelo2v2Nuevo";
import * as fs from "fs";
import * as path from "path";
import {
  clearDuelo2v2CreateSession,
  writeDuelo2v2CreateDraft,
} from "../../lib/duelo2v2/duelo2v2CreateDraft";
import { createDuelo2v2OpenDraft, getDuelos2v2 } from "../../services/duelo2v2Service";
import { navigateDuelo2v2 } from "./duelo2v2Nav";
import {
  fetchOpenGameRegistrationConfig,
} from "../../lib/retaAbierta/retaAbiertaService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock("../../club-experience", () => ({
  useClubModeEyebrow: () => "Club Test",
  useConvocatoriaOriginName: () => "Club Test",
}));

jest.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ user: { id: "org-1" }, loading: false }),
}));

jest.mock("../../services/duelo2v2Service", () => ({
  createDuelo2v2OpenDraft: jest.fn().mockResolvedValue({
    id: "duelo-nuevo-99",
    nombre: "Hackpadel nuevo",
    cancha: "1",
    programado_en: "2026-07-16T23:00:00.000Z",
    programado_hasta: "2026-07-17T01:00:00.000Z",
    organizador_id: "org-1",
    estado: "configuracion",
  }),
  getDuelos2v2: jest.fn().mockResolvedValue([]),
  getDuelo2v2ById: jest.fn(),
  ensureDuelo2v2OpenDraft: jest.fn(),
}));

jest.mock("../../lib/retaAbierta/retaAbiertaService", () => ({
  buildRetaAbiertaPublicUrl: (slug: string) => `https://app.test/jugar/${slug}`,
  fetchOpenGameRegistrationConfig: jest.fn().mockResolvedValue({
    public_slug: "ra-old",
    enabled: true,
    status: "open",
    capacity: 4,
    category_label: "5ta Fza",
  }),
  fetchOpenRegistrationPublic: jest.fn(),
  listOpenGameRegistrationEntries: jest.fn().mockResolvedValue([
    { id: "1", status: "confirmed" },
    { id: "2", status: "confirmed" },
    { id: "3", status: "confirmed" },
    { id: "4", status: "confirmed" },
  ]),
  promoteOpenRegistrationEntry: jest.fn(),
  removeOpenRegistrationEntry: jest.fn(),
  upsertOpenRegistrationConfig: jest.fn(),
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

describe("Duelo2v2Nuevo — ciclo de vida limpio", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.clearAllMocks();
    (getDuelos2v2 as jest.Mock).mockResolvedValue([]);
    sessionStorage.clear();
    writeDuelo2v2CreateDraft("org-1", {
      nombre: "Hackpadel",
      cancha: "1",
      categoria: "5ta Fza",
      draftDate: "2026-07-16",
      draftTimeStart: "17:00",
      draftTimeEnd: "19:00",
      pairA: null,
      pairB: null,
      openDueloId: "duelo-viejo-4inscritos",
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    sessionStorage.clear();
  });

  async function renderNuevo() {
    await act(async () => {
      root.render(<Duelo2v2Nuevo />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("no renderiza ConvocatoriaWhatsAppPanel ni 4/4 al montar", async () => {
    await renderNuevo();

    expect(container.textContent).toContain("Nuevo duelo 2 vs 2");
    expect(
      container.querySelector('[data-testid="convocatoria-whatsapp-panel"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="lanzar-por-whatsapp"]')
    ).toBeNull();
    expect(container.textContent).not.toMatch(/Confirmados:\s*4/);
    expect(container.textContent).not.toMatch(/4 de 4/);
    expect(container.textContent).not.toContain("Ya son los 4 jugadores");
    // Convocatoria aún no activa: panel CTA ausente; copy solo anticipa el
    // flujo post-guardar (copy actual del panel «Siguiente»).
    expect(container.textContent).toContain(
      "Al guardar abres Convocatoria con «Lanzar y copiar» para WhatsApp."
    );
    expect(container.textContent).not.toMatch(/Lanzar por WhatsApp/);
  });

  it("no llama get_open_game_registration al montar", async () => {
    await renderNuevo();
    expect(fetchOpenGameRegistrationConfig).not.toHaveBeenCalled();
  });

  it("limpia openDueloId de sessionStorage al montar (sin hidratar form)", async () => {
    await renderNuevo();
    expect(sessionStorage.getItem("duelo-2v2-draft:org-1")).toBeNull();
    const nombreInput = container.querySelector(
      "#duelo-nombre"
    ) as HTMLInputElement | null;
    expect(nombreInput?.value ?? "").toBe("");
    expect(container.textContent).not.toContain("Hackpadel");
  });

  it("botón Guardar duelo visible en formulario limpio", async () => {
    await renderNuevo();
    expect(
      container.querySelector('[data-testid="guardar-duelo"]')
    ).not.toBeNull();
    expect(container.textContent).toContain("Guardar duelo");
  });

  it("muestra Continuar borrador solo si hay duelo en configuración (sin hidratar)", async () => {
    (getDuelos2v2 as jest.Mock).mockResolvedValue([
      {
        id: "cfg-1",
        nombre: "Borrador visible",
        estado: "configuracion",
        organizador_id: "org-1",
      },
    ]);
    await renderNuevo();

    expect(
      container.querySelector('[data-testid="duelo-pending-draft-card"]')
    ).not.toBeNull();
    expect(container.textContent).toContain("Encontramos un duelo pendiente");
    const nombreInput = container.querySelector(
      "#duelo-nombre"
    ) as HTMLInputElement;
    expect(nombreInput.value).toBe("");

    await act(async () => {
      container
        .querySelector('[data-testid="continuar-borrador"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(navigateDuelo2v2).toHaveBeenCalledWith(
      "/duelo-2v2/cfg-1/gestionar"
    );
  });

  it("Descartar limpia sesión y oculta la tarjeta sin llamar convocatoria", async () => {
    (getDuelos2v2 as jest.Mock).mockResolvedValue([
      {
        id: "cfg-1",
        nombre: "Borrador",
        estado: "configuracion",
        organizador_id: "org-1",
      },
    ]);
    writeDuelo2v2CreateDraft("org-1", {
      nombre: "X",
      cancha: "1",
      categoria: "",
      draftDate: "2026-07-16",
      draftTimeStart: "15:00",
      draftTimeEnd: "17:00",
      pairA: null,
      pairB: null,
      openDueloId: "cfg-1",
    });

    await renderNuevo();
    // mount already cleared session; re-seed then discard
    writeDuelo2v2CreateDraft("org-1", {
      nombre: "X",
      cancha: "1",
      categoria: "",
      draftDate: "2026-07-16",
      draftTimeStart: "15:00",
      draftTimeEnd: "17:00",
      pairA: null,
      pairB: null,
      openDueloId: "cfg-1",
    });

    await act(async () => {
      container
        .querySelector('[data-testid="descartar-borrador"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(sessionStorage.getItem("duelo-2v2-draft:org-1")).toBeNull();
    expect(
      container.querySelector('[data-testid="duelo-pending-draft-card"]')
    ).toBeNull();
    expect(fetchOpenGameRegistrationConfig).not.toHaveBeenCalled();
  });

  it("no reutiliza duelos finalizados ni en_juego como borrador", async () => {
    (getDuelos2v2 as jest.Mock).mockResolvedValue([
      {
        id: "fin-1",
        nombre: "Ya cerrado",
        estado: "finalizado",
        organizador_id: "org-1",
      },
      {
        id: "live-1",
        nombre: "En juego",
        estado: "en_juego",
        organizador_id: "org-1",
      },
    ]);
    await renderNuevo();
    expect(
      container.querySelector('[data-testid="duelo-pending-draft-card"]')
    ).toBeNull();
  });

  it("doble submit en UI bloqueado por saveLock (una sola llamada a create)", async () => {
    const user = userEvent.setup();
    let resolveCreate: ((v: unknown) => void) | undefined;
    (createDuelo2v2OpenDraft as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );

    await renderNuevo();

    // cancha/lugar/horario ya tienen defaults; solo falta el nombre para canSubmit.
    await user.type(
      screen.getByLabelText(/Nombre del encuentro/i),
      "Idempotente"
    );

    const botones = screen.getAllByTestId("guardar-duelo");
    const boton = botones.find((el) => !(el as HTMLButtonElement).disabled);
    expect(boton).toBeTruthy();
    expect(boton).not.toBeDisabled();

    await Promise.all([user.click(boton!), user.click(boton!)]);

    expect(createDuelo2v2OpenDraft).toHaveBeenCalledTimes(1);
    expect(boton).toBeDisabled();

    await act(async () => {
      resolveCreate?.({
        id: "once-1",
        nombre: "Idempotente",
        cancha: "1",
        programado_en: "2026-07-16T21:00:00.000Z",
        programado_hasta: "2026-07-16T23:00:00.000Z",
        organizador_id: "org-1",
        estado: "configuracion",
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(navigateDuelo2v2).toHaveBeenCalledWith(
        "/duelo-2v2/once-1/gestionar"
      );
    });
    expect(createDuelo2v2OpenDraft).toHaveBeenCalledTimes(1);
  });
});

describe("clearDuelo2v2CreateSession", () => {
  it("borra la clave de draft del organizador", () => {
    writeDuelo2v2CreateDraft("org-1", {
      nombre: "X",
      cancha: "1",
      categoria: "",
      draftDate: "2026-07-16",
      draftTimeStart: "15:00",
      draftTimeEnd: "17:00",
      pairA: null,
      pairB: null,
      openDueloId: "abc",
    });
    clearDuelo2v2CreateSession("org-1");
    expect(sessionStorage.getItem("duelo-2v2-draft:org-1")).toBeNull();
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

  it("Reta y Americano sí cablean convocatoria; Nuevo duelo no", () => {
    const reta = fs.readFileSync(
      path.join(rootDir, "TournamentDetails.tsx"),
      "utf8"
    );
    const americano = fs.readFileSync(
      path.join(rootDir, "AmericanoDinamico/AmericanoDinamicoScreen.tsx"),
      "utf8"
    );
    const nuevo = fs.readFileSync(
      path.join(rootDir, "duelo-2v2/Duelo2v2Nuevo.tsx"),
      "utf8"
    );
    const gestionar = fs.readFileSync(
      path.join(rootDir, "duelo-2v2/Duelo2v2Gestionar.tsx"),
      "utf8"
    );
    expect(reta).toMatch(/RetaAbiertaOrganizerPanel/);
    expect(americano).toMatch(/ConvocatoriaWhatsAppPanel/);
    expect(nuevo).not.toMatch(/ConvocatoriaWhatsAppPanel/);
    expect(gestionar).toMatch(/ConvocatoriaWhatsAppPanel/);
  });
});
