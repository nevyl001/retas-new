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

interface DashboardStats {
  totalUsers: number;
  activeTournaments: number;
  activeUsers: number;
  recentRegistrations: number;
}

export const AdminDashboard: React.FC = () => {
  const { adminUser, logoutAdmin } = useAdmin();
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeTournaments: 0,
    activeUsers: 0,
    recentRegistrations: 0,
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
        .select("id, created_at, user_id, is_finished");

      if (tournamentsError) {
        throw tournamentsError;
      }

      const activeTournaments =
        tournaments?.filter((t) => t.is_finished !== true) ?? [];

      const now = new Date();
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const stats: DashboardStats = {
        totalUsers: filteredUsers.length,
        activeTournaments: activeTournaments.length,
        activeUsers: filteredUsers.filter(
          (user) => new Date(user.created_at) > lastWeek
        ).length,
        recentRegistrations: filteredUsers.filter(
          (user) => new Date(user.created_at) > lastMonth
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
              <span className="admin-dash__stat-label">
                Usuarios registrados
              </span>
            </article>
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.activeTournaments}
              </span>
              <span className="admin-dash__stat-label">
                Retas activas
              </span>
            </article>
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.activeUsers}
              </span>
              <span className="admin-dash__stat-label">
                Activos (7 días)
              </span>
            </article>
            <article className="admin-dash__stat-card">
              <span className="admin-dash__stat-value">
                {dashboardStats.recentRegistrations}
              </span>
              <span className="admin-dash__stat-label">
                Altas (30 días)
              </span>
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
