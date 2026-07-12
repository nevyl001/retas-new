import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { TorneoExpressEvento } from "../../lib/torneoExpress/types";
import {
  fetchEventosByOrganizador,
  fetchTorneosExpressByOrganizador,
  formatSupabaseError,
} from "../../services/torneoExpressService";
import { Badge, Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { useClubModeEyebrow } from "../../club-experience";
import { TePageShell } from "./TePageShell";
import { CrearEventoModal } from "./CrearEventoModal";
import { navigateTorneoExpress } from "./torneoExpressNav";
import "./te-eventos.css";

const ESTADO_LABEL: Record<TorneoExpressEvento["estado"], string> = {
  draft: "Borrador",
  published: "Publicado",
  in_progress: "En curso",
  completed: "Completado",
  archived: "Archivado",
};

function formatFecha(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function badgeVariantForEstado(
  estado: TorneoExpressEvento["estado"]
): "pending" | "live" | "finished" | "active" {
  if (estado === "published" || estado === "in_progress") return "live";
  if (estado === "completed") return "finished";
  if (estado === "archived") return "pending";
  return "pending";
}

export const EventosLista: React.FC = () => {
  const modeEyebrow = useClubModeEyebrow();
  const [eventos, setEventos] = useState<TorneoExpressEvento[]>([]);
  const [categoriaCountByEvento, setCategoriaCountByEvento] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, torneos] = await Promise.all([
        fetchEventosByOrganizador(),
        // Necesita categorías vinculadas para contar; no usar el default standaloneOnly.
        fetchTorneosExpressByOrganizador({ standaloneOnly: false }).catch(
          () => []
        ),
      ]);
      setEventos(list);
      const counts: Record<string, number> = {};
      for (const t of torneos) {
        const eid = t.evento_id?.trim();
        if (!eid) continue;
        counts[eid] = (counts[eid] ?? 0) + 1;
      }
      setCategoriaCountByEvento(counts);
    } catch (e) {
      setError(formatSupabaseError(e));
      setEventos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const empty = useMemo(
    () => !loading && eventos.length === 0,
    [loading, eventos.length]
  );

  return (
    <TePageShell className="te-inicio-page te-eventos-page">
      <div className="te-inicio-page__shell">
        <ActionBar className="te-inicio-toolbar riviera-back-toolbar">
          <Button
            type="button"
            variant="back"
            onClick={() => navigateTorneoExpress("/torneo-express")}
          >
            ← Volver a Torneos
          </Button>
        </ActionBar>

        <div className="te-inicio-page__intro">
          <ModeHeader
            className="te-inicio-header te-header rv-mode-header rv-mode-header--entry"
            eyebrow={modeEyebrow}
            title="Eventos"
            subtitle="Agrupa varias categorías (torneos) bajo un mismo evento. Cada categoría se arma y compite por separado."
          />
        </div>

        <div className="te-eventos-toolbar">
          <Button
            type="button"
            variant="primary"
            onClick={() => setCreateOpen(true)}
          >
            Crear evento
          </Button>
        </div>

        {error ? <p className="te-error">{error}</p> : null}

        {loading ? (
          <ul className="te-torneos-skeleton" aria-busy="true">
            <li className="te-torneos-skeleton__card" />
            <li className="te-torneos-skeleton__card" />
          </ul>
        ) : null}

        {empty ? (
          <div className="te-torneos-empty">
            <p>Aún no tienes eventos.</p>
            <p>Crea uno para agrupar categorías (4ta, 5ta, Open, etc.).</p>
          </div>
        ) : null}

        {!loading && eventos.length > 0 ? (
          <ul className="te-eventos-list">
            {eventos.map((ev) => {
              const nCat = categoriaCountByEvento[ev.id] ?? 0;
              const fi = formatFecha(ev.fecha_inicio);
              const ff = formatFecha(ev.fecha_fin);
              return (
                <li key={ev.id} className="te-evento-card">
                  <div className="te-evento-card__main">
                    <div className="te-evento-card__top">
                      <h3 className="te-evento-card__title">{ev.nombre}</h3>
                      <Badge variant={badgeVariantForEstado(ev.estado)}>
                        {ESTADO_LABEL[ev.estado]}
                      </Badge>
                    </div>
                    <p className="te-evento-card__meta">
                      {fi || ff
                        ? [fi, ff].filter(Boolean).join(" – ")
                        : "Fechas por definir"}
                      {" · "}
                      {nCat === 1
                        ? "1 categoría"
                        : `${nCat} categorías`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      navigateTorneoExpress(`/torneo-express/evento/${ev.id}`)
                    }
                  >
                    Abrir
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <CrearEventoModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          navigateTorneoExpress(`/torneo-express/evento/${id}`);
        }}
      />
    </TePageShell>
  );
};
