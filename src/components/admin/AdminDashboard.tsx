import React, { useState, useEffect } from "react";
import { useAdmin } from "../../contexts/AdminContext";
import { supabase } from "../../lib/supabaseClient";
import { UserManagement } from "./UserManagement";
import "./AdminDashboard.css";

interface UserStats {
  id: string;
  email: string;
  name: string;
  created_at: string;
  tournaments_count: number;
  last_activity?: string;
}

interface DashboardStats {
  totalUsers: number;
  totalTournaments: number;
  activeUsers: number;
  recentRegistrations: number;
}

export const AdminDashboard: React.FC = () => {
  const { adminUser, logoutAdmin } = useAdmin();
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalTournaments: 0,
    activeUsers: 0,
    recentRegistrations: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"dashboard" | "users">(
    "dashboard"
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (adminUser) {
      loadDashboardData();
    }
  }, [adminUser]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError("");

      // Cargar estadísticas de usuarios (excluir admin)
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, email, name, created_at")
        .neq("email", "admin@test.com") // Excluir admin
        .order("created_at", { ascending: false });

      console.log("🔍 Consulta usuarios - Error:", usersError);
      console.log("🔍 Consulta usuarios - Data:", users);

      if (usersError) {
        throw usersError;
      }

      console.log("👥 Usuarios cargados (sin admin):", users);
      console.log("📊 Total de usuarios encontrados:", users?.length || 0);

      // Cargar estadísticas generales
      const { data: tournaments, error: tournamentsError } = await supabase
        .from("tournaments")
        .select("id, created_at, user_id");

      if (tournamentsError) {
        throw tournamentsError;
      }

      // Cargar torneos por usuario
      const { data: tournamentsByUser, error: tournamentsByUserError } =
        await supabase
          .from("tournaments")
          .select("user_id")
          .in("user_id", users?.map((u) => u.id) || []);

      if (tournamentsByUserError) {
        console.error(
          "❌ Error cargando torneos por usuario:",
          tournamentsByUserError
        );
      }

      console.log("🏆 Torneos por usuario:", tournamentsByUser);

      // Procesar datos de usuarios
      const processedUsers: UserStats[] =
        users?.map((user) => {
          const userTournaments =
            tournamentsByUser?.filter((t) => t.user_id === user.id) || [];
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            created_at: user.created_at,
            tournaments_count: userTournaments.length,
            last_activity: user.created_at, // Por ahora usamos created_at
          };
        }) || [];

      // Calcular estadísticas del dashboard
      const now = new Date();
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const stats: DashboardStats = {
        totalUsers: processedUsers.length,
        totalTournaments: tournaments?.length || 0,
        activeUsers: processedUsers.filter(
          (user) => new Date(user.created_at) > lastWeek
        ).length,
        recentRegistrations: processedUsers.filter(
          (user) => new Date(user.created_at) > lastMonth
        ).length,
      };

      setUserStats(processedUsers);
      setDashboardStats(stats);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      setError("Error al cargar los datos del dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logoutAdmin();
    window.location.href = "/admin-login";
  };

  if (loading) {
    return (
      <div className="admin-dashboard-container">
        <div className="admin-loading">
          <h2>⏳ Cargando datos...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard-container">
      <div className="admin-dashboard-header">
        <div className="admin-header-info">
          <h1>📊 Panel de Administración</h1>
          <p>Bienvenido, {adminUser?.name}</p>
        </div>
        <button onClick={handleLogout} className="admin-logout-btn">
          🚪 Cerrar Sesión
        </button>
      </div>

      {error && <div className="admin-error-banner">❌ {error}</div>}

      {/* Navegación */}
      <div className="admin-navigation">
        <button
          className={`nav-btn ${activeSection === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveSection("dashboard")}
        >
          📊 Dashboard
        </button>
        <button
          className={`nav-btn ${activeSection === "users" ? "active" : ""}`}
          onClick={() => setActiveSection("users")}
        >
          👥 Gestión de Usuarios
        </button>
      </div>

      {/* Contenido condicional */}
      {activeSection === "dashboard" && (
        <>
          {/* Estadísticas Generales */}
          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-icon">👥</div>
              <div className="admin-stat-content">
                <h3>{dashboardStats.totalUsers}</h3>
                <p>Usuarios Registrados</p>
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-icon">🏆</div>
              <div className="admin-stat-content">
                <h3>{dashboardStats.totalTournaments}</h3>
                <p>Retas Creadas</p>
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-icon">📈</div>
              <div className="admin-stat-content">
                <h3>{dashboardStats.activeUsers}</h3>
                <p>Usuarios Activos (7 días)</p>
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-icon">🆕</div>
              <div className="admin-stat-content">
                <h3>{dashboardStats.recentRegistrations}</h3>
                <p>Registros Recientes (30 días)</p>
              </div>
            </div>
          </div>

          {/* Tabla de Usuarios */}
          <div className="admin-users-section">
            <h2>👥 Usuarios Registrados</h2>
            <div className="admin-users-table-container">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Email</th>
                    <th>Retas Creadas</th>
                    <th>Fecha de Registro</th>
                  </tr>
                </thead>
                <tbody>
                  {userStats.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="admin-user-info">
                          <div className="admin-user-avatar">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{user.name}</span>
                        </div>
                      </td>
                      <td>{user.email}</td>
                      <td>
                        <span className="admin-tournaments-count">
                          {user.tournaments_count}
                        </span>
                      </td>
                      <td>
                        {new Date(user.created_at).toLocaleDateString("es-ES", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeSection === "users" && <UserManagement />}
    </div>
  );
};
