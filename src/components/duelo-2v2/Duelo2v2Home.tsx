import React, { useCallback, useEffect, useState } from "react";
import { navigateToAppHome } from "../../lib/appRouting";
import type { Duelo2v2 } from "../../lib/duelo2v2/types";
import {
  deleteDuelo2v2,
  getDuelos2v2,
  parejaLabel,
} from "../../services/duelo2v2Service";
import { Button } from "../ui";
import { Duelo2v2PageShell } from "./Duelo2v2PageShell";
import { duelo2v2GestionarPath, navigateDuelo2v2 } from "./duelo2v2Nav";
import "./duelo2v2-page.css";

function estadoLabel(estado: Duelo2v2["estado"]): string {
  if (estado === "finalizado") return "Finalizado";
  if (estado === "en_juego") return "En curso";
  return "Configuración";
}

function badgeClass(estado: Duelo2v2["estado"]): string {
  if (estado === "finalizado") return "duelo2v2-badge duelo2v2-badge--done";
  return "duelo2v2-badge duelo2v2-badge--live";
}

export const Duelo2v2Home: React.FC = () => {
  const [duelos, setDuelos] = useState<Duelo2v2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getDuelos2v2();
      setDuelos(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar duelos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (duelo: Duelo2v2) => {
    if (
      !window.confirm(
        `¿Eliminar «${duelo.nombre}»? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setDeletingId(duelo.id);
    try {
      await deleteDuelo2v2(duelo.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Duelo2v2PageShell wide>
      <div className="duelo2v2-toolbar riviera-back-toolbar">
        <Button type="button" variant="back" onClick={() => navigateToAppHome()}>
          ← Volver al inicio
        </Button>
      </div>

      <header className="duelo2v2-header">
        <h1>Duelo 2 vs 2</h1>
        <p>
          Encuentros entre dos parejas del registro Riviera Open. Suman al ranking
          global (+25 participar, +100 ganar).
        </p>
      </header>

      <div className="duelo2v2-actions">
        <Button
          type="button"
          variant="primary"
          onClick={() => navigateDuelo2v2("/duelo-2v2/nuevo")}
        >
          Nuevo duelo
        </Button>
      </div>

      {error && <p className="duelo2v2-error">{error}</p>}
      {loading && <p>Cargando…</p>}

      {!loading && duelos.length === 0 && (
        <p className="duelo2v2-card__meta">Aún no hay duelos registrados.</p>
      )}

      {duelos.map((d) => (
        <div key={d.id} className="duelo2v2-card" style={{ cursor: "default" }}>
          <div className="duelo2v2-card__title">
            {d.nombre}
            <span className={badgeClass(d.estado)}>{estadoLabel(d.estado)}</span>
          </div>
          <div className="duelo2v2-card__meta">
            {parejaLabel(d.pareja_a_j1_nombre, d.pareja_a_j2_nombre)} vs{" "}
            {parejaLabel(d.pareja_b_j1_nombre, d.pareja_b_j2_nombre)}
            {d.estado === "finalizado" && (
              <> · {d.sets_pareja_a}–{d.sets_pareja_b} sets</>
            )}
          </div>
          <div className="duelo2v2-card__actions">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => navigateDuelo2v2(duelo2v2GestionarPath(d.id))}
            >
              Gestionar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deletingId === d.id}
              onClick={() => void handleDelete(d)}
            >
              Eliminar
            </Button>
          </div>
        </div>
      ))}
    </Duelo2v2PageShell>
  );
};
