import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TablerIcon } from "../ui/TablerIcon";
import { AdminControlLayout } from "./AdminControlLayout";
import { AccountControlsPanel } from "./AccountControlsPanel";
import {
  fetchAdminUserDetail,
  type AdminUserDetail,
} from "../../lib/admin/fetchAdminUserDetail";
import { deleteUserComplete } from "../../lib/admin/deleteUserComplete";
import { updateUserEmailAdmin } from "../../lib/admin/updateUserEmailAdmin";
import { updateUserNameAdmin } from "../../lib/admin/updateUserNameAdmin";
import { navigateAdminDashboard } from "../../lib/admin/adminNav";
import { getOfficialRankingsPageUrl } from "../../lib/rivieraOfficialSite";
import { buildInternalClubRankingUrl } from "../jugadores/jugadoresPublicNav";
import "./AdminUserManagePage.css";

interface AdminUserManagePageProps {
  userId: string;
}

type ClubDetailTab =
  | "info"
  | "configuracion"
  | "jugadores"
  | "competencias"
  | "ranking"
  | "coaching"
  | "personalizacion";

const DETAIL_TABS: Array<{
  id: ClubDetailTab;
  label: string;
  icon: string;
}> = [
  { id: "info", label: "Información general", icon: "info-circle" },
  { id: "configuracion", label: "Configuración", icon: "settings" },
  { id: "jugadores", label: "Jugadores", icon: "users" },
  { id: "competencias", label: "Competencias", icon: "trophy" },
  { id: "ranking", label: "Ranking", icon: "chart-bar" },
  { id: "coaching", label: "Coaching", icon: "user-check" },
  {
    id: "personalizacion",
    label: "Personalización y upgrade",
    icon: "sparkles",
  },
];

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
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(dateString: string): string {
  const t = Date.parse(dateString);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export const AdminUserManagePage: React.FC<AdminUserManagePageProps> = ({
  userId,
}) => {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<ClubDetailTab>("info");

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");

  const [compFilter, setCompFilter] = useState<string>("all");

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const detail = await fetchAdminUserDetail(userId);
      setUser(detail);
      if (detail) {
        setEditName(detail.name);
        setEditEmail(detail.email);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo cargar la información del club"
      );
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const startEdit = () => {
    if (!user) return;
    setEditName(user.name);
    setEditEmail(user.email);
    setEditing(true);
    setError("");
    setProfileNotice("");
  };

  const cancelEdit = () => {
    if (user) {
      setEditName(user.name);
      setEditEmail(user.email);
    }
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!user) return;
    setSavingProfile(true);
    setError("");
    setProfileNotice("");
    try {
      if (editName !== user.name) {
        await updateUserNameAdmin({
          targetUserId: user.id,
          newName: editName,
        });
      }

      if (editEmail !== user.email && editEmail.trim()) {
        await updateUserEmailAdmin({
          targetUserId: user.id,
          newEmail: editEmail,
        });
      }

      setEditing(false);
      setProfileNotice("Datos de perfil actualizados correctamente.");
      await loadDetail();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al actualizar datos del club"
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!user) return;
    const confirmMessage = `¿Estás seguro de que quieres eliminar el club "${
      user.name || user.email
    }"?\n\nEsta acción eliminará:\n- El usuario del sistema\n- Todas sus competencias (${
      user.competencias_total
    })\n- Todos los datos relacionados\n\nEsta acción NO se puede deshacer.`;
    if (!window.confirm(confirmMessage)) return;

    setDeleting(true);
    setError("");
    try {
      await deleteUserComplete(user.id);
      navigateAdminDashboard("cuentas");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al eliminar el club"
      );
    } finally {
      setDeleting(false);
    }
  };

  const filteredClubCompetitions = useMemo(() => {
    if (!user) return [];
    if (compFilter === "all") return user.competitions;
    return user.competitions.filter((c) => c.formatKey === compFilter);
  }, [user, compFilter]);

  const displayName = user ? user.name.trim() || user.email : "Detalle de Club";

  return (
    <AdminControlLayout
      activeSection="cuentas"
      title={displayName}
      eyebrow="Riviera Open · Ficha de Club"
      headerActions={
        <>
          <button
            type="button"
            className="admin-cc__btn admin-cc__btn--ghost admin-cc__btn--sm"
            onClick={() => navigateAdminDashboard("cuentas")}
          >
            <TablerIcon name="arrow-left" size={15} />
            <span>Volver a cuentas</span>
          </button>
          <button
            type="button"
            className="admin-cc__btn admin-cc__btn--sm"
            onClick={() => void loadDetail()}
            disabled={loading}
          >
            <TablerIcon name="refresh" size={15} />
            <span>Actualizar</span>
          </button>
        </>
      }
    >
      {loading && !user ? (
        <div className="admin-club-detail__state-card" aria-busy="true">
          Cargando ficha administrativa del club…
        </div>
      ) : null}

      {!loading && !user ? (
        <div className="admin-club-detail__state-card" role="alert">
          <p>{error || "No se encontró el club solicitado."}</p>
          <button
            type="button"
            className="admin-cc__btn admin-cc__btn--primary"
            onClick={() => navigateAdminDashboard("cuentas")}
          >
            Volver a Gestión de cuentas
          </button>
        </div>
      ) : null}

      {user ? (
        <div className="admin-club-detail">
          {/* Top Club Identity & KPI Header */}
          <section
            className="admin-club-detail__hero"
            aria-label="Resumen de identidad del club"
          >
            <div className="admin-club-detail__hero-main">
              <div className="admin-club-detail__logo">
                {user.logo_url ? (
                  <img
                    src={user.logo_url}
                    alt={`Logo oficial de ${displayName}`}
                    className="admin-club-detail__logo-img"
                  />
                ) : (
                  <span>{getInitials(user.name, user.email)}</span>
                )}
              </div>

              <div className="admin-club-detail__hero-text">
                <div className="admin-club-detail__badges-row">
                  <span className="admin-club-detail__badge">Club Oficial</span>
                  {user.has_upgrade ? (
                    <span className="admin-club-detail__badge admin-club-detail__badge--upgrade">
                      Upgrade
                      {user.upgrade_label ? ` · ${user.upgrade_label}` : ""}
                    </span>
                  ) : (
                    <span className="admin-club-detail__badge">
                      Identidad Estándar
                    </span>
                  )}
                  <span
                    className={`admin-club-detail__badge ${
                      user.competencias_activas > 0
                        ? "admin-club-detail__badge--live"
                        : ""
                    }`}
                  >
                    {user.competencias_activas > 0
                      ? `En operación (${user.competencias_activas} activas)`
                      : "Cuenta activa"}
                  </span>
                </div>

                <h2 className="admin-club-detail__title">{displayName}</h2>

                <div className="admin-club-detail__meta-row">
                  <span>{user.email}</span>
                  <span className="admin-club-detail__meta-sep">·</span>
                  <span>Registrado el {formatDate(user.created_at)}</span>
                  <span className="admin-club-detail__meta-sep">·</span>
                  <code className="admin-club-detail__id-code">
                    ID: {user.id}
                  </code>
                </div>
              </div>
            </div>

            <div className="admin-club-detail__hero-stats">
              <div className="admin-club-detail__stat-box">
                <span className="admin-club-detail__stat-label">
                  Competencias
                </span>
                <strong className="admin-club-detail__stat-val">
                  {user.competencias_total}
                </strong>
              </div>
              <div className="admin-club-detail__stat-box">
                <span className="admin-club-detail__stat-label">En curso</span>
                <strong className="admin-club-detail__stat-val">
                  {user.competencias_activas}
                </strong>
              </div>
              <div className="admin-club-detail__stat-box">
                <span className="admin-club-detail__stat-label">Jugadores</span>
                <strong className="admin-club-detail__stat-val">
                  {user.jugadores_total}
                </strong>
              </div>
              <div className="admin-club-detail__stat-box">
                <span className="admin-club-detail__stat-label">
                  Sitio oficial
                </span>
                <strong className="admin-club-detail__stat-val">
                  {user.jugadores_publicos}
                </strong>
              </div>
            </div>
          </section>

          {/* 7 Section Navigation Tabs */}
          <nav
            className="admin-club-detail__tabs"
            aria-label="Secciones de gestión del club"
          >
            {DETAIL_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`admin-club-detail__tab${
                    isActive ? " admin-club-detail__tab--active" : ""
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <TablerIcon name={tab.icon} size={15} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {error ? (
            <div
              className="admin-club-detail__banner admin-club-detail__banner--error"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {profileNotice ? (
            <div
              className="admin-club-detail__banner admin-club-detail__banner--ok"
              role="status"
            >
              {profileNotice}
            </div>
          ) : null}

          {/* SECTION 1: INFORMACIÓN GENERAL */}
          {activeTab === "info" ? (
            <div className="admin-club-detail__grid-2">
              <section className="admin-club-detail__panel">
                <header className="admin-club-detail__panel-head">
                  <div>
                    <span className="admin-club-detail__panel-eyebrow">
                      Datos de identidad y acceso
                    </span>
                    <h3 className="admin-club-detail__panel-title">
                      Perfil de la cuenta
                    </h3>
                  </div>
                  {!editing ? (
                    <button
                      type="button"
                      className="admin-cc__btn admin-cc__btn--sm"
                      onClick={startEdit}
                    >
                      <TablerIcon name="edit" size={14} />
                      <span>Editar perfil</span>
                    </button>
                  ) : null}
                </header>

                {!editing ? (
                  <dl className="admin-club-detail__dl">
                    <div className="admin-club-detail__dl-row">
                      <dt>Nombre comercial del club</dt>
                      <dd>{user.name || "Sin nombre configurado"}</dd>
                    </div>
                    <div className="admin-club-detail__dl-row">
                      <dt>Correo electrónico</dt>
                      <dd>{user.email}</dd>
                    </div>
                    <div className="admin-club-detail__dl-row">
                      <dt>Identificador de cuenta (UUID)</dt>
                      <dd>
                        <code>{user.id}</code>
                      </dd>
                    </div>
                    <div className="admin-club-detail__dl-row">
                      <dt>Fecha de alta</dt>
                      <dd>{formatDate(user.created_at)}</dd>
                    </div>
                    <div className="admin-club-detail__dl-row">
                      <dt>Estado de personalización</dt>
                      <dd>
                        {user.has_upgrade
                          ? `Upgrade activo (${
                              user.upgrade_label ??
                              user.upgrade_key ??
                              "Personalizado"
                            })`
                          : "Identidad estándar Riviera Open"}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <div className="admin-club-detail__edit-form">
                    <label className="admin-club-detail__field">
                      <span>Nombre del club</span>
                      <input
                        type="text"
                        className="admin-club-detail__input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={savingProfile}
                        placeholder="Nombre comercial del club"
                      />
                    </label>
                    <label className="admin-club-detail__field">
                      <span>Correo electrónico de acceso</span>
                      <input
                        type="email"
                        className="admin-club-detail__input"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        disabled={savingProfile}
                        placeholder="correo@ejemplo.com"
                      />
                    </label>
                    <div className="admin-club-detail__form-actions">
                      <button
                        type="button"
                        className="admin-cc__btn admin-cc__btn--primary"
                        onClick={() => void saveEdit()}
                        disabled={savingProfile}
                      >
                        {savingProfile ? "Guardando…" : "Guardar cambios"}
                      </button>
                      <button
                        type="button"
                        className="admin-cc__btn admin-cc__btn--ghost"
                        onClick={cancelEdit}
                        disabled={savingProfile}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                <div className="admin-club-detail__danger-box">
                  <div>
                    <strong className="admin-club-detail__danger-title">
                      Zona de peligro · Eliminación definitiva
                    </strong>
                    <p className="admin-club-detail__danger-desc">
                      Elimina permanentemente la cuenta del club, sus{" "}
                      {user.competencias_total} competencias y registros
                      asociados.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="admin-cc__btn admin-cc__btn--danger admin-cc__btn--sm"
                    onClick={() => void handleDeleteUser()}
                    disabled={deleting}
                  >
                    <TablerIcon name="trash" size={14} />
                    <span>{deleting ? "Eliminando…" : "Eliminar club"}</span>
                  </button>
                </div>
              </section>

              <section className="admin-club-detail__panel">
                <header className="admin-club-detail__panel-head">
                  <div>
                    <span className="admin-club-detail__panel-eyebrow">
                      Actividad consolidada por formato
                    </span>
                    <h3 className="admin-club-detail__panel-title">
                      Resumen deportivo del club
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="admin-cc__btn admin-cc__btn--ghost admin-cc__btn--sm"
                    onClick={() => setActiveTab("competencias")}
                  >
                    <span>Ver competencias ({user.competencias_total})</span>
                  </button>
                </header>

                <div className="admin-club-detail__formats-grid">
                  <div className="admin-club-detail__format-box">
                    <span>Round Robin</span>
                    <strong>{user.formats.round_robin.total}</strong>
                  </div>
                  <div className="admin-club-detail__format-box">
                    <span>Americano Dinámico</span>
                    <strong>{user.formats.americano.total}</strong>
                  </div>
                  <div className="admin-club-detail__format-box">
                    <span>Reta por Equipos</span>
                    <strong>{user.formats.reta_equipos.total}</strong>
                  </div>
                  <div className="admin-club-detail__format-box">
                    <span>Torneo Express</span>
                    <strong>{user.formats.torneo_express.total}</strong>
                  </div>
                  <div className="admin-club-detail__format-box">
                    <span>Duelo 2v2</span>
                    <strong>{user.formats.duelo_2v2.total}</strong>
                  </div>
                  <div className="admin-club-detail__format-box">
                    <span>Liga Individual</span>
                    <strong>{user.formats.liga_individual.total}</strong>
                  </div>
                  <div className="admin-club-detail__format-box">
                    <span>Liga de Parejas</span>
                    <strong>{user.formats.liga_parejas.total}</strong>
                  </div>
                  <div className="admin-club-detail__format-box">
                    <span>Riviera Flex League</span>
                    <strong>{user.formats.liga_flex.total}</strong>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {/* SECTION 2: CONFIGURACIÓN */}
          {activeTab === "configuracion" ? (
            <AccountControlsPanel
              organizadorId={user.id}
              accountLabel={displayName}
              layout="page"
              sectionFilter="configuracion"
              onSaved={() => void loadDetail()}
            />
          ) : null}

          {/* SECTION 3: JUGADORES */}
          {activeTab === "jugadores" ? (
            <AccountControlsPanel
              organizadorId={user.id}
              accountLabel={displayName}
              layout="page"
              sectionFilter="jugadores"
              onSaved={() => void loadDetail()}
            />
          ) : null}

          {/* SECTION 4: COMPETENCIAS */}
          {activeTab === "competencias" ? (
            <section className="admin-club-detail__panel">
              <header className="admin-club-detail__panel-head">
                <div>
                  <span className="admin-club-detail__panel-eyebrow">
                    Historial operativo del club
                  </span>
                  <h3 className="admin-club-detail__panel-title">
                    Competencias registradas ({user.competitions.length})
                  </h3>
                </div>
                <select
                  className="admin-club-detail__select"
                  value={compFilter}
                  onChange={(e) => setCompFilter(e.target.value)}
                  aria-label="Filtrar competencias por formato"
                >
                  <option value="all">
                    Todos los formatos ({user.competitions.length})
                  </option>
                  <option value="round_robin">
                    Round Robin ({user.formats.round_robin.total})
                  </option>
                  <option value="americano">
                    Americano Dinámico ({user.formats.americano.total})
                  </option>
                  <option value="reta_equipos">
                    Reta por Equipos ({user.formats.reta_equipos.total})
                  </option>
                  <option value="torneo_express">
                    Torneo Express ({user.formats.torneo_express.total})
                  </option>
                  <option value="duelo_2v2">
                    Duelo 2v2 ({user.formats.duelo_2v2.total})
                  </option>
                  <option value="liga_individual">
                    Liga Individual ({user.formats.liga_individual.total})
                  </option>
                  <option value="liga_parejas">
                    Liga de Parejas ({user.formats.liga_parejas.total})
                  </option>
                  <option value="liga_flex">
                    Riviera Flex League ({user.formats.liga_flex.total})
                  </option>
                </select>
              </header>

              {filteredClubCompetitions.length === 0 ? (
                <p className="admin-club-detail__empty">
                  Este club no tiene competencias registradas en el formato
                  seleccionado.
                </p>
              ) : (
                <div className="admin-club-detail__table-wrap">
                  <table className="admin-club-detail__table">
                    <thead>
                      <tr>
                        <th>Competencia</th>
                        <th>Formato</th>
                        <th>Estado</th>
                        <th>Fecha</th>
                        <th className="is-right">Enlace público</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClubCompetitions.map((comp) => (
                        <tr key={`${comp.formatKey}-${comp.id}`}>
                          <td>
                            <strong>{comp.title}</strong>
                          </td>
                          <td>
                            <span className="admin-club-detail__tag">
                              {comp.formatLabel}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`admin-club-detail__status ${
                                comp.status === "active"
                                  ? "admin-club-detail__status--active"
                                  : ""
                              }`}
                            >
                              {comp.statusLabel}
                            </span>
                          </td>
                          <td>{formatShortDate(comp.createdAt)}</td>
                          <td className="is-right">
                            {comp.publicPath ? (
                              <a
                                href={comp.publicPath}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="admin-cc__btn admin-cc__btn--ghost admin-cc__btn--sm"
                              >
                                <span>Vista pública</span>
                                <TablerIcon name="external-link" size={13} />
                              </a>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {/* SECTION 5: RANKING */}
          {activeTab === "ranking" ? (
            <div className="admin-club-detail__grid-2">
              <section className="admin-club-detail__panel">
                <header className="admin-club-detail__panel-head">
                  <div>
                    <span className="admin-club-detail__panel-eyebrow">
                      Visibilidad y clasificación
                    </span>
                    <h3 className="admin-club-detail__panel-title">
                      Ranking interno del club
                    </h3>
                  </div>
                </header>
                <p className="admin-club-detail__desc">
                  El ranking interno del club muestra a todos los jugadores
                  activos registrados en esta cuenta ({user.jugadores_total}{" "}
                  jugadores).
                </p>
                <div className="admin-club-detail__link-card">
                  <code>{buildInternalClubRankingUrl(user.id)}</code>
                  <a
                    href={buildInternalClubRankingUrl(user.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-cc__btn admin-cc__btn--primary admin-cc__btn--sm"
                  >
                    <span>Abrir ranking del club</span>
                    <TablerIcon name="external-link" size={14} />
                  </a>
                </div>
              </section>

              <section className="admin-club-detail__panel">
                <header className="admin-club-detail__panel-head">
                  <div>
                    <span className="admin-club-detail__panel-eyebrow">
                      Riviera Open · Sitio Oficial
                    </span>
                    <h3 className="admin-club-detail__panel-title">
                      Publicación en Ranking Oficial
                    </h3>
                  </div>
                </header>
                <p className="admin-club-detail__desc">
                  Actualmente <strong>{user.jugadores_publicos}</strong> de{" "}
                  <strong>{user.jugadores_total}</strong> jugadores están
                  marcados para aparecer públicamente en{" "}
                  <strong>{getOfficialRankingsPageUrl()}</strong>.
                </p>
                <div className="admin-club-detail__form-actions">
                  <button
                    type="button"
                    className="admin-cc__btn admin-cc__btn--primary admin-cc__btn--sm"
                    onClick={() => setActiveTab("jugadores")}
                  >
                    <TablerIcon name="users" size={14} />
                    <span>Administrar visibilidad de jugadores</span>
                  </button>
                  <a
                    href={getOfficialRankingsPageUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-cc__btn admin-cc__btn--ghost admin-cc__btn--sm"
                  >
                    <span>Ver ranking sitio oficial</span>
                    <TablerIcon name="external-link" size={14} />
                  </a>
                </div>
              </section>
            </div>
          ) : null}

          {/* SECTION 6: COACHING */}
          {activeTab === "coaching" ? (
            <div className="admin-club-detail__stack">
              <div className="admin-club-detail__coaching-kpis">
                <div className="admin-club-detail__stat-box">
                  <span className="admin-club-detail__stat-label">
                    Coaches vinculados al club
                  </span>
                  <strong className="admin-club-detail__stat-val">
                    {user.coaches.length}
                  </strong>
                </div>
                <div className="admin-club-detail__stat-box">
                  <span className="admin-club-detail__stat-label">
                    Alumnos en este club
                  </span>
                  <strong className="admin-club-detail__stat-val">
                    {user.students.length}
                  </strong>
                </div>
                <div className="admin-club-detail__stat-box">
                  <span className="admin-club-detail__stat-label">
                    Movimientos en bitácora de clases
                  </span>
                  <strong className="admin-club-detail__stat-val">
                    {user.coaching_movements_count}
                  </strong>
                </div>
              </div>

              <div className="admin-club-detail__grid-2">
                <section className="admin-club-detail__panel">
                  <header className="admin-club-detail__panel-head">
                    <div>
                      <span className="admin-club-detail__panel-eyebrow">
                        Riviera Coaching
                      </span>
                      <h3 className="admin-club-detail__panel-title">
                        Coaches del club ({user.coaches.length})
                      </h3>
                    </div>
                  </header>
                  {user.coaches.length === 0 ? (
                    <p className="admin-club-detail__empty">
                      No hay coaches vinculados a este club.
                    </p>
                  ) : (
                    <div className="admin-club-detail__table-wrap">
                      <table className="admin-club-detail__table">
                        <thead>
                          <tr>
                            <th>Coach</th>
                            <th>Código</th>
                            <th>Estado</th>
                            <th>Vinculación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {user.coaches.map((c) => (
                            <tr key={c.coachId}>
                              <td>
                                <strong>{c.displayName}</strong>
                              </td>
                              <td>
                                <code>{c.coachCode}</code>
                              </td>
                              <td>{c.status}</td>
                              <td>{formatShortDate(c.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="admin-club-detail__panel">
                  <header className="admin-club-detail__panel-head">
                    <div>
                      <span className="admin-club-detail__panel-eyebrow">
                        Riviera Coaching
                      </span>
                      <h3 className="admin-club-detail__panel-title">
                        Alumnos vinculados ({user.students.length})
                      </h3>
                    </div>
                  </header>
                  {user.students.length === 0 ? (
                    <p className="admin-club-detail__empty">
                      No hay alumnos vinculados a este club.
                    </p>
                  ) : (
                    <div className="admin-club-detail__table-wrap">
                      <table className="admin-club-detail__table">
                        <thead>
                          <tr>
                            <th>Correo / Alumno</th>
                            <th>Estado</th>
                            <th>Alta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {user.students.map((s) => (
                            <tr key={s.authUserId}>
                              <td>
                                <strong>{s.email || s.authUserId}</strong>
                              </td>
                              <td>{s.isActive ? "Activo" : "Inactivo"}</td>
                              <td>{formatShortDate(s.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : null}

          {/* SECTION 7: PERSONALIZACIÓN Y UPGRADE */}
          {activeTab === "personalizacion" ? (
            <div className="admin-club-detail__stack">
              <section className="admin-club-detail__panel">
                <header className="admin-club-detail__panel-head">
                  <div>
                    <span className="admin-club-detail__panel-eyebrow">
                      Estado actual de identidad visual
                    </span>
                    <h3 className="admin-club-detail__panel-title">
                      Resumen de branding y upgrade
                    </h3>
                  </div>
                </header>
                <div className="admin-club-detail__branding-preview">
                  <div className="admin-club-detail__logo">
                    {user.logo_url ? (
                      <img
                        src={user.logo_url}
                        alt={`Logo de ${displayName}`}
                        className="admin-club-detail__logo-img"
                      />
                    ) : (
                      <span>{getInitials(user.name, user.email)}</span>
                    )}
                  </div>
                  <div className="admin-club-detail__branding-info">
                    <strong>
                      {user.has_upgrade
                        ? `Upgrade visual activo · ${
                            user.upgrade_label ?? user.upgrade_key
                          }`
                        : "Identidad oficial Riviera Open (Estándar)"}
                    </strong>
                    <span>
                      {user.has_upgrade
                        ? "El club utiliza su paleta personalizada, acentos y logotipo oficial en sus vistas operativas y públicas autorizadas."
                        : "El club utiliza exclusivamente la paleta institucional negro/blanco/escala de grises y el logotipo oficial de Riviera Open."}
                    </span>
                  </div>
                </div>
              </section>

              <AccountControlsPanel
                organizadorId={user.id}
                accountLabel={displayName}
                layout="page"
                sectionFilter="personalizacion"
                onSaved={() => void loadDetail()}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </AdminControlLayout>
  );
};
