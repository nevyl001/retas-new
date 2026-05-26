import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAdmin } from "../../contexts/AdminContext";
import "./UserManagement.css";

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

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  tournaments_total?: number;
  tournaments_active?: number;
  tournaments_finished?: number;
  last_activity?: string;
}

interface UserManagementProps {
  onUserSelect?: (user: User) => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({
  onUserSelect,
}) => {
  const { adminUser } = useAdmin();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<
    "name" | "email" | "created_at" | "updated_at" | "tournaments_total"
  >("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterBy, setFilterBy] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [authCleanupNotice, setAuthCleanupNotice] = useState<string | null>(
    null
  );

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);

      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (usersError) {
        console.error("Error cargando usuarios:", usersError);
        return;
      }

      const { data: tournamentsData, error: tournamentsError } = await supabase
        .from("tournaments")
        .select("user_id, is_finished, name, description");

      if (tournamentsError) {
        console.error("Error cargando torneos:", tournamentsError);
      }

      const realTournaments =
        tournamentsData?.filter((t) => !isDraftTournamentRow(t)) ?? [];

      const totals: Record<string, number> = {};
      const active: Record<string, number> = {};
      const finished: Record<string, number> = {};

      realTournaments.forEach((tournament) => {
        const uid = tournament.user_id;
        totals[uid] = (totals[uid] || 0) + 1;
        if (tournament.is_finished === true) {
          finished[uid] = (finished[uid] || 0) + 1;
        } else {
          active[uid] = (active[uid] || 0) + 1;
        }
      });

      const usersWithCounts = (usersData ?? [])
        .map((user) => ({
          ...user,
          tournaments_total: totals[user.id] || 0,
          tournaments_active: active[user.id] || 0,
          tournaments_finished: finished[user.id] || 0,
          last_activity: user.updated_at,
        }))
        .filter((u) => u.id !== adminUser?.user_id);

