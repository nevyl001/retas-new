import React, { useState, useEffect, useCallback } from "react";
import { useAdmin } from "../../contexts/AdminContext";
import { supabase } from "../../lib/supabaseClient";
import { UserManagement } from "./UserManagement";
import "./AdminDashboard.css";

interface UserRow {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

const DRAFT_DESCRIPTION = "Parejas en armado para torneo";

function isDraftTournamentRow(row: {
  name?: string | null;
  description?: string | null;
}): boolean {
  const n = (row.name ?? "").trim();
  const d = (row.description ?? "").trim();
  return (
    n.startsWith("(Borrador)") ||
    n === "Torneo Express Draft" ||
    n === DRAFT_DESCRIPTION ||
    d === DRAFT_DESCRIPTION
  );
}

function americanIdsFromPublicConfig(
  rows: Record<string, unknown>[] | null | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!rows) return ids;
  for (const row of rows) {
    if (!("americano_live" in row)) continue;
    const live = row.americano_live as unknown;
    if (
      live &&
      typeof live === "object" &&
      !Array.isArray(live) &&
      (live as { version?: number }).version === 1
    ) {
      const tid = row.tournament_id;
      if (typeof tid === "string") ids.add(tid);
    }
  }
  return ids;
}

function teamIdsFromPublicConfig(
  rows: Record<string, unknown>[] | null | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!rows) return ids;
  for (const row of rows) {
    if (row.format !== "teams") continue;
    const tc = row.team_config as
      | { teamNames?: unknown[]; pairToTeam?: Record<string, unknown> }
      | undefined;
    const tid = row.tournament_id;
    if (
      typeof tid === "string" &&
      Array.isArray(tc?.teamNames) &&
      (tc?.teamNames?.length ?? 0) > 0 &&
      tc?.pairToTeam &&
      typeof tc.pairToTeam === "object"
    ) {
      ids.add(tid);
    }
  }
  return ids;
}

type TournamentMode = "americano" | "teams" | "round_robin";

function resolveTournamentMode(
  tournamentId: string,
  americanIds: Set<string>,
  teamIds: Set<string>
): TournamentMode {
  if (americanIds.has(tournamentId)) return "americano";
  if (teamIds.has(tournamentId)) return "teams";
  return "round_robin";
}

interface ModeCounts {
  total: number;
  active: number;
  finished: number;
}

function emptyModeCounts(): ModeCounts {
  return { total: 0, active: 0, finished: 0 };
}

function bumpModeCounts(
  counts: ModeCounts,
  isFinished: boolean | null | undefined
): void {
  counts.total += 1;
  if (isFinished === true) {
    counts.finished += 1;
  } else {
    counts.active += 1;
  }
}

interface DashboardStats {
  totalUsers: number;
  totalTournamentsApp: number;
  tournamentsActive: number;
  tournamentsFinished: number;
  roundRobin: ModeCounts;
  americano: ModeCounts;
  teams: ModeCounts;
  express: ModeCounts;
}

