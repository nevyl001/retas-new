import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAdmin } from "../../contexts/AdminContext";
import { TablerIcon } from "../ui/TablerIcon";
import { AdminControlLayout } from "./AdminControlLayout";
import { UserManagement } from "./UserManagement";
import {
  fetchAdminControlCenterSnapshot,
  type AdminControlCenterSnapshot,
  type AdminFormatKey,
} from "../../lib/admin/adminControlCenterData";
import { accountHasRole } from "../../lib/admin/adminAccountClassification";
import {
  navigateAdminUser,
  readStoredAdminSection,
  writeStoredAdminSection,
  type AdminControlSection,
} from "../../lib/admin/adminNav";
import "./AdminDashboard.css";

const SECTION_TITLES: Record<
  AdminControlSection,
  { title: string; eyebrow: string }
> = {
  resumen: {
    title: "Resumen General de Plataforma",
    eyebrow: "Riviera Open · Control Center",
  },
  cuentas: {
    title: "Gestión de Cuentas y Clubes",
    eyebrow: "Riviera Open · Directorio Oficial",
  },
  competencias: {
    title: "Competencias y Formatos Deportivos",
    eyebrow: "Riviera Open · Operación Deportiva",
  },
  actividad: {
    title: "Actividad del Sistema",
    eyebrow: "Riviera Open · Bitácora Verificable",
  },
};

function formatShortDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string, email: string): string {
  const src = (name || email || "RO").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

export const AdminDashboard: React.FC = () => {
  const { adminUser } = useAdmin();
  const [section, setSection] = useState<AdminControlSection>(() =>
    readStoredAdminSection()
  );
  const [snapshot, setSnapshot] = useState<AdminControlCenterSnapshot | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Competencias filters
  const [compSearch, setCompSearch] = useState("");
  const [compFormatFilter, setCompFormatFilter] = useState<
    "all" | AdminFormatKey
  >("all");
  const [compStatusFilter, setCompStatusFilter] = useState<
    "all" | "active" | "finished"
  >("all");
  const [compPage, setCompPage] = useState(1);
  const COMP_PAGE_SIZE = 15;

  // Actividad filters
  const [actCategory, setActCategory] = useState<
    "all" | "competencia" | "cuenta" | "coaching"
  >("all");
  const [actSearch, setActSearch] = useState("");

  const handleSelectSection = useCallback((next: AdminControlSection) => {
    setSection(next);
    writeStoredAdminSection(next);
  }, []);

  const loadSnapshot = useCallback(
    async (isSilent = false) => {
      if (isSilent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const data = await fetchAdminControlCenterSnapshot(
          adminUser?.id ?? null
        );
        setSnapshot(data);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "No se pudieron cargar las métricas del panel de administración."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [adminUser?.id]
  );

  useEffect(() => {
    void loadSnapshot(false);
  }, [loadSnapshot]);

  const clubAccounts = useMemo(
    () =>
      snapshot?.accounts.filter((a) => accountHasRole(a, "club")) ?? [],
    [snapshot]
  );

  const clubesActivos = useMemo(
    () =>
      clubAccounts.filter((c) => c.competencias_activas > 0).length,
    [clubAccounts]
  );

  const clubesConUpgrade = useMemo(
    () => clubAccounts.filter((c) => c.has_upgrade).length,
    [clubAccounts]
  );

  const topClubs = useMemo(() => {
    return [...clubAccounts]
      .sort((a, b) => {
        if (b.competencias_total !== a.competencias_total) {
          return b.competencias_total - a.competencias_total;
        }
        return b.jugadores_total - a.jugadores_total;
      })
      .slice(0, 6);
  }, [clubAccounts]);

  const filteredCompetitions = useMemo(() => {
    if (!snapshot) return [];
    const q = compSearch.trim().toLowerCase();
    return snapshot.competitions.filter((c) => {
      if (compFormatFilter !== "all" && c.formatKey !== compFormatFilter) {
        return false;
      }
      if (compStatusFilter !== "all" && c.status !== compStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.organizadorName.toLowerCase().includes(q) ||
        c.formatLabel.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    });
  }, [snapshot, compSearch, compFormatFilter, compStatusFilter]);

  useEffect(() => {
    setCompPage(1);
  }, [compSearch, compFormatFilter, compStatusFilter]);

  const totalCompPages = Math.max(
    1,
    Math.ceil(filteredCompetitions.length / COMP_PAGE_SIZE)
  );
  const pagedCompetitions = useMemo(() => {
    const start = (compPage - 1) * COMP_PAGE_SIZE;
    return filteredCompetitions.slice(start, start + COMP_PAGE_SIZE);
  }, [filteredCompetitions, compPage]);

  const filteredActivities = useMemo(() => {
    if (!snapshot) return [];
    const q = actSearch.trim().toLowerCase();
    return snapshot.activities.filter((a) => {
      if (actCategory !== "all" && a.kind !== actCategory) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.subtitle.toLowerCase().includes(q) ||
        a.actorName.toLowerCase().includes(q)
      );
    });
  }, [snapshot, actCategory, actSearch]);

  const navBadges = useMemo(
    () =>
      snapshot
        ? {
            cuentas: snapshot.totalAccountsCount,
            competencias: snapshot.competenciasTotal,
            actividad: snapshot.activities.length,
          }
        : undefined,
    [snapshot]
  );

  const currentSectionMeta = SECTION_TITLES[section];

  return (
    <AdminControlLayout
      activeSection={section}
      onSelectSection={handleSelectSection}
      title={currentSectionMeta.title}
      eyebrow={currentSectionMeta.eyebrow}
      badges={navBadges}
      headerActions={
        <>
          <button
            type="button"
            className="admin-cc__btn admin-cc__btn--ghost admin-cc__btn--sm"
            onClick={() => void loadSnapshot(true)}
            disabled={loading || refreshing}
            title="Sincronizar estadísticas e información en tiempo real"
          >
            <TablerIcon name="refresh" size={15} />
            <span>{refreshing ? "Actualizando…" : "Actualizar"}</span>
          </button>
          {section !== "cuentas" ? (
            <button
              type="button"
              className="admin-cc__btn admin-cc__btn--primary admin-cc__btn--sm"
              onClick={() => handleSelectSection("cuentas")}
            >
              <TablerIcon name="users" size={15} />
              <span>Gestionar cuentas</span>
            </button>
          ) : null}
        </>
      }
    >
      {error ? (
        <div className="admin-dash__alert" role="alert">
          <div className="admin-dash__alert-text">
            <strong>Error de sincronización:</strong> {error}
          </div>
          <button
            type="button"
            className="admin-cc__btn admin-cc__btn--sm"
            onClick={() => void loadSnapshot(false)}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {loading && !snapshot ? (
        <div className="admin-dash__loading-state" aria-busy="true">
          <div className="admin-dash__kpi-grid">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="admin-dash__kpi-card admin-dash__kpi-card--skeleton"
              />
            ))}
          </div>
          <div className="admin-dash__skeleton-panel" />
        </div>
      ) : null}

      {snapshot && section === "resumen" ? (
        <div className="admin-dash__section-stack">
          {/* 6 Compact KPI Cards (90-110px desktop height) */}
          <section aria-label="Indicadores clave de la plataforma">
            <div className="admin-dash__kpi-grid">
              <article className="admin-dash__kpi-card">
                <div className="admin-dash__kpi-top">
                  <span className="admin-dash__kpi-label">
                    Clubes registrados
                  </span>
                  <TablerIcon
                    name="trophy"
                    size={15}
                    className="admin-dash__kpi-icon"
                  />
                </div>
                <div className="admin-dash__kpi-value">
                  {snapshot.clubesCount}
                </div>
                <div className="admin-dash__kpi-sub">
                  {clubesActivos} en operación · {clubesConUpgrade} con upgrade
                </div>
              </article>

              <article className="admin-dash__kpi-card">
                <div className="admin-dash__kpi-top">
                  <span className="admin-dash__kpi-label">
                    Cuentas registradas
                  </span>
                  <TablerIcon
                    name="users"
                    size={15}
                    className="admin-dash__kpi-icon"
                  />
                </div>
                <div className="admin-dash__kpi-value">
                  {snapshot.totalAccountsCount}
                </div>
                <div className="admin-dash__kpi-sub">
                  {snapshot.clubesCount} clubes · {snapshot.coachesCount}{" "}
                  coaches · {snapshot.studentsCount} alumnos
                </div>
              </article>

              <article className="admin-dash__kpi-card">
                <div className="admin-dash__kpi-top">
                  <span className="admin-dash__kpi-label">
                    Jugadores registrados
                  </span>
                  <TablerIcon
                    name="user"
                    size={15}
                    className="admin-dash__kpi-icon"
                  />
                </div>
                <div className="admin-dash__kpi-value">
                  {snapshot.jugadoresTotal}
                </div>
                <div className="admin-dash__kpi-sub">
                  {snapshot.jugadoresPublicos} publicados en ranking oficial
                </div>
              </article>

              <article className="admin-dash__kpi-card admin-dash__kpi-card--highlight">
                <div className="admin-dash__kpi-top">
                  <span className="admin-dash__kpi-label">
                    Competencias totales
                  </span>
                  <TablerIcon
                    name="chart-bar"
                    size={15}
                    className="admin-dash__kpi-icon"
                  />
                </div>
                <div className="admin-dash__kpi-value">
                  {snapshot.competenciasTotal}
                </div>
                <div className="admin-dash__kpi-sub">
                  {snapshot.retasTournamentsTableTotal} retas +{" "}
                  {snapshot.formats.torneo_express.total} Express +{" "}
                  {snapshot.formats.liga_individual.total +
                    snapshot.formats.liga_parejas.total +
                    snapshot.formats.liga_flex.total}{" "}
                  Ligas + {snapshot.formats.duelo_2v2.total} Duelos
                </div>
              </article>

              <article className="admin-dash__kpi-card">
                <div className="admin-dash__kpi-top">
                  <span className="admin-dash__kpi-label">
                    Competencias activas
                  </span>
                  <TablerIcon
                    name="bolt"
                    size={15}
                    className="admin-dash__kpi-icon"
                  />
                </div>
                <div className="admin-dash__kpi-value">
                  {snapshot.competenciasActivas}
                </div>
                <div className="admin-dash__kpi-sub">
                  En curso o abiertas en los 8 formatos
                </div>
              </article>

              <article className="admin-dash__kpi-card">
                <div className="admin-dash__kpi-top">
                  <span className="admin-dash__kpi-label">
                    Competencias finalizadas
                  </span>
                  <TablerIcon
                    name="circle-check"
                    size={15}
                    className="admin-dash__kpi-icon"
                  />
                </div>
                <div className="admin-dash__kpi-value">
                  {snapshot.competenciasFinalizadas}
                </div>
                <div className="admin-dash__kpi-sub">
                  Completadas (excluye borradores)
                </div>
              </article>
            </div>
          </section>

          {/* 2-Column Main Operational Overview */}
          <div className="admin-dash__main-grid">
            {/* Left: All 8 Active Sports Formats Breakdown */}
            <section
              className="admin-dash__panel"
              aria-labelledby="dash-formats-heading"
            >
              <header className="admin-dash__panel-head">
                <div>
                  <span className="admin-dash__panel-eyebrow">
                    Cobertura integral · 8 formatos activos
                  </span>
                  <h2
                    id="dash-formats-heading"
                    className="admin-dash__panel-title"
                  >
                    Distribución por formato deportivo
                  </h2>
                </div>
                <button
                  type="button"
                  className="admin-cc__btn admin-cc__btn--ghost admin-cc__btn--sm"
                  onClick={() => handleSelectSection("competencias")}
                >
                  <span>Explorar competencias</span>
                  <TablerIcon name="chevron-right" size={14} />
                </button>
              </header>

              <div className="admin-dash__format-table-wrap">
                <table className="admin-dash__format-table">
                  <thead>
                    <tr>
                      <th>Formato deportivo</th>
                      <th className="is-num">Total</th>
                      <th className="is-num">Activas</th>
                      <th className="is-num">Finalizadas</th>
                      <th>Proporción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.formatList.map((fmt) => {
                      const pct =
                        snapshot.competenciasTotal > 0
                          ? Math.round(
                              (fmt.counts.total / snapshot.competenciasTotal) *
                                100
                            )
                          : 0;
                      return (
                        <tr
                          key={fmt.key}
                          className="admin-dash__format-row"
                          onClick={() => {
                            setCompFormatFilter(fmt.key);
                            handleSelectSection("competencias");
                          }}
                          title={`Filtrar competencias de ${fmt.label}`}
                        >
                          <td>
                            <div className="admin-dash__format-name-cell">
                              <span className="admin-dash__format-name">
                                {fmt.label}
                              </span>
                              <span className="admin-dash__format-meta">
                                {fmt.ruleNote}
                              </span>
                            </div>
                          </td>
                          <td className="is-num">
                            <span className="admin-dash__format-total">
                              {fmt.counts.total}
                            </span>
                          </td>
                          <td className="is-num">
                            <span
                              className={`admin-dash__pill${
                                fmt.counts.active > 0
                                  ? " admin-dash__pill--active"
                                  : ""
                              }`}
                            >
                              {fmt.counts.active}
                            </span>
                          </td>
                          <td className="is-num">
                            <span className="admin-dash__pill">
                              {fmt.counts.finished}
                            </span>
                          </td>
                          <td>
                            <div className="admin-dash__bar-cell">
                              <div className="admin-dash__bar-track">
                                <div
                                  className="admin-dash__bar-fill"
                                  style={{
                                    width: `${Math.max(
                                      fmt.counts.total > 0 ? 4 : 0,
                                      pct
                                    )}%`,
                                  }}
                                />
                              </div>
                              <span className="admin-dash__bar-pct">
                                {pct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <footer className="admin-dash__reconcile-note">
                <div className="admin-dash__reconcile-row">
                  <TablerIcon name="info-circle" size={15} />
                  <span>
                    <strong>Conciliación estadística verificada:</strong> El
                    total general ({snapshot.competenciasTotal}) suma
                    exactamente las retas en <code>tournaments</code> (
                    {snapshot.retasTournamentsTableTotal}), los torneos en{" "}
                    <code>torneo_express</code> (
                    {snapshot.formats.torneo_express.total}), las temporadas en{" "}
                    <code>ligas</code> (
                    {snapshot.formats.liga_individual.total +
                      snapshot.formats.liga_parejas.total +
                      snapshot.formats.liga_flex.total}
                    ; cada temporada cuenta como 1 competencia sin duplicar
                    jornadas ni partidos) y los encuentros en{" "}
                    <code>duelos_2v2</code> ({snapshot.formats.duelo_2v2.total}
                    ).
                  </span>
                </div>
                <div className="admin-dash__reconcile-row admin-dash__reconcile-row--muted">
                  <span>
                    <strong>Cancha Reina:</strong> formato sin tabla ni módulo
                    persistido en base de datos actualmente (0 registros).
                  </span>
                </div>
              </footer>
            </section>

            {/* Right: Riviera Coaching + Top Active Clubs */}
            <div className="admin-dash__side-stack">
              <section
                className="admin-dash__panel"
                aria-labelledby="dash-coaching-heading"
              >
                <header className="admin-dash__panel-head">
                  <div>
                    <span className="admin-dash__panel-eyebrow">
                      Módulo formativo independiente
                    </span>
                    <h2
                      id="dash-coaching-heading"
                      className="admin-dash__panel-title"
                    >
                      Riviera Coaching
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="admin-cc__btn admin-cc__btn--ghost admin-cc__btn--sm"
                    onClick={() => handleSelectSection("cuentas")}
                  >
                    <span>Ver coaches y alumnos</span>
                  </button>
                </header>

                <div className="admin-dash__coaching-grid">
                  <div className="admin-dash__coaching-stat">
                    <span className="admin-dash__coaching-label">
                      Coaches activos
                    </span>
                    <strong className="admin-dash__coaching-val">
                      {snapshot.coaching.coachesTotal}
                    </strong>
                  </div>
                  <div className="admin-dash__coaching-stat">
                    <span className="admin-dash__coaching-label">
                      Alumnos vinculados
                    </span>
                    <strong className="admin-dash__coaching-val">
                      {snapshot.coaching.alumnosVinculados}
                    </strong>
                  </div>
                  <div className="admin-dash__coaching-stat">
                    <span className="admin-dash__coaching-label">
                      Clubes con coaching
                    </span>
                    <strong className="admin-dash__coaching-val">
                      {snapshot.coaching.clubesConCoaching}
                    </strong>
                  </div>
                  <div className="admin-dash__coaching-stat">
                    <span className="admin-dash__coaching-label">
                      Movimientos de clases
                    </span>
                    <strong className="admin-dash__coaching-val">
                      {snapshot.coaching.movimientosClases}
                    </strong>
                  </div>
                </div>
              </section>

              <section
                className="admin-dash__panel"
                aria-labelledby="dash-top-clubs-heading"
              >
                <header className="admin-dash__panel-head">
                  <div>
                    <span className="admin-dash__panel-eyebrow">
                      Operación por organizador
                    </span>
                    <h2
                      id="dash-top-clubs-heading"
                      className="admin-dash__panel-title"
                    >
                      Clubes con mayor actividad
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="admin-cc__btn admin-cc__btn--ghost admin-cc__btn--sm"
                    onClick={() => handleSelectSection("cuentas")}
                  >
                    <span>Directorio ({clubAccounts.length})</span>
                  </button>
                </header>

                {topClubs.length === 0 ? (
                  <p className="admin-dash__empty-inline">
                    No hay clubes registrados.
                  </p>
                ) : (
                  <ul className="admin-dash__top-clubs-list">
                    {topClubs.map((club) => (
                      <li key={club.id} className="admin-dash__top-club-item">
                        <div className="admin-dash__top-club-identity">
                          <div className="admin-dash__club-avatar">
                            {club.logo_url ? (
                              <img
                                src={club.logo_url}
                                alt={`Logo de ${club.name || club.email}`}
                                className="admin-dash__club-avatar-img"
                              />
                            ) : (
                              <span>{getInitials(club.name, club.email)}</span>
                            )}
                          </div>
                          <div className="admin-dash__top-club-text">
                            <div className="admin-dash__top-club-name-row">
                              <span className="admin-dash__top-club-name">
                                {club.name || "Club sin nombre"}
                              </span>
                              {club.has_upgrade ? (
                                <span className="admin-dash__upgrade-tag">
                                  Upgrade
                                </span>
                              ) : null}
                            </div>
                            <span className="admin-dash__top-club-meta">
                              {club.competencias_total} competencias ·{" "}
                              {club.jugadores_total} jugadores
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="admin-cc__btn admin-cc__btn--ghost admin-cc__btn--sm"
                          onClick={() => navigateAdminUser(club.id)}
                        >
                          Gestionar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          {/* Bottom Strip: Recent Verifiable Activity */}
          <section
            className="admin-dash__panel"
            aria-labelledby="dash-recent-activity-heading"
          >
            <header className="admin-dash__panel-head">
              <div>
                <span className="admin-dash__panel-eyebrow">
                  Eventos recientes en base de datos
                </span>
                <h2
                  id="dash-recent-activity-heading"
                  className="admin-dash__panel-title"
                >
                  Actividad reciente de la plataforma
                </h2>
              </div>
              <button
                type="button"
                className="admin-cc__btn admin-cc__btn--ghost admin-cc__btn--sm"
                onClick={() => handleSelectSection("actividad")}
              >
                <span>Ver bitácora completa</span>
                <TablerIcon name="chevron-right" size={14} />
              </button>
            </header>

            {snapshot.activities.length === 0 ? (
              <p className="admin-dash__empty-inline">
                No hay eventos recientes registrados.
              </p>
            ) : (
              <div className="admin-dash__activity-preview-grid">
                {snapshot.activities.slice(0, 6).map((act) => (
                  <article
                    key={act.id}
                    className="admin-dash__activity-card-mini"
                  >
                    <div className="admin-dash__activity-mini-top">
                      <span
                        className={`admin-dash__cat-badge admin-dash__cat-badge--${act.kind}`}
                      >
                        {act.badge}
                      </span>
                      <time className="admin-dash__activity-time">
                        {formatShortDate(act.timestamp)}
                      </time>
                    </div>
                    <h3 className="admin-dash__activity-mini-title">
                      {act.title}
                    </h3>
                    <p className="admin-dash__activity-mini-sub">
                      {act.subtitle} · {act.actorName}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {section === "cuentas" ? (
        <UserManagement
          snapshot={snapshot}
          onRefresh={() => void loadSnapshot(true)}
        />
      ) : null}

      {snapshot && section === "competencias" ? (
        <div className="admin-dash__section-stack">
          {/* Format Filter Chips Strip */}
          <section
            className="admin-dash__formats-strip"
            aria-label="Filtro rápido por formato deportivo"
          >
            <button
              type="button"
              className={`admin-dash__format-chip${
                compFormatFilter === "all"
                  ? " admin-dash__format-chip--active"
                  : ""
              }`}
              onClick={() => setCompFormatFilter("all")}
            >
              <span className="admin-dash__format-chip-label">
                Todos los formatos
              </span>
              <strong className="admin-dash__format-chip-count">
                {snapshot.competenciasTotal}
              </strong>
            </button>
            {snapshot.formatList.map((fmt) => (
              <button
                key={fmt.key}
                type="button"
                className={`admin-dash__format-chip${
                  compFormatFilter === fmt.key
                    ? " admin-dash__format-chip--active"
                    : ""
                }`}
                onClick={() =>
                  setCompFormatFilter((prev) =>
                    prev === fmt.key ? "all" : fmt.key
                  )
                }
              >
                <span className="admin-dash__format-chip-label">
                  {fmt.shortLabel}
                </span>
                <strong className="admin-dash__format-chip-count">
                  {fmt.counts.total}
                </strong>
              </button>
            ))}
          </section>

          <section className="admin-dash__panel">
            <div className="admin-dash__toolbar">
              <div className="admin-dash__search-box">
                <TablerIcon
                  name="search"
                  size={16}
                  className="admin-dash__search-icon"
                />
                <input
                  type="search"
                  className="admin-dash__search-input"
                  placeholder="Buscar por nombre de competencia, club organizador o formato…"
                  value={compSearch}
                  onChange={(e) => setCompSearch(e.target.value)}
                  aria-label="Buscar competencias"
                />
              </div>

              <div className="admin-dash__toolbar-filters">
                <select
                  className="admin-dash__select"
                  value={compFormatFilter}
                  onChange={(e) =>
                    setCompFormatFilter(
                      e.target.value as "all" | AdminFormatKey
                    )
                  }
                  aria-label="Filtrar por formato"
                >
                  <option value="all">Todos los formatos (8)</option>
                  {snapshot.formatList.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label} ({f.counts.total})
                    </option>
                  ))}
                </select>

                <select
                  className="admin-dash__select"
                  value={compStatusFilter}
                  onChange={(e) =>
                    setCompStatusFilter(
                      e.target.value as "all" | "active" | "finished"
                    )
                  }
                  aria-label="Filtrar por estado"
                >
                  <option value="all">Todos los estados</option>
                  <option value="active">
                    Activas / En curso ({snapshot.competenciasActivas})
                  </option>
                  <option value="finished">
                    Finalizadas ({snapshot.competenciasFinalizadas})
                  </option>
                </select>

                <span className="admin-dash__result-count">
                  {filteredCompetitions.length} resultados
                </span>
              </div>
            </div>

            {filteredCompetitions.length === 0 ? (
              <div className="admin-dash__empty-box">
                <p>
                  Ninguna competencia coincide con los filtros seleccionados.
                </p>
                <button
                  type="button"
                  className="admin-cc__btn admin-cc__btn--sm"
                  onClick={() => {
                    setCompSearch("");
                    setCompFormatFilter("all");
                    setCompStatusFilter("all");
                  }}
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              <>
                <div className="admin-dash__table-wrap">
                  <table className="admin-dash__data-table">
                    <thead>
                      <tr>
                        <th>Competencia</th>
                        <th>Formato</th>
                        <th>Club organizador</th>
                        <th>Estado</th>
                        <th>Fecha</th>
                        <th className="is-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedCompetitions.map((comp) => (
                        <tr key={`${comp.formatKey}-${comp.id}`}>
                          <td>
                            <div className="admin-dash__comp-title-cell">
                              <span className="admin-dash__comp-title">
                                {comp.title}
                              </span>
                              <span className="admin-dash__comp-id">
                                ID: {comp.id.slice(0, 8)}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="admin-dash__format-badge">
                              {comp.formatLabel}
                            </span>
                          </td>
                          <td>
                            {comp.organizadorId ? (
                              <button
                                type="button"
                                className="admin-dash__link-btn"
                                onClick={() =>
                                  navigateAdminUser(comp.organizadorId)
                                }
                              >
                                {comp.organizadorName}
                              </button>
                            ) : (
                              <span className="admin-dash__muted">
                                {comp.organizadorName}
                              </span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`admin-dash__status-badge${
                                comp.status === "active"
                                  ? " admin-dash__status-badge--active"
                                  : " admin-dash__status-badge--finished"
                              }`}
                            >
                              {comp.statusLabel}
                            </span>
                          </td>
                          <td>
                            <span className="admin-dash__date-text">
                              {formatShortDate(comp.createdAt)}
                            </span>
                          </td>
                          <td className="is-right">
                            <div className="admin-dash__row-actions">
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
                              ) : null}
                              {comp.organizadorId ? (
                                <button
                                  type="button"
                                  className="admin-cc__btn admin-cc__btn--sm"
                                  onClick={() =>
                                    navigateAdminUser(comp.organizadorId)
                                  }
                                >
                                  Club
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalCompPages > 1 ? (
                  <div className="admin-dash__pagination">
                    <span className="admin-dash__pagination-info">
                      Página {compPage} de {totalCompPages} ·{" "}
                      {filteredCompetitions.length} competencias
                    </span>
                    <div className="admin-dash__pagination-btns">
                      <button
                        type="button"
                        className="admin-cc__btn admin-cc__btn--sm"
                        disabled={compPage <= 1}
                        onClick={() => setCompPage((p) => Math.max(1, p - 1))}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        className="admin-cc__btn admin-cc__btn--sm"
                        disabled={compPage >= totalCompPages}
                        onClick={() =>
                          setCompPage((p) => Math.min(totalCompPages, p + 1))
                        }
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}

      {snapshot && section === "actividad" ? (
        <div className="admin-dash__section-stack">
          <section className="admin-dash__panel">
            <div className="admin-dash__toolbar">
              <div className="admin-dash__search-box">
                <TablerIcon
                  name="search"
                  size={16}
                  className="admin-dash__search-icon"
                />
                <input
                  type="search"
                  className="admin-dash__search-input"
                  placeholder="Filtrar eventos por nombre, club o formato…"
                  value={actSearch}
                  onChange={(e) => setActSearch(e.target.value)}
                  aria-label="Buscar eventos en bitácora"
                />
              </div>

              <div className="admin-dash__toolbar-filters">
                <div
                  className="admin-dash__segmented"
                  role="group"
                  aria-label="Categoría de actividad"
                >
                  {(
                    [
                      { id: "all", label: "Todos" },
                      { id: "competencia", label: "Competencias" },
                      { id: "cuenta", label: "Cuentas" },
                      { id: "coaching", label: "Coaching" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`admin-dash__seg-btn${
                        actCategory === tab.id
                          ? " admin-dash__seg-btn--active"
                          : ""
                      }`}
                      onClick={() => setActCategory(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <span className="admin-dash__result-count">
                  {filteredActivities.length} eventos
                </span>
              </div>
            </div>

            {filteredActivities.length === 0 ? (
              <div className="admin-dash__empty-box">
                <p>No se encontraron eventos con los criterios actuales.</p>
              </div>
            ) : (
              <div className="admin-dash__table-wrap">
                <table className="admin-dash__data-table">
                  <thead>
                    <tr>
                      <th>Fecha y hora</th>
                      <th>Categoría</th>
                      <th>Evento</th>
                      <th>Detalle operativo</th>
                      <th>Organizador / Actor</th>
                      <th className="is-right">Acceso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActivities.map((act) => (
                      <tr key={act.id}>
                        <td>
                          <span className="admin-dash__date-text">
                            {formatDateTime(act.timestamp)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`admin-dash__cat-badge admin-dash__cat-badge--${act.kind}`}
                          >
                            {act.badge}
                          </span>
                        </td>
                        <td>
                          <strong className="admin-dash__comp-title">
                            {act.title}
                          </strong>
                        </td>
                        <td>
                          <span className="admin-dash__comp-detail">
                            {act.subtitle}
                          </span>
                        </td>
                        <td>
                          <span className="admin-dash__comp-detail">
                            {act.actorName}
                          </span>
                        </td>
                        <td className="is-right">
                          <div className="admin-dash__row-actions">
                            {act.organizadorId ? (
                              <button
                                type="button"
                                className="admin-cc__btn admin-cc__btn--sm"
                                onClick={() =>
                                  navigateAdminUser(act.organizadorId!)
                                }
                              >
                                Ver club
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </AdminControlLayout>
  );
};
