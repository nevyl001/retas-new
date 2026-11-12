import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAdmin } from "../../contexts/AdminContext";
import { navigateAdminUser } from "../../lib/admin/adminNav";
import { deleteUserComplete } from "../../lib/admin/deleteUserComplete";
import { TablerIcon } from "../ui/TablerIcon";
import { AdminCreateUserModal } from "./AdminCreateUserModal";
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
  coach_info?: {
    coach_code: string;
    club_count: number;
  } | null;
  student_info?: {
    rivieraId: string | null;
    isActive: boolean;
    clubCount: number;
  } | null;
  account_kind: "club" | "coach" | "student";
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
  const [accountKind, setAccountKind] = useState<"club" | "coach" | "student">("club");
  const [filterBy, setFilterBy] = useState<"all" | "active" | "inactive">("all");
  const [authCleanupNotice, setAuthCleanupNotice] = useState<string | null>(
    null
  );
  const [authCleanupNoticeError, setAuthCleanupNoticeError] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const loadUsers = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    try {
      if (!silent) {
        setLoading(true);
      }

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
        { data: coachesData, error: coachesError },
        { data: membershipsData, error: membershipsError },
        { data: studentLinks, error: studentLinksError },
        { data: identities, error: identitiesError },
      ] = await Promise.all([
        supabase
          .from("tournaments")
          .select("id, user_id, is_finished, name, description"),
        supabase.from("torneo_express").select("organizador_id, estado"),
        supabase.from("tournament_public_config").select("*"),
        supabase.from("riviera_coaches").select("id, auth_user_id, coach_code"),
        supabase.from("coach_club_memberships").select("coach_id, organizador_id"),
        supabase
          .from("coach_student_account_links")
          .select("auth_user_id, jugador_id, organizador_id, is_active, student_email, created_at"),
        supabase
          .from("riviera_official_player_identity")
          .select("canonical_riviera_jugador_id, riviera_id"),
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
      if (coachesError) {
        console.warn("riviera_coaches query warning:", coachesError);
      }
      if (membershipsError) {
        console.warn("coach_club_memberships query warning:", membershipsError);
      }
      if (studentLinksError) {
        console.warn("coach_student_account_links query warning:", studentLinksError);
      }
      if (identitiesError) {
        console.warn("riviera_official_player_identity query warning:", identitiesError);
      }

      const rivieraByJugador = new Map<string, string>();
      for (const row of identities ?? []) {
        const jugadorId = String(
          (row as { canonical_riviera_jugador_id?: string }).canonical_riviera_jugador_id ?? ""
        );
        const rivieraId = String((row as { riviera_id?: string }).riviera_id ?? "").trim();
        if (jugadorId && rivieraId) rivieraByJugador.set(jugadorId, rivieraId);
      }

      const studentByAuth = new Map<
        string,
        { rivieraId: string | null; isActive: boolean; clubs: Set<string>; email: string; createdAt: string }
      >();
      for (const row of studentLinks ?? []) {
        const authId = String((row as { auth_user_id?: string }).auth_user_id ?? "");
        if (!authId) continue;
        const current = studentByAuth.get(authId) ?? {
          rivieraId: null,
          isActive: false,
          clubs: new Set<string>(),
          email: "",
          createdAt: String((row as { created_at?: string }).created_at ?? ""),
        };
        const jugadorId = String((row as { jugador_id?: string }).jugador_id ?? "");
        const organizadorId = String((row as { organizador_id?: string }).organizador_id ?? "");
        const email = String((row as { student_email?: string }).student_email ?? "").trim();
        if (jugadorId && !current.rivieraId) {
          current.rivieraId = rivieraByJugador.get(jugadorId) ?? null;
        }
        if ((row as { is_active?: boolean }).is_active) current.isActive = true;
        if (organizadorId) current.clubs.add(organizadorId);
        if (email && !current.email) current.email = email;
        studentByAuth.set(authId, current);
      }

      const coachClubCountMap = new Map<string, number>();
      for (const m of membershipsData ?? []) {
        const cid = String((m as { coach_id?: string }).coach_id ?? "");
        if (cid) {
          coachClubCountMap.set(cid, (coachClubCountMap.get(cid) || 0) + 1);
        }
      }

      const authCoachMap = new Map<string, { coach_code: string; club_count: number }>();
      for (const c of coachesData ?? []) {
        const aid = (c as { auth_user_id?: string }).auth_user_id;
        const code = (c as { coach_code?: string }).coach_code;
        const cid = (c as { id?: string }).id;
        if (aid && code) {
          authCoachMap.set(aid, {
            coach_code: code,
            club_count: cid ? coachClubCountMap.get(cid) || 0 : 0,
          });
        }
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
          const coachInfo = authCoachMap.get(uid) || null;
          const studentRaw = studentByAuth.get(uid);
          const studentInfo = studentRaw
            ? {
                rivieraId: studentRaw.rivieraId,
                isActive: studentRaw.isActive,
                clubCount: studentRaw.clubs.size,
              }
            : null;
          const accountKind: User["account_kind"] = coachInfo
            ? "coach"
            : studentInfo
            ? "student"
            : "club";

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
            coach_info: coachInfo,
            student_info: studentInfo,
            account_kind: accountKind,
          };
        })
        .filter((u) => u.id !== adminUser?.user_id);

      const knownIds = new Set(usersWithCounts.map((user) => user.id));
      for (const entry of Array.from(studentByAuth.entries())) {
        const authId = entry[0];
        const studentRaw = entry[1];
        if (knownIds.has(authId) || authId === adminUser?.user_id || authCoachMap.has(authId)) {
          continue;
        }
        usersWithCounts.push({
          id: authId,
          email: studentRaw.email,
          name: studentRaw.rivieraId || studentRaw.email || "Alumno",
          created_at: studentRaw.createdAt || new Date(0).toISOString(),
          updated_at: studentRaw.createdAt || new Date(0).toISOString(),
          activity_total: 0,
          coach_info: null,
          student_info: {
            rivieraId: studentRaw.rivieraId,
            isActive: studentRaw.isActive,
            clubCount: studentRaw.clubs.size,
          },
          account_kind: "student",
        });
      }

      setUsers(usersWithCounts);
    } catch (error) {
      console.error("Error inesperado:", error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [adminUser?.user_id]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const filteredAndSortedUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    let filtered = users.filter((user) => {
      const name = (user.name ?? "").toLowerCase();
      const email = (user.email ?? "").toLowerCase();
      const coachCode = (user.coach_info?.coach_code ?? "").toLowerCase();
      const rivieraId = (user.student_info?.rivieraId ?? "").toLowerCase();
      const matchesSearch =
        !q ||
        name.includes(q) ||
        email.includes(q) ||
        coachCode.includes(q) ||
        rivieraId.includes(q);

      const hasClassicActive = (user.tournaments_active || 0) > 0;
      const hasExpressActive = (user.express_active || 0) > 0;

      const matchesKind = user.account_kind === accountKind;
      const matchesFilter =
        accountKind !== "club" ||
        filterBy === "all" ||
        (filterBy === "active" && (hasClassicActive || hasExpressActive)) ||
        (filterBy === "inactive" && !hasClassicActive && !hasExpressActive);

      return matchesSearch && matchesKind && matchesFilter;
    });

    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "created_at" || sortBy === "updated_at") {
        const aTime = a[sortBy] ? new Date(a[sortBy]).getTime() : 0;
        const bTime = b[sortBy] ? new Date(b[sortBy]).getTime() : 0;
        cmp = aTime - bTime;
      } else if (sortBy === "name" || sortBy === "email") {
        cmp = String(a[sortBy] ?? "").localeCompare(String(b[sortBy] ?? ""), "es");
      } else {
        cmp = Number(a[sortBy] ?? 0) - Number(b[sortBy] ?? 0);
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [users, searchTerm, sortBy, sortOrder, filterBy, accountKind]);

  const kindCounts = useMemo(() => {
    return {
      club: users.filter((user) => user.account_kind === "club").length,
      coach: users.filter((user) => user.account_kind === "coach").length,
      student: users.filter((user) => user.account_kind === "student").length,
    };
  }, [users]);

  const handleUserSelect = (user: User) => {
    if (onUserSelect) {
      onUserSelect(user);
    }
    navigateAdminUser(user.id);
  };

  const handleDeleteUser = async (user: User) => {
    if (
      !window.confirm(
        user.account_kind === "coach"
          ? `¿Eliminar la cuenta de coach de "${user.name || user.email}"?\n\nSe borra su acceso, su ficha de entrenador y su historial en los clubes. No se borran las retas, los jugadores ni el ranking del club. Esta acción no se puede deshacer.`
          : user.account_kind === "student"
          ? `¿Eliminar el acceso de alumno de "${user.name || user.email}"?\n\nSe borra su entrada a Mi Coaching. No se borran las clases ni el ranking del club. Esta acción no se puede deshacer.`
          : `¿Eliminar por completo a "${user.name || user.email}"?\n\nSe borrarán retas, jugadores, torneos, ligas, duelos, ranking y su cuenta de acceso. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setDeletingUserId(user.id);
    setAuthCleanupNotice(null);
    setAuthCleanupNoticeError(false);

    try {
      await deleteUserComplete(user.id);

      setAuthCleanupNotice(
        `Se eliminó por completo la cuenta de "${user.name || user.email}" y todos sus datos.`
      );
      setAuthCleanupNoticeError(false);

      await loadUsers();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo eliminar el usuario";
      setAuthCleanupNotice(message);
      setAuthCleanupNoticeError(true);
      console.error("Error eliminando usuario:", err);
    } finally {
      setDeletingUserId(null);
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
      <>
        <div className="user-management-loading">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Cargando usuarios...</p>
          </div>
        </div>
        <AdminCreateUserModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCreated={() => loadUsers({ silent: true })}
        />
      </>
    );
  }

  return (
    <div className="user-management">
      {/* Header con título y acciones principales */}
      <div className="um-header">
        <div className="um-header-title-wrap">
          <h2 className="um-header-title">Gestión de Cuentas</h2>
          <span className="um-header-count">
            {filteredAndSortedUsers.length} {filteredAndSortedUsers.length === 1 ? "cuenta" : "cuentas"}
          </span>
        </div>

        <div className="um-header-actions">
          {accountKind === "club" ? (
            <button
              type="button"
              className="um-btn um-btn--primary"
              onClick={() => setCreateModalOpen(true)}
            >
              <TablerIcon name="plus" size={16} />
              <span>Crear club</span>
            </button>
          ) : null}
          <button
            type="button"
            className="um-btn um-btn--ghost"
            onClick={() => void loadUsers()}
            title="Actualizar lista de cuentas"
          >
            <TablerIcon name="refresh" size={15} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Selector segmentado de Tipo de Cuenta */}
      <div className="um-tabs-container">
        <div className="um-tabs" role="tablist" aria-label="Tipo de cuenta">
          <button
            type="button"
            className={`um-tab ${accountKind === "club" ? "um-tab--active" : ""}`}
            onClick={() => setAccountKind("club")}
          >
            <TablerIcon name="building-community" size={16} />
            <span>Clubes</span>
            <span className="um-tab-count">{kindCounts.club}</span>
          </button>
          <button
            type="button"
            className={`um-tab ${accountKind === "coach" ? "um-tab--active" : ""}`}
            onClick={() => setAccountKind("coach")}
          >
            <TablerIcon name="whistle" size={16} />
            <span>Coaches</span>
            <span className="um-tab-count">{kindCounts.coach}</span>
          </button>
          <button
            type="button"
            className={`um-tab ${accountKind === "student" ? "um-tab--active" : ""}`}
            onClick={() => setAccountKind("student")}
          >
            <TablerIcon name="user" size={16} />
            <span>Alumnos</span>
            <span className="um-tab-count">{kindCounts.student}</span>
          </button>
        </div>

        <p className="um-hint">
          {accountKind === "club"
            ? "Clubes y organizaciones deportivas que operan retas, torneos, ligas y coaching. 'Gestionar' abre su configuración y ranking."
            : accountKind === "coach"
            ? "Entrenadores oficiales con credencial RIV-C y acceso al Espacio del Coach. Eliminar la cuenta no borra las retas ni alumnos del club."
            : "Alumnos con acceso a Mi Coaching. Eliminar la cuenta no borra las clases impartidas ni su historial en el club."}
        </p>
      </div>

      {/* Notificación de Limpieza o Error */}
      {authCleanupNotice && (
        <div
          className={`um-notice ${authCleanupNoticeError ? "um-notice--error" : "um-notice--success"}`}
          role="status"
        >
          <div className="um-notice-content">
            <TablerIcon
              name={authCleanupNoticeError ? "alert-circle" : "check"}
              size={18}
            />
            <span>{authCleanupNotice}</span>
          </div>
          <button
            type="button"
            className="um-notice-close"
            onClick={() => {
              setAuthCleanupNotice(null);
              setAuthCleanupNoticeError(false);
            }}
          >
            Entendido
          </button>
        </div>
      )}

      {/* Toolbar con Búsqueda y Filtros */}
      <div className="um-toolbar">
        <div className="um-search-box">
          <TablerIcon name="search" size={16} className="um-search-icon" />
          <input
            type="text"
            className="um-search-input"
            placeholder={
              accountKind === "student"
                ? "Buscar alumno por nombre, correo o Riviera ID..."
                : accountKind === "coach"
                ? "Buscar coach por nombre, correo o RIV-C..."
                : "Buscar club por nombre o correo..."
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="um-search-clear"
              onClick={() => setSearchTerm("")}
              title="Borrar búsqueda"
            >
              <TablerIcon name="x" size={14} />
            </button>
          )}
        </div>

        <div className="um-toolbar-filters">
          {accountKind === "club" ? (
            <div className="um-select-wrapper">
              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as "all" | "active" | "inactive")}
                className="um-select"
              >
                <option value="all">Todos los clubes</option>
                <option value="active">Con actividad en curso</option>
                <option value="inactive">Sin actividad en curso</option>
              </select>
            </div>
          ) : null}

          <div className="um-select-wrapper">
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
              className="um-select"
            >
              <option value="created_at">Fecha de registro</option>
              <option value="updated_at">Última actualización</option>
              <option value="name">Nombre alfabético</option>
              <option value="email">Correo electrónico</option>
              {accountKind === "club" ? (
                <>
                  <option value="tournaments_total">Retas (app)</option>
                  <option value="activity_total">Actividad total</option>
                </>
              ) : null}
            </select>
          </div>

          <button
            type="button"
            className="um-sort-toggle"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            title={`Ordenar ${sortOrder === "asc" ? "descendente" : "ascendente"}`}
          >
            <TablerIcon name={sortOrder === "asc" ? "sort-ascending" : "sort-descending"} size={16} />
            <span>{sortOrder === "asc" ? "Asc" : "Desc"}</span>
          </button>
        </div>
      </div>

      {/* Lista de Cuentas en Tarjetas Elegantes */}
      <div className="um-cards-list">
        {filteredAndSortedUsers.length === 0 ? (
          <div className="um-empty-state">
            <TablerIcon name="users" size={40} className="um-empty-icon" />
            <h3 className="um-empty-title">No se encontraron cuentas</h3>
            <p className="um-empty-desc">
              {searchTerm
                ? `No hay coincidencias para "${searchTerm}". Prueba con otros términos.`
                : "No hay registros disponibles en esta categoría."}
            </p>
          </div>
        ) : (
          filteredAndSortedUsers.map((user) => (
            <div key={user.id} className="um-card">
              {/* Columna Izquierda: Identidad */}
              <div className="um-card-identity">
                <div className="um-avatar">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.name || user.email}
                      className="um-avatar-img"
                    />
                  ) : (
                    <span className="um-avatar-initials">
                      {getInitials(user.name, user.email)}
                    </span>
                  )}
                </div>

                <div className="um-identity-info">
                  <div className="um-name-row">
                    <h3 className="um-name" title={user.name || user.email}>
                      {user.name || user.email || "Sin nombre"}
                    </h3>
                    {user.account_kind === "club" ? (
                      <span className="um-badge um-badge--club">Club</span>
                    ) : user.account_kind === "coach" ? (
                      <span className="um-badge um-badge--coach">
                        {user.coach_info?.coach_code || "Coach"}
                      </span>
                    ) : (
                      <span className="um-badge um-badge--student">
                        {user.student_info?.rivieraId || "Alumno"}
                      </span>
                    )}
                  </div>
                  <p className="um-email" title={user.email}>
                    {user.email || "Sin correo"}
                  </p>
                </div>
              </div>

              {/* Columna Central: Métricas y Datos Estructurados */}
              <div className="um-card-metrics">
                {user.account_kind === "coach" ? (
                  <div className="um-metrics-group">
                    <div className="um-metrics-chips">
                      <span className="um-stat-chip">
                        <TablerIcon name="building-community" size={13} />
                        {user.coach_info?.club_count || 0}{" "}
                        {(user.coach_info?.club_count || 0) === 1 ? "club asignado" : "clubes asignados"}
                      </span>
                    </div>
                    <span className="um-date-label">
                      <TablerIcon name="calendar" size={12} />
                      Creado el {formatDate(user.created_at)}
                    </span>
                  </div>
                ) : user.account_kind === "student" ? (
                  <div className="um-metrics-group">
                    <div className="um-metrics-chips">
                      <span
                        className={`um-stat-chip ${
                          user.student_info?.isActive ? "um-stat-chip--active" : "um-stat-chip--pending"
                        }`}
                      >
                        <TablerIcon name={user.student_info?.isActive ? "check" : "clock"} size={13} />
                        {user.student_info?.isActive ? "Acceso activo" : "Pendiente de activación"}
                      </span>
                      <span className="um-stat-chip">
                        <TablerIcon name="building-community" size={13} />
                        {user.student_info?.clubCount || 0}{" "}
                        {(user.student_info?.clubCount || 0) === 1 ? "club vinculado" : "clubes vinculados"}
                      </span>
                    </div>
                    <span className="um-date-label">
                      <TablerIcon name="calendar" size={12} />
                      Creado el {formatDate(user.created_at)}
                    </span>
                  </div>
                ) : (
                  <div className="um-metrics-group">
                    <div className="um-club-stats-row">
                      <span className="um-stat-chip um-stat-chip--highlight">
                        <TablerIcon name="activity" size={13} />
                        {user.activity_total || 0}{" "}
                        {(user.activity_total || 0) === 1 ? "actividad" : "actividades"}
                      </span>
                      <span className="um-retas-summary">
                        {user.tournaments_total || 0} retas · RR {user.retas_round_robin_total || 0} · Am. {user.retas_americano_total || 0} · Eq. {user.retas_teams_total || 0} · TE {user.express_total || 0}
                      </span>
                    </div>
                    <span className="um-date-label">
                      <TablerIcon name="calendar" size={12} />
                      Registrado el {formatDate(user.created_at)}
                    </span>
                  </div>
                )}
              </div>

              {/* Columna Derecha: Acciones */}
              <div className="um-card-actions">
                {user.account_kind === "club" ? (
                  <button
                    type="button"
                    className="um-action-btn um-action-btn--manage"
                    onClick={() => handleUserSelect(user)}
                    title="Modos de juego, jugadores y ranking"
                  >
                    <TablerIcon name="settings" size={14} />
                    <span>Gestionar</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="um-action-btn um-action-btn--delete"
                  onClick={() => handleDeleteUser(user)}
                  disabled={deletingUserId === user.id}
                  title="Eliminar cuenta"
                >
                  <TablerIcon name="trash" size={14} />
                  <span>{deletingUserId === user.id ? "Eliminando…" : "Eliminar"}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <AdminCreateUserModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={() => loadUsers({ silent: true })}
      />
    </div>
  );
};
