import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LigaFlexPublica } from "./LigaFlexPublica";
import type { LigaDetalle } from "../../lib/liga/types";
import * as flexService from "../../services/ligaFlexService";
import * as avatarResolver from "../../lib/liga/publicParejaAvatars";

jest.mock("../../club-experience", () => ({
  ClubExperienceScope: ({ children }: { children: React.ReactNode }) => (
    <div
      className="club-experience-scope"
      data-club="padelito-warehouse"
      data-brand="padelito-warehouse"
    >
      {children}
    </div>
  ),
  PublicScopedBrandGate: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PublicEventBrandIdentity: () => (
    <div data-testid="public-brand-identity">
      <span>Padelito Warehouse</span> <span>by Riviera Open</span>
    </div>
  ),
}));

jest.mock("../../services/ligaFlexService", () => {
  const actual = jest.requireActual("../../services/ligaFlexService");
  return {
    ...actual,
    loadFlexLeague: jest.fn(),
  };
});

jest.mock("../../lib/liga/publicParejaAvatars", () => ({
  resolveLigaJugadorPublicProfiles: jest.fn(),
}));

const mockedFlex = flexService as jest.Mocked<typeof flexService>;
const mockedProfiles = avatarResolver as jest.Mocked<typeof avatarResolver>;

const players = [
  { id: "p1", nombre: "Luis Osorio", rivieraId: "RIV-00000409", puntos: 100, pos: 1 },
  { id: "p2", nombre: "Oswaldo M", rivieraId: "RIV-00000412", puntos: 90, pos: 2 },
  { id: "p3", nombre: "Alberto Diaz", rivieraId: "RIV-00000415", puntos: 80, pos: 3 },
  { id: "p4", nombre: "Eliut F", rivieraId: "RIV-00000580", puntos: 70, pos: 4 },
  { id: "p5", nombre: "Yusuke", rivieraId: "RIV-00000046", puntos: 65, pos: 5 },
];

function makeDetalle(): LigaDetalle {
  return {
    id: "liga-flex-pub-1",
    organizador_id: "e724de97-3552-4a01-a269-f621e6f1ed26",
    nombre: "Riviera League Flex",
    modalidad: "flex_league",
    estado: "in_progress",
    categoria: "3ra Fuerza",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    jugadores: players.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      email: null,
      telefono: null,
      genero: null,
      nivel: null,
      estado: "activo",
      organizador_id: "e724de97-3552-4a01-a269-f621e6f1ed26",
      created_at: "2026-01-01T00:00:00Z",
    })),
    equipos: [],
    inscripciones: players.map((p, idx) => ({
      id: `ins-${idx + 1}`,
      liga_id: "liga-flex-pub-1",
      jugador_id: p.id,
      puntos: p.puntos,
      partidos_jugados: 5,
      partidos_ganados: 4,
      partidos_perdidos: 1,
      games_favor: 24,
      games_contra: 14,
      diferencia_games: 10,
      created_at: "2026-01-01T00:00:00Z",
      jugador: { id: p.id, nombre: p.nombre },
    })),
    jornadas: [
      {
        id: "jor-1",
        liga_id: "liga-flex-pub-1",
        numero: 1,
        fecha: "2026-11-17",
        estado: "completed",
        created_at: "2026-01-01T00:00:00Z",
        parejas: [],
        partidos: [],
      },
      {
        id: "jor-2",
        liga_id: "liga-flex-pub-1",
        numero: 2,
        fecha: "2026-11-24",
        estado: "upcoming",
        created_at: "2026-01-01T00:00:00Z",
        parejas: [],
        partidos: [],
      },
      {
        id: "jor-3",
        liga_id: "liga-flex-pub-1",
        numero: 3,
        fecha: null,
        estado: "upcoming",
        created_at: "2026-01-01T00:00:00Z",
        parejas: [],
        partidos: [],
      },
    ],
  } as unknown as LigaDetalle;
}

