import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteTorneoExpress,
  fetchTorneosExpressByOrganizador,
  finalizeTorneoExpress,
  formatSupabaseError,
  type TorneoExpressListItem,
} from "../../services/torneoExpressService";
import { TorneoExpressResultadosPanel } from "./TorneoExpressResultadosPanel";
import { TorneoExpressTablaGeneralPanel } from "./TorneoExpressTablaGeneralPanel";
import { navigateTorneoExpress } from "./torneoExpressNav";
import type { TorneoExpress } from "../../lib/torneoExpress/types";
import { formatTorneoExpressCategoria } from "../../lib/torneoExpress/formatCategoria";
import { Badge, Button } from "../ui";

const MAX_VISIBLE = 5;

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

function isActivo(estado: string): boolean {
  return estado === "en_curso" || estado === "pendiente";
}

function sortTorneos(list: TorneoExpressListItem[]): TorneoExpressListItem[] {
  const activos = list.filter((t) => isActivo(t.estado));
  const finalizados = list.filter((t) => t.estado === "finalizado");
  const otros = list.filter((t) => !isActivo(t.estado) && t.estado !== "finalizado");
  return [...activos, ...otros, ...finalizados];
}

interface TorneoExpressTorneosSectionProps {
  refreshToken?: number;
}

export const TorneoExpressTorneosSection: React.FC<
  TorneoExpressTorneosSectionProps