export const AdminDashboard: React.FC = () => {
  const { adminUser, logoutAdmin } = useAdmin();
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalTournamentsApp: 0,
    tournamentsActive: 0,
    tournamentsFinished: 0,
    roundRobin: emptyModeCounts(),
    americano: emptyModeCounts(),
    teams: emptyModeCounts(),
    express: emptyModeCounts(),
  });
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"dashboard" | "users">(
    "dashboard"
  );
  const [error, setError] = useState("");

  const loadDashboardData = useCallback(async () => {
    if (!adminUser) return;

    try {
      setLoading(true);
      setError("");

      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, email, name, created_at")
        .order("created_at", { ascending: false });

      if (usersError) {
        throw usersError;
      }

      const filteredUsers: UserRow[] =
        users?.filter((u) => u.id !== adminUser?.user_id) ?? [];

      const [{ data: tournaments, error: tournamentsError }, { data: expressRows, error: expressError }, { data: publicConfigs, error: publicConfigError }] =
        await Promise.all([
          supabase
            .from("tournaments")
            .select("id, created_at, user_id, is_finished, name, description"),
          supabase.from("torneo_express").select("id, estado"),
          supabase.from("tournament_public_config").select("*"),
        ]);

      if (tournamentsError) {
        throw tournamentsError;
      }
      if (expressError) {
        console.warn("Torneo Express dashboard:", expressError);
      }
      if (publicConfigError) {
        console.warn("tournament_public_config dashboard:", publicConfigError);
      }

      const americanIds = americanIdsFromPublicConfig(
        publicConfigs as Record<string, unknown>[] | null | undefined
      );
      const teamIds = teamIdsFromPublicConfig(
        publicConfigs as Record<string, unknown>[] | null | undefined
      );

      const realTournaments =
        tournaments?.filter((t) => !isDraftTournamentRow(t)) ?? [];

      const roundRobin = emptyModeCounts();
      const americano = emptyModeCounts();
      const teams = emptyModeCounts();
      let activeApp = 0;
      let finishedApp = 0;

      for (const t of realTournaments) {
        if (t.is_finished === true) {
          finishedApp += 1;
        } else {
          activeApp += 1;
        }

        const mode = resolveTournamentMode(
          String(t.id),
          americanIds,
          teamIds
        );
        if (mode === "americano") {
          bumpModeCounts(americano, t.is_finished);
        } else if (mode === "teams") {
          bumpModeCounts(teams, t.is_finished);
        } else {
          bumpModeCounts(roundRobin, t.is_finished);
        }
      }

      const express = emptyModeCounts();
      for (const row of expressRows ?? []) {
        const estado = (row as { estado?: string }).estado ?? "pendiente";
        bumpModeCounts(express, estado === "finalizado");
      }

      const stats: DashboardStats = {
        totalUsers: filteredUsers.length,
        totalTournamentsApp: realTournaments.length,
        tournamentsActive: activeApp,
        tournamentsFinished: finishedApp,
        roundRobin,
        americano,
        teams,
        express,
      };

      setDashboardStats(stats);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      setError("Error al cargar los datos del dashboard");
    } finally {
      setLoading(false);
    }
  }, [adminUser]);

  useEffect(() => {
    if (adminUser) {
      void loadDashboardData();
    }
  }, [adminUser, loadDashboardData]);

  const handleLogout = () => {
    void logoutAdmin();
  };

  const modeSublabel = (c: ModeCounts) =>
    `${c.active} activas · ${c.finished} fin.`;

  if (loading) {
    return (
      <div className="admin-dash">
        <div className="admin-dash__loading">
          <div className="admin-dash__spinner" aria-hidden="true" />
          <p className="admin-dash__loading-text">Cargando datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dash">
      <header className="admin-dash__header">
        <div className="admin-dash__header-title-wrap">
          <h1 className="admin-dash__title">Panel de administración</h1>
          {adminUser?.email ? (
            <p className="admin-dash__subtitle">{adminUser.email}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="admin-dash__btn-logout"
          onClick={handleLogout}
        >
          Cerrar sesión
        </button>
      </header>

      {error ? (
        <div className="admin-dash__banner admin-dash__banner--error" role="alert">
          {error}
        </div>
      ) : null}

      <nav className="admin-dash__tabs" aria-label="Sección del panel">
        <button
          type="button"
          className={
            activeSection === "dashboard"
              ? "admin-dash__tab admin-dash__tab--active"
              : "admin-dash__tab"
          }
          onClick={() => setActiveSection("dashboard")}
        >
          Resumen
        </button>
        <button
          type="button"
          className={
            activeSection === "users"
              ? "admin-dash__tab admin-dash__tab--active"
              : "admin-dash__tab"
          }
          onClick={() => setActiveSection("users")}
        >
          Usuarios
        </button>
      </nav>

      {activeSection === "dashboard" ? (
        <section className="admin-dash__summary" aria-label="Resumen">
          <h2 className="admin-dash__stat-section-title">General</h2>
          <div className="admin-dash__stat-grid admin-dash__stat-grid--4">
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.totalUsers}
              </span>
              <div className="admin-dash__stat-meta">
                <span className="admin-dash__stat-label">Usuarios</span>
                <span className="admin-dash__stat-sublabel" aria-hidden="true">
                  &nbsp;
                </span>
              </div>
            </article>
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.totalTournamentsApp}
              </span>
              <div className="admin-dash__stat-meta">
                <span className="admin-dash__stat-label">Retas totales</span>
                <span className="admin-dash__stat-sublabel">Sin borradores</span>
              </div>
            </article>
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.tournamentsActive}
              </span>
              <div className="admin-dash__stat-meta">
                <span className="admin-dash__stat-label">Retas activas</span>
                <span className="admin-dash__stat-sublabel">En curso o pendientes</span>
              </div>
            </article>
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.tournamentsFinished}
              </span>
              <div className="admin-dash__stat-meta">
                <span className="admin-dash__stat-label">Retas finalizadas</span>
                <span className="admin-dash__stat-sublabel">Completadas</span>
              </div>
            </article>
          </div>

          <h2 className="admin-dash__stat-section-title">Por modo de juego</h2>
          <div className="admin-dash__stat-grid admin-dash__stat-grid--4">
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.roundRobin.total}
              </span>
              <div className="admin-dash__stat-meta">
                <span className="admin-dash__stat-label">Round robin</span>
                <span className="admin-dash__stat-sublabel">
                  {modeSublabel(dashboardStats.roundRobin)}
                </span>
              </div>
            </article>
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.americano.total}
              </span>
              <div className="admin-dash__stat-meta">
                <span className="admin-dash__stat-label">Pádel americano</span>
                <span className="admin-dash__stat-sublabel">
                  {modeSublabel(dashboardStats.americano)}
                </span>
              </div>
            </article>
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.teams.total}
              </span>
              <div className="admin-dash__stat-meta">
                <span className="admin-dash__stat-label">Por equipos</span>
                <span className="admin-dash__stat-sublabel">
                  {modeSublabel(dashboardStats.teams)}
                </span>
              </div>
            </article>
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.express.total}
              </span>
              <div className="admin-dash__stat-meta">
                <span className="admin-dash__stat-label">Torneo Express</span>
                <span className="admin-dash__stat-sublabel">
                  {modeSublabel(dashboardStats.express)}
                </span>
              </div>
            </article>
          </div>

          <p className="admin-dash__hint-muted">
            El listado completo está en Usuarios.
          </p>
        </section>
      ) : null}

      {activeSection === "users" ? (
        <section className="admin-dash__users-shell" aria-label="Gestión de usuarios">
          <UserManagement />
        </section>
      ) : null}
    </div>
  );
};