describe("LigaFlexPublica — rediseño de vista pública de temporada", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFlex.loadFlexLeague.mockResolvedValue({
      config: {
        ligaId: "liga-flex-pub-1",
        jornadasPlaneadas: 12,
        jugadoresMin: 8,
        jugadoresMax: 16,
        rondasSugeridas: 5,
        duracionRondaMin: 20,
        descansoMin: 0,
        categoria: "3ra Fuerza",
        horarioSugerido: "18:00",
        inscripcionTemporadaMxn: null,
        participacionJornadaMxn: null,
        premioCampeon: null,
        premioSubcampeon: null,
        premioTercer: null,
        jornadaFinalId: null,
        cerradoAt: null,
      },
      jornadas: [
        {
          jornadaId: "jor-1",
          ligaId: "liga-flex-pub-1",
          canchas: 2,
          rondas: 5,
          duracionRondaMin: 20,
          descansoMin: 0,
          horaInicio: "18:00",
          horaFin: "20:00",
          seed: 1,
          programacionEstado: "confirmada",
          advertencia: null,
          esFinal: false,
          calidad: null,
        },
        {
          jornadaId: "jor-2",
          ligaId: "liga-flex-pub-1",
          canchas: 2,
          rondas: 5,
          duracionRondaMin: 20,
          descansoMin: 0,
          horaInicio: "19:00",
          horaFin: "21:00",
          seed: null,
          programacionEstado: "vacia",
          advertencia: null,
          esFinal: false,
          calidad: null,
        },
      ],
      participantes: {
        "jor-1": players.map((p) => p.id),
      },
      posiciones: players.map((p) => ({
        jornadaId: "jor-1",
        jugadorId: p.id,
        posicion: p.pos,
        puntos: p.puntos,
        partidos: 5,
        gamesFavor: 24,
        gamesContra: 14,
      })),
      honores: null,
    });

    mockedProfiles.resolveLigaJugadorPublicProfiles.mockResolvedValue(
      Object.fromEntries(
        players.map((p) => [
          p.id,
          { fotoUrl: null, rivieraId: p.rivieraId, rating: null },
        ])
      )
    );
  });

  it("muestra hero, resumen rápido, top 3, ranking general y calendario sin detalle fijo en el flujo principal", async () => {
    render(<LigaFlexPublica detalle={makeDetalle()} />);

    await waitFor(() => {
      expect(mockedFlex.loadFlexLeague).toHaveBeenCalledWith("liga-flex-pub-1");
    });

    // 1) Hero con club + by Riviera Open, nombre de liga y estado
    expect(screen.getByText("Padelito Warehouse")).toBeInTheDocument();
    expect(screen.getByText("by Riviera Open")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Riviera League Flex" })
    ).toBeInTheDocument();

    // 2) Resumen rápido de temporada
    const summary = screen.getByRole("region", {
      name: /Resumen rápido de temporada/i,
    });
    expect(within(summary).getByText("Total jornadas")).toBeInTheDocument();
    expect(within(summary).getByText("Jornada actual")).toBeInTheDocument();
    expect(within(summary).getByText("Jugadores activos")).toBeInTheDocument();
    expect(within(summary).getByText("Líder actual")).toBeInTheDocument();
    expect(within(summary).getByText("Puntos del líder")).toBeInTheDocument();
    expect(within(summary).getByText("100 PTS")).toBeInTheDocument();

    // 3) Top 3 y resto de clasificación con Riviera ID visible
    await waitFor(() => {
      expect(screen.getByText("RIV-00000409")).toBeInTheDocument();
    });
    expect(screen.getByText("RIV-00000412")).toBeInTheDocument();
    expect(screen.getByText("RIV-00000415")).toBeInTheDocument();
    expect(screen.getByText("RIV-00000580")).toBeInTheDocument();

    // 4) El detalle del jugador NO está fijo ocupando espacio en el flujo principal
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // 5) Al tocar un jugador se abre el drawer contextual con su historial por jornada y botón Ver perfil
    const leaderCardBtn = screen.getByRole("button", {
      name: /Luis Osorio/i,
    });
    fireEvent.click(leaderCardBtn);

    const dialog = screen.getByRole("dialog", {
      name: /Detalle de Luis Osorio/i,
    });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("#1")).toBeInTheDocument();
    expect(within(dialog).getByText("100 PTS")).toBeInTheDocument();
    expect(within(dialog).getByText("J01")).toBeInTheDocument();
    expect(within(dialog).getByText("Posición #1")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: /Ver perfil/i })
    ).toBeInTheDocument();

    // Cerrar el drawer contextual
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Cerrar detalle del jugador/i })
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // 6) Calendario de temporada con estados claros
    const calendar = screen.getByRole("region", {
      name: /Calendario de temporada/i,
    });
    expect(within(calendar).getByText("J01")).toBeInTheDocument();
    expect(within(calendar).getByText("Finalizada")).toBeInTheDocument();
    expect(within(calendar).getByText("J02")).toBeInTheDocument();
    expect(within(calendar).getByText("Próxima")).toBeInTheDocument();
    expect(within(calendar).getByText("J03")).toBeInTheDocument();
    expect(within(calendar).getByText("Por programar")).toBeInTheDocument();
  });
});
