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

type CountMaps = {
  total: Record<string, number>;
  active: Record<string, number>;
  finished: Record<string, number>;
};

function emptyCountMaps(): CountMaps {
  return { total: {}, active: {}, finished: {} };
}

function addCount(
  maps: CountMaps,
  userId: string,
  isFinished: boolean | null | undefined
): void {
  maps.total[userId] = (maps.total[userId] || 0) + 1;
  if (isFinished === true) {
    maps.finished[userId] = (maps.finished[userId] || 0) + 1;
  } else {
    maps.active[userId] = (maps.active[userId] || 0) + 1;
  }
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
  retas_americano_total?: number;
  retas_americano_active?: number;
  retas_americano_finished?: number;
  retas_round_robin_total?: number;
  retas_round_robin_active?: number;
  retas_round_robin_finished?: number;
  retas_teams_total?: number;
  retas_teams_active?: number;
  retas_teams_finished?: number;
  express_total?: number;
  express_active?: number;
  express_finished?: number;
  activity_total?: number;
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
    | "name"
    | "email"
    | "created_at"
    | "updated_at"
    | "tournaments_total"
    | "activity_total"
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

      const [
        { data: tournamentsData, error: tournamentsError },
        { data: expressData, error: expressError },
        { data: publicConfigData, error: publicConfigError },
      ] = await Promise.all([
        supabase
          .from("tournaments")
          .select("id, user_id, is_finished, name, description"),
        supabase.from("torneo_express").select("organizador_id, estado"),
        supabase.from("tournament_public_config").select("*"),
      ]);

      if (tournamentsError) {
        console.error("Error cargando torneos:", tournamentsError);
      }
      if (expressError) {
        console.error("Error cargando Torneo Express:", expressError);
      }
      if (publicConfigError) {
        console.warn("tournament_public_config (americano):", publicConfigError);
      }

      const americanTournamentIds = americanIdsFromPublicConfig(
        publicConfigData as Record<string, unknown>[] | null | undefined
      );
      const teamTournamentIds = teamIdsFromPublicConfig(
        publicConfigData as Record<string, unknown>[] | null | undefined
      );

      const realTournaments =
        tournamentsData?.filter((t) => !isDraftTournamentRow(t)) ?? [];

      const classicMaps = emptyCountMaps();
      const americanoMaps = emptyCountMaps();
      const roundRobinMaps = emptyCountMaps();
      const teamsMaps = emptyCountMaps();

      const expressTotal: Record<string, number> = {};
      const expressActive: Record<string, number> = {};
      const expressFinished: Record<string, number> = {};

      for (const t of realTournaments) {
        const uid = t.user_id as string;
        addCount(classicMaps, uid, t.is_finished);

        const isAm = americanTournamentIds.has(String(t.id));
        const isTeams = teamTournamentIds.has(String(t.id));
        if (isAm) {
          addCount(americanoMaps, uid, t.is_finished);
        } else if (isTeams) {
          addCount(teamsMaps, uid, t.is_finished);
        } else {
          addCount(roundRobinMaps, uid, t.is_finished);
        }
      }

      for (const row of expressData ?? []) {
        const oid = (row as { organizador_id?: string }).organizador_id;
        if (!oid) continue;
        expressTotal[oid] = (expressTotal[oid] || 0) + 1;
        const estado = (row as { estado?: string }).estado ?? "pendiente";
        if (estado === "finalizado") {
          expressFinished[oid] = (expressFinished[oid] || 0) + 1;
        } else {
          expressActive[oid] = (expressActive[oid] || 0) + 1;
        }
      }

      const merge = (maps: CountMaps, uid: string) => ({
        total: maps.total[uid] || 0,
        active: maps.active[uid] || 0,
        finished: maps.finished[uid] || 0,
      });

      const usersWithCounts = (usersData ?? [])
        .map((user) => {
          const uid = user.id;
          const c = merge(classicMaps, uid);
          const am = merge(americanoMaps, uid);
          const rr = merge(roundRobinMaps, uid);
          const tm = merge(teamsMaps, uid);
          const exT = expressTotal[uid] || 0;
          const exA = expressActive[uid] || 0;
          const exF = expressFinished[uid] || 0;

          return {
            ...user,
            tournaments_total: c.total,
            tournaments_active: c.active,
            tournaments_finished: c.finished,
            retas_americano_total: am.total,
            retas_americano_active: am.active,
            retas_americano_finished: am.finished,
            retas_round_robin_total: rr.total,
            retas_round_robin_active: rr.active,
            retas_round_robin_finished: rr.finished,
            retas_teams_total: tm.total,
            retas_teams_active: tm.active,
            retas_teams_finished: tm.finished,
            express_total: exT,
            express_active: exA,
            express_finished: exF,
            activity_total: c.total + exT,
            last_activity: user.updated_at,
          };
        })
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

      const hasClassicActive = (user.tournaments_active || 0) > 0;
      const hasExpressActive = (user.express_active || 0) > 0;

      const matchesFilter =
        filterBy === "all" ||
        (filterBy === "active" && (hasClassicActive || hasExpressActive)) ||
        (filterBy === "inactive" && !hasClassicActive && !hasExpressActive);

      return matchesSearch && matchesFilter;
    });

    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "created_at" || sortBy === "updated_at") {
        cmp =
          new Date(a[sortBy]).getTime() - new Date(b[sortBy]).getTime();
      } else if (sortBy === "name" || sortBy === "email") {
        cmp = String(a[sortBy]).localeCompare(String(b[sortBy]), "es");
      } else {
        cmp =
          Number(a[sortBy] ?? 0) - Number(b[sortBy] ?? 0);
      }
      return sortOrder === "asc" ? cmp : -cmp;
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
          `Supabase → Authentication → Users (busca por email o por id ${user.id}). ` +
          `Los Torneo Express del usuario no se eliminan desde este panel; hazlo en Supabase si aplica.`
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
            <option value="active">Con actividad en curso</option>
            <option value="inactive">Sin actividad en curso</option>
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
                  | "activity_total"
              )
            }
            className="filter-select"
          >
            <option value="created_at">Ordenar por fecha de registro</option>
            <option value="updated_at">Ordenar por última actualización</option>
            <option value="name">Ordenar por nombre</option>
            <option value="email">Ordenar por email</option>
            <option value="tournaments_total">Ordenar por retas (app)</option>
            <option value="activity_total">Ordenar por actividad total</option>
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
                    <span className="stat-item stat-item--strong">
                      {user.activity_total || 0}{" "}
                      {(user.activity_total || 0) === 1
                        ? "actividad"
                        : "actividades"}
                    </span>
                    <span className="stat-item stat-item--muted">
                      {user.tournaments_total || 0} retas · RR{" "}
                      {user.retas_round_robin_total || 0} · Am.{" "}
                      {user.retas_americano_total || 0} · Eq.{" "}
                      {user.retas_teams_total || 0} · TE{" "}
                      {user.express_total || 0}
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

                <h4 className="detail-section-title">Resumen de actividad</h4>
                <div className="detail-row detail-row--stats">
                  <label>Actividad total (retas + Torneo Express):</label>
                  <span className="tournaments-count">
                    {detailUser.activity_total || 0}
                  </span>
                </div>

                <h4 className="detail-section-title">Retas en la app</h4>
                <p className="detail-section-hint">
                  Round robin, por equipos y pádel americano (sin borradores).
                </p>
                <div className="detail-row detail-row--stats">
                  <label>Total retas:</label>
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

                <h4 className="detail-section-title">Por modo (retas)</h4>
                <div className="detail-row detail-row--stats">
                  <label>Pádel americano:</label>
                  <span>
                    {(detailUser.retas_americano_total || 0) > 0
                      ? `${detailUser.retas_americano_total} tot. · ${detailUser.retas_americano_active} activas · ${detailUser.retas_americano_finished} fin.`
                      : "0"}
                  </span>
                </div>
                <div className="detail-row detail-row--stats">
                  <label>Round robin:</label>
                  <span>
                    {(detailUser.retas_round_robin_total || 0) > 0
                      ? `${detailUser.retas_round_robin_total} tot. · ${detailUser.retas_round_robin_active} activas · ${detailUser.retas_round_robin_finished} fin.`
                      : "0"}
                  </span>
                </div>
                <div className="detail-row detail-row--stats">
                  <label>Por equipos:</label>
                  <span>
                    {(detailUser.retas_teams_total || 0) > 0
                      ? `${detailUser.retas_teams_total} tot. · ${detailUser.retas_teams_active} activas · ${detailUser.retas_teams_finished} fin.`
                      : "0"}
                  </span>
                </div>

                <h4 className="detail-section-title">Torneo Express</h4>
                <div className="detail-row detail-row--stats">
                  <label>Total torneos:</label>
                  <span className="tournaments-count">
                    {detailUser.express_total || 0}
                  </span>
                </div>
                <div className="detail-row detail-row--stats">
                  <label>Pendiente / en curso:</label>
                  <span>{detailUser.express_active || 0}</span>
                </div>
                <div className="detail-row detail-row--stats">
                  <label>Finalizados:</label>
                  <span>{detailUser.express_finished || 0}</span>
                </div>

                <h4 className="detail-section-title">Cuenta</h4>
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
