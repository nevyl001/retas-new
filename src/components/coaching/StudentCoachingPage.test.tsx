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
let mockUserProfile: { name?: string; avatar_url?: string } | null = {
  name: "Diego Palomares",
};

jest.mock("../../contexts/UserContext", () => ({
  useUser: () => ({
    user: mockCurrentUser,
    userProfile: mockUserProfile,
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
    mockUserProfile = { name: "Diego Palomares" };
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
    expect(container.textContent).toContain(
      "Inicia sesión con tu cuenta oficial de Riviera",
    );
  });

  it("renders personalized header, daily mindset quote, and compact empty state without duplicate RV ID when student has no coach", async () => {
    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockResolvedValueOnce({
      ok: true,
      linked: true,
      rivieraId: "RIV-00000356",
      relationships: [],
    });

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    // Encabezado personalizado
    expect(container.textContent).toContain("Hola, Diego Palomares");
    expect(container.textContent).toContain("Mi Coaching");
    expect(container.textContent).toContain(
      "Tu espacio para entrenar, mejorar y seguir evolucionando.",
    );
    expect(container.textContent).toContain("RIV-00000356");
    expect(container.textContent).not.toContain("Riviera ID");
    expect(container.textContent).toContain("Ver mi Ficha de Ranking");
    expect(container.textContent).not.toContain("Volver a mi Ficha");

    // El identificador oficial aparece una sola vez en pantalla (en el encabezado)
    const idOccurrences = (container.textContent ?? "").split("RIV-00000356").length - 1;
    expect(idOccurrences).toBe(1);

    // Mensaje motivacional diario
    expect(container.textContent).toContain("MENTALIDAD RIVIERA");

    // Estado sin entrenador asignado
    expect(container.textContent).toContain("Tu evolución comienza aquí.");
    expect(container.textContent).toContain(
      "Cuando tu entrenador te vincule, encontrarás aquí tus clases, avances y próximos objetivos.",
    );
    expect(container.textContent).toContain("COPIAR MI RV ID");
  });

  it("renders active coaching relationship with training summary, player evolution, and ledger history", async () => {
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
        relationshipId: "rel-hack-1",
        organizadorId: "org-hack-uuid",
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
    expect(container.textContent).toContain("Hola, Diego Palomares");
    expect(container.textContent).toContain("RIV-00000356");
    expect(container.textContent).toContain("MENTALIDAD RIVIERA");

    // Validar información del coach y club
    expect(container.textContent).toContain("RESUMEN DEL ENTRENAMIENTO");
    expect(container.textContent).toContain("Prof. Roberto Morales");
    expect(container.textContent).toContain("COACH-007");
    expect(container.textContent).toContain("Bandeja");
    expect(container.textContent).toContain("Hack Pádel");

    // Validar métricas de balance
    expect(container.textContent).toContain("Clases disponibles");
    expect(container.textContent).toContain("4");
    expect(container.textContent).toContain("Paquete Vigente");
    expect(container.textContent).toContain("Clases completadas");
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("Clases Impartidas");

    // Validar Mi Evolución como Jugador
    expect(container.textContent).toContain("MI EVOLUCIÓN COMO JUGADOR");
    expect(container.textContent).toContain("ÚLTIMA CLASE");
    expect(container.textContent).toContain("EN QUÉ DEBO MEJORAR");
    expect(container.textContent).toContain("MIS AVANCES");
    expect(container.textContent).toContain("RECOMENDACIONES");
    expect(container.textContent).toContain("MI PRÓXIMO OBJETIVO");
    expect(container.textContent).toContain("Diez minutos de desplazamiento");
    expect(container.textContent).toContain("Defensa de pared");

    // Validar historial y ledger + privacidad de notas internas
    expect(container.textContent).toContain("Historial de Sesiones y Asignaciones");
    expect(container.textContent).toContain("Armado de bandeja profunda");
    expect(container.textContent).toContain("Mejor control en la volea");
    expect(container.textContent).toContain("Anticipar el globo");
    expect(container.textContent).not.toContain("Gran mejoría en posición de espera");
    expect(container.textContent).not.toContain("Clase presencial 1");
    expect(container.textContent).toContain("+5 Clases (Club)");
    expect(container.textContent).toContain("-1 Clase (Coach)");
  });

  it("muestra la evolución de cada club por separado y sin notas privadas", async () => {
    jest.spyOn(coachingApi, "fetchStudentTrainingTimeline").mockResolvedValue([
      {
        id: "ses-hack",
        startsAt: "2026-10-19T17:00:00Z",
        durationMinutes: 60,
        workedOn: ["Bandeja"],
        improvements: "Avance solo de Hack",
        areasToImprove: null,
        recommendations: null,
        nextGoals: null,
        motivationalMessage: null,
        followupUpdatedAt: null,
        coachNombre: "Prof. Roberto Morales",
        clubNombre: "Club Riviera",
        relationshipId: "rel-hack-1",
        organizadorId: "org-hack-uuid",
        nextScheduledAt: null,
      },
      {
        id: "ses-valvi",
        startsAt: "2026-10-18T17:00:00Z",
        durationMinutes: 60,
        workedOn: ["Volea"],
        improvements: "Avance solo de Valvidub",
        areasToImprove: null,
        recommendations: null,
        nextGoals: null,
        motivationalMessage: null,
        followupUpdatedAt: null,
        coachNombre: "Coach Ana",
        clubNombre: "Club Riviera",
        relationshipId: "rel-valvi-1",
        organizadorId: "org-valvi-uuid",
        nextScheduledAt: null,
        privateNotes: "nota reservada",
      } as never,
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
          },
          coach: {
            id: "coach-uuid-1",
            nombre: "Prof. Roberto Morales",
            coachCode: "COACH-007",
            fotoUrl: null,
            especialidades: [],
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
              id: "led-hack",
              delta: -1,
              tipo: "CLASS_DEBIT",
              notas: null,
              createdAt: "2026-10-19T18:00:00Z",
              session: { id: "ses-hack", startsAt: "2026-10-19T17:00:00Z" },
            },
          ],
        },
        {
          relationshipId: "rel-valvi-1",
          status: "ACTIVE",
          isPrimary: false,
          startedAt: "2026-09-01T12:00:00Z",
          endedAt: null,
          club: {
            organizadorId: "org-valvi-uuid",
            nombre: "Club Riviera",
          },
          coach: {
            id: "coach-uuid-2",
            nombre: "Coach Ana",
            coachCode: "COACH-008",
            fotoUrl: null,
            especialidades: [],
          },
          player: {
            id: "player-uuid-1",
            nombre: "Diego Palomares",
            rivieraId: "RIV-00000356",
          },
          balance: {
            balanceClasses: 2,
            totalClassesGiven: 3,
            updatedAt: "2026-10-18T18:00:00Z",
          },
          ledger: [
            {
              id: "led-valvi",
              delta: -1,
              tipo: "CLASS_DEBIT",
              notas: null,
              createdAt: "2026-10-18T18:00:00Z",
              session: { id: "ses-valvi", startsAt: "2026-10-18T17:00:00Z" },
            },
          ],
        },
      ],
    });

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    const sections = container.querySelectorAll(".coaching-student-relation-card");
    expect(sections).toHaveLength(2);
    expect(sections[0].textContent).toContain("Avance solo de Hack");
    expect(sections[0].textContent).not.toContain("Avance solo de Valvidub");
    expect(sections[1].textContent).toContain("Avance solo de Valvidub");
    expect(sections[1].textContent).not.toContain("Avance solo de Hack");
    expect(container.textContent).not.toContain("nota reservada");
  });

  it("does not render empty evolution cards when coach is assigned but no sessions are registered yet", async () => {
    jest.spyOn(coachingApi, "fetchStudentTrainingTimeline").mockResolvedValue([]);
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
          },
          coach: {
            id: "coach-uuid-1",
            nombre: "Prof. Roberto Morales",
            coachCode: "COACH-007",
            fotoUrl: null,
            especialidades: [],
          },
          player: {
            id: "player-uuid-1",
            nombre: "Diego Palomares",
            rivieraId: "RIV-00000356",
          },
          balance: {
            balanceClasses: 2,
            totalClassesGiven: 0,
            updatedAt: "2026-10-15T12:00:00Z",
          },
          ledger: [],
        },
      ],
    });

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    expect(container.textContent).toContain("MI EVOLUCIÓN COMO JUGADOR");
    expect(container.textContent).not.toContain("EN QUÉ DEBO MEJORAR");
    expect(container.textContent).not.toContain("RECOMENDACIONES");
    expect(container.textContent).not.toContain("MI PRÓXIMO OBJETIVO");
  });

  it("renders error alert with retry button when loading fails", async () => {
    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockRejectedValueOnce(
      new Error("Conexión perdida con la base de datos"),
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
    expect(container.textContent).toContain("Tu evolución comienza aquí.");
  });
});
