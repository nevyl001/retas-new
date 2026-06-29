import React, { useCallback, useEffect, useState } from "react";
import { navigateToAppHome } from "../../lib/appRouting";
import type { Liga } from "../../lib/liga/types";
import { ligaModalidadLabel } from "../../lib/liga/types";
import { deleteLiga, getLigas } from "../../services/ligaService";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { navigateLiga } from "./ligaNav";
import { LigaPageShell } from "./LigaPageShell";
import "./liga-page.css";

function estadoLabel(estado: Liga["estado"]): string {
  switch (estado) {
    case "upcoming":
      return "Próxima";
    case "in_progress":
      return "En curso";
    case "completed":
      return "Finalizada";
    default:
      return estado;
  }
}

function badgeClass(estado: Liga["estado"]): string {
  if (estado === "in_progress") return "liga-badge liga-badge--live rv-pill";
  if (estado === "completed") return "liga-badge liga-badge--done rv-pill";
  return "liga-badge rv-pill";
}

export const LigaHome: React.FC = () => {
  const [ligas, setLigas] = useState<Liga[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getLigas();
      setLigas(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar ligas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteLiga = async (liga: Liga) => {
    if (
      !window.confirm(
        `¿Eliminar «${liga.nombre}»? Se borrarán inscripciones, jornadas y resultados. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setDeletingId(liga.id);
    setError(null);
    try {
      await deleteLiga(liga.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar la liga");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <LigaPageShell>
      <ActionBar className="liga-toolbar riviera-back-toolbar">
        <Button type="button" variant="back" onClick={() => navigateToAppHome()}>
          ← Volver al inicio
        </Button>
      </ActionBar>

      <ModeHeader
        className="liga-header rv-mode-header rv-mode-header--entry"
        eyebrow="Riviera Open"
        title="Ligas"
        subtitle="Liga individual con parejas rotativas o liga por parejas fijas"
      />

      <ActionBar className="liga-actions">
        <Button
          type="button"
          variant="primary"
          onClick={() => navigateLiga("/liga/nueva")}
        >
          Nueva liga
        </Button>
      </ActionBar>

      {error ? <p className="liga-error">{error}</p> : null}

      {loading ? (
        <p className="liga-subtitle">Cargando ligas…</p>
      ) : ligas.length === 0 ? (
        <div className="liga-card liga-empty rv-card rv-empty-state">
          <p>No tienes ligas creadas. Usa «Nueva liga» para empezar.</p>
        </div>
      ) : (
        <ul className="liga-list">
          {ligas.map((liga) => (
            <li key={liga.id} className="liga-list-item">
              <div className="liga-list-item__main">
                <p className="liga-list-item__title">{liga.nombre}</p>
                <p className="liga-list-item__meta">
                  {ligaModalidadLabel(liga.modalidad)}
                  {" · "}
                  {liga.modalidad === "parejas_fijas"
                    ? `${liga.equipos_count ?? 0} parejas`
                    : `${liga.inscripciones_count ?? 0} jugadores`}
                  {" · "}
                  <span className={badgeClass(liga.estado)}>
                    {estadoLabel(liga.estado)}
                  </span>
                </p>
              </div>
              <div className="liga-list-item__actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={deletingId !== null}
                  onClick={() => navigateLiga(`/liga/${liga.id}/gestionar`)}
                >
                  Gestionar
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  loading={deletingId === liga.id}
                  disabled={deletingId !== null && deletingId !== liga.id}
                  onClick={() => void handleDeleteLiga(liga)}
                >
                  Eliminar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </LigaPageShell>
  );
};
