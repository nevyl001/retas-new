import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdmin } from "../../contexts/AdminContext";
import { AdminCreateUserModal } from "./AdminCreateUserModal";
import { TablerIcon } from "../ui/TablerIcon";
import { navigateAdminUser } from "../../lib/admin/adminNav";
import { deleteUserComplete } from "../../lib/admin/deleteUserComplete";
import { getOfficialRankingsPageUrl } from "../../lib/rivieraOfficialSite";
import { buildInternalClubRankingUrl } from "../jugadores/jugadoresPublicNav";
import {
  fetchAdminControlCenterSnapshot,
  type AdminAccountRow,
  type AdminControlCenterSnapshot,
} from "../../lib/admin/adminControlCenterData";
import { accountHasRole } from "../../lib/admin/adminAccountClassification";
import "./UserManagement.css";

type AccountTab = "clubs" | "coaches" | "students";
type ClubSortField = "created_at" | "name" | "activity";
type ClubActivityFilter =
  | "all"
  | "active"
  | "inactive"
  | "upgrade"
  | "standard";

interface UserManagementProps {
  snapshot?: AdminControlCenterSnapshot | null;
  onRefresh?: () => void;
}

const PAGE_SIZE = 12;

function getInitials(name: string, email: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

function formatDate(dateString: string): string {
  const t = Date.parse(dateString);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const UserManagement: React.FC<UserManagementProps> = ({
  snapshot: externalSnapshot,
  onRefresh,
}) => {
  const { adminUser } = useAdmin();
  const [localSnapshot, setLocalSnapshot] =
    useState<AdminControlCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(!externalSnapshot);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  const [activeTab, setActiveTab] = useState<AccountTab>("clubs");
  const [searchQuery, setSearchQuery] = useState("");
  const [clubSortBy, setClubSortBy] = useState<ClubSortField>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [activityFilter, setActivityFilter] =
    useState<ClubActivityFilter>("all");
  const [page, setPage] = useState(1);

  const activeSnapshot = externalSnapshot ?? localSnapshot;

  const loadLocalSnapshot = useCallback(async () => {
    if (onRefresh && externalSnapshot) {
      onRefresh();
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminControlCenterSnapshot(
        adminUser?.id ?? null
      );
      setLocalSnapshot(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las cuentas registradas."
      );
    } finally {
      setLoading(false);
    }
  }, [adminUser?.id, externalSnapshot, onRefresh]);

  useEffect(() => {
    if (!externalSnapshot) {
      void loadLocalSnapshot();
    } else {
      setLoading(false);
    }
  }, [externalSnapshot, loadLocalSnapshot]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    setPage(1);
    setOpenMenuId(null);
  }, [activeTab, searchQuery, activityFilter, clubSortBy, sortOrder]);

  const users: AdminAccountRow[] = useMemo(
    () =>
      activeSnapshot?.accounts.filter((a) => accountHasRole(a, "club")) ?? [],
    [activeSnapshot]
  );
  const coaches: AdminAccountRow[] = useMemo(
    () =>
      activeSnapshot?.accounts.filter((a) => accountHasRole(a, "coach")) ?? [],
    [activeSnapshot]
  );
  const students: AdminAccountRow[] = useMemo(
    () =>
      activeSnapshot?.accounts.filter((a) => accountHasRole(a, "student")) ??
      [],
    [activeSnapshot]
  );

  const deleteAccountByUserId = async (
    userId: string,
    confirmMessage: string
  ) => {
    setOpenMenuId(null);
    if (!window.confirm(confirmMessage)) return;

    setDeletingUserId(userId);
    setError("");
    try {
      await deleteUserComplete(userId);
      await loadLocalSnapshot();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al eliminar la cuenta"
      );
    } finally {
      setDeletingUserId(null);
    }
  };

  const filteredClubs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = users.filter((u) => {
      if (activityFilter === "active" && u.competencias_activas === 0) {
        return false;
      }
      if (activityFilter === "inactive" && u.competencias_activas > 0) {
        return false;
      }
      if (activityFilter === "upgrade" && !u.has_upgrade) {
        return false;
      }
      if (activityFilter === "standard" && u.has_upgrade) {
        return false;
      }
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.upgrade_label ?? "").toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (clubSortBy === "name") {
        cmp = (a.name || a.email).localeCompare(b.name || b.email);
      } else if (clubSortBy === "activity") {
        cmp = a.competencias_total - b.competencias_total;
      } else {
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return list;
  }, [users, searchQuery, activityFilter, clubSortBy, sortOrder]);

  const filteredCoaches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = coaches.filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.coach_info?.coach_code ?? "").toLowerCase().includes(q)
      );
    });
    list.sort((a, b) => {
      const cmp =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return list;
  }, [coaches, searchQuery, sortOrder]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = students.filter((s) => {
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (s.student_info?.rivieraId ?? "").toLowerCase().includes(q)
      );
    });
    list.sort((a, b) => {
      const cmp =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return list;
  }, [students, searchQuery, sortOrder]);

  const activeListLength =
    activeTab === "clubs"
      ? filteredClubs.length
      : activeTab === "coaches"
      ? filteredCoaches.length
      : filteredStudents.length;

  const totalPages = Math.max(1, Math.ceil(activeListLength / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;

  const pagedClubs = useMemo(
    () => filteredClubs.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredClubs, pageStart]
  );
  const pagedCoaches = useMemo(
    () => filteredCoaches.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredCoaches, pageStart]
  );
  const pagedStudents = useMemo(
    () => filteredStudents.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredStudents, pageStart]
  );

  const totalAccounts = users.length + coaches.length + students.length;

  return (
    <div className="user-mgmt" ref={menuContainerRef}>
      {/* Top Action Header */}
      <div className="user-mgmt__top-bar">
        <div
          className="user-mgmt__tabs"
          role="tablist"
          aria-label="Tipos de cuenta"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "clubs"}
            className={`user-mgmt__tab${
              activeTab === "clubs" ? " user-mgmt__tab--active" : ""
            }`}
            onClick={() => setActiveTab("clubs")}
          >
            <TablerIcon name="trophy" size={16} />
            <span>Clubes</span>
            <span className="user-mgmt__tab-count">
              {activeSnapshot && !error ? users.length : "—"}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "coaches"}
            className={`user-mgmt__tab${
              activeTab === "coaches" ? " user-mgmt__tab--active" : ""
            }`}
            onClick={() => setActiveTab("coaches")}
          >
            <TablerIcon name="user-check" size={16} />
            <span>Coaches</span>
            <span className="user-mgmt__tab-count">
              {activeSnapshot && !error ? coaches.length : "—"}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "students"}
            className={`user-mgmt__tab${
              activeTab === "students" ? " user-mgmt__tab--active" : ""
            }`}
            onClick={() => setActiveTab("students")}
          >
            <TablerIcon name="users" size={16} />
            <span>Alumnos</span>
            <span className="user-mgmt__tab-count">
              {activeSnapshot && !error ? students.length : "—"}
            </span>
          </button>
        </div>

        <div className="user-mgmt__top-actions">
          <span className="user-mgmt__total-pill">
            {totalAccounts} cuentas registradas
          </span>
          <button
            type="button"
            className="admin-cc__btn admin-cc__btn--primary"
            onClick={() => setShowCreateModal(true)}
          >
            <TablerIcon name="plus" size={16} />
            <span>Crear club</span>
          </button>
          <button
            type="button"
            className="admin-cc__btn"
            onClick={() => void loadLocalSnapshot()}
            disabled={loading}
          >
            <TablerIcon name="refresh" size={16} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {activeSnapshot && (activeSnapshot.unclassifiedCount ?? 0) > 0 ? (
        <p className="user-mgmt__counter">
          {activeSnapshot.unclassifiedCount} cuentas sin entidad de club no se
          listan como clubes.
        </p>
      ) : null}

      {/* Filter & Search Toolbar */}
      <div className="user-mgmt__toolbar">
        <div className="user-mgmt__search-wrap">
          <TablerIcon
            name="search"
            size={16}
            className="user-mgmt__search-icon"
          />
          <input
            type="search"
            className="user-mgmt__search-input"
            placeholder={
              activeTab === "clubs"
                ? "Buscar club por nombre, correo o upgrade…"
                : activeTab === "coaches"
                ? "Buscar coach por nombre, correo o código…"
                : "Buscar alumno por nombre, correo o Riviera ID…"
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Buscar cuentas"
          />
          {searchQuery ? (
            <button
              type="button"
              className="user-mgmt__search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Limpiar búsqueda"
            >
              <TablerIcon name="x" size={14} />
            </button>
          ) : null}
        </div>

        <div className="user-mgmt__filters">
          {activeTab === "clubs" ? (
            <>
              <select
                className="user-mgmt__select"
                value={activityFilter}
                onChange={(e) =>
                  setActivityFilter(e.target.value as ClubActivityFilter)
                }
                aria-label="Filtrar clubes"
              >
                <option value="all">Todos los clubes ({users.length})</option>
                <option value="active">Con actividad en curso</option>
                <option value="inactive">Sin actividad en curso</option>
                <option value="upgrade">Con upgrade activo</option>
                <option value="standard">Identidad estándar</option>
              </select>

              <select
                className="user-mgmt__select"
                value={clubSortBy}
                onChange={(e) =>
                  setClubSortBy(e.target.value as ClubSortField)
                }
                aria-label="Ordenar clubes por"
              >
                <option value="created_at">Orden: Fecha de registro</option>
                <option value="name">Orden: Nombre del club</option>
                <option value="activity">Orden: Actividad registrada</option>
              </select>
            </>
          ) : null}

          <button
            type="button"
            className="admin-cc__btn admin-cc__btn--sm"
            onClick={() =>
              setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
            }
            title={
              sortOrder === "asc"
                ? "Orden ascendente (cambiar a descendente)"
                : "Orden descendente (cambiar a ascendente)"
            }
          >
            <TablerIcon
              name={
                sortOrder === "asc" ? "sort-ascending" : "sort-descending"
              }
              size={15}
            />
            <span>{sortOrder === "asc" ? "Asc" : "Desc"}</span>
          </button>

          <span className="user-mgmt__counter" aria-live="polite">
            {error || !activeSnapshot
              ? "—"
              : `${activeListLength} ${
                  activeTab === "clubs"
                    ? "clubes"
                    : activeTab === "coaches"
                    ? "coaches"
                    : "alumnos"
                }`}
          </span>
        </div>
      </div>

      {error ? (
        <div className="user-mgmt__error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="admin-cc__btn admin-cc__btn--sm"
            onClick={() => void loadLocalSnapshot()}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {loading && !activeSnapshot ? (
        <div className="user-mgmt__loading" aria-busy="true">
          Cargando directorio de cuentas…
        </div>
      ) : null}

      {/* TAB 1: CLUBES TABLE */}
      {!loading && !error && activeTab === "clubs" ? (
        filteredClubs.length === 0 ? (
          <div className="user-mgmt__empty">
            <p>
              {users.length === 0
                ? "No hay clubes registrados en la plataforma."
                : "Ningún club coincide con la búsqueda o los filtros aplicados."}
            </p>
            {users.length > 0 ? (
              <button
                type="button"
                className="admin-cc__btn admin-cc__btn--sm"
                onClick={() => {
                  setSearchQuery("");
                  setActivityFilter("all");
                }}
              >
                Restablecer filtros
              </button>
            ) : null}
          </div>
        ) : (
          <div className="user-mgmt__table-surface">
            <div className="user-mgmt__table-scroll">
              <table className="user-mgmt__table" aria-label="Tabla de clubes">
                <thead>
                  <tr>
                    <th>Club / Correo</th>
                    <th>Registro</th>
                    <th>Actividad registrada</th>
                    <th>Estado</th>
                    <th>Upgrade</th>
                    <th className="is-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedClubs.map((club) => {
                    const isDeleting = deletingUserId === club.id;
                    const menuKey = `club-${club.id}`;
                    const menuOpen = openMenuId === menuKey;

                    const accountState =
                      club.competencias_activas > 0
                        ? { label: "En operación", mod: "live" }
                        : club.competencias_total > 0 ||
                          club.jugadores_total > 0
                        ? { label: "Activa", mod: "active" }
                        : { label: "Sin actividad", mod: "idle" };

                    return (
                      <tr key={club.id} className="user-mgmt__row">
                        <td data-label="Club">
                          <div className="user-mgmt__club-cell">
                            <div className="user-mgmt__avatar">
                              {club.logo_url ? (
                                <img
                                  src={club.logo_url}
                                  alt={`Logo de ${club.name || club.email}`}
                                  className="user-mgmt__avatar-img"
                                />
                              ) : (
                                <span>
                                  {getInitials(club.name, club.email)}
                                </span>
                              )}
                            </div>
                            <div className="user-mgmt__club-info">
                              <button
                                type="button"
                                className="user-mgmt__club-name-btn"
                                onClick={() => navigateAdminUser(club.id)}
                              >
                                {club.name || "Club sin nombre"}
                              </button>
                              <span className="user-mgmt__club-email">
                                {club.email}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td data-label="Registro">
                          <span className="user-mgmt__date">
                            {formatDate(club.created_at)}
                          </span>
                        </td>

                        <td data-label="Actividad registrada">
                          <div className="user-mgmt__activity-cell">
                            <div className="user-mgmt__activity-top">
                              <strong className="user-mgmt__activity-total">
                                {club.competencias_total} competencias
                              </strong>
                              <span className="user-mgmt__activity-dot">·</span>
                              <span className="user-mgmt__activity-players">
                                {club.jugadores_total} jugadores
                              </span>
                            </div>
                            <div className="user-mgmt__format-pills">
                              <span>RR {club.retas_round_robin_total}</span>
                              <span>Am {club.retas_americano_total}</span>
                              <span>Eq {club.retas_teams_total}</span>
                              <span>TE {club.express_total}</span>
                              {club.ligas_total > 0 ? (
                                <span>Ligas {club.ligas_total}</span>
                              ) : null}
                              {club.duelos_total > 0 ? (
                                <span>D2v2 {club.duelos_total}</span>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        <td data-label="Estado">
                          <span
                            className={`user-mgmt__state-badge user-mgmt__state-badge--${accountState.mod}`}
                          >
                            {accountState.label}
                            {club.competencias_activas > 0
                              ? ` (${club.competencias_activas})`
                              : ""}
                          </span>
                        </td>

                        <td data-label="Upgrade">
                          {club.has_upgrade ? (
                            <span className="user-mgmt__upgrade-badge user-mgmt__upgrade-badge--on">
                              Upgrade
                              {club.upgrade_label
                                ? ` · ${club.upgrade_label}`
                                : ""}
                            </span>
                          ) : (
                            <span className="user-mgmt__upgrade-badge">
                              Estándar
                            </span>
                          )}
                        </td>

                        <td data-label="Acciones" className="is-right">
                          <div className="user-mgmt__actions-cell">
                            <button
                              type="button"
                              className="admin-cc__btn admin-cc__btn--primary admin-cc__btn--sm"
                              onClick={() => navigateAdminUser(club.id)}
                            >
                              <TablerIcon name="settings" size={14} />
                              <span>Gestionar</span>
                            </button>

                            <div className="user-mgmt__context-wrap">
                              <button
                                type="button"
                                className="user-mgmt__more-btn"
                                onClick={() =>
                                  setOpenMenuId((prev) =>
                                    prev === menuKey ? null : menuKey
                                  )
                                }
                                aria-label={`Más acciones para ${
                                  club.name || club.email
                                }`}
                                aria-expanded={menuOpen}
                                aria-haspopup="menu"
                                disabled={isDeleting}
                              >
                                <TablerIcon name="dots-vertical" size={16} />
                              </button>

                              {menuOpen ? (
                                <div
                                  className="user-mgmt__context-menu"
                                  role="menu"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="user-mgmt__context-item"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      navigateAdminUser(club.id);
                                    }}
                                  >
                                    <TablerIcon name="settings" size={15} />
                                    <span>Abrir ficha completa del club</span>
                                  </button>

                                  <a
                                    href={buildInternalClubRankingUrl(club.id)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    role="menuitem"
                                    className="user-mgmt__context-item"
                                    onClick={() => setOpenMenuId(null)}
                                  >
                                    <TablerIcon
                                      name="external-link"
                                      size={15}
                                    />
                                    <span>Ver ranking interno del club</span>
                                  </a>

                                  {club.visible_ranking_oficial ? (
                                    <a
                                      href={getOfficialRankingsPageUrl()}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      role="menuitem"
                                      className="user-mgmt__context-item"
                                      onClick={() => setOpenMenuId(null)}
                                    >
                                      <TablerIcon name="trophy" size={15} />
                                      <span>Ver ranking sitio oficial</span>
                                    </a>
                                  ) : null}

                                  <div className="user-mgmt__context-divider" />

                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="user-mgmt__context-item user-mgmt__context-item--danger"
                                    disabled={isDeleting}
                                    onClick={() =>
                                      void deleteAccountByUserId(
                                        club.id,
                                        `¿Estás seguro de que quieres eliminar el club "${
                                          club.name || club.email
                                        }"?\n\nEsta acción eliminará:\n- El usuario del sistema\n- Todas sus competencias (${
                                          club.competencias_total
                                        })\n- Todos los datos relacionados\n\nEsta acción NO se puede deshacer.`
                                      )
                                    }
                                  >
                                    <TablerIcon name="trash" size={15} />
                                    <span>
                                      {isDeleting
                                        ? "Eliminando…"
                                        : "Eliminar cuenta"}
                                    </span>
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : null}

      {/* TAB 2: COACHES TABLE */}
      {!loading && !error && activeTab === "coaches" ? (
        filteredCoaches.length === 0 ? (
          <div className="user-mgmt__empty">
            <p>
              {coaches.length === 0
                ? "No hay coaches registrados en Riviera Coaching."
                : "Ningún coach coincide con la búsqueda."}
            </p>
          </div>
        ) : (
          <div className="user-mgmt__table-surface">
            <div className="user-mgmt__table-scroll">
              <table className="user-mgmt__table" aria-label="Tabla de coaches">
                <thead>
                  <tr>
                    <th>Coach / Correo</th>
                    <th>Código</th>
                    <th>Club</th>
                    <th>Alumnos</th>
                    <th>Clases</th>
                    <th>Registro</th>
                    <th>Estado</th>
                    <th className="is-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCoaches.map((coach) => {
                    const isDeleting = deletingUserId === coach.id;
                    const menuKey = `coach-${coach.id}`;
                    const menuOpen = openMenuId === menuKey;
                    const code = coach.coach_info?.coach_code || "—";
                    const clubLabel = coach.coach_info?.clubs.length
                      ? coach.coach_info.clubs.map((club) => club.name).join(", ")
                      : "Sin club asociado";
                    const stateMod =
                      coach.coach_info?.membership_status === "activo"
                        ? "active"
                        : "idle";

                    return (
                      <tr key={coach.id} className="user-mgmt__row">
                        <td data-label="Coach">
                          <div className="user-mgmt__club-cell">
                            <div className="user-mgmt__avatar">
                              {coach.avatar_url ? (
                                <img
                                  src={coach.avatar_url}
                                  alt=""
                                  className="user-mgmt__avatar-img"
                                />
                              ) : (
                                <span>
                                  {getInitials(coach.name, coach.email)}
                                </span>
                              )}
                            </div>
                            <div className="user-mgmt__club-info">
                              <span className="user-mgmt__club-name-static">
                                {coach.name || coach.email || "Coach"}
                              </span>
                              <span className="user-mgmt__club-email">
                                {coach.email || "Sin correo"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Código">
                          <code className="user-mgmt__code-badge">{code}</code>
                        </td>
                        <td data-label="Club">
                          <span className="user-mgmt__meta-text">{clubLabel}</span>
                        </td>
                        <td data-label="Alumnos">
                          <span className="user-mgmt__meta-text">
                            {coach.coach_info?.student_count ?? 0}
                          </span>
                        </td>
                        <td data-label="Clases">
                          <span className="user-mgmt__meta-text">
                            {coach.coach_info?.class_count ?? 0}
                          </span>
                        </td>
                        <td data-label="Registro">
                          <span className="user-mgmt__date">
                            {formatDate(coach.created_at)}
                          </span>
                        </td>
                        <td data-label="Estado">
                          <span
                            className={`user-mgmt__state-badge user-mgmt__state-badge--${stateMod}`}
                          >
                            {coach.status_label}
                          </span>
                        </td>
                        <td data-label="Acciones" className="is-right">
                          <div className="user-mgmt__actions-cell">
                            <div className="user-mgmt__context-wrap">
                              <button
                                type="button"
                                className="user-mgmt__more-btn"
                                onClick={() =>
                                  setOpenMenuId((prev) =>
                                    prev === menuKey ? null : menuKey
                                  )
                                }
                                aria-label={`Acciones para ${
                                  coach.name || coach.email
                                }`}
                                aria-expanded={menuOpen}
                                disabled={isDeleting}
                              >
                                <TablerIcon name="dots-vertical" size={16} />
                              </button>
                              {menuOpen ? (
                                <div
                                  className="user-mgmt__context-menu"
                                  role="menu"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="user-mgmt__context-item user-mgmt__context-item--danger"
                                    disabled={isDeleting}
                                    onClick={() =>
                                      void deleteAccountByUserId(
                                        coach.id,
                                        `¿Estás seguro de que quieres eliminar la cuenta del coach "${
                                          coach.name || coach.email
                                        }" (${code})?\n\nSe eliminarán su perfil de coach, membresías a clubes, vínculos con alumnos y su usuario de acceso.\n\nEsta acción NO se puede deshacer.`
                                      )
                                    }
                                  >
                                    <TablerIcon name="trash" size={15} />
                                    <span>
                                      {isDeleting
                                        ? "Eliminando…"
                                        : "Eliminar cuenta de coach"}
                                    </span>
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : null}

      {/* TAB 3: ALUMNOS TABLE */}
      {!loading && !error && activeTab === "students" ? (
        filteredStudents.length === 0 ? (
          <div className="user-mgmt__empty">
            <p>
              {students.length === 0
                ? "No hay cuentas de alumnos vinculadas a Riviera Coaching."
                : "Ningún alumno coincide con la búsqueda."}
            </p>
          </div>
        ) : (
          <div className="user-mgmt__table-surface">
            <div className="user-mgmt__table-scroll">
              <table className="user-mgmt__table" aria-label="Tabla de alumnos">
                <thead>
                  <tr>
                    <th>Alumno / Correo</th>
                    <th>Riviera ID</th>
                    <th>Registro</th>
                    <th>Clubes vinculados</th>
                    <th>Estado</th>
                    <th className="is-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedStudents.map((student) => {
                    const isDeleting = deletingUserId === student.id;
                    const menuKey = `student-${student.id}`;
                    const menuOpen = openMenuId === menuKey;
                    const rivieraId = student.student_info?.rivieraId ?? null;

                    return (
                      <tr key={student.id} className="user-mgmt__row">
                        <td data-label="Alumno">
                          <div className="user-mgmt__club-cell">
                            <div className="user-mgmt__avatar">
                              <span>
                                {getInitials(student.name, student.email)}
                              </span>
                            </div>
                            <div className="user-mgmt__club-info">
                              <span className="user-mgmt__club-name-static">
                                {student.name || student.email}
                              </span>
                              <span className="user-mgmt__club-email">
                                {student.email || "Sin correo"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Riviera ID">
                          {rivieraId ? (
                            <code className="user-mgmt__code-badge">
                              {rivieraId}
                            </code>
                          ) : (
                            <span className="user-mgmt__meta-text">—</span>
                          )}
                        </td>
                        <td data-label="Registro">
                          <span className="user-mgmt__date">
                            {formatDate(student.created_at)}
                          </span>
                        </td>
                        <td data-label="Clubes">
                          <span className="user-mgmt__meta-text">
                            {student.student_info?.clubCount ?? 0} clubes
                          </span>
                        </td>
                        <td data-label="Estado">
                          <span className="user-mgmt__state-badge user-mgmt__state-badge--active">
                            {student.status_label}
                          </span>
                        </td>
                        <td data-label="Acciones" className="is-right">
                          <div className="user-mgmt__actions-cell">
                            <div className="user-mgmt__context-wrap">
                              <button
                                type="button"
                                className="user-mgmt__more-btn"
                                onClick={() =>
                                  setOpenMenuId((prev) =>
                                    prev === menuKey ? null : menuKey
                                  )
                                }
                                aria-label={`Acciones para ${
                                  student.name || student.email
                                }`}
                                aria-expanded={menuOpen}
                                disabled={isDeleting}
                              >
                                <TablerIcon name="dots-vertical" size={16} />
                              </button>
                              {menuOpen ? (
                                <div
                                  className="user-mgmt__context-menu"
                                  role="menu"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="user-mgmt__context-item user-mgmt__context-item--danger"
                                    disabled={isDeleting}
                                    onClick={() =>
                                      void deleteAccountByUserId(
                                        student.id,
                                        `¿Estás seguro de que quieres eliminar la cuenta del alumno "${
                                          student.name || student.email
                                        }"?\n\nSe desvincularán sus registros de coaching y se eliminará su cuenta de acceso.\n\nEsta acción NO se puede deshacer.`
                                      )
                                    }
                                  >
                                    <TablerIcon name="trash" size={15} />
                                    <span>
                                      {isDeleting
                                        ? "Eliminando…"
                                        : "Eliminar cuenta de alumno"}
                                    </span>
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : null}

      {/* Pagination Bar */}
      {totalPages > 1 ? (
        <div className="user-mgmt__pagination">
          <span className="user-mgmt__pagination-info">
            Mostrando {pageStart + 1}–
            {Math.min(pageStart + PAGE_SIZE, activeListLength)} de{" "}
            {activeListLength} registros
          </span>
          <div className="user-mgmt__pagination-controls">
            <button
              type="button"
              className="admin-cc__btn admin-cc__btn--sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <span className="user-mgmt__pagination-page">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              className="admin-cc__btn admin-cc__btn--sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente
            </button>
          </div>
        </div>
      ) : null}

      <AdminCreateUserModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          setShowCreateModal(false);
          void loadLocalSnapshot();
        }}
      />
    </div>
  );
};