      setUsers(usersWithCounts);
    } catch (error) {
      console.error("Error inesperado:", error);
    } finally {
      setLoading(false);
    }
  }, [adminUser?.user_id]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const filteredAndSortedUsers = useMemo(() => {
    let filtered = users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesFilter =
        filterBy === "all" ||
        (filterBy === "active" && (user.tournaments_active || 0) > 0) ||
        (filterBy === "inactive" && (user.tournaments_active || 0) === 0);

      return matchesSearch && matchesFilter;
    });

    filtered.sort((a, b) => {
      let aValue: any = a[sortBy];
      let bValue: any = b[sortBy];

      if (sortBy === "created_at" || sortBy === "updated_at") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      }
      return aValue < bValue ? 1 : -1;
    });

    return filtered;
  }, [users, searchTerm, sortBy, sortOrder, filterBy]);

  const detailUser =
    showUserDetails && selectedUser
      ? users.find((u) => u.id === selectedUser.id) ?? selectedUser
      : null;

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    setShowUserDetails(true);
    if (onUserSelect) {
      onUserSelect(user);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (
      !window.confirm(
        `¿Estás seguro de que quieres eliminar al usuario "${user.name || user.email}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    try {
      const { error: tournamentsError } = await supabase
        .from("tournaments")
        .delete()
        .eq("user_id", user.id);

      if (tournamentsError) {
        console.error("Error eliminando torneos:", tournamentsError);
      }

      const { error: playersError } = await supabase
        .from("players")
        .delete()
        .eq("user_id", user.id);

      if (playersError) {
        console.error("Error eliminando jugadores:", playersError);
      }

      const { error: pairsError } = await supabase
        .from("pairs")
        .delete()
        .eq("user_id", user.id);

      if (pairsError) {
        console.error("Error eliminando pares:", pairsError);
      }

      const { error: matchesError } = await supabase
        .from("matches")
        .delete()
        .eq("user_id", user.id);

      if (matchesError) {
        console.error("Error eliminando partidos:", matchesError);
      }

      const { error: gamesError } = await supabase
        .from("games")
        .delete()
        .eq("user_id", user.id);

      if (gamesError) {
        console.error("Error eliminando juegos:", gamesError);
      }

      const { error: userError } = await supabase
        .from("users")
        .delete()
        .eq("id", user.id);

      if (userError) {
        console.error("Error eliminando usuario de public.users:", userError);
        return;
      }

      setAuthCleanupNotice(
        `Se eliminaron los datos de "${user.name || user.email}" en la app. ` +
          `Si esa persona aún puede iniciar sesión, borra también la cuenta en ` +
          `Supabase → Authentication → Users (busca por email o por id ${user.id}).`
      );

      await loadUsers();

      if (selectedUser?.id === user.id) {
        setShowUserDetails(false);
        setSelectedUser(null);
      }
    } catch (error) {
      console.error("Error inesperado:", error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getInitials = (name: string, email?: string) => {
    const source = (name || email || "?").trim();
    return source
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="user-management-loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Cargando usuarios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-management">
      <div className="user-management-header">
        <div className="header-title">
          <h2>Gestión de Usuarios</h2>
          <span className="user-count">
            {filteredAndSortedUsers.length} usuarios
          </span>
        </div>

        <div className="header-controls">
          <button
            type="button"
            className="refresh-btn"
            onClick={loadUsers}
            title="Actualizar lista"
          >
            Actualizar
          </button>
        </div>
      </div>

      {authCleanupNotice && (
        <div className="user-management-notice" role="status">
          <p>{authCleanupNotice}</p>
          <div className="user-management-notice-actions">
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="notice-link"
            >
              Abrir panel de Supabase
            </a>
            <button
              type="button"
              className="notice-dismiss"
              onClick={() => setAuthCleanupNotice(null)}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      <div className="user-management-filters">
        <div className="search-container">
          <div className="search-input-container">
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="filter-controls">
          <select
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value as "all" | "active" | "inactive")}
            className="filter-select"
          >
            <option value="all">Todos los usuarios</option>
            <option value="active">Con retas activas</option>
            <option value="inactive">Sin retas activas</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(
                e.target.value as
                  | "name"
                  | "email"
                  | "created_at"
                  | "updated_at"
                  | "tournaments_total"
              )
            }
            className="filter-select"
          >
            <option value="created_at">Ordenar por fecha de registro</option>
            <option value="updated_at">Ordenar por última actualización</option>
            <option value="name">Ordenar por nombre</option>
            <option value="email">Ordenar por email</option>
            <option value="tournaments_total">Ordenar por total de retas</option>
          </select>

          <button
            type="button"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="sort-btn"
            title={`Ordenar ${
              sortOrder === "asc" ? "descendente" : "ascendente"
            }`}
          >
            {sortOrder === "asc" ? "Asc" : "Desc"}
          </button>
        </div>
      </div>

      <div className="user-list">
        {filteredAndSortedUsers.length === 0 ? (
          <div className="no-users">
            <h3>No se encontraron usuarios</h3>
            <p>Intenta ajustar los filtros de búsqueda</p>
          </div>
        ) : (
          <div className="user-grid">
            {filteredAndSortedUsers.map((user) => (
              <div key={user.id} className="user-card">
                <div className="user-avatar">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.name || user.email}
                      className="user-avatar-img"
                    />
                  ) : (
                    <span className="user-avatar-initials">
                      {getInitials(user.name, user.email)}
                    </span>
                  )}
                </div>

                <div className="user-info">
                  <h3 className="user-name">{user.name || user.email}</h3>
                  <p className="user-email">{user.email}</p>
                  <div className="user-stats">
                    <span className="stat-item">
                      {user.tournaments_total || 0}{" "}
                      {user.tournaments_total === 1 ? "reta" : "retas"}
                    </span>
                    <span className="stat-item">
                      {formatDate(user.created_at)}
                    </span>
                  </div>
                </div>

                <div className="user-actions">
                  <button
                    type="button"
                    className="action-btn view-btn"
                    onClick={() => handleUserSelect(user)}
                    title="Ver detalles"
                  >
                    Ver
                  </button>
                  <button
                    type="button"
                    className="action-btn delete-btn"
                    onClick={() => handleDeleteUser(user)}
                    title="Eliminar usuario"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {detailUser && (
        <div className="user-details-modal">
          <div
            className="modal-backdrop"
            onClick={() => setShowUserDetails(false)}
          ></div>
          <div className="modal-content">
            <div className="modal-header">
              <h3>Detalles del Usuario</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowUserDetails(false)}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="user-detail-avatar">
                {detailUser.avatar_url ? (
                  <img
                    src={detailUser.avatar_url}
                    alt={detailUser.name || detailUser.email}
                    className="detail-avatar-img"
                  />
                ) : (
                  <span className="detail-avatar-initials">
                    {getInitials(detailUser.name, detailUser.email)}
                  </span>
                )}
              </div>

              <div className="user-detail-info">
                <div className="detail-row">
                  <label>Nombre:</label>
                  <span>{detailUser.name || "—"}</span>
                </div>
                <div className="detail-row">
                  <label>Email:</label>
                  <span>{detailUser.email}</span>
                </div>

                <div className="detail-row detail-row--stats">
                  <label>Total de retas:</label>
                  <span className="tournaments-count">
                    {detailUser.tournaments_total || 0}
                  </span>
                </div>
                <div className="detail-row detail-row--stats">
                  <label>Retas activas:</label>
                  <span>{detailUser.tournaments_active || 0}</span>
                </div>
                <div className="detail-row detail-row--stats">
                  <label>Retas finalizadas:</label>
                  <span>{detailUser.tournaments_finished || 0}</span>
                </div>

                <div className="detail-row">
                  <label>Fecha de registro:</label>
                  <span>{formatDate(detailUser.created_at)}</span>
                </div>
                <div className="detail-row">
                  <label>Última actualización:</label>
                  <span>{formatDate(detailUser.updated_at)}</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="modal-btn secondary"
                onClick={() => setShowUserDetails(false)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="modal-btn danger"
                onClick={() => {
                  setShowUserDetails(false);
                  handleDeleteUser(detailUser);
                }}
              >
                Eliminar usuario
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
