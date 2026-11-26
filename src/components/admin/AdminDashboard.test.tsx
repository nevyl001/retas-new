import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminDashboard } from "./AdminDashboard";
import {
  emptyFormatCounts,
  type AdminControlCenterSnapshot,
} from "../../lib/admin/adminControlCenterData";

const mockFetchSnapshot = jest.fn<
  Promise<AdminControlCenterSnapshot>,
  [string | null | undefined]
>();

jest.mock("../../lib/admin/adminControlCenterData", () => {
  const actual = jest.requireActual("../../lib/admin/adminControlCenterData");
  return {
    ...actual,
    fetchAdminControlCenterSnapshot: (excludeId?: string | null) =>
      mockFetchSnapshot(excludeId),
  };
});

jest.mock("../../contexts/AdminContext", () => ({
  useAdmin: () => ({
    isAdminLoggedIn: true,
    adminUser: {
      id: "admin-master-id",
      email: "christiancastellanosmx@gmail.com",
      is_admin: true,
    },
    loading: false,
    loginAdmin: jest.fn(),
    logoutAdmin: jest.fn(),
  }),
}));

jest.mock("../../contexts/UserContext", () => ({
  useUser: () => ({
    user: null,
    userProfile: null,
    loading: false,
  }),
}));

const SAMPLE_FORMATS = {
  round_robin: { total: 83, active: 44, finished: 39 },
  americano: { total: 44, active: 14, finished: 30 },
  reta_equipos: { total: 11, active: 3, finished: 8 },
  torneo_express: { total: 18, active: 7, finished: 11 },
  duelo_2v2: { total: 4, active: 1, finished: 3 },
  liga_individual: { total: 2, active: 1, finished: 1 },
  liga_parejas: { total: 1, active: 1, finished: 0 },
  liga_flex: { total: 2, active: 1, finished: 1 },
};

