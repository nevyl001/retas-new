import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LigaFlexPublica } from "./LigaFlexPublica";
import { FLEX_POSITION_POINTS } from "../../lib/liga/flex/constants";
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
    categoria: "6ª Alta / 5ª Baja",
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
        fecha: null,
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

describe("LigaFlexPublica — rediseño definitivo de vista pública de temporada", () => {
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
        categoria: "6ª Alta / 5ª Baja",
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
          horaInicio: null,
          horaFin: null,
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

  it("muestra encabezado simplificado sin las 6 tarjetas redundantes, barra de jornada próxima con 'Fecha por confirmar', podio Top 3, tabla desde posición 4 y calendario compacto", async () => {
    render(<LigaFlexPublica detalle={makeDetalle()} />);

    await waitFor(() => {
      expect(mockedFlex.loadFlexLeague).toHaveBeenCalledWith("liga-flex-pub-1");
    });

    // 1) Encabezado simplificado con club, by Riviera Open, nombre, categoría, estado, jugadores y progreso
    const header = screen.getByRole("banner", { name: /Encabezado de la liga/i });
    expect(within(header).getByText("Padelito Warehouse")).toBeInTheDocument();
    expect(within(header).getByText("by Riviera Open")).toBeInTheDocument();
    expect(
      within(header).getByRole("heading", { name: "Riviera League Flex" })
    ).toBeInTheDocument();
    expect(within(header).getByText("6ª Alta / 5ª Baja")).toBeInTheDocument();
    expect(within(header).getByText("5 jugadores")).toBeInTheDocument();
    expect(
      within(header).getByText("1 de 3 jornadas completadas")
    ).toBeInTheDocument();

    // Verifica que las 6 tarjetas redundantes fueron eliminadas
    expect(screen.queryByText("Total jornadas")).not.toBeInTheDocument();
    expect(screen.queryByText("Líder actual")).not.toBeInTheDocument();
    expect(screen.queryByText("Puntos del líder")).not.toBeInTheDocument();

    // 2) Componente compacto de jornada actual o próxima
    const matchday = screen.getByRole("region", {
      name: /Jornada actual o próxima/i,
    });
    expect(within(matchday).getByText("Jornada 02")).toBeInTheDocument();
    expect(within(matchday).getByText("Fecha por confirmar")).toBeInTheDocument();
    expect(
      within(matchday).getByRole("link", { name: /Ver jornada/i })
    ).toBeInTheDocument();

    // 3) Podio Top 3 y tabla de clasificación desde la posición 4
    await waitFor(() => {
      expect(screen.getByText("Luis Osorio")).toBeInTheDocument();
    });
    const podium = document.querySelector(".flex-liga-top3");
    expect(podium?.textContent).not.toMatch(/RIV-/);
    expect(screen.getByText("RIV-00000580")).toBeInTheDocument();

    // 4) El detalle del jugador se abre bajo demanda en modal/drawer
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Luis Osorio/i }));

    const dialog = screen.getByRole("dialog", {
      name: /Detalle de Luis Osorio/i,
    });
    expect(within(dialog).getByText("#1")).toBeInTheDocument();
    expect(within(dialog).getByText("100 PTS")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: /Ver perfil/i })
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: /Cerrar detalle del jugador/i })
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // 5) Calendario compacto sin repetir "Por programar" y sin enlaces inútiles en jornadas pendientes vacías
    const calendar = screen.getByRole("region", {
      name: /Calendario de temporada/i,
    });
    expect(within(calendar).getByText("J01")).toBeInTheDocument();
    expect(within(calendar).getByText("J02")).toBeInTheDocument();
    expect(within(calendar).getByText("J03")).toBeInTheDocument();
    expect(within(calendar).queryByText("Por programar")).not.toBeInTheDocument();

    // J01 (Finalizada) y J02 (Próxima) son enlaces; J03 (Pendiente sin contenido) no es enlace
    expect(
      within(calendar).getByRole("link", { name: /J01 · Finalizada/i })
    ).toBeInTheDocument();
    expect(
      within(calendar).getByRole("link", { name: /J02 · Próxima/i })
    ).toBeInTheDocument();
    expect(
      within(calendar).queryByRole("link", { name: /J03/i })
    ).not.toBeInTheDocument();
  });

  it("prioriza una jornada en curso sobre las próximas y muestra horario cuando existe", async () => {
    const detalleEnCurso = makeDetalle();
    detalleEnCurso.jornadas[1]!.estado = "in_progress";
    detalleEnCurso.jornadas[1]!.fecha = "2026-11-24";

    mockedFlex.loadFlexLeague.mockResolvedValueOnce({
      config: {
        ligaId: "liga-flex-pub-1",
        jornadasPlaneadas: 12,
        jugadoresMin: 8,
        jugadoresMax: 16,
        rondasSugeridas: 5,
        duracionRondaMin: 20,
        descansoMin: 0,
        categoria: "6ª Alta / 5ª Baja",
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
          jornadaId: "jor-2",
          ligaId: "liga-flex-pub-1",
          canchas: 2,
          rondas: 5,
          duracionRondaMin: 20,
          descansoMin: 0,
          horaInicio: "19:00",
          horaFin: "21:00",
          seed: 1,
          programacionEstado: "confirmada",
          advertencia: null,
          esFinal: false,
          calidad: null,
        },
      ],
      participantes: {},
      posiciones: [],
      honores: null,
    });

    render(<LigaFlexPublica detalle={detalleEnCurso} />);

    const matchday = await screen.findByRole("region", {
      name: /Jornada actual o próxima/i,
    });
    expect(within(matchday).getByText("En curso")).toBeInTheDocument();
    expect(within(matchday).getByText("Jornada 02")).toBeInTheDocument();
    expect(within(matchday).getByText(/19:00 – 21:00/i)).toBeInTheDocument();
  });

  it("adapta la vista para temporada concluida y clasificaciones de 16 jugadores con nombres largos y sin foto", async () => {
    const sixteenPlayers = Array.from({ length: 16 }).map((_, idx) => ({
      id: `p-${idx + 1}`,
      nombre:
        idx === 0
          ? "Maximiliano Alejandro Villanueva De La Torre"
          : `Jugador Oficial Número ${idx + 1}`,
      rivieraId: `RIV-00000${700 + idx}`,
      puntos: 160 - idx * 5,
      pos: idx + 1,
    }));

    const detalleFinalizada = {
      ...makeDetalle(),
      estado: "completed" as const,
      jugadores: sixteenPlayers.map((p) => ({
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
      inscripciones: sixteenPlayers.map((p, idx) => ({
        id: `ins-16-${idx + 1}`,
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
          estado: "completed" as const,
          created_at: "2026-01-01T00:00:00Z",
          parejas: [],
          partidos: [],
        },
        {
          id: "jor-2",
          liga_id: "liga-flex-pub-1",
          numero: 2,
          fecha: "2026-11-24",
          estado: "completed" as const,
          created_at: "2026-01-01T00:00:00Z",
          parejas: [],
          partidos: [],
        },
      ],
    } as unknown as LigaDetalle;

    mockedFlex.loadFlexLeague.mockResolvedValueOnce({
      config: {
        ligaId: "liga-flex-pub-1",
        jornadasPlaneadas: 2,
        jugadoresMin: 8,
        jugadoresMax: 16,
        rondasSugeridas: 5,
        duracionRondaMin: 20,
        descansoMin: 0,
        categoria: "Open",
        horarioSugerido: "18:00",
        inscripcionTemporadaMxn: null,
        participacionJornadaMxn: null,
        premioCampeon: null,
        premioSubcampeon: null,
        premioTercer: null,
        jornadaFinalId: null,
        cerradoAt: "2026-11-25T00:00:00Z",
      },
      jornadas: [],
      participantes: {
        "jor-1": sixteenPlayers.slice(0, 12).map((p) => p.id),
        "jor-2": sixteenPlayers.slice(12, 16).map((p) => p.id),
      },
      posiciones: [
        ...sixteenPlayers.slice(0, 12).map((p, idx) => ({
          jornadaId: "jor-1",
          jugadorId: p.id,
          posicion: idx + 1,
          puntos: FLEX_POSITION_POINTS[idx]!,
          partidos: 5,
          gamesFavor: 24,
          gamesContra: 14,
        })),
        ...sixteenPlayers.slice(0, 4).map((p, idx) => ({
          jornadaId: "jor-2",
          jugadorId: p.id,
          posicion: idx + 1,
          puntos: FLEX_POSITION_POINTS[idx]!,
          partidos: 5,
          gamesFavor: 24,
          gamesContra: 14,
        })),
        ...sixteenPlayers.slice(12, 16).map((p, idx) => ({
          jornadaId: "jor-2",
          jugadorId: p.id,
          posicion: idx + 5,
          puntos: FLEX_POSITION_POINTS[idx + 4]!,
          partidos: 5,
          gamesFavor: 18,
          gamesContra: 20,
        })),
      ],
      honores: null,
    });

    mockedProfiles.resolveLigaJugadorPublicProfiles.mockResolvedValueOnce(
      Object.fromEntries(
        sixteenPlayers.map((p) => [
          p.id,
          { fotoUrl: null, rivieraId: p.rivieraId, rating: null },
        ])
      )
    );

    render(<LigaFlexPublica detalle={detalleFinalizada} />);

    await waitFor(() => {
      expect(screen.getByText("16 clasificados")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Maximiliano Alejandro Villanueva De La Torre")
    ).toBeInTheDocument();
    expect(screen.getByText("Jugador Oficial Número 16")).toBeInTheDocument();

    const header = screen.getByRole("banner", { name: /Encabezado de la liga/i });
    expect(within(header).getByText("Finalizada")).toBeInTheDocument();
  });
});
