import React, { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../../contexts/AdminContext";
import {
  fetchAdminUserDetail,
  type AdminUserDetail,
} from "../../lib/admin/fetchAdminUserDetail";
import { buildMarketingOfficialRankingsUrl } from "../../lib/rivieraOfficialSite";
import { buildInternalClubRankingUrl } from "../jugadores/jugadoresPublicNav";
import { deleteUserComplete } from "../../lib/admin/deleteUserComplete";
import { navigateAdminDashboard } from "../../lib/admin/adminNav";
import { AccountControlsPanel } from "./AccountControlsPanel";
import "./AdminDashboard.css";
import "./AdminUserManagePage.css";
import "./AccountControlsPanel.css";

interface AdminUserManagePageProps {
  userId: string;
}

function getInitials(name: string, email?: string): string {
  const source = (name || email || "?").trim();
  return source
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const AdminUserManagePage: React.FC<AdminUserManagePageProps> = ({
  userId,
}) => {
  const { adminUser, logoutAdmin } = useAdmin();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadUser = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const row = await fetchAdminUserDetail(userId);
      if (!row) {
        setError("Usuario no encontrado");
        setUser(null);
        return;
      }
      setUser(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el usuario");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const internalRankingUrl = buildInternalClubRankingUrl(userId, "M");
  const officialSiteRankingUrl = buildMarketingOfficialRankingsUrl(userId);

  const handleDelete = async () => {
    if (!user) return;
    if (
      !window.confirm(
        `¿Eliminar por completo a "${user.name || user.email}"?\n\nSe borrarán retas, jugadores, torneos, ligas, duelos, ranking y su cuenta de acceso.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setNotice("");
    try {
      await deleteUserComplete(user.id);
      navigateAdminDashboard();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "No se pudo eliminar el usuario"
      );
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-dash admin-user-page">
        <div className="admin-dash__loading">
          <div className="admin-dash__spinner" aria-hidden />
          <p className="admin-dash__loading-text">Cargando cuenta…</p>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="admin-dash admin-user-page">
        <button
          type="button"
          className="admin-user-page__back"
          onClick={navigateAdminDashboard}
        >
          ← Volver a usuarios
        </button>
        <div className="admin-dash__banner admin-dash__banner--error" role="alert">
          {error || "Usuario no encontrado"}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dash admin-user-page">
      <header className="admin-user-page__top">
        <div className="admin-user-page__top-left">
          <button
            type="button"
            className="admin-user-page__back"
            onClick={navigateAdminDashboard}
          >
            ← Volver a usuarios
          </button>
          <h1 className="admin-dash__title">Gestionar cuenta</h1>
          {adminUser?.email ? (
            <p className="admin-dash__subtitle">Admin: {adminUser.email}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="admin-dash__btn-logout"
          onClick={() => void logoutAdmin()}
        >
          Cerrar sesión
        </button>
      </header>

      {notice ? (
        <div className="admin-dash__banner admin-dash__banner--error" role="alert">
          {notice}
        </div>
      ) : null}

      <section className="admin-user-page__hero">
        <div className="admin-user-page__identity">
          <div className="admin-user-page__avatar">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="admin-user-page__avatar-img" />
            ) : (
              <span className="admin-user-page__avatar-initials">
                {getInitials(user.name, user.email)}
              </span>
            )}
          </div>
          <div>
            <h2 className="admin-user-page__name">{user.name || user.email}</h2>
            <p className="admin-user-page__email">{user.email}</p>
            <p className="admin-user-page__meta">
              Registro: {formatDate(user.created_at)} · ID:{" "}
              <code className="admin-user-page__id">{user.id}</code>
            </p>
          </div>
        </div>

        <div className="admin-user-page__metrics" aria-label="Resumen de actividad">
          <article className="admin-user-page__metric">
            <span className="admin-user-page__metric-value">
              {user.activity_total}
            </span>
            <span className="admin-user-page__metric-label">Actividades</span>
          </article>
          <article className="admin-user-page__metric">
            <span className="admin-user-page__metric-value">
              {user.tournaments_total}
            </span>
            <span className="admin-user-page__metric-label">Retas</span>
          </article>
          <article className="admin-user-page__metric">
            <span className="admin-user-page__metric-value">
              {user.express_total}
            </span>
            <span className="admin-user-page__metric-label">Torneo Express</span>
          </article>
          <article className="admin-user-page__metric">
            <span className="admin-user-page__metric-value">
              {user.tournaments_active}
            </span>
            <span className="admin-user-page__metric-label">Retas activas</span>
          </article>
        </div>
      </section>

      <section className="admin-user-page__ranking-link">
        <span className="admin-user-page__ranking-label">
          Rankings del club
        </span>
        <p className="admin-user-page__ranking-hint">
          «Ranking» = ranking interno en appriviera. «Público» + club publicado =
          también en rivieraopen.com. Cada club es independiente.
        </p>
        <span className="admin-user-page__ranking-label admin-user-page__ranking-label--sub">
          Sitio oficial (rivieraopen.com)
        </span>
        <a
          href={officialSiteRankingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="admin-user-page__ranking-url"
        >
          {officialSiteRankingUrl}
        </a>
        <span className="admin-user-page__ranking-label admin-user-page__ranking-label--sub">
          Ranking interno del club (appriviera)
        </span>
        <a
          href={internalRankingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="admin-user-page__ranking-url admin-user-page__ranking-url--muted"
        >
          {internalRankingUrl}
        </a>
      </section>

      <section className="admin-user-page__controls">
        <AccountControlsPanel
          organizadorId={user.id}
          accountLabel={user.name || user.email}
          layout="page"
        />
      </section>

      <footer className="admin-user-page__footer">
        <button
          type="button"
          className="admin-user-page__btn admin-user-page__btn--danger"
          onClick={() => void handleDelete()}
          disabled={deleting}
        >
          {deleting ? "Eliminando cuenta…" : "Eliminar usuario por completo"}
        </button>
      </footer>
    </div>
  );
};
