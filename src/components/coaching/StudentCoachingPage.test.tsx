/**
 * @jest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudentCoachingPage } from "./StudentCoachingPage";
import { CoachingRouter } from "./CoachingRouter";
import * as coachingApi from "../../lib/coaching/coachingApi";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUser = { id: "user-student-123", email: "diego@padel.com" };
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

describe("StudentCoachingPage & CoachingRouter", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockCurrentUser = mockUser;
    jest.clearAllMocks();
    jest.spyOn(coachingApi, "fetchStudentTrainingTimeline").mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders login required message when user is not authenticated", async () => {
    mockCurrentUser = null;

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    expect(container.textContent).toContain("Sesión requerida");
    expect(container.textContent).toContain("Inicia sesión con tu cuenta oficial de Riviera");
  });

  it("renders empty state with Riviera ID when student has no active coaching package", async () => {
    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockResolvedValueOnce({
      ok: true,
      linked: true,
      rivieraId: "RIV-00000356",
      relationships: [],
    });

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    expect(container.textContent).toContain("Aún no tienes un entrenador asignado");
    expect(container.textContent).toContain("RIV-00000356");
  });

  it("renders active coaching relationship with club, coach, class balance, and ledger history", async () => {
    jest.spyOn(coachingApi, "fetchStudentTrainingTimeline").mockResolvedValue([
      {
        id: "ses-1",
        startsAt: "2026-10-19T17:00:00Z",
        durationMinutes: 60,
        workedOn: ["Bandeja"],
        improvements: "Mejor control en la volea",
        areasToImprove: "Anticipar el globo",
        recommendations: "Diez minutos de desplazamiento",
        nextGoals: "Defensa de pared",
        motivationalMessage: "Buen trabajo hoy",
        followupUpdatedAt: null,
        coachNombre: "Prof. Roberto Morales",
        clubNombre: "Hack Pádel",
        nextScheduledAt: null,
      },
    ]);
    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockResolvedValueOnce({
      ok: true,
      linked: true,
      rivieraId: "RIV-00000356",
      relationships: [
        {
          relationshipId: "rel-hack-1",
          status: "ACTIVE",
          isPrimary: true,
          startedAt: "2026-10-15T12:00:00Z",
          endedAt: null,
          club: {
            organizadorId: "org-hack-uuid",
            nombre: "Hack Pádel",
            brandingKey: "hack-padel",
          },
          coach: {
            id: "coach-uuid-1",
            nombre: "Prof. Roberto Morales",
            coachCode: "COACH-007",
            fotoUrl: null,
            especialidades: ["Bandeja", "Defensa de Pared"],
          },
          player: {
            id: "player-uuid-1",
            nombre: "Diego Palomares",
            rivieraId: "RIV-00000356",
          },
          balance: {
            balanceClasses: 4,
            totalClassesGiven: 1,
            updatedAt: "2026-10-19T18:00:00Z",
          },
          ledger: [
            {
              id: "led-1",
              delta: -1,
              tipo: "CLASS_SESSION",
              notas: "Clase presencial 1",
              createdAt: "2026-10-19T18:00:00Z",
              session: {
                id: "ses-1",
                startsAt: "2026-10-19T17:00:00Z",
                durationMinutes: 60,
                focus: "Armado de bandeja profunda",
                workedOn: ["Bandeja"],
                notesSummary: "Gran mejoría en posición de espera",
              },
            },
            {
              id: "led-2",
              delta: 5,
              tipo: "ASSIGN",
              notas: "Paquete inicial 5 clases",
              createdAt: "2026-10-15T12:00:00Z",
              session: null,
            },
          ],
        },
      ],
    });

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    // Validar encabezados y badge
    expect(container.textContent).toContain("Mi Coaching");
    expect(container.textContent).toContain("RIV-00000356");

    // Validar información del coach y club
    expect(container.textContent).toContain("Prof. Roberto Morales");
    expect(container.textContent).toContain("COACH-007");
    expect(container.textContent).toContain("Bandeja");
    expect(container.textContent).toContain("Hack Pádel");

    // Validar métricas de balance
    expect(container.textContent).toContain("4");
    expect(container.textContent).toContain("Paquete Vigente");
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("Clases Impartidas");

    // Validar historial y ledger
    expect(container.textContent).toContain("Historial de Sesiones y Asignaciones");
    expect(container.textContent).toContain("Armado de bandeja profunda");
    expect(container.textContent).toContain("Mejor control en la volea");
    expect(container.textContent).toContain("Anticipar el globo");
    expect(container.textContent).not.toContain("Gran mejoría en posición de espera");
    expect(container.textContent).not.toContain("Clase presencial 1");
    expect(container.textContent).toContain("+5 Clases (Club)");
    expect(container.textContent).toContain("-1 Clase (Coach)");
  });

  it("renders error alert with retry button when loading fails", async () => {
    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockRejectedValueOnce(
      new Error("Conexión perdida con la base de datos")
    );

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    expect(container.textContent).toContain("No pudimos cargar tus clases");
    expect(container.textContent).toContain("Conexión perdida con la base de datos");
    expect(container.textContent).toContain("Reintentar");
  });

  it("CoachingRouter routes /coaching/mi-coaching to StudentCoachingPage", async () => {
    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockResolvedValueOnce({
      ok: true,
      linked: true,
      rivieraId: "RIV-00000356",
      relationships: [],
    });

    await act(async () => {
      root.render(<CoachingRouter pathname="/coaching/mi-coaching" />);
    });

    expect(container.textContent).toContain("Mi Coaching");
    expect(container.textContent).toContain("Aún no tienes un entrenador asignado");
  });
});