const SAMPLE_SNAPSHOT: AdminControlCenterSnapshot = {
  clubesCount: 8,
  coachesCount: 1,
  studentsCount: 3,
  totalAccountsCount: 12,
  jugadoresTotal: 94,
  jugadoresPublicos: 62,
  competenciasTotal: 165,
  competenciasActivas: 72,
  competenciasFinalizadas: 93,
  retasTournamentsTableTotal: 138,
  formats: SAMPLE_FORMATS,
  formatList: [
    {
      key: "round_robin",
      label: "Round Robin",
      shortLabel: "RR",
      category: "reta_rapida",
      sourceTable: "public.tournaments",
      ruleNote: "1 reta = 1 competencia",
      counts: SAMPLE_FORMATS.round_robin,
    },
    {
      key: "americano",
      label: "Americano Dinámico",
      shortLabel: "Am",
      category: "reta_rapida",
      sourceTable: "public.tournaments",
      ruleNote: "1 americano = 1 competencia",
      counts: SAMPLE_FORMATS.americano,
    },
    {
      key: "reta_equipos",
      label: "Reta por Equipos",
      shortLabel: "Eq",
      category: "reta_rapida",
      sourceTable: "public.tournaments",
      ruleNote: "1 reta por equipos = 1 competencia",
      counts: SAMPLE_FORMATS.reta_equipos,
    },
    {
      key: "torneo_express",
      label: "Torneo Express",
      shortLabel: "TE",
      category: "torneo",
      sourceTable: "public.torneo_express",
      ruleNote: "1 torneo = 1 competencia",
      counts: SAMPLE_FORMATS.torneo_express,
    },
    {
      key: "duelo_2v2",
      label: "Duelo 2v2",
      shortLabel: "D2v2",
      category: "reta_rapida",
      sourceTable: "public.duelos_2v2",
      ruleNote: "1 duelo = 1 competencia",
      counts: SAMPLE_FORMATS.duelo_2v2,
    },
    {
      key: "liga_individual",
      label: "Liga Individual",
      shortLabel: "L.Ind",
      category: "liga",
      sourceTable: "public.ligas",
      ruleNote: "1 temporada = 1 competencia",
      counts: SAMPLE_FORMATS.liga_individual,
    },
    {
      key: "liga_parejas",
      label: "Liga de Parejas Fijas",
      shortLabel: "L.Par",
      category: "liga",
      sourceTable: "public.ligas",
      ruleNote: "1 temporada = 1 competencia",
      counts: SAMPLE_FORMATS.liga_parejas,
    },
    {
      key: "liga_flex",
      label: "Riviera Flex League",
      shortLabel: "Flex",
      category: "liga",
      sourceTable: "public.ligas",
      ruleNote: "1 temporada = 1 competencia",
      counts: SAMPLE_FORMATS.liga_flex,
    },
  ],
  coaching: {
    coachesTotal: 1,
    alumnosVinculados: 3,
    clubesConCoaching: 1,
    movimientosClases: 14,
  },
  accounts: [
    {
      id: "club-hackpadel",
      email: "aaronduran2020@gmail.com",
      name: "Hackpadel",
      avatar_url: null,
      logo_url: "/clubs/hack-padel/logo-header.png",
      created_at: "2026-06-29T19:29:00.000Z",
      updated_at: "2026-11-20T12:00:00.000Z",
      account_kind: "club",
      status_key: "en_curso",
      status_label: "En operación",
      has_upgrade: true,
      upgrade_key: "hack-padel",
      upgrade_label: "Hackpadel",
      visible_ranking_oficial: true,
      permite_ajuste_puntos: true,
      jugadores_total: 42,
      jugadores_publicos: 30,
      coaches_count: 1,
      students_count: 3,
      coaching_movements: 14,
      competencias_total: 38,
      competencias_activas: 5,
      competencias_finalizadas: 33,
      tournaments_total: 29,
      tournaments_active: 3,
      tournaments_finished: 26,
      retas_round_robin_total: 19,
      retas_round_robin_active: 2,
      retas_round_robin_finished: 17,
      retas_americano_total: 10,
      retas_americano_active: 1,
      retas_americano_finished: 9,
      retas_teams_total: 0,
      retas_teams_active: 0,
      retas_teams_finished: 0,
      express_total: 7,
      express_active: 1,
      express_finished: 6,
      ligas_total: 2,
      ligas_active: 1,
      ligas_finished: 1,
      duelos_total: 0,
      duelos_active: 0,
      duelos_finished: 0,
      activity_total: 38,
      formats: {
        roundRobin: { total: 19, active: 2, finished: 17 },
        americano: { total: 10, active: 1, finished: 9 },
        retaEquipos: emptyFormatCounts(),
        duelo2v2: emptyFormatCounts(),
        torneoExpress: { total: 7, active: 1, finished: 6 },
        ligaIndividual: emptyFormatCounts(),
        ligaParejas: emptyFormatCounts(),
        ligaFlex: { total: 2, active: 1, finished: 1 },
      },
      coach_info: null,
      student_info: null,
    },
    {
      id: "club-test",
      email: "clubtest@rivieraopen.com",
      name: "Club Test",
      avatar_url: null,
      logo_url: null,
      created_at: "2026-09-10T10:00:00.000Z",
      updated_at: "2026-11-15T10:00:00.000Z",
      account_kind: "club",
      status_key: "con_actividad",
      status_label: "Activa",
      has_upgrade: false,
      upgrade_key: null,
      upgrade_label: null,
      visible_ranking_oficial: false,
      permite_ajuste_puntos: true,
      jugadores_total: 16,
      jugadores_publicos: 0,
      coaches_count: 0,
      students_count: 0,
      coaching_movements: 0,
      competencias_total: 4,
      competencias_activas: 0,
      competencias_finalizadas: 4,
      tournaments_total: 4,
      tournaments_active: 0,
      tournaments_finished: 4,
      retas_round_robin_total: 4,
      retas_round_robin_active: 0,
      retas_round_robin_finished: 4,
      retas_americano_total: 0,
      retas_americano_active: 0,
      retas_americano_finished: 0,
      retas_teams_total: 0,
      retas_teams_active: 0,
      retas_teams_finished: 0,
      express_total: 0,
      express_active: 0,
      express_finished: 0,
      ligas_total: 0,
      ligas_active: 0,
      ligas_finished: 0,
      duelos_total: 0,
      duelos_active: 0,
      duelos_finished: 0,
      activity_total: 4,
      formats: {
        roundRobin: { total: 4, active: 0, finished: 4 },
        americano: emptyFormatCounts(),
        retaEquipos: emptyFormatCounts(),
        duelo2v2: emptyFormatCounts(),
        torneoExpress: emptyFormatCounts(),
        ligaIndividual: emptyFormatCounts(),
        ligaParejas: emptyFormatCounts(),
        ligaFlex: emptyFormatCounts(),
      },
      coach_info: null,
      student_info: null,
    },
  ],
  competitions: [
    {
      id: "flex-season-1",
      title: "Riviera League Flex",
      formatKey: "liga_flex",
      formatLabel: "Riviera Flex League",
      organizadorId: "club-hackpadel",
      organizadorName: "Hackpadel",
      status: "active",
      statusLabel: "En curso",
      createdAt: "2026-11-01T10:00:00.000Z",
      publicPath: "/liga-flex/flex-season-1/temporada",
    },
  ],
  activities: [
    {
      id: "act-1",
      timestamp: "2026-11-01T10:00:00.000Z",
      kind: "competencia",
      title: "Riviera League Flex",
      subtitle: "Riviera Flex League · En curso",
      actorName: "Hackpadel",
      organizadorId: "club-hackpadel",
      badge: "Competencia",
    },
  ],
};

