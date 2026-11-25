import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LigaFlexAdmin } from "./LigaFlexAdmin";
import type { LigaDetalle, LigaJugadorPoolItem } from "../../lib/liga/types";
import * as flexService from "../../services/ligaFlexService";

jest.mock("../../club-experience", () => ({
  useClubModeEyebrow: () => "Riviera Open",
  useBranding: () => ({ nombre: "Riviera Open" }),
}));

jest.mock("./LigaPageShell", () => ({
  LigaPageShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="liga-page-shell">{children}</div>
  ),
}));

jest.mock("../../services/ligaFlexService", () => {
  const actual = jest.requireActual("../../services/ligaFlexService");
  return {
    ...actual,
    loadFlexLeague: jest.fn(),
    loadFlexConfirmedRounds: jest.fn(),
    correctFlexMatch: jest.fn(),
    saveFlexMatchScore: jest.fn(),
    confirmFlexRound: jest.fn(),
  };
});

const mockedService = flexService as jest.Mocked<typeof flexService>;

const pool: LigaJugadorPoolItem[] = [
  "Ana Uno",
  "Beto Dos",
  "Carla Tres",
  "Dani Cuatro",
  "Eva Cinco",
  "Fran Seis",
  "Gaby Siete",
  "Hugo Ocho",
].map((nombre, index) => ({
  id: `p${index + 1}`,
  nombre,
  email: null,
  telefono: null,
  genero: null,
  nivel: null,
  estado: "activo",
  organizador_id: "org-1",
  created_at: "2026-01-01T00:00:00Z",
  categoria: null,
  riviera_id: `RO-00${index + 1}`,
  foto_url: null,
}));

function makeDetalle(jornadaEstado: "in_progress" | "completed" = "in_progress"): LigaDetalle {
  return {
    id: "liga-flex-1",
    club_id: "club-1",
    nombre: "Riviera Flex League",
    temporada: "2026",
    formato: "flex_league",
    categoria: "3ra",
    rama: "mixto",
    estado: "in_progress",
    puntos_victoria: 3,
    puntos_derrota: 1,
    puntos_no_presentado: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    jugadores: pool,
    equipos: [],
    inscripciones: pool.map((p, index) => ({
      id: `ins-${index + 1}`,
      liga_id: "liga-flex-1",
      jugador_id: p.id,
      puntos: 0,
      partidos_jugados: 2,
      partidos_ganados: 1,
      partidos_perdidos: 1,
      games_favor: 10,
      games_contra: 10,
      diferencia_games: 0,
      created_at: "2026-01-01T00:00:00Z",
      jugador: p,
    })) as unknown as LigaDetalle["inscripciones"],
    jornadas: [
      {
        id: "jor-1",
        liga_id: "liga-flex-1",
        numero: 1,
        nombre: "Jornada 1",
        fecha: "2026-05-10",
        estado: jornadaEstado,
        created_at: "2026-01-01T00:00:00Z",
        parejas: [
          {
            id: "par-1",
            jornada_id: "jor-1",
            jugador1_id: "p1",
            jugador2_id: "p2",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "par-2",
            jornada_id: "jor-1",
            jugador1_id: "p3",
            jugador2_id: "p4",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "par-3",
            jornada_id: "jor-1",
            jugador1_id: "p5",
            jugador2_id: "p6",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "par-4",
            jornada_id: "jor-1",
            jugador1_id: "p7",
            jugador2_id: "p8",
            created_at: "2026-01-01T00:00:00Z",
          },
        ] as unknown as LigaDetalle["jornadas"][number]["parejas"],
        partidos: [
          {
            id: "m-r1-c1",
            liga_id: "liga-flex-1",
            jornada_id: "jor-1",
            ronda: 1,
            cancha: 1,
            pareja1_id: "par-1",
            pareja2_id: "par-2",
            score_pareja1: 6,
            score_pareja2: 4,
            estado: "completed",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "m-r1-c2",
            liga_id: "liga-flex-1",
            jornada_id: "jor-1",
            ronda: 1,
            cancha: 2,
            pareja1_id: "par-3",
            pareja2_id: "par-4",
            score_pareja1: 6,
            score_pareja2: 2,
            estado: "completed",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "m-r2-c1",
            liga_id: "liga-flex-1",
            jornada_id: "jor-1",
            ronda: 2,
            cancha: 1,
            pareja1_id: "par-1",
            pareja2_id: "par-3",
            score_pareja1: 6,
            score_pareja2: 3,
            estado: "completed",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "m-r2-c2",
            liga_id: "liga-flex-1",
            jornada_id: "jor-1",
            ronda: 2,
            cancha: 2,
            pareja1_id: "par-2",
            pareja2_id: "par-4",
            score_pareja1: 6,
            score_pareja2: 5,
            estado: "completed",
            created_at: "2026-01-01T00:00:00Z",
          },
        ] as unknown as LigaDetalle["jornadas"][number]["partidos"],
      },
    ],
  } as unknown as LigaDetalle;
}

