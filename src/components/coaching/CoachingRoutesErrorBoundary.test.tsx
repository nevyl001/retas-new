/**
 * @jest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ErrorBoundary } from "../ErrorBoundary";
import { CoachingRouter } from "./CoachingRouter";
import * as coachingApi from "../../lib/coaching/coachingApi";
import type { CoachingClubSnapshot, CurrentCoachProfile } from "../../lib/coaching/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUser = {
  id: "user-test-uuid",
  email: "test@rivierapadel.com",
};

jest.mock("../../contexts/UserContext", () => ({
  useUser: () => ({
    user: mockUser,
    isStudentOnly: false,
    isCoachOnly: false,
    loading: false,
  }),
}));

jest.mock("../../club-experience", () => ({
  useBranding: () => ({ nombre: "Club Deportivo Riviera" }),
}));

jest.mock("../../lib/appRouting", () => ({
  navigateToAppHome: jest.fn(),
  navigateAppTo: jest.fn(),
  normalizeAppPathname: (p: string) => p,
}));

const mockSnapshot: CoachingClubSnapshot = {
  source: "live",
  coaches: [
    {
      id: "coach-1",
      coachCode: "RIV-C-00001",
      nombre: "Coach Rodrigo",
      email: "rodrigo@club.com",
      membershipStatus: "ACTIVE",
      especialidades: ["Técnica"],
      fuerzas: ["1ra_fuerza"],
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
      balanceClasses: 5,
      totalClassesGiven: 2,
    },
  ],
};

const mockCoachProfile: CurrentCoachProfile = {
  id: "coach-uuid-1",
  authUserId: "user-test-uuid",
  coachCode: "RIV-C-00042",
  nombre: "Coach Rodrigo",
  fotoUrl: null,
  bio: "Entrenador certificado",
  filosofia: "Control y técnica",
  especialidades: ["Técnica"],
  fuerzas: ["1ra_fuerza"],
  memberships: [
    {
      membershipId: "mem-1",
      organizadorId: "org-1",
      clubNombre: "Club Deportivo Riviera",
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
};

describe("Coaching Routes ErrorBoundary Validation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("mounts /coaching within ErrorBoundary without unhandled exceptions or crash fallback", async () => {
    jest.spyOn(coachingApi, "loadCoachingClubSnapshot").mockResolvedValueOnce(mockSnapshot);

    await act(async () => {
      root.render(
        <ErrorBoundary>
          <CoachingRouter pathname="/coaching" />
        </ErrorBoundary>
      );
    });

    // Validar que NO se disparó el fallback de ErrorBoundary ("Algo salió mal")
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain("Algo salió mal");

    // Validar contenido esperado de CoachingClubPage
    expect(container.textContent).toContain("Riviera Coaching");
    expect(container.textContent).toContain("Dashboard");
    expect(container.textContent).toContain("Coaches");
    expect(container.textContent).toContain("Jugadores");
  });

  it("mounts /coaching/mi-espacio within ErrorBoundary without unhandled exceptions or crash fallback", async () => {
    jest.spyOn(coachingApi, "fetchCurrentCoachProfile").mockResolvedValueOnce(mockCoachProfile);
    jest.spyOn(coachingApi, "fetchCoachAssignedStudents").mockResolvedValueOnce([
      {
        id: "rel-1",
        coachId: "coach-uuid-1",
        coachNombre: "Coach Rodrigo",
        jugadorId: "jug-1",
        jugadorNombre: "Carlos Alumno",
        rivieraId: "RIV-00000042",
        status: "ACTIVE",
        isPrimary: true,
        balanceClasses: 3,
        totalClassesGiven: 1,
      },
    ]);
    jest.spyOn(coachingApi, "fetchCoachAgenda").mockResolvedValueOnce([]);
    jest.spyOn(coachingApi, "fetchCoachFollowupDigest").mockResolvedValueOnce([]);

    await act(async () => {
      root.render(
        <ErrorBoundary>
          <CoachingRouter pathname="/coaching/mi-espacio" />
        </ErrorBoundary>
      );
    });

    // Validar que NO se disparó el fallback de ErrorBoundary
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain("Algo salió mal");

    // Validar contenido esperado del CoachPortalPage
    expect(container.textContent).toContain("Espacio del Coach");
    expect(container.textContent).toContain("Coach Rodrigo");
    expect(container.textContent).toContain("Carlos Alumno");
    expect(container.textContent).toContain("3 clases disponibles");
  });

  it("mounts /coaching/mi-coaching within ErrorBoundary without unhandled exceptions or crash fallback", async () => {
    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockResolvedValueOnce({
      ok: true,
      linked: true,
      rivieraId: "RIV-00000107",
      relationships: [
        {
          relationshipId: "rel-student-1",
          status: "ACTIVE",
          isPrimary: true,
          startedAt: "2026-10-15T12:00:00Z",
          endedAt: null,
          club: {
            organizadorId: "org-hack-uuid",
            nombre: "Hack Pádel",
          },
          coach: {
            id: "coach-1",
            nombre: "Gabriel Duran",
            coachCode: "COACH-007",
            especialidades: ["Bandeja"],
          },
          player: {
            id: "p-1",
            nombre: "Alumno Zaid",
            rivieraId: "RIV-00000107",
          },
          balance: {
            balanceClasses: 10,
            totalClassesGiven: 3,
          },
          history: [],
        } as any,
      ],
    });
    jest.spyOn(coachingApi, "fetchStudentTrainingTimeline").mockResolvedValueOnce([]);

    await act(async () => {
      root.render(
        <ErrorBoundary>
          <CoachingRouter pathname="/coaching/mi-coaching" />
        </ErrorBoundary>
      );
    });

    // Validar que NO se disparó el fallback de ErrorBoundary
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain("Algo salió mal");

    // Validar contenido esperado de StudentCoachingPage
    expect(container.textContent).toContain("Mi Coaching");
    expect(container.textContent).toContain("Gabriel Duran");
    expect(container.textContent).toContain("Hack Pádel");
    expect(container.textContent).toContain("10");
  });

  it("mounts /coaching/acceso-alumno within ErrorBoundary without unhandled exceptions or crash fallback", async () => {
    await act(async () => {
      root.render(
        <ErrorBoundary>
          <CoachingRouter pathname="/coaching/acceso-alumno" />
        </ErrorBoundary>
      );
    });

    // Validar que NO se disparó el fallback de ErrorBoundary
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain("Algo salió mal");

    // Validar contenido esperado de StudentAccessPage (formulario de acceso)
    expect(container.textContent).toContain("Acceso de Alumno");
    expect(container.textContent).toContain("Correo Electrónico");
    expect(container.textContent).toContain("Contraseña");
    expect(container.textContent).toContain("Ingresar a Mi Coaching");
  });
});
