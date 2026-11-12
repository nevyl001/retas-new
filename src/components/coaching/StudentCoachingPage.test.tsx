/**
 * @jest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudentCoachingPage } from "./StudentCoachingPage";
import { CoachingRouter } from "./CoachingRouter";
import * as coachingApi from "../../lib/coaching/coachingApi";
import * as uploadAvatarModule from "../../lib/rivieraJugadores/uploadAvatar";

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

jest.mock("../jugadores/JugadorAvatarCropModal", () => ({
  JugadorAvatarCropModal: ({ open, onConfirm, onClose }: any) =>
    open ? (
      <div data-testid="crop-modal">
        <button
          data-testid="crop-confirm"
          onClick={() =>
            onConfirm(new File(["dummy"], "avatar.jpg", { type: "image/jpeg" }))
          }
        >
          Usar recorte
        </button>
        <button data-testid="crop-close" onClick={onClose}>
          Cerrar
        </button>
      </div>
    ) : null,
}));

jest.mock("../../lib/rivieraJugadores/uploadAvatar", () => ({
  ...jest.requireActual("../../lib/rivieraJugadores/uploadAvatar"),
  uploadJugadorAvatarCroppedFileWithinLimit: jest
    .fn()
    .mockResolvedValue("https://cdn.test/storage/diego-new.jpg?v=1"),
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

  it("muestra la foto real y el perfil del alumno aunque no tenga entrenador, sin campo de correo", async () => {
    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockResolvedValueOnce({
      ok: true,
      linked: true,
      rivieraId: "RIV-00000356",
      relationships: [],
      studentProfile: {
        id: "player-1",
        nombre: "Diego Palomares",
        fotoUrl: "https://cdn.test/diego.jpg",
        rivieraId: "RIV-00000356",
        edad: 28,
        enCancha: "reves",
        instagramUrl: "instagram.com/diego",
        facebookUrl: null,
        tiktokUrl: null,
      },
    });

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    const img = container.querySelector(
      ".coaching-student-hero__portrait-img",
    ) as HTMLImageElement | null;
    expect(img?.src).toContain("diego.jpg");
    expect(container.textContent).toContain("Cambiar foto");
    expect(container.textContent).toContain("MI PERFIL");
    expect(container.textContent).toContain("28 años");
    expect(container.textContent).toContain("Revés");
    expect(container.textContent).toContain("Instagram");
  });

  it("muestra iniciales cuando no hay foto", async () => {
    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockResolvedValueOnce({
      ok: true,
      linked: true,
      rivieraId: "RIV-00000356",
      relationships: [],
      studentProfile: {
        id: "player-1",
        nombre: "Diego Palomares",
        fotoUrl: null,
        edad: null,
        enCancha: null,
        instagramUrl: null,
        facebookUrl: null,
        tiktokUrl: null,
      },
    });

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    expect(container.querySelector(".coaching-student-hero__portrait-img")).toBeNull();
    expect(
      container.querySelector(".coaching-student-hero__portrait-fallback")?.textContent,
    ).toBe("DP");
  });

  it("edita edad, posición y redes y nunca ofrece el correo como campo", async () => {
    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockResolvedValueOnce({
      ok: true,
      linked: true,
      rivieraId: "RIV-00000356",
      relationships: [],
      studentProfile: {
        id: "player-1",
        nombre: "Diego Palomares",
        fotoUrl: null,
        edad: null,
        enCancha: null,
        instagramUrl: null,
        facebookUrl: null,
        tiktokUrl: null,
      },
    });
    const saveSpy = jest
      .spyOn(coachingApi, "updateStudentCoachingProfile")
      .mockResolvedValue({
        id: "player-1",
        nombre: "Diego Palomares",
        fotoUrl: null,
        edad: 30,
        enCancha: "drive",
        instagramUrl: "instagram.com/diego",
        facebookUrl: null,
        tiktokUrl: null,
      });

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    const editBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Editar perfil"),
    ) as HTMLButtonElement;
    await act(async () => {
      editBtn.click();
    });

    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.textContent?.toLowerCase()).not.toContain("correo");

    const setValue = (el: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const inputs = container.querySelectorAll(
      ".coaching-student-profile__form input",
    );
    await act(async () => {
      setValue(inputs[0] as HTMLInputElement, "30");
      setValue(inputs[1] as HTMLInputElement, "instagram.com/diego");
    });
    const drive = Array.from(container.querySelectorAll('[role="radio"]')).find(
      (b) => b.textContent === "Drive",
    ) as HTMLButtonElement;
    await act(async () => {
      drive.click();
    });
    const form = container.querySelector(
      ".coaching-student-profile__form",
    ) as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(saveSpy).toHaveBeenCalledWith({
      edad: 30,
      enCancha: "drive",
      instagramUrl: "https://instagram.com/diego",
      facebookUrl: null,
      tiktokUrl: null,
    });
    expect(container.textContent).toContain("30 años");
    expect(container.textContent).toContain("Drive");
  });

  it("valida edad fuera de 5–99 y enlaces inválidos sin llamar al servidor", async () => {
    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockResolvedValueOnce({
      ok: true,
      linked: true,
      rivieraId: "RIV-00000356",
      relationships: [],
      studentProfile: {
        id: "player-1",
        nombre: "Diego Palomares",
        fotoUrl: null,
        edad: null,
        enCancha: null,
        instagramUrl: null,
        facebookUrl: null,
        tiktokUrl: null,
      },
    });
    const saveSpy = jest.spyOn(coachingApi, "updateStudentCoachingProfile");
    saveSpy.mockClear();

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });
    const editBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Editar perfil"),
    ) as HTMLButtonElement;
    await act(async () => {
      editBtn.click();
    });

    const setValue = (el: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const submit = async () => {
      const form = container.querySelector(
        ".coaching-student-profile__form",
      ) as HTMLFormElement;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
    };
    const inputs = () =>
      container.querySelectorAll(
        ".coaching-student-profile__form input",
      ) as NodeListOf<HTMLInputElement>;

    await act(async () => {
      setValue(inputs()[0], "4");
    });
    await submit();
    expect(container.textContent).toContain("entre 5 y 99");

    await act(async () => {
      setValue(inputs()[0], "100");
    });
    await submit();
    expect(container.textContent).toContain("entre 5 y 99");

    await act(async () => {
      setValue(inputs()[0], "25");
      setValue(inputs()[1], "ftp://malicioso");
    });
    await submit();
    expect(container.textContent).toContain("enlace de Instagram no es válido");
    expect(saveSpy).not.toHaveBeenCalled();
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

  it("permite seleccionar una foto, confirmarla en el modal y actualizar el retrato inmediatamente", async () => {
    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockResolvedValueOnce({
      ok: true,
      linked: true,
      rivieraId: "RIV-00000356",
      relationships: [],
      studentProfile: {
        id: "player-1",
        nombre: "Diego Palomares",
        fotoUrl: null,
        edad: null,
        enCancha: null,
        instagramUrl: null,
        facebookUrl: null,
        tiktokUrl: null,
      },
    });

    jest
      .spyOn(uploadAvatarModule, "uploadJugadorAvatarCroppedFileWithinLimit")
      .mockResolvedValue("https://cdn.test/storage/diego-new.jpg?v=1");

    const updateSpy = jest
      .spyOn(coachingApi, "updateStudentCoachingProfile")
      .mockResolvedValueOnce({
        id: "player-1",
        nombre: "Diego Palomares",
        fotoUrl: "https://cdn.test/storage/diego-new.jpg?v=1",
        edad: null,
        enCancha: null,
        instagramUrl: null,
        facebookUrl: null,
        tiktokUrl: null,
      });

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    // Inicialmente muestra iniciales
    expect(container.querySelector(".coaching-student-hero__portrait-fallback")?.textContent).toBe("DP");

    // Seleccionar foto desde input
    const fileInput = container.querySelector(
      'input[data-testid="student-photo-input"]',
    ) as HTMLInputElement;
    const testFile = new File(["dummy image"], "photo.png", { type: "image/png" });

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [testFile],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Modal de recorte aparece
    expect(container.querySelector('[data-testid="crop-modal"]')).not.toBeNull();

    // Confirmar en modal
    const confirmBtn = container.querySelector(
      '[data-testid="crop-confirm"]',
    ) as HTMLButtonElement;
    await act(async () => {
      confirmBtn.click();
    });

    // Se llamó al guardado de foto
    expect(updateSpy).toHaveBeenCalledWith({
      fotoUrl: "https://cdn.test/storage/diego-new.jpg?v=1",
    });

    // Retrato actualizado inmediatamente a la nueva imagen
    const newImg = container.querySelector(
      ".coaching-student-hero__portrait-img",
    ) as HTMLImageElement | null;
    expect(newImg?.src).toContain("diego-new.jpg");
  });

  it("persiste los cambios de perfil y fotografía tras recargar la página", async () => {
    // 1. Carga inicial sin datos
    const profileState = {
      id: "player-1",
      nombre: "Diego Palomares",
      fotoUrl: null as string | null,
      edad: null as number | null,
      enCancha: null as string | null,
      instagramUrl: null as string | null,
      facebookUrl: null as string | null,
      tiktokUrl: null as string | null,
    };

    jest.spyOn(coachingApi, "fetchStudentCoachingOverview").mockImplementation(async () => ({
      ok: true,
      linked: true,
      rivieraId: "RIV-00000356",
      relationships: [],
      studentProfile: { ...profileState },
    }));

    jest.spyOn(coachingApi, "updateStudentCoachingProfile").mockImplementation(async (input) => {
      if (input.fotoUrl !== undefined) profileState.fotoUrl = input.fotoUrl;
      if (input.edad !== undefined) profileState.edad = input.edad;
      if (input.enCancha !== undefined) profileState.enCancha = input.enCancha;
      if (input.instagramUrl !== undefined) profileState.instagramUrl = input.instagramUrl;
      if (input.facebookUrl !== undefined) profileState.facebookUrl = input.facebookUrl;
      if (input.tiktokUrl !== undefined) profileState.tiktokUrl = input.tiktokUrl;
      return { ...profileState };
    });

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    // Editar perfil
    const editBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Editar perfil"),
    ) as HTMLButtonElement;
    await act(async () => {
      editBtn.click();
    });

    const setValue = (el: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const inputs = container.querySelectorAll(
      ".coaching-student-profile__form input",
    );
    await act(async () => {
      setValue(inputs[0] as HTMLInputElement, "29");
      setValue(inputs[1] as HTMLInputElement, "instagram.com/diego_padel");
    });
    const reves = Array.from(container.querySelectorAll('[role="radio"]')).find(
      (b) => b.textContent === "Revés",
    ) as HTMLButtonElement;
    await act(async () => {
      reves.click();
    });
    const form = container.querySelector(
      ".coaching-student-profile__form",
    ) as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain("29 años");
    expect(container.textContent).toContain("Revés");

    // 2. Simular recarga de página (desmontar y volver a montar)
    await act(async () => {
      root.unmount();
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<StudentCoachingPage />);
    });

    // Verificamos que los datos persisten tras la nueva carga
    expect(container.textContent).toContain("29 años");
    expect(container.textContent).toContain("Revés");
    expect(container.textContent).toContain("Instagram");
    expect(container.querySelector('a[href*="instagram.com/diego_padel"]')).not.toBeNull();
  });
});
