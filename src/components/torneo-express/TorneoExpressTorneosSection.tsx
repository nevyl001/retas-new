import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteTorneoExpress,
  fetchTorneosExpressByOrganizador,
  formatSupabaseError,
  type TorneoExpressListItem,
} from "../../services/torneoExpressService";
import { TorneoExpressBracketModal } from "./TorneoExpressBracketModal";
import { TorneoExpressDeleteModal } from "./TorneoExpressDeleteModal";
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
  /** Lista dedicada: muestra todos sin truncar. */
  listMode?: boolean;
}

export const TorneoExpressTorneosSection: React.FC<
  TorneoExpressTorneosSectionProps
> = ({ refreshToken = 0, listMode = false }) => {
  const [torneos, setTorneos] = useState<TorneoExpressListItem[]>([]);
  const [cargandoTorneos, setCargandoTorneos] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(listMode);
  const [resultadosTorneoId, setResultadosTorneoId] = useState<string | null>(null);
  const [tablaGeneralTorneoId, setTablaGeneralTorneoId] = useState<string | null>(
    null
  );
  const [bracketTorneo, setBracketTorneo] =
    useState<TorneoExpressListItem | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<TorneoExpressListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const torneoId = deleteTarget.id;
    setDeleting(true);
    setError(null);
    try {
      await deleteTorneoExpress(torneoId);
      setTorneos((prev) => prev.filter((t) => t.id !== torneoId));
      setDeleteTarget(null);
      if (resultadosTorneoId === torneoId) setResultadosTorneoId(null);
      if (tablaGeneralTorneoId === torneoId) setTablaGeneralTorneoId(null);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setDeleting(false);
    }
  };

  const renderEliminarBtn = (t: TorneoExpressListItem) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="te-btn-eliminar-torneo"
      disabled={deleting}
      onClick={() => {
        setDeleteTarget(t);
        setBracketTorneo(null);
      }}
    >
      Eliminar
    </Button>
  );

  const renderTorneoCard = (t: TorneoExpressListItem) => {
    const activo = isActivo(t.estado);
    const faseTorneo = t.fase_torneo ?? "grupos";
    const puedeGestionar =
      activo || faseTorneo === "eliminatoria" || faseTorneo === "cerrado";
    const enEliminatoria =
      activo &&
      (faseTorneo === "eliminatoria" || faseTorneo === "cerrado");
    const enGrupos = activo && faseTorneo === "grupos";
    const showResultados =
      resultadosTorneoId === t.id && torneoResultados;
    const showTablaGeneral =
      tablaGeneralTorneoId === t.id && torneoTablaGeneral;
    return (
      <li
        key={t.id}
        className={`te-torneo-card rv-card${activo ? " te-torneo-card--activo" : " te-torneo-card--finalizado"}`}
      >
        <div className="te-torneo-card__inner">
          <div className="te-torneo-card__body">
            <div className="te-torneo-card__meta-top">
              {enEliminatoria ? (
                <Badge variant="live" className="te-torneo-card__badge-live">
                  ELIMINATORIA
                </Badge>
              ) : enGrupos ? (
                <Badge variant="live" className="te-torneo-card__badge-live">
                  EN CURSO
                </Badge>
              ) : activo ? (
                <Badge variant="live" className="te-torneo-card__badge-live">
                  EN CURSO
                </Badge>
              ) : (
                <Badge variant="finished" className="te-torneo-card__badge-done">
                  FINALIZADO
                </Badge>
              )}
              <span className="te-torneo-card__fecha">
                {formatFecha(t.created_at)}
              </span>
            </div>

            <h3 className="te-torneo-card__nombre">{t.nombre}</h3>
            <p className="te-torneo-card__meta-line">
              {formatTorneoExpressCategoria(t.categoria) ? (
                <>
                  <span className="te-torneo-card__meta-cat">
                    {formatTorneoExpressCategoria(t.categoria)}
                  </span>
                  <span className="te-torneo-card__meta-sep" aria-hidden>
                    ·
                  </span>
                </>
              ) : null}
              <span>
                {t.grupoCount} {t.grupoCount === 1 ? "grupo" : "grupos"}
              </span>
              <span className="te-torneo-card__meta-sep" aria-hidden>
                ·
              </span>
              <span>
                {t.parejaCount} {t.parejaCount === 1 ? "pareja" : "parejas"}
              </span>
            </p>
          </div>

          <footer className="te-torneo-card__footer">
            <div className="te-torneo-card__actions-bar">
              {puedeGestionar ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="te-torneo-card__btn-manage"
                  onClick={() =>
                    navigateTorneoExpress(`/torneo-express/${t.id}/gestionar`)
                  }
                >
                  Gestionar
                </Button>
              ) : null}

              <div className="te-torneo-card__actions-links">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => openResultados(t.id)}
                >
                  {showResultados ? "Ocultar" : "Resultados"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => openTablaGeneral(t.id)}
                >
                  {showTablaGeneral ? "Ocultar" : "Tabla"}
                </Button>
              </div>

              <div className="te-torneo-card__actions-end">
                {puedeGestionar && enGrupos ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="te-btn-finalizar-fase"
                    onClick={() => setBracketTorneo(t)}
                  >
                    Finalizar fase
                  </Button>
                ) : null}
                {renderEliminarBtn(t)}
              </div>
            </div>
          </footer>
        </div>

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
        <h2 id="te-torneos-heading" className="te-torneos-section__title rv-section-title">
          {listMode ? "Tus Torneos Express" : "Tus torneos"}
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
          <p>Aún no tienes Torneos Express.</p>
          <p>Crea uno con «Crear torneo» para comenzar.</p>
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

      {!cargandoTorneos && hayMas && !showAll && !listMode && (
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

      {deleteTarget ? (
        <TorneoExpressDeleteModal
          torneoNombre={deleteTarget.nombre}
          deleting={deleting}
          onCancel={() => !deleting && setDeleteTarget(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}

      <TorneoExpressBracketModal
        torneoId={bracketTorneo?.id ?? ""}
        torneoNombre={bracketTorneo?.nombre ?? ""}
        open={Boolean(bracketTorneo)}
        onClose={() => setBracketTorneo(null)}
        onConfirmed={() => {
          setBracketTorneo(null);
          void cargar();
        }}
      />
    </section>
  );
};
