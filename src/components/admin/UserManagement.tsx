import React, { useState, useEffect, useMemo } from "react";
import { supabase, supabaseAdmin } from "../../lib/supabaseClient";
import "./UserManagement.css";

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  tournaments_count?: number;
  last_activity?: string;
}

interface UserManagementProps {
  onUserSelect?: (user: User) => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({
  onUserSelect,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<
    "name" | "email" | "created_at" | "updated_at" | "tournaments_count"
  >("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterBy, setFilterBy] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);

  // Cargar usuarios
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      console.log("🔍 Cargando usuarios...");

      // Obtener usuarios de la tabla public.users
      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (usersError) {
        console.error("❌ Error cargando usuarios:", usersError);
        return;
      }

      // Obtener conteo de torneos por usuario
      const { data: tournamentsData, error: tournamentsError } = await supabase
        .from("tournaments")
        .select("user_id");

      if (tournamentsError) {
        console.error("❌ Error cargando torneos:", tournamentsError);
      }

      // Contar torneos por usuario
      const tournamentCounts: { [key: string]: number } = {};
      if (tournamentsData) {
        tournamentsData.forEach((tournament) => {
          tournamentCounts[tournament.user_id] =
            (tournamentCounts[tournament.user_id] || 0) + 1;
        });
      }

      // Combinar datos
      const usersWithCounts = usersData.map((user) => ({
        ...user,
        tournaments_count: tournamentCounts[user.id] || 0,
        last_activity: user.updated_at,
      }));

      setUsers(usersWithCounts);
      console.log("✅ Usuarios cargados:", usersWithCounts.length);
    } catch (error) {
      console.error("❌ Error inesperado:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar y ordenar usuarios
  const filteredAndSortedUsers = useMemo(() => {
    let filtered = users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesFilter =
        filterBy === "all" ||
        (filterBy === "active" && (user.tournaments_count || 0) > 0) ||
        (filterBy === "inactive" && (user.tournaments_count || 0) === 0);

      return matchesSearch && matchesFilter;
    });

    // Ordenar
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy];
      let bValue: any = b[sortBy];

      if (sortBy === "created_at" || sortBy === "updated_at") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [users, searchTerm, sortBy, sortOrder, filterBy]);

  // Manejar selección de usuario
  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    setShowUserDetails(true);
    if (onUserSelect) {
      onUserSelect(user);
    }
  };

  // Manejar eliminación de usuario
  const handleDeleteUser = async (user: User) => {
    if (
      !window.confirm(
        `¿Estás seguro de que quieres eliminar al usuario "${user.name}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    try {
      console.log("🗑️ Eliminando usuario:", user.id);

      // 1. Eliminar torneos del usuario primero
      const { error: tournamentsError } = await supabase
        .from("tournaments")
        .delete()
        .eq("user_id", user.id);

      if (tournamentsError) {
        console.error("❌ Error eliminando torneos:", tournamentsError);
      } else {
        console.log("✅ Torneos eliminados");
      }

      // 2. Eliminar jugadores del usuario
      const { error: playersError } = await supabase
        .from("players")
        .delete()
        .eq("user_id", user.id);

      if (playersError) {
        console.error("❌ Error eliminando jugadores:", playersError);
      } else {
        console.log("✅ Jugadores eliminados");
      }

      // 3. Eliminar pares del usuario
      const { error: pairsError } = await supabase
        .from("pairs")
        .delete()
        .eq("user_id", user.id);

      if (pairsError) {
        console.error("❌ Error eliminando pares:", pairsError);
      } else {
        console.log("✅ Pares eliminados");
      }

      // 4. Eliminar partidos del usuario
      const { error: matchesError } = await supabase
        .from("matches")
        .delete()
        .eq("user_id", user.id);

      if (matchesError) {
        console.error("❌ Error eliminando partidos:", matchesError);
      } else {
        console.log("✅ Partidos eliminados");
      }

      // 5. Eliminar juegos del usuario
      const { error: gamesError } = await supabase
        .from("games")
        .delete()
        .eq("user_id", user.id);

      if (gamesError) {
        console.error("❌ Error eliminando juegos:", gamesError);
      } else {
        console.log("✅ Juegos eliminados");
      }

      // 6. Eliminar usuario de la tabla public.users
      const { error: userError } = await supabase
        .from("users")
        .delete()
        .eq("id", user.id);

      if (userError) {
        console.error(
          "❌ Error eliminando usuario de public.users:",
          userError
        );
        return;
      } else {
        console.log("✅ Usuario eliminado de public.users");
      }

      // 7. Eliminar usuario de auth.users (esto requiere admin privileges)
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
        user.id
      );

      if (authError) {
        console.error("❌ Error eliminando usuario de auth.users:", authError);
        console.log(
          "⚠️ El usuario fue eliminado de public.users pero no de auth.users"
        );
        console.log(
          "⚠️ Esto puede requerir permisos de administrador en Supabase"
        );
      } else {
        console.log("✅ Usuario eliminado de auth.users");
      }

      console.log("✅ Usuario eliminado exitosamente de la base de datos");

      // Recargar usuarios
      await loadUsers();

      // Cerrar detalles si estaba abierto
      if (selectedUser?.id === user.id) {
        setShowUserDetails(false);
        setSelectedUser(null);
      }
    } catch (error) {
      console.error("❌ Error inesperado:", error);
    }
  };

  // Formatear fecha
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Obtener iniciales
  const getInitials = (name: string) => {
    return name
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
          <p>⏳ Cargando usuarios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-management">
      {/* Header con controles */}
      <div className="user-management-header">
        <div className="header-title">
          <h2>👥 Gestión de Usuarios</h2>
          <span className="user-count">
            {filteredAndSortedUsers.length} usuarios
          </span>
        </div>

        <div className="header-controls">
          <button
            className="refresh-btn"
            onClick={loadUsers}
            title="Actualizar lista"
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Filtros y búsqueda */}
      <div className="user-management-filters">
        <div className="search-container">
          <div className="search-input-container">
            <input
              type="text"
              placeholder="🔍 Buscar por nombre o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="filter-controls">
          <select
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value as any)}
            className="filter-select"
          >
            <option value="all">Todos los usuarios</option>
            <option value="active">Usuarios activos</option>
            <option value="inactive">Usuarios inactivos</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="filter-select"
          >
            <option value="created_at">Ordenar por fecha de registro</option>
            <option value="updated_at">Ordenar por última actualización</option>
            <option value="name">Ordenar por nombre</option>
            <option value="email">Ordenar por email</option>
            <option value="tournaments_count">Ordenar por retas</option>
          </select>

          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="sort-btn"
            title={`Ordenar ${
              sortOrder === "asc" ? "descendente" : "ascendente"
            }`}
          >
            {sortOrder === "asc" ? "⬆️" : "⬇️"}
          </button>
        </div>
      </div>

      {/* Lista de usuarios */}
      <div className="user-list">
        {filteredAndSortedUsers.length === 0 ? (
          <div className="no-users">
            <div className="no-users-icon">👥</div>
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
                      alt={user.name}
                      className="user-avatar-img"
                    />
                  ) : (
                    <span className="user-avatar-initials">
                      {getInitials(user.name)}
                    </span>
                  )}
                </div>

                <div className="user-info">
                  <h3 className="user-name">{user.name}</h3>
                  <p className="user-email">{user.email}</p>
                  <div className="user-stats">
                    <span className="stat-item">
                      <span className="stat-icon">🏆</span>
                      <span>{user.tournaments_count || 0} retas</span>
                    </span>
                    <span className="stat-item">
                      <span className="stat-icon">📅</span>
                      <span>{formatDate(user.created_at)}</span>
                    </span>
                  </div>
                </div>

                <div className="user-actions">
                  <button
                    className="action-btn view-btn"
                    onClick={() => handleUserSelect(user)}
                    title="Ver detalles"
                  >
                    👁️
                  </button>
                  <button
                    className="action-btn delete-btn"
                    onClick={() => handleDeleteUser(user)}
                    title="Eliminar usuario"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de detalles de usuario */}
      {showUserDetails && selectedUser && (
        <div className="user-details-modal">
          <div
            className="modal-backdrop"
            onClick={() => setShowUserDetails(false)}
          ></div>
          <div className="modal-content">
            <div className="modal-header">
              <h3>👤 Detalles del Usuario</h3>
              <button
                className="modal-close"
                onClick={() => setShowUserDetails(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="user-detail-avatar">
                {selectedUser.avatar_url ? (
                  <img
                    src={selectedUser.avatar_url}
                    alt={selectedUser.name}
                    className="detail-avatar-img"
                  />
                ) : (
                  <span className="detail-avatar-initials">
                    {getInitials(selectedUser.name)}
                  </span>
                )}
              </div>

              <div className="user-detail-info">
                <div className="detail-row">
                  <label>Nombre:</label>
                  <span>{selectedUser.name}</span>
                </div>
                <div className="detail-row">
                  <label>Email:</label>
                  <span>{selectedUser.email}</span>
                </div>
                <div className="detail-row">
                  <label>ID:</label>
                  <span className="user-id">{selectedUser.id}</span>
                </div>
                <div className="detail-row">
                  <label>Fecha de registro:</label>
                  <span>{formatDate(selectedUser.created_at)}</span>
                </div>
                <div className="detail-row">
                  <label>Última actualización:</label>
                  <span>{formatDate(selectedUser.updated_at)}</span>
                </div>
                <div className="detail-row">
                  <label>Retas creadas:</label>
                  <span className="tournaments-count">
                    {selectedUser.tournaments_count || 0}
                  </span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="modal-btn secondary"
                onClick={() => setShowUserDetails(false)}
              >
                Cerrar
              </button>
              <button
                className="modal-btn danger"
                onClick={() => {
                  setShowUserDetails(false);
                  handleDeleteUser(selectedUser);
                }}
              >
                🗑️ Eliminar Usuario
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
