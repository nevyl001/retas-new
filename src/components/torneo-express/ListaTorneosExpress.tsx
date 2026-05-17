import React, { useEffect, useState } from "react";
import {
  deleteTorneoExpress,
  fetchTorneosExpressByOrganizador,
  formatSupabaseError,
  type TorneoExpressListItem,
} from "../../services/torneoExpressService";
import { TorneoExpressDeleteModal } from "./TorneoExpressDeleteModal";
import { torneoExpressEstadoLabel } from "../../lib/torneoExpress/labels";
import {
  navigateTorneoExpress,
  setTorneoExpressGeneralBack,
} from "./torneoExpressNav";
import "./torneo-express.css";

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export const ListaTorneosExpress: React.FC = () => {
  const [torneos, setTorneos] = useState<TorneoExpressListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TorneoExpressListItem | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await fetchTorneosExpressByOrganizador();
        if (active) setTorneos(list);
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error ? e.message : "No se pudieron cargar los torneos"
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const refreshList = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchTorneosExpressByOrganizador();
      setTorneos(list);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudieron cargar los torneos"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteTorneoExpress(deleteTarget.id);
      setDeleteTarget(null);
      await refreshList();
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="torneo-express-page">
      {deleteTarget && (
        <TorneoExpressDeleteModal
          torneoNombre={deleteTarget.nombre}
          deleting={deleting}
          onCancel={() => !deleting && setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      <header className="te-header">
        <div>
          <h1 className="te-title">Torneo Express</h1>
          <p className="te-subtitle">Tus torneos por grupos</p>
        </div>
        <button
          type="button"
          className="torneo-express-btn"
          onClick={() => navigateTorneoExpress("/")}
        >
          Ir a RivieraApp
        </button>
      </header>

      <section className="torneo-express-card te-list-section">
        <button
          type="button"
          className="torneo-express-btn torneo-express-btn--primary"
          onClick={() => navigateTorneoExpress("/torneo-express/nuevo")}
        >
          Crear nuevo torneo express
        </button>
      </section>

      <section className="torneo-express-card te-list-section">
        <h2 className="te-list-heading">Tus torneos express</h2>

        {error && <p className="te-error">{error}</p>}
        {loading && <p className="te-subtitle">Cargando torneos…</p>}

        {!loading && !error && torneos.length === 0 && (
          <p className="te-empty-list">No tienes torneos express. ¡Crea el primero!</p>
        )}

        {!loading && torneos.length > 0 && (
          <ul className="te-torneo-list">
            {torneos.map((t) => (
              <li key={t.id} className="te-torneo-list-card">
                <div className="te-torneo-list-card__body">
                  <h3 className="te-torneo-list-card__title">{t.nombre}</h3>
                  <p className="te-torneo-list-card__meta">
                    Creado: {formatFecha(t.created_at)}
                  </p>
                  <p className="te-torneo-list-card__meta">
                    Estado:{" "}
                    <span className={`te-estado te-estado--${t.estado}`}>
                      {torneoExpressEstadoLabel(t.estado)}
                    </span>
                    {" · "}
                    {t.grupoCount} {t.grupoCount === 1 ? "grupo" : "grupos"}
                  </p>
                </div>
                <div className="te-torneo-list-card__actions">
                  <button
                    type="button"
                    className="torneo-express-btn torneo-express-btn--primary"
                    onClick={() =>
                      navigateTorneoExpress(`/torneo-express/${t.id}/gestionar`)
                    }
                  >
                    Gestionar
                  </button>
                  <button
                    type="button"
                    className="torneo-express-btn"
                    onClick={() => {
                      setTorneoExpressGeneralBack(t.id, "/torneo-express");
                      navigateTorneoExpress(`/torneo-express/${t.id}/general`);
                    }}
                  >
                    Ver tabla general
                  </button>
                  <button
                    type="button"
                    className="torneo-express-btn te-btn-delete"
                    onClick={() => setDeleteTarget(t)}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