function mockBundle() {
  mockedService.loadFlexLeague.mockResolvedValue({
    config: {
      ligaId: "liga-flex-1",
      jornadasPlaneadas: 10,
      jugadoresMin: 8,
      jugadoresMax: 16,
      rondasSugeridas: 5,
      duracionRondaMin: 20,
      descansoMin: 0,
      categoria: "3ra",
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
        ligaId: "liga-flex-1",
        canchas: 2,
        rondas: 5,
        duracionRondaMin: 20,
        descansoMin: 0,
        horaInicio: "18:00",
        horaFin: "20:00",
        seed: 123,
        programacionEstado: "confirmada",
        advertencia: null,
        esFinal: false,
        calidad: null,
      },
    ],
    participantes: {
      "jor-1": pool.map((p) => p.id),
    },
    posiciones: [],
    honores: null,
  });
}

describe("LigaFlexAdmin — flujo unificado de captura y corrección por ronda", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBundle();
    mockedService.loadFlexConfirmedRounds.mockResolvedValue([1]);
    mockedService.correctFlexMatch.mockResolvedValue({
      needsResolution: false,
    });
  });

  it("oculta Confirmar ronda 2 al consultar R01 confirmada, permite Editar/Cancelar y confirma con motivo en modal", async () => {
    const onReload = jest.fn();
    render(
      <LigaFlexAdmin
        detalle={makeDetalle("in_progress")}
        pool={pool}
        onReload={onReload}
      />
    );

    await waitFor(() => {
      expect(mockedService.loadFlexLeague).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Confirmar ronda 2/i })).toBeInTheDocument();
    });

    // Seleccionar R01 (ronda anterior confirmada mientras R02 está activa)
    const r01Tab = screen.getByRole("tab", { name: /R01/i });
    fireEvent.click(r01Tab);

    // El botón Confirmar ronda 2 NO debe aparecer mientras se consulta R01
    expect(screen.queryByRole("button", { name: /Confirmar ronda 2/i })).not.toBeInTheDocument();

    // Los campos de R01 están deshabilitados por defecto y muestran Editar
    const scoreA1 = screen.getByLabelText("Marcador pareja 1 ronda 1 cancha 1") as HTMLInputElement;
    const scoreB1 = screen.getByLabelText("Marcador pareja 2 ronda 1 cancha 1") as HTMLInputElement;
    const scoreA2 = screen.getByLabelText("Marcador pareja 1 ronda 1 cancha 2") as HTMLInputElement;
    expect(scoreA1).toBeDisabled();
    expect(scoreB1).toBeDisabled();
    expect(scoreA2).toBeDisabled();

    // Pulsar Editar en Cancha 1 habilita únicamente los campos de ese partido
    const editBtnC1 = screen.getByRole("button", {
      name: /Editar partido ronda 1 cancha 1/i,
    });
    fireEvent.click(editBtnC1);

    expect(scoreA1).not.toBeDisabled();
    expect(scoreB1).not.toBeDisabled();
    expect(scoreA2).toBeDisabled();

    // Probar Cancelar: modifica temporalmente y cancela sin alterar datos
    fireEvent.change(scoreA1, { target: { value: "3" } });
    expect(scoreA1.value).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(scoreA1.value).toBe("6");
    expect(scoreA1).toBeDisabled();
    expect(mockedService.correctFlexMatch).not.toHaveBeenCalled();

    // Volver a pulsar Editar, cambiar marcador y abrir ventana de confirmación
    fireEvent.click(
      screen.getByRole("button", { name: /Editar partido ronda 1 cancha 1/i })
    );
    fireEvent.change(scoreA1, { target: { value: "4" } });
    fireEvent.change(scoreB1, { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    // Verificar contenido del modal compacto de confirmación
    expect(
      screen.getByText(/CONFIRMAR CORRECCIÓN DE RESULTADO/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Ronda R01 · Cancha 1/i)).toBeInTheDocument();
    expect(screen.getByText("6 - 4")).toBeInTheDocument();
    expect(screen.getByText("4 - 6")).toBeInTheDocument();
    expect(
      screen.getByText(
        /La clasificación se actualizará automáticamente\. Los puntos anteriores serán sustituidos sin duplicar registros\./i
      )
    ).toBeInTheDocument();

    const confirmModalBtn = screen.getByRole("button", {
      name: "Confirmar corrección",
    });
    expect(confirmModalBtn).toBeDisabled();

    const motivoInput = screen.getByPlaceholderText(
      /Motivo de la corrección/i
    );
    fireEvent.change(motivoInput, {
      target: { value: "Error de captura en acta oficial" },
    });
    expect(confirmModalBtn).not.toBeDisabled();

    fireEvent.click(confirmModalBtn);

    await waitFor(() => {
      expect(mockedService.correctFlexMatch).toHaveBeenCalledWith({
        partidoId: "m-r1-c1",
        scoreA: 4,
        scoreB: 6,
        motivo: "Error de captura en acta oficial",
        orden: [],
      });
    });
  });

  it("elimina la sección duplicada 'Corrección de jornada finalizada' y permite corregir por ronda en jornada cerrada", async () => {
    mockedService.loadFlexConfirmedRounds.mockResolvedValue([1, 2]);
    render(
      <LigaFlexAdmin
        detalle={makeDetalle("completed")}
        pool={pool}
        onReload={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(mockedService.loadFlexLeague).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Editar partido ronda 2 cancha 1/i })
      ).toBeInTheDocument();
    });

    // No existe el bloque duplicado al final de la página
    expect(
      screen.queryByText(/Corrección de jornada finalizada/i)
    ).not.toBeInTheDocument();
  });
});
