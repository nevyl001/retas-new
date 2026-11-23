/**
 * @jest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LigaDetalle, LigaJugadorPoolItem } from "../../lib/liga/types";
import * as ligaFlexService from "../../services/ligaFlexService";
import { LigaFlexAdmin, resolveFlexJornadaVisualState } from "./LigaFlexAdmin";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../club-experience", () => ({
  useBranding: () => ({ nombre: "Hack Pádel" }),
  useClubModeEyebrow: () => "Hack Pádel",
}));

const mockDetalle: LigaDetalle = {
  id: "liga-flex-1",
  nombre: "Test Flex",
  estado: "in_progress",
  modalidad: "flex_league",
  vueltas: 1,
  organizador_id: "org-1",
  canchas_disponibles: 3,
  fecha_inicio: "2026-11-01",
  fecha_fin: null,
  created_at: "2026-11-01T00:00:00Z",
  inscripciones: [],
  equipos: [],
  jugadores: [
    {
      id: "p1",
      nombre: "Carlos Jugador",
      email: "carlos@club.com",
      telefono: null,
      genero: "M",
      nivel: null,
      estado: "activo",
      organizador_id: "org-1",
      created_at: "2026-11-01T00:00:00Z",
    },
    {
      id: "p2",
      nombre: "Ana Jugadora",
      email: "ana@club.com",
      telefono: null,
      genero: "F",
      nivel: null,
      estado: "activo",
      organizador_id: "org-1",
      created_at: "2026-11-01T00:00:00Z",
    },
  ],
  jornadas: [
    {
      id: "jor-1",
      liga_id: "liga-flex-1",
      numero: 1,
      estado: "completed",
      fecha: "2026-11-10",
      puntos_aplicados: true,
      parejas: [],
      partidos: [],
    } as unknown as LigaDetalle["jornadas"][number],
    {
      id: "jor-2",
      liga_id: "liga-flex-1",
      numero: 2,
      estado: "upcoming",
      fecha: "2026-11-24",
      puntos_aplicados: false,
      parejas: [],
      partidos: [],
    } as unknown as LigaDetalle["jornadas"][number],
  ],
};

const mockPool: LigaJugadorPoolItem[] = [
  {
    id: "p1",
    nombre: "Carlos Jugador",
    email: "carlos@club.com",
    telefono: null,
    genero: "M",
    nivel: null,
    estado: "activo",
    organizador_id: "org-1",
    created_at: "2026-11-01T00:00:00Z",
    categoria: "4ta_fuerza",
    riviera_id: "RIV-00000101",
    foto_url: "https://example.com/carlos.jpg",
  },
  {
    id: "p2",
    nombre: "Ana Jugadora",
    email: "ana@club.com",
    telefono: null,
    genero: "F",
    nivel: null,
    estado: "activo",
    organizador_id: "org-1",
    created_at: "2026-11-01T00:00:00Z",
    categoria: "5ta_fuerza",
    riviera_id: "RIV-00000102",
    foto_url: null,
  },
];

const mockBundle: ligaFlexService.FlexBundle = {
  config: {
    ligaId: "liga-flex-1",
    jornadasPlaneadas: 12,
    jugadoresMin: 12,
    jugadoresMax: 16,
    rondasSugeridas: 5,
    duracionRondaMin: 20,
    descansoMin: 3,
    categoria: "5ta fuerza",
    horarioSugerido: "19:00",
    inscripcionTemporadaMxn: 200,
    participacionJornadaMxn: 300,
    premioCampeon: "$3,000 MXN",
    premioSubcampeon: "2 clases gratuitas",
    premioTercer: "Kit Riviera Open",
    jornadaFinalId: null,
    cerradoAt: null,
  },
  jornadas: [
    {
      jornadaId: "jor-1",
      ligaId: "liga-flex-1",
      canchas: 3,
      rondas: 5,
      duracionRondaMin: 20,
      descansoMin: 3,
      horaInicio: "19:00",
      horaFin: "21:00",
      seed: 123,
      programacionEstado: "confirmada",
      advertencia: null,
      esFinal: false,
      calidad: null,
    },
    {
      jornadaId: "jor-2",
      ligaId: "liga-flex-1",
      canchas: 3,
      rondas: 5,
      duracionRondaMin: 20,
      descansoMin: 3,
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
    "jor-1": ["p1", "p2"],
    "jor-2": ["p1"],
  },
  posiciones: [
    {
      jornadaId: "jor-1",
      jugadorId: "p1",
      posicion: 1,
      puntos: 100,
      partidos: 5,
      gamesFavor: 30,
      gamesContra: 15,
    },
    {
      jornadaId: "jor-1",
      jugadorId: "p2",
      posicion: 2,
      puntos: 90,
      partidos: 5,
      gamesFavor: 25,
      gamesContra: 20,
    },
  ],
  honores: null,
};

describe("LigaFlexAdmin — Rediseño Integral Premium", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.spyOn(ligaFlexService, "loadFlexLeague").mockResolvedValue(mockBundle);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.restoreAllMocks();
  });

  it("resuelve estados reales de jornada (Pendiente, Configurada, En curso, Finalizada)", () => {
    expect(
      resolveFlexJornadaVisualState(
        { estado: "completed", fecha: null } as any,
        null,
        0
      )
    ).toEqual({ key: "finalizada", label: "Finalizada" });

    expect(
      resolveFlexJornadaVisualState(
        { estado: "in_progress", fecha: null } as any,
        null,
        12
      )
    ).toEqual({ key: "en_curso", label: "En curso" });

    expect(
      resolveFlexJornadaVisualState(
        { estado: "upcoming", fecha: "2026-11-24" } as any,
        null,
        0
      )
    ).toEqual({ key: "configurada", label: "Configurada" });

    expect(
      resolveFlexJornadaVisualState(
        { estado: "upcoming", fecha: null } as any,
        null,
        0
      )
    ).toEqual({ key: "pendiente", label: "Pendiente" });
  });

  it("renderiza el Header Premium con KPIs reales y navega entre las 4 pestañas principales", async () => {
    await act(async () => {
      root.render(
        <LigaFlexAdmin detalle={mockDetalle} pool={mockPool} onReload={jest.fn()} />
      );
    });

    // Header y KPIs reales
    expect(container.textContent).toContain("RIVIERA FLEX LEAGUE");
    expect(container.textContent).toContain("Test Flex");
    expect(container.textContent).toContain("Hack Pádel");
    expect(container.textContent).toContain("5ta fuerza");
    expect(container.textContent).toContain("EN CURSO");
    expect(container.textContent).toContain("Jornadas totales");
    expect(container.textContent).toContain("Jornadas completadas");
    expect(container.textContent).toContain("Jugadores registrados");
    expect(container.textContent).toContain("Próxima jornada");

    // 4 pestañas principales: Resumen, Jornadas, Clasificación, Jugadores
    const tabs = Array.from(container.querySelectorAll(".liga-flex-tab"));
    expect(tabs.map((t) => t.textContent)).toEqual([
      expect.stringContaining("Resumen"),
      expect.stringContaining("Jornadas"),
      expect.stringContaining("Clasificación"),
      expect.stringContaining("Jugadores"),
    ]);

    // Vista por defecto: Jornadas con layout 2 columnas, Configuración y Participantes
    expect(container.textContent).toContain("PARTICIPANTES DE LA JORNADA");
    expect(container.textContent).toContain("¿No encuentras al jugador?");
    expect(container.textContent).toContain("Ir al registro único");
    expect(container.textContent).not.toContain("Registrar jugador nuevo");
    expect(container.textContent).not.toContain("Dar de alta");
    expect(container.textContent).toContain("CONFIGURACIÓN DE JORNADA");
    expect(container.textContent).toContain("3 CANCHAS · 5 RONDAS");
    expect(container.textContent).toContain("TIEMPO DE LA RETA: 120 MIN");
    expect(container.textContent).not.toContain("Duración por ronda");
    expect(container.textContent).not.toContain("Descanso entre rondas");
    expect(container.textContent).toContain("Guardar configuración");

    const resumenTab = tabs.find((t) => t.textContent?.includes("Resumen")) as HTMLButtonElement;
    await act(async () => {
      resumenTab.click();
    });
    expect((container.querySelector("#flex-inscripcion") as HTMLInputElement).value).toBe("200");
    expect((container.querySelector("#flex-participacion") as HTMLInputElement).value).toBe("300");
    expect((container.querySelector("#flex-premio-campeon") as HTMLInputElement).value).toBe(
      "$3,000 MXN"
    );
    expect((container.querySelector("#flex-premio-sub") as HTMLInputElement).value).toBe(
      "2 clases gratuitas"
    );
    expect((container.querySelector("#flex-premio-tercer") as HTMLInputElement).value).toBe(
      "Kit Riviera Open"
    );
    expect(container.textContent).toContain("Guardar premios y costos");

    // Cambiar a Clasificación
    const clasificacionTab = tabs.find((t) =>
      t.textContent?.includes("Clasificación")
    ) as HTMLButtonElement;
    await act(async () => {
      clasificacionTab.click();
    });

    expect(container.textContent).toContain("Clasificación General");
    expect(container.textContent).toContain("Carlos Jugador");
    expect(container.textContent).toContain("RIV-00000101");
    expect(container.textContent).toContain("100 pts");

    // Cambiar a Jugadores
    const jugadoresTab = tabs.find((t) =>
      t.textContent?.includes("Jugadores")
    ) as HTMLButtonElement;
    await act(async () => {
      jugadoresTab.click();
    });

    expect(container.textContent).toContain("Directorio de Jugadores");
    expect(container.textContent).not.toContain("Dar de alta nuevo jugador");
    expect(container.textContent).toContain("Ana Jugadora");
    expect(container.textContent).toContain("RIV-00000102");

    await act(async () => {
      resumenTab.click();
    });

    expect(container.textContent).toContain("Estado general y progreso");
    expect(container.textContent).toContain("Líderes de la temporada");
  });
});
