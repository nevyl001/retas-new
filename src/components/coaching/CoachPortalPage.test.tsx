/**
 * @jest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CoachPortalPage } from "./CoachPortalPage";
import { CoachingRouter } from "./CoachingRouter";
import * as coachingApi from "../../lib/coaching/coachingApi";
import type { CurrentCoachProfile } from "../../lib/coaching/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUser = { id: "user-coach-123", email: "coach@padel.com" };
let mockCurrentUser: { id: string; email: string } | null = mockUser;

jest.mock("../../contexts/UserContext", () => ({
  useUser: () => ({
    user: mockCurrentUser,
    loading: false,
  }),
}));

jest.mock("../../lib/appRouting", () => ({
  navigateToAppHome: jest.fn(),
  navigateAppTo: jest.fn(),
  normalizeAppPathname: (p: string) => p,
}));

const mockCoachProfile: CurrentCoachProfile = {
  id: "coach-uuid-1",
  authUserId: "user-coach-123",
  coachCode: "RIV-C-00042",
  nombre: "Coach Fernando",
  fotoUrl: null,
  bio: "Entrenador certificado nivel 2",
  filosofia: "Enfoque en técnica y control de fondo",
  especialidades: ["Técnica", "Defensa"],
  fuerzas: ["2da_fuerza", "3ra_fuerza"],
  memberships: [
    {
      membershipId: "mem-1",
      organizadorId: "club-alpha-uuid",
      clubNombre: "Padelito Warehouse",
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
    },
    {
      membershipId: "mem-2",
      organizadorId: "club-beta-uuid",
      clubNombre: "Acapulco Padel Club",
      status: "INACTIVE",
      createdAt: "2026-02-01T00:00:00Z",
    },
  ],
};

describe("CoachPortalPage & CoachingRouter", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockCurrentUser = mockUser;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.restoreAllMocks();
  });

  it("renders login required message when user is not authenticated", async () => {
    mockCurrentUser = null;
    jest.spyOn(coachingApi, "fetchCurrentCoachProfile").mockResolvedValue(null);

    await act(async () => {
      root.render(<CoachPortalPage />);
    });

    expect(container.textContent).toContain("Sesión requerida");
    expect(container.textContent).toContain("Inicia sesión con tu cuenta oficial");
  });

  it("renders unauthorized message when user is authenticated but not registered as a coach", async () => {
    mockCurrentUser = { id: "normal-player-id", email: "player@example.com" };
    jest.spyOn(coachingApi, "fetchCurrentCoachProfile").mockResolvedValue(null);

    await act(async () => {
      root.render(<CoachPortalPage />);
    });

    expect(container.textContent).toContain("Acceso exclusivo para entrenadores");
    expect(container.textContent).toContain("player@example.com");
    expect(container.textContent).toContain("no está registrada como coach oficial");
  });

  it("renders authentic coach identity with official RIV-C-##### code and profile details", async () => {
    jest.spyOn(coachingApi, "fetchCurrentCoachProfile").mockResolvedValue(mockCoachProfile);

    await act(async () => {
      root.render(<CoachPortalPage />);
    });

    expect(container.textContent).toContain("Coach Fernando");
    expect(container.textContent).toContain("RIV-C-00042");
    expect(container.textContent).toContain("Entrenador certificado nivel 2");
    expect(container.textContent).toContain("Técnica");
    expect(container.textContent).toContain("Defensa");
  });

  it("renders multi-club affiliations with active and inactive status badges", async () => {
    jest.spyOn(coachingApi, "fetchCurrentCoachProfile").mockResolvedValue(mockCoachProfile);

    await act(async () => {
      root.render(<CoachPortalPage />);
    });

    expect(container.textContent).toContain("Padelito Warehouse");
    expect(container.textContent).toContain("Acapulco Padel Club");

    const badges = container.querySelectorAll(".coaching-badge");
    const badgeTexts = Array.from(badges).map((b) => b.textContent?.trim());
    expect(badgeTexts).toContain("Activo");
    expect(badgeTexts).toContain("Inactivo");
  });

  it("renders pending membership with badge and allows coach to accept invitation", async () => {
    const pendingProfile: CurrentCoachProfile = {
      ...mockCoachProfile,
      memberships: [
        {
          membershipId: "mem-pending-42",
          organizadorId: "club-pending-uuid",
          clubNombre: "Club Deportivo Padel",
          status: "PENDING",
          createdAt: "2026-03-01T00:00:00Z",
        },
      ],
    };

    const activeProfile: CurrentCoachProfile = {
      ...mockCoachProfile,
      memberships: [
        {
          membershipId: "mem-pending-42",
          organizadorId: "club-pending-uuid",
          clubNombre: "Club Deportivo Padel",
          status: "ACTIVE",
          createdAt: "2026-03-01T00:00:00Z",
        },
      ],
    };

    const fetchSpy = jest
      .spyOn(coachingApi, "fetchCurrentCoachProfile")
      .mockResolvedValueOnce(pendingProfile)
      .mockResolvedValueOnce(activeProfile);

    const acceptSpy = jest
      .spyOn(coachingApi, "acceptCoachClubInvitation")
      .mockResolvedValueOnce({ success: true });

    await act(async () => {
      root.render(<CoachPortalPage />);
    });

    expect(container.textContent).toContain("Invitación pendiente");
    const acceptBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Aceptar invitación al club")
    );
    expect(acceptBtn).toBeTruthy();

    await act(async () => {
      acceptBtn?.click();
    });

    expect(acceptSpy).toHaveBeenCalledWith("mem-pending-42");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Activo");
  });

  it("allows switching operative club in multi-club setup", async () => {
    const multiClubProfile: CurrentCoachProfile = {
      ...mockCoachProfile,
      memberships: [
        {
          membershipId: "mem-1",
          organizadorId: "club-alpha-uuid",
          clubNombre: "Padelito Warehouse",
          status: "ACTIVE",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          membershipId: "mem-2",
          organizadorId: "club-beta-uuid",
          clubNombre: "Acapulco Padel Club",
          status: "ACTIVE",
          createdAt: "2026-02-01T00:00:00Z",
        },
      ],
    };
    jest.spyOn(coachingApi, "fetchCurrentCoachProfile").mockResolvedValue(multiClubProfile);

    await act(async () => {
      root.render(<CoachPortalPage />);
    });

    expect(container.textContent).toContain("Club operativo seleccionado");

    const switchBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Operar en este club")
    );
    expect(switchBtn).toBeTruthy();

    await act(async () => {
      switchBtn?.click();
    });

    // Now the second club should be active
    const cards = container.querySelectorAll(".coaching-card--highlight");
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain("Acapulco Padel Club");
  });

  it("routes /coaching/mi-espacio to CoachPortalPage and /coaching to CoachingClubPage", async () => {
    jest.spyOn(coachingApi, "fetchCurrentCoachProfile").mockResolvedValue(mockCoachProfile);
    jest.spyOn(coachingApi, "loadCoachingClubSnapshot").mockResolvedValue({
      source: "live",
      coaches: [],
      links: [],
    });

    // Test coach portal route
    await act(async () => {
      root.render(<CoachingRouter pathname="/coaching/mi-espacio" />);
    });
    expect(container.textContent).toContain("Espacio del Coach");

    // Test club admin route
    await act(async () => {
      root.render(<CoachingRouter pathname="/coaching" />);
    });
    expect(container.textContent).toContain("Dashboard");
  });
});

