import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LigaDetalle } from "../../../lib/liga/types";
import {
  computeFlexJornadaProvisionalStandings,
  FlexPublicJornada,
} from "./FlexPublicJornada";

const mockLoadFlexLeague = jest.fn();
const mockResolveProfiles = jest.fn();

jest.mock("../../../services/ligaFlexService", () => ({
  loadFlexLeague: (...args: unknown[]) => mockLoadFlexLeague(...args),
}));

jest.mock("../../../lib/liga/publicParejaAvatars", () => ({
  resolveLigaJugadorPublicProfiles: (...args: unknown[]) =>
    mockResolveProfiles(...args),
}));

jest.mock("../../../club-experience", () => ({
  ClubExperienceScope: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PublicEventBrandIdentity: () => <div data-testid="brand-identity" />,
  PublicEventNeutralLoading: ({ message }: { message?: string }) => (
    <div>{message}</div>
  ),
  PublicScopedBrandGate: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useOrganizerDisplayName: () => "Club Test",
}));

function buildMockDetalle(opts?: {
  round1Scored?: boolean;
  jornadaCompleted?: boolean;
}): LigaDetalle {
  const players = Array.from({ length: 12 }, (_, idx) => {
    const n = idx + 1;
    return {
      id: `p${n}`,
      nombre: `Jugador ${n}`,
      email: null,
      telefono: null,
      genero: null,
      nivel: null,
      estado: "activo" as const,
      organizador_id: "org-1",
      created_at: "2026-11-01T00:00:00Z",
    };
  });

  const parejas = [
    // Ronda 1
    {
      id: "par-r1-c1-a",
      jornada_id: "j1",
      jugador1_id: "p1",
      jugador2_id: "p2",
      jugador1: players[0],
      jugador2: players[1],
    },
    {
      id: "par-r1-c1-b",
      jornada_id: "j1",
      jugador1_id: "p3",
      jugador2_id: "p4",
      jugador1: players[2],
      jugador2: players[3],
    },
    {
      id: "par-r1-c2-a",
      jornada_id: "j1",
      jugador1_id: "p5",
      jugador2_id: "p6",
      jugador1: players[4],
      jugador2: players[5],
    },
    {
      id: "par-r1-c2-b",
      jornada_id: "j1",
      jugador1_id: "p7",
      jugador2_id: "p8",
      jugador1: players[6],
      jugador2: players[7],
    },
    {
      id: "par-r1-c3-a",
      jornada_id: "j1",
      jugador1_id: "p9",
      jugador2_id: "p10",
      jugador1: players[8],
      jugador2: players[9],
    },
    {
      id: "par-r1-c3-b",
      jornada_id: "j1",
      jugador1_id: "p11",
      jugador2_id: "p12",
      jugador1: players[10],
      jugador2: players[11],
    },
  ];

  const r1Scored = Boolean(opts?.round1Scored);

  const partidos = [
    {
      id: "m-r1-c1",
      jornada_id: "j1",
      ronda: 1,
      cancha: 1,
      pareja1_id: "par-r1-c1-a",
      pareja2_id: "par-r1-c1-b",
      score_pareja1: r1Scored ? 6 : null,
      score_pareja2: r1Scored ? 2 : null,
      estado: r1Scored ? ("completed" as const) : ("in_progress" as const),
      created_at: "2026-11-01T00:00:00Z",
    },
    {
      id: "m-r1-c2",
      jornada_id: "j1",
      ronda: 1,
      cancha: 2,
      pareja1_id: "par-r1-c2-a",
      pareja2_id: "par-r1-c2-b",
      score_pareja1: r1Scored ? 6 : null,
      score_pareja2: r1Scored ? 4 : null,
      estado: r1Scored ? ("completed" as const) : ("in_progress" as const),
      created_at: "2026-11-01T00:00:00Z",
    },
    {
      id: "m-r1-c3",
      jornada_id: "j1",
      ronda: 1,
      cancha: 3,
      pareja1_id: "par-r1-c3-a",
      pareja2_id: "par-r1-c3-b",
      score_pareja1: r1Scored ? 5 : null,
      score_pareja2: r1Scored ? 3 : null,
      estado: r1Scored ? ("completed" as const) : ("in_progress" as const),
      created_at: "2026-11-01T00:00:00Z",
    },
    {
      id: "m-r2-c1",
      jornada_id: "j1",
      ronda: 2,
      cancha: 1,
      pareja1_id: "par-r1-c1-a",
      pareja2_id: "par-r1-c2-b",
      score_pareja1: null,
      score_pareja2: null,
      estado: "upcoming" as const,
      created_at: "2026-11-01T00:00:00Z",
    },
  ];

  return {
    id: "liga-flex-1",
    nombre: "Riviera Flex League Test",
    estado: "in_progress",
    modalidad: "flex_league",
    vueltas: 1,
    organizador_id: "org-1",
    canchas_disponibles: 3,
    fecha_inicio: "2026-11-23",
    fecha_fin: null,
    created_at: "2026-11-01T00:00:00Z",
    jugadores: players,
    inscripciones: players.map((p, i) => ({
      id: `ins-${i + 1}`,
      liga_id: "liga-flex-1",
      jugador_id: p.id,
      puntos: 0,
      jugador: p,
      created_at: "2026-11-01T00:00:00Z",
    })),
    equipos: [],
    jornadas: [
      {
        id: "j1",
        liga_id: "liga-flex-1",
        numero: 1,
        fecha: "2026-11-23",
        estado: opts?.jornadaCompleted ? "completed" : "in_progress",
        created_at: "2026-11-01T00:00:00Z",
        parejas,
        partidos,
      },
    ],
  };
}