describe("AdminDashboard Control Center", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mockFetchSnapshot.mockResolvedValue(SAMPLE_SNAPSHOT);
  });

  it("renders all 6 general KPIs and reconciles all 8 active sports formats + Riviera Coaching", async () => {
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Clubes registrados")).toBeInTheDocument();
    });

    expect(screen.getByText("Cuentas registradas")).toBeInTheDocument();
    expect(screen.getByText("Jugadores registrados")).toBeInTheDocument();
    expect(screen.getByText("Competencias totales")).toBeInTheDocument();
    expect(screen.getByText("Competencias activas")).toBeInTheDocument();
    expect(screen.getByText("Competencias finalizadas")).toBeInTheDocument();

    // Verify all 8 active sports formats are rendered
    expect(screen.getByText("Round Robin")).toBeInTheDocument();
    expect(screen.getByText("Americano Dinámico")).toBeInTheDocument();
    expect(screen.getByText("Reta por Equipos")).toBeInTheDocument();
    expect(screen.getByText("Torneo Express")).toBeInTheDocument();
    expect(screen.getByText("Duelo 2v2")).toBeInTheDocument();
    expect(screen.getByText("Liga Individual")).toBeInTheDocument();
    expect(screen.getByText("Liga de Parejas Fijas")).toBeInTheDocument();
    expect(screen.getByText("Riviera Flex League")).toBeInTheDocument();

    // Verify Cancha Reina documentation note and Riviera Coaching independent block
    expect(screen.getByText(/Cancha Reina:/i)).toBeInTheDocument();
    expect(screen.getByText("Riviera Coaching")).toBeInTheDocument();
  });

  it("navigates to Gestión de cuentas and renders club logos, upgrade badges, and contextual delete menu", async () => {
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Clubes registrados")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Gestión de cuentas/i })
    );

    await waitFor(() => {
      expect(
        screen.getByRole("table", { name: /Tabla de clubes/i })
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Hackpadel")).toBeInTheDocument();
    expect(screen.getByText(/Upgrade · Hackpadel/i)).toBeInTheDocument();
    expect(screen.getByText("Estándar")).toBeInTheDocument();

    // Destructive delete button is NOT permanently visible on rows until contextual menu (⋯) is opened
    expect(screen.queryByText("Eliminar cuenta")).not.toBeInTheDocument();

    const moreBtn = screen.getByRole("button", {
      name: /Más acciones para Hackpadel/i,
    });
    fireEvent.click(moreBtn);

    expect(screen.getByText("Eliminar cuenta")).toBeInTheDocument();
  });

  it("navigates to Competencias and filters across formats", async () => {
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Clubes registrados")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /^Competencias/i })
    );

    await waitFor(() => {
      expect(screen.getByText("Riviera League Flex")).toBeInTheDocument();
    });

    expect(screen.getByText("Hackpadel")).toBeInTheDocument();
  });
});
