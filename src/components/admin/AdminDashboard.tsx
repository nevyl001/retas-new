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

interface DashboardStats {
  totalUsers: number;
  totalTournaments: number;
  activeTournaments: number;
  finishedTournaments: number;
}

export const AdminDashboard: React.FC = () => {
  const { adminUser, logoutAdmin } = useAdmin();
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalTournaments: 0,
    activeTournaments: 0,
    finishedTournaments: 0,
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

      const { data: tournaments, error: tournamentsError } = await supabase
        .from("tournaments")
        .select("id, created_at, user_id, is_finished, name, description");

      if (tournamentsError) {
        throw tournamentsError;
      }

      const realTournaments =
        tournaments?.filter((t) => !isDraftTournamentRow(t)) ?? [];

      const stats: DashboardStats = {
        totalUsers: filteredUsers.length,
        totalTournaments: realTournaments.length,
        activeTournaments: realTournaments.filter(
          (t) => t.is_finished !== true
        ).length,
        finishedTournaments: realTournaments.filter(
          (t) => t.is_finished === true
        ).length,
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
          <div className="admin-dash__stat-grid">
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.totalUsers}
              </span>
              <span className="admin-dash__stat-label">Usuarios</span>
            </article>
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.totalTournaments}
              </span>
              <span className="admin-dash__stat-label">Retas totales</span>
            </article>
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.activeTournaments}
              </span>
              <span className="admin-dash__stat-label">Retas activas</span>
            </article>
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.finishedTournaments}
              </span>
              <span className="admin-dash__stat-label">Retas finalizadas</span>
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