> = ({ refreshToken = 0 }) => {
  const [torneos, setTorneos] = useState<TorneoExpressListItem[]>([]);
  const [cargandoTorneos, setCargandoTorneos] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [resultadosTorneoId, setResultadosTorneoId] = useState<string | null>(null);
  const [tablaGeneralTorneoId, setTablaGeneralTorneoId] = useState<string | null>(
    null
  );
  const [finalizarId, setFinalizarId] = useState<string | null>(null);
  const [eliminarId, setEliminarId] = useState<string | null>(null);
  const [accionando, setAccionando] = useState(false);

  const cargar = useCallback(async () => {
    setCargandoTorneos(true);
    setError(null);
    try {
      const list = await fetchTorneosExpressByOrganizador();
      setTorneos(sortTorneos(list));
    } catch (e) {
      setError(formatSupabaseError(e));
      setTorneos([]);
    } finally {
      setCargandoTorneos(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar, refreshToken]);

  const sorted = useMemo(() => sortTorneos(torneos), [torneos]);
  const visible = showAll ? sorted : sorted.slice(0, MAX_VISIBLE);
  const hayMas = sorted.length > MAX_VISIBLE;
  const activosCount = useMemo(
    () => sorted.filter((t) => isActivo(t.estado)).length,
    [sorted]
  );
  const visibleActivos = useMemo(
    () => visible.filter((t) => isActivo(t.estado)),
    [visible]
  );
  const visibleFinalizados = useMemo(
    () => visible.filter((t) => t.estado === "finalizado"),
    [visible]
  );
  const visibleOtros = useMemo(
    () =>
      visible.filter((t) => !isActivo(t.estado) && t.estado !== "finalizado"),
    [visible]
  );

  const torneoResultados = useMemo(
    () => sorted.find((t) => t.id === resultadosTorneoId) ?? null,
    [sorted, resultadosTorneoId]
  );

  const torneoTablaGeneral = useMemo(
    () => sorted.find((t) => t.id === tablaGeneralTorneoId) ?? null,
    [sorted, tablaGeneralTorneoId]
  );

  const openResultados = (id: string) => {
    setTablaGeneralTorneoId(null);
    setResultadosTorneoId((prev) => (prev === id ? null : id));
  };

  const openTablaGeneral = (id: string) => {
    setResultadosTorneoId(null);
    setTablaGeneralTorneoId((prev) => (prev === id ? null : id));
  };

  const handleFinalizar = async (torneoId: string) => {
    setAccionando(true);
    setError(null);
    try {
      await finalizeTorneoExpress(torneoId);
      setTorneos((prev) =>
        prev.map((t) =>
          t.id === torneoId ? { ...t, estado: "finalizado" } : t
        )
      );
      setFinalizarId(null);
      setResultadosTorneoId(torneoId);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setAccionando(false);
    }
  };

  const handleEliminar = async (torneoId: string) => {
    setAccionando(true);
    setError(null);
    try {
      await deleteTorneoExpress(torneoId);
      setTorneos((prev) => prev.filter((t) => t.id !== torneoId));
      setEliminarId(null);
      if (resultadosTorneoId === torneoId) setResultadosTorneoId(null);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setAccionando(false);
    }
  };

  const renderTorneoCard = (t: TorneoExpressListItem) => {
    const activo = isActivo(t.estado);
    const showResultados =
      resultadosTorneoId === t.id && torneoResultados;
    const showTablaGeneral =
      tablaGeneralTorneoId === t.id && torneoTablaGeneral;
    const confirmFinalizar = finalizarId === t.id;
    const confirmEliminar = eliminarId === t.id;

    return (
      <li
        key={t.id}
        className={`te-torneo-card${activo ? " te-torneo-card--activo" : " te-torneo-card--finalizado"}`}
      >
        <div className="te-torneo-card__inner">
          <div className="te-torneo-card__info-col">
            <div className="te-torneo-card__meta-top">
              {activo ? (
                <Badge variant="live" className="te-torneo-card__badge-live">
                  EN CURSO
                </Badge>
              ) : (
                <Badge variant="finished" className="te-torneo-card__badge-done">
                  FINALIZADO
                </Badge>
              )}
              <span className="te-torneo-card__fecha">
                Creado: {formatFecha(t.created_at)}
              </span>
            </div>

            <h3 className="te-torneo-card__nombre">{t.nombre}</h3>
            {formatTorneoExpressCategoria(t.categoria) ? (
              <p className="te-torneo-card__categoria">
                {formatTorneoExpressCategoria(t.categoria)}
              </p>
            ) : null}
            <p className="te-torneo-card__info">
              {t.grupoCount} {t.grupoCount === 1 ? "grupo" : "grupos"} ·{" "}
              {t.parejaCount} {t.parejaCount === 1 ? "pareja" : "parejas"}
            </p>
          </div>

          {!confirmFinalizar && !confirmEliminar ? (
            <div className="te-torneo-card__actions-col">
              {activo ? (
                <>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      navigateTorneoExpress(
                        `/torneo-express/${t.id}/gestionar`
                      )
                    }
                  >
                    Gestionar →
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => openResultados(t.id)}
                  >
                    {showResultados ? "Ocultar resultados" : "Ver resultados"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => openTablaGeneral(t.id)}
                  >
                    {showTablaGeneral
                      ? "Ocultar tabla general"
                      : "Tabla general"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="te-btn-finalizar-fase"
                    onClick={() => {
                      setFinalizarId(t.id);
                      setEliminarId(null);
                    }}
                  >
                    Finalizar fase
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => openResultados(t.id)}
                  >
                    {showResultados ? "Ocultar resultados" : "Ver resultados"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => openTablaGeneral(t.id)}
                  >
                    {showTablaGeneral
                      ? "Ocultar tabla general"
                      : "Tabla general"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="te-btn-finalizar-fase"
                    onClick={() => {
                      setEliminarId(t.id);
                      setFinalizarId(null);
                    }}
                  >
                    Eliminar
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </div>

        {confirmFinalizar ? (
          <div className="te-torneo-card__confirm">
            <p className="te-torneo-card__confirm-title">
              ⚠️ ¿Finalizar la fase de grupos?
            </p>
            <p className="te-torneo-card__confirm-text">
              Esta acción no se puede deshacer.
            </p>
            <div className="te-torneo-card__confirm-actions">
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={accionando}
                loading={accionando}
                onClick={() => void handleFinalizar(t.id)}
              >
                Sí, finalizar fase
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={accionando}
                onClick={() => setFinalizarId(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        {confirmEliminar ? (
          <div className="te-torneo-card__confirm">
            <p className="te-torneo-card__confirm-title">
              ¿Eliminar {t.nombre}?
            </p>
            <div className="te-torneo-card__confirm-actions">
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={accionando}
                loading={accionando}
                onClick={() => void handleEliminar(t.id)}
              >
                Sí, eliminar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={accionando}
                onClick={() => setEliminarId(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        {showResultados && torneoResultados ? (
          <TorneoExpressResultadosPanel
            torneo={torneoResultados as TorneoExpress}
            onClose={() => setResultadosTorneoId(null)}
          />
        ) : null}

        {showTablaGeneral && torneoTablaGeneral ? (
          <TorneoExpressTablaGeneralPanel
            torneo={torneoTablaGeneral as TorneoExpress}
            onClose={() => setTablaGeneralTorneoId(null)}
          />
        ) : null}
      </li>
    );
  };

  return (
    <section className="te-torneos-section" aria-labelledby="te-torneos-heading">
      <div className="te-torneos-section__head">
        <h2 id="te-torneos-heading" className="te-torneos-section__title">
          Tus torneos
        </h2>
        {!cargandoTorneos && activosCount > 0 ? (
          <span className="te-torneos-section__count">
            {activosCount} {activosCount === 1 ? "activo" : "activos"}
          </span>
        ) : null}
      </div>

      {error && <p className="te-error">{error}</p>}

      {cargandoTorneos && (
        <ul className="te-torneos-skeleton" aria-busy="true">
          {[1, 2].map((i) => (
            <li key={i} className="te-torneos-skeleton__card" />
          ))}
        </ul>
      )}

      {!cargandoTorneos && sorted.length === 0 && (
        <div className="te-torneos-empty">
          <p>Aún no tienes torneos.</p>
          <p>Crea uno abajo para comenzar.</p>
        </div>
      )}

      {!cargandoTorneos && visible.length > 0 && (
        <>
          {visibleActivos.length > 0 ? (
            <div className="te-torneos-group">
              <h3 className="te-torneos-group__label">En curso</h3>
              <ul className="te-torneos-cards">
                {visibleActivos.map(renderTorneoCard)}
              </ul>
            </div>
          ) : null}

          {visibleOtros.length > 0 ? (
            <div className="te-torneos-group">
              <h3 className="te-torneos-group__label">Otros</h3>
              <ul className="te-torneos-cards">
                {visibleOtros.map(renderTorneoCard)}
              </ul>
            </div>
          ) : null}

          {visibleFinalizados.length > 0 ? (
            <div className="te-torneos-group">
              <h3 className="te-torneos-group__label">Finalizados</h3>
              <ul className="te-torneos-cards">
                {visibleFinalizados.map(renderTorneoCard)}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {!cargandoTorneos && hayMas && !showAll && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="te-ver-todos-btn"
          onClick={() => setShowAll(true)}
        >
          Ver todos mis torneos →
        </Button>
      )}
    </section>
  );
};