describe("FlexPublicJornada — Jornada Pública Riviera Flex League", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const profiles: Record<string, { fotoUrl: string | null; rivieraId: string }> = {};
    for (let i = 1; i <= 12; i += 1) {
      profiles[`p${i}`] = {
        fotoUrl: null,
        rivieraId: `RIV-${String(i).padStart(8, "0")}`,
      };
    }
    mockResolveProfiles.mockResolvedValue(profiles);
  });

  it("prioriza los partidos antes que los participantes, muestra fichas horizontales compactas y evita pósters verticales", async () => {
    const detalle = buildMockDetalle({ round1Scored: false });
    mockLoadFlexLeague.mockResolvedValue({
      config: {
        ligaId: "liga-flex-1",
        jornadasPlaneadas: 12,
        jugadoresMin: 12,
        jugadoresMax: 16,
        rondasSugeridas: 5,
        duracionRondaMin: 20,
        descansoMin: 3,
        categoria: "5ª Fuerza",
        horarioSugerido: null,
        inscripcionTemporadaMxn: 200,
        participacionJornadaMxn: 300,
        premioCampeon: "$3,000 MXN",
        premioSubcampeon: null,
        premioTercer: null,
        jornadaFinalId: null,
        cerradoAt: null,
      },
      jornadas: [
        {
          jornadaId: "j1",
          ligaId: "liga-flex-1",
          canchas: 3,
          rondas: 5,
          duracionRondaMin: 20,
          descansoMin: 3,
          horaInicio: "18:00",
          horaFin: "20:00",
          seed: 101,
          programacionEstado: "confirmada",
          advertencia: null,
          esFinal: false,
          calidad: null,
        },
      ],
      participantes: {
        j1: Array.from({ length: 12 }, (_, idx) => `p${idx + 1}`),
      },
      posiciones: [],
      honores: null,
    });

    const { container } = render(
      <FlexPublicJornada detalle={detalle} numero={1} />
    );

    await waitFor(() => {
      expect(screen.getByText("RONDA 01")).toBeInTheDocument();
    });

    // Verifica subtítulo "3 CANCHAS · 3 PARTIDOS" y las 3 canchas
    expect(screen.getByText(/3 CANCHAS · 3 PARTIDOS/i)).toBeInTheDocument();
    expect(screen.getByText("CANCHA 01")).toBeInTheDocument();
    expect(screen.getByText("CANCHA 02")).toBeInTheDocument();
    expect(screen.getByText("CANCHA 03")).toBeInTheDocument();

    // Verifica que la sección de partidos aparezca ANTES que la de participantes en el DOM
    const matchesSection = container.querySelector(".flex-pub-matches-section");
    const participantsSection = container.querySelector(
      ".flex-pub-participants-section"
    );
    expect(matchesSection).not.toBeNull();
    expect(participantsSection).not.toBeNull();
    expect(
      matchesSection!.compareDocumentPosition(participantsSection!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // Verifica que existan 12 tarjetas horizontales compactas y NINGÚN póster vertical .pub-split-vs-panel
    const participantCards = container.querySelectorAll(
      ".flex-pub-participant-card"
    );
    expect(participantCards).toHaveLength(12);
    expect(container.querySelectorAll(".pub-split-vs-panel")).toHaveLength(0);

    // Sin resultados aún: muestra "—", "PTS JORNADA" y "Pendiente" (no muestra 0)
    expect(screen.getAllByText("PTS JORNADA")).toHaveLength(12);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(12);
    expect(container.querySelector(".flex-pub-jornada-close")).toBeNull();
  });

  it("actualiza automáticamente los puntos de jornada en cada tarjeta de participante y muestra CLASIFICACIÓN DE LA JORNADA al confirmar una ronda", async () => {
    const detalle = buildMockDetalle({ round1Scored: true });
    mockLoadFlexLeague.mockResolvedValue({
      config: {
        ligaId: "liga-flex-1",
        jornadasPlaneadas: 12,
        jugadoresMin: 12,
        jugadoresMax: 16,
        rondasSugeridas: 5,
        duracionRondaMin: 20,
        descansoMin: 3,
        categoria: "5ª Fuerza",
        horarioSugerido: null,
        inscripcionTemporadaMxn: 200,
        participacionJornadaMxn: 300,
        premioCampeon: "$3,000 MXN",
        premioSubcampeon: null,
        premioTercer: null,
        jornadaFinalId: null,
        cerradoAt: null,
      },
      jornadas: [
        {
          jornadaId: "j1",
          ligaId: "liga-flex-1",
          canchas: 3,
          rondas: 2,
          duracionRondaMin: 20,
          descansoMin: 3,
          horaInicio: "18:00",
          horaFin: "20:00",
          seed: 101,
          programacionEstado: "confirmada",
          advertencia: null,
          esFinal: false,
          calidad: null,
        },
      ],
      participantes: {
        j1: Array.from({ length: 12 }, (_, idx) => `p${idx + 1}`),
      },
      posiciones: [],
      honores: null,
    });

    const names = new Map(detalle.jugadores.map((p) => [p.id, p.nombre]));
    const rows = computeFlexJornadaProvisionalStandings(
      detalle.jornadas[0]!,
      names,
      detalle.jugadores.map((p) => p.id)
    );
    expect(rows).toHaveLength(12);
    expect(rows[0]!.puntos).toBe(100);
    expect(rows[11]!.puntos).toBe(30);

    const { container } = render(
      <FlexPublicJornada detalle={detalle} numero={1} />
    );

    await waitFor(() => {
      expect(
        screen.getByText("CLASIFICACIÓN DE LA JORNADA")
      ).toBeInTheDocument();
    });

    const standings = container.querySelector(".flex-pub-standings-section");
    const close = container.querySelector(".flex-pub-jornada-close");
    expect(standings).not.toBeNull();
    expect(close).not.toBeNull();
    expect(
      standings!.compareDocumentPosition(close!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(close!.querySelectorAll(".flex-pub-jornada-close__card")).toHaveLength(
      3
    );
    expect(close!.textContent).toMatch(/100\s*PTS/);
    expect(
      screen.getByText("¡FELICIDADES AL TOP 3 DE LA JORNADA!")
    ).toBeInTheDocument();
    expect(screen.getByText("Vive Riviera Open.")).toBeInTheDocument();

    expect(
      screen.getAllByText(/Clasificación provisional/i).length
    ).toBeGreaterThanOrEqual(1);

    // Permite consultar la Ronda 1 confirmada con sus resultados históricos
    const r1Button = screen.getByRole("button", { name: /RONDA 1/i });
    fireEvent.click(r1Button);
    expect(screen.getByText("RONDA 01")).toBeInTheDocument();
    expect(screen.getAllByText("Resultado")).toHaveLength(3);
  });

  it("en la vista en vivo muestra el progreso, la clasificación y un icono para expandir", async () => {
    const detalle = buildMockDetalle({ round1Scored: false });
    mockLoadFlexLeague.mockResolvedValue({
      config: {
        ligaId: "liga-flex-1",
        jornadasPlaneadas: 12,
        jugadoresMin: 12,
        jugadoresMax: 16,
        rondasSugeridas: 5,
        duracionRondaMin: 20,
        descansoMin: 3,
        categoria: "5ª Fuerza",
        horarioSugerido: null,
        inscripcionTemporadaMxn: 200,
        participacionJornadaMxn: 300,
        premioCampeon: null,
        premioSubcampeon: null,
        premioTercer: null,
        jornadaFinalId: null,
        cerradoAt: null,
      },
      jornadas: [
        {
          jornadaId: "j1",
          ligaId: "liga-flex-1",
          canchas: 3,
          rondas: 5,
          duracionRondaMin: 20,
          descansoMin: 3,
          horaInicio: "19:00",
          horaFin: "21:00",
          seed: 101,
          programacionEstado: "confirmada",
          advertencia: null,
          esFinal: false,
          calidad: null,
        },
      ],
      participantes: {
        j1: Array.from({ length: 12 }, (_, idx) => `p${idx + 1}`),
      },
      posiciones: [],
      honores: null,
    });

    const { container } = render(
      <FlexPublicJornada detalle={detalle} numero={1} pantalla />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Expandir" })).toBeInTheDocument();
    });
    expect(container.querySelector(".flex-pub-live.ro-public-view")).not.toBeNull();
    expect(screen.queryByText(/pantalla completa/i)).toBeNull();
    expect(screen.getByText(/ronda 01 de 05/i)).toBeInTheDocument();
    expect(screen.getByText(/4 rondas por disputar/i)).toBeInTheDocument();
    expect(screen.getByText(/cancha 01/i)).toBeInTheDocument();
    expect(screen.getByText(/clasificación de la jornada/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^participantes$/i })).toBeInTheDocument();
    expect(
      screen.getByText(/pendiente · en espera de resultados confirmados/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /ronda 02/i }));
    expect(screen.getByRole("button", { name: /volver a ronda actual/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /volver a ronda actual/i }));
    expect(screen.queryByRole("button", { name: /volver a ronda actual/i })).toBeNull();
  });
});
