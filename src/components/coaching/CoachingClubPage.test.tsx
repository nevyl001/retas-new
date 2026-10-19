/**
 * @jest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CoachingClubPage } from "./CoachingClubPage";
import * as coachingApi from "../../lib/coaching/coachingApi";
import type { CoachingClubSnapshot } from "../../lib/coaching/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ user: { id: "org-test-123" } }),
}));

jest.mock("../../club-experience", () => ({
  useBranding: () => ({ nombre: "Padelito Warehouse" }),
}));

jest.mock("../../lib/appRouting", () => ({
  navigateToAppHome: jest.fn(),
  navigateAppTo: jest.fn(),
  normalizeAppPathname: (p: string) => p,
}));

const mockSnapshot: CoachingClubSnapshot = {
  source: "demo",
  coaches: [
    {
      id: "coach-1",
      coachCode: "RIV-C-00001",
      nombre: "Coach Rodrigo",
      email: "rodrigo@club.com",
      telefono: "+52 998 123 4567",
      paisCodigo: "MX",
      genero: "M",
      categoria: "2da_fuerza",
      edad: 32,
      manoDominante: "derecha",
      enCancha: "reves",
      bio: "Coach titular",
      especialidades: ["Técnica", "Táctica"],
      fuerzas: ["1ra_fuerza", "2da_fuerza", "3ra_fuerza"],
      membershipStatus: "ACTIVE",
      fotoUrl: null,
    },
  ],
  links: [
    {
      id: "link-1",
      coachId: "coach-1",
      coachNombre: "Coach Rodrigo",
      jugadorId: "jug-1",
      jugadorNombre: "Carlos Alumno",
      rivieraId: "RIV-00000042",
      status: "ACTIVE",
      isPrimary: true,
    },
    {
      id: "link-2",
      coachId: "coach-1",
      coachNombre: "Coach Rodrigo",
      jugadorId: "jug-2",
      jugadorNombre: "Laura Pausada",
      rivieraId: "RIV-00000099",
      status: "PAUSED",
      isPrimary: false,
    },
  ],
};

describe("CoachingClubPage UX/UI Redesign", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.spyOn(coachingApi, "loadCoachingClubSnapshot").mockResolvedValue(mockSnapshot);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.restoreAllMocks();
  });

  it("renders the redesigned header with correct title, club identification, and demo distinction", async () => {
    await act(async () => {
      root.render(<CoachingClubPage pathname="/coaching" />);
    });

    const title = container.querySelector(".coaching-title");
    expect(title).not.toBeNull();
    expect(title?.textContent).toBe("Riviera Coaching");

    const kicker = container.querySelector(".coaching-kicker");
    expect(kicker?.textContent).toContain("Padelito Warehouse");

    const lead = container.querySelector(".coaching-lead");
    expect(lead?.textContent).toContain(
      "Gestiona tus coaches, alumnos y actividades de formación deportiva."
    );

    const demoBanner = container.querySelector(".coaching-demo-banner");
    expect(demoBanner).not.toBeNull();
    expect(demoBanner?.textContent).toContain("Modo demostración");
  });

  it("renders the 4 main tabs with icons and counter badges", async () => {
    await act(async () => {
      root.render(<CoachingClubPage pathname="/coaching" />);
    });

    const tabs = container.querySelectorAll(".coaching-tab");
    expect(tabs.length).toBe(4);
    expect(tabs[0].textContent).toContain("Dashboard");
    expect(tabs[1].textContent).toContain("Coaches");
    expect(tabs[2].textContent).toContain("Jugadores");
    expect(tabs[3].textContent).toContain("Agenda");

    // Coach counter badge reflects active count
    expect(tabs[1].textContent).toContain("1");
    // Jugadores counter badge reflects active count
    expect(tabs[2].textContent).toContain("1");
  });

  it("renders Dashboard KPIs with real metrics from snapshot (no invented stats)", async () => {
    await act(async () => {
      root.render(<CoachingClubPage pathname="/coaching" />);
    });

    const values = container.querySelectorAll(".coaching-kpi__value");
    expect(values.length).toBe(3);
    // 1 active coach
    expect(values[0].textContent).toBe("1");
    // 1 active link
    expect(values[1].textContent).toBe("1");
    // 1 paused link
    expect(values[2].textContent).toBe("1");

    const guide = container.querySelector(".coaching-guide-card");
    expect(guide).not.toBeNull();
    expect(guide?.textContent).toContain("Flujo operativo de la academia");
  });

  it("renders Coaches tab with protagonist cards and modal trigger button", async () => {
    await act(async () => {
      root.render(<CoachingClubPage pathname="/coaching/coaches" />);
    });

    const addCoachBtn = container.querySelector(".coaching-btn--primary");
    expect(addCoachBtn?.textContent).toContain("Agregar coach (demo)");

    const coachTitle = container.querySelector(".coaching-card__title");
    expect(coachTitle?.textContent).toBe("Coach Rodrigo");

    const coachCode = container.querySelector(".coaching-card__code");
    expect(coachCode?.textContent).toBe("RIV-C-00001");

    // Click to open modal
    await act(async () => {
      (addCoachBtn as HTMLButtonElement).click();
    });

    const modalTitle = document.querySelector(".riviera-modal__title");
    expect(modalTitle?.textContent).toBe("Agregar coach (demo)");

    const modalClose = document.querySelector(".riviera-modal__close");
    await act(async () => {
      (modalClose as HTMLButtonElement).click();
    });
  });

  it("renders Jugadores tab with canonical Riviera ID form and player link cards", async () => {
    await act(async () => {
      root.render(<CoachingClubPage pathname="/coaching/jugadores" />);
    });

    const input = container.querySelector("input[placeholder='RIV-00000001']");
    expect(input).not.toBeNull();

    const linkTitles = container.querySelectorAll(".coaching-card__title");
    expect(linkTitles.length).toBe(2);
    expect(linkTitles[0].textContent).toBe("Carlos Alumno");
    expect(linkTitles[1].textContent).toBe("Laura Pausada");

    // Badges
    const badges = container.querySelectorAll(".coaching-badge");
    const badgeTexts = Array.from(badges).map((b) => b.textContent);
    expect(badgeTexts).toContain("Activo");
    expect(badgeTexts).toContain("En pausa");
  });

  it("renders Agenda tab with premium informative upcoming feature card", async () => {
    await act(async () => {
      root.render(<CoachingClubPage pathname="/coaching/agenda" />);
    });

    const agendaCard = container.querySelector(".coaching-agenda-card");
    expect(agendaCard).not.toBeNull();
    expect(agendaCard?.textContent).toContain("Agenda y sesiones de clase");
    expect(agendaCard?.textContent).toContain("Próximamente en la Entrega D de Riviera Coaching");
  });
});

