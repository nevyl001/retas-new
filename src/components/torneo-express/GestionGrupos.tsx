import React, { useEffect, useMemo, useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import { eliminatoriaUltimaRondaCompleta, eliminatoriaBracketSize } from "../../lib/torneoExpress/bracketRounds";
import {
  copyToClipboard,
  publicEliminatoriaUrl,
  publicGeneralUrl,
  publicGrupoUrl,
  publicGruposUrl,
} from "../../services/torneoExpressService";
import { formatTorneoExpressCategoria } from "../../lib/torneoExpress/formatCategoria";
import {
  torneoExpressEstadoLabel,
  torneoExpressFaseLabel,
} from "../../lib/torneoExpress/labels";
import { GrupoBadge } from "./GrupoBadge";
import { GestionEliminatoria } from "./GestionEliminatoria";
import { PartidosGrupo } from "./PartidosGrupo";
import { TablaGrupo } from "./TablaGrupo";
import { TePageShell } from "./TePageShell";
import { TorneoExpressBracketModal } from "./TorneoExpressBracketModal";
import { TorneoExpressResetEliminatoriaModal } from "./TorneoExpressResetEliminatoriaModal";
import { torneoEstadoBadgeVariant } from "./teEstadoBadge";
import {
  navigateTorneoExpress,
  setTorneoExpressGeneralBack,
} from "./torneoExpressNav";
import { Badge, Button } from "../ui";
import "./te-gestion-page.css";

export const GestionGrupos: React.FC<{ torneoId: string }> = ({ torneoId }) => {
  const {
    bundle,
    loading,
    error,
    reload,
    standingsByGrupo,
    saveResultado,
    saveOrden,
    savingPartidoId,
    savingOrden,
    partidosOrdenDisponible,
    partidosCanchaDisponible,
    partidosProgramadoDisponible,
    saveCancha,
    saveProgramado,
    savingCanchaId,
    savingProgramadoId,
    eliminatoriaLabelMap,
    saveEliminatoriaResultado,
    saveEliminatoriaCancha,
    saveEliminatoriaProgramado,
    savingEliminatoriaId,
    savingEliminatoriaCanchaId,
    savingEliminatoriaProgramadoId,
    finalizarTorneoEliminatoria,
    reabrirTorneoEliminatoria,
    resetEliminatoriaTorneo,
    finalizandoTorneo,
    reabriendoTorneo,
    reiniciandoEliminatoria,
  } = useTorneoExpress(torneoId, { publicMode: false, realtime: true });

  const [activeGrupoId, setActiveGrupoId] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState("");
  const [bracketOpen, setBracketOpen] = useState(false);
  const [resetElimOpen, setResetElimOpen] = useState(false);
  const [vista, setVista] = useState<"grupos" | "eliminatoria">("grupos");
  const [confirmFinalizar, setConfirmFinalizar] = useState(false);
  const [actionToast, setActionToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const faseTorneo = bundle?.torneo.fase_torneo ?? "grupos";
  const enEliminatoria =
    faseTorneo === "eliminatoria" || faseTorneo === "cerrado";

  const grupoId = activeGrupoId ?? bundle?.grupos[0]?.id ?? null;
  const grupo = bundle?.grupos.find((g) => g.id === grupoId);

  useEffect(() => {
    if (
      bundle?.torneo.fase_torneo === "eliminatoria" ||
      bundle?.torneo.fase_torneo === "cerrado"
    ) {
      setVista("eliminatoria");
    }
  }, [bundle?.torneo.fase_torneo, bundle?.torneo.id]);

  const fasePill = useMemo(
    () => torneoExpressFaseLabel(faseTorneo),
    [faseTorneo]
  );

  const puedeFinalizarTorneo = useMemo(() => {
    if (!bundle || faseTorneo !== "eliminatoria") return false;
    const fase = bundle.torneo.fase_eliminacion;
    if (!fase) return false;
    return eliminatoriaUltimaRondaCompleta(
      bundle.eliminatoriaPartidos,
      fase,
      eliminatoriaBracketSize(fase, bundle.torneo.bracket_slots)
    );
  }, [bundle, faseTorneo]);

  const puedeReanudarEliminatoria = useMemo(() => {
    if (!bundle?.torneo.fase_eliminacion) return false;
    const fase = bundle.torneo.fase_eliminacion;
    const cerradoOFinalizado =
      faseTorneo === "cerrado" || bundle.torneo.estado === "finalizado";
    if (!cerradoOFinalizado) return false;
    return !eliminatoriaUltimaRondaCompleta(
      bundle.eliminatoriaPartidos,
      fase,
      eliminatoriaBracketSize(fase, bundle.torneo.bracket_slots)
    );
  }, [bundle, faseTorneo]);

  const puedeReiniciarEliminatoria =
    faseTorneo === "eliminatoria" && bundle?.torneo.estado !== "finalizado";

  const showActionToast = (
    message: string,
    type: "success" | "error"
  ) => {
    setActionToast({ message, type });
    window.setTimeout(() => setActionToast(null), 4500);
  };

  const copyLink = async (url: string) => {
    const ok = await copyToClipboard(url);
    setCopyMsg(ok ? "Enlace copiado" : "No se pudo copiar");
    setTimeout(() => setCopyMsg(""), 2000);
  };

  if (loading && !bundle) {
    return (
      <TePageShell className="te-gestion-page">
        <p>Cargando torneo…</p>
      </TePageShell>
    );
  }

  if (!bundle) {
    return (
      <TePageShell className="te-gestion-page">
        <p className="te-error">
          {error ?? "Torneo no encontrado. ¿Ejecutaste la migración SQL en Supabase?"}
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigateTorneoExpress("/torneo-express")}
        >
          Volver al listado
        </Button>
      </TePageShell>
    );
  }

  const mostrarEliminatoria = enEliminatoria && vista === "eliminatoria";

  return (
    <TePageShell className="te-gestion-page">
      <header className="te-header te-gestion-header">
        <div className="te-gestion-header__brand">
          <h1 className="te-title te-gestion-title">{bundle.torneo.nombre}</h1>
          <div className="te-gestion-header__pills">
            {formatTorneoExpressCategoria(bundle.torneo.categoria) ? (
              <span className="te-categoria-pill te-categoria-pill--neutral">
                {formatTorneoExpressCategoria(bundle.torneo.categoria)}
              </span>
            ) : null}
            {fasePill ? (
              <Badge variant="scheduled" className="te-gestion-fase-pill">
                {fasePill}
              </Badge>
            ) : null}
            <Badge
              variant={torneoEstadoBadgeVariant(bundle.torneo.estado)}
              className="te-gestion-estado-pill"
            >
              {torneoExpressEstadoLabel(bundle.torneo.estado)}
            </Badge>
          </div>
        </div>
        <div className="te-header__actions te-gestion-header__actions">
          {faseTorneo === "grupos" && bundle.torneo.estado !== "finalizado" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="te-btn-finalizar-fase"
              onClick={() => setBracketOpen(true)}
            >
              Finalizar fase
            </Button>
          ) : null}
          {puedeReanudarEliminatoria ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="te-btn-finalizar-fase"
              loading={reabriendoTorneo}
              disabled={reabriendoTorneo}
              onClick={() => {
                void reabrirTorneoEliminatoria();
              }}
            >
              Reanudar eliminatoria
            </Button>
          ) : null}
          {puedeReiniciarEliminatoria ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="te-btn-finalizar-fase"
              disabled={reiniciandoEliminatoria}
              onClick={() => setResetElimOpen(true)}
            >
              <span className="te-btn-icon" aria-hidden>
                ↻
              </span>
              Reiniciar eliminatoria
            </Button>
          ) : null}
          {puedeFinalizarTorneo ? (
            confirmFinalizar ? (
              <div className="te-gestion-finalizar-confirm">
                <p className="te-gestion-finalizar-confirm__text">
                  ¿Confirmas que el torneo ha terminado? Esta acción no se puede
                  deshacer.
                </p>
                <div className="te-gestion-finalizar-confirm__actions">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    loading={finalizandoTorneo}
                    disabled={finalizandoTorneo}
                    onClick={() => {
                      void finalizarTorneoEliminatoria().finally(() =>
                        setConfirmFinalizar(false)
                      );
                    }}
                  >
                    Sí, finalizar torneo
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={finalizandoTorneo}
                    onClick={() => setConfirmFinalizar(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="te-btn-finalizar-fase"
                onClick={() => setConfirmFinalizar(true)}
              >
                Finalizar torneo
              </Button>
            )
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setTorneoExpressGeneralBack(
                torneoId,
                `/torneo-express/${torneoId}/gestionar`
              );
              navigateTorneoExpress(`/torneo-express/${torneoId}/general`);
            }}
          >
            <span className="te-btn-icon" aria-hidden>
              ⊞
            </span>
            Ver tabla general
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigateTorneoExpress("/torneo-express")}
          >
            <span className="te-btn-icon" aria-hidden>
              ≡
            </span>
            Listado
          </Button>
        </div>
      </header>

      <div
        className="te-public-links-compact"
        role="group"
        aria-label="Enlaces públicos"
      >
        {enEliminatoria ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="te-public-link-btn"
            onClick={() => copyLink(publicEliminatoriaUrl(torneoId))}
          >
            <span className="te-btn-icon" aria-hidden>
              ⎘
            </span>
            Cuadro eliminatorio
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="te-public-link-btn"
          onClick={() => copyLink(publicGruposUrl(torneoId))}
        >
          <span className="te-btn-icon" aria-hidden>
            ⎘
          </span>
          Tablas por grupo
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="te-public-link-btn"
          onClick={() => copyLink(publicGeneralUrl(torneoId))}
        >
          <span className="te-btn-icon" aria-hidden>
            ⎘
          </span>
          Tabla general
        </Button>
        {grupo && !mostrarEliminatoria ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="te-public-link-btn"
            onClick={() => copyLink(publicGrupoUrl(torneoId, grupo.id))}
          >
            <span className="te-btn-icon" aria-hidden>
              ⎘
            </span>
            Grupo activo
          </Button>
        ) : null}
        {copyMsg ? <span className="te-copy-ok">{copyMsg}</span> : null}
      </div>

      {error && <p className="te-error">{error}</p>}

      {actionToast ? (
        <div
          className={`te-gestion-toast te-gestion-toast--${actionToast.type}`}
          role="status"
          aria-live="polite"
        >
          {actionToast.message}
        </div>
      ) : null}

      {enEliminatoria ? (
        <div
          className="te-grupos-card__tabs te-gestion-vista-tabs"
          role="tablist"
          aria-label="Vista del torneo"
        >
          <button
            type="button"
            role="tab"
            aria-selected={vista === "grupos"}
            className={`te-grupos-tab${
              vista === "grupos" ? " te-grupos-tab--active" : ""
            }`}
            onClick={() => setVista("grupos")}
          >
            Fase de grupos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={vista === "eliminatoria"}
            className={`te-grupos-tab${
              vista === "eliminatoria" ? " te-grupos-tab--active" : ""
            }`}
            onClick={() => setVista("eliminatoria")}
          >
            Eliminatoria
          </button>
        </div>
      ) : null}

      {mostrarEliminatoria ? (
        <GestionEliminatoria
          bundle={bundle}
          labelMap={eliminatoriaLabelMap}
          editable={faseTorneo === "eliminatoria" || faseTorneo === "cerrado"}
          savingEliminatoriaId={savingEliminatoriaId}
          savingEliminatoriaCanchaId={savingEliminatoriaCanchaId}
          savingEliminatoriaProgramadoId={savingEliminatoriaProgramadoId}
          onSaveResultado={saveEliminatoriaResultado}
          onSaveCancha={saveEliminatoriaCancha}
          onSaveProgramado={saveEliminatoriaProgramado}
        />
      ) : (
        <div className="torneo-express-card te-grupos-card te-gestion-card">
          <h2 className="te-grupos-card__title te-label-section">Grupos</h2>
          <div
            className="te-grupos-card__tabs"
            role="tablist"
            aria-label="Seleccionar grupo"
          >
            {bundle.grupos.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={g.id === grupoId}
                className={`te-grupos-tab${
                  g.id === grupoId ? " te-grupos-tab--active" : ""
                }`}
                onClick={() => setActiveGrupoId(g.id)}
              >
                <GrupoBadge nombre={g.nombre} orden={g.orden} />
              </button>
            ))}
          </div>

          {grupo && (
            <div className="te-grupos-card__body te-gestion-layout">
              <section className="te-gestion-layout__partidos">
                <h3 className="te-grupos-card__active-name te-label-section">
                  {grupo.nombre}
                </h3>

                <h3 className="te-grupos-card__partidos-title te-label-section">
                  Partidos
                </h3>
                <p className="te-grupos-card__partidos-hint">
                  Captura resultados, horarios y canchas de cada juego.
                </p>
                {(!partidosOrdenDisponible ||
                  !partidosCanchaDisponible ||
                  !partidosProgramadoDisponible) && (
                  <div className="te-partidos-migration-hint" role="alert">
                    <p>
                      Faltan columnas en Supabase para{" "}
                      {[
                        !partidosOrdenDisponible && "orden",
                        !partidosCanchaDisponible && "cancha",
                        !partidosProgramadoDisponible && "programado_en",
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      .
                    </p>
                    <p className="te-partidos-migration-hint__sql">
                      SQL Editor → ejecuta{" "}
                      <strong>supabase/torneo-express-partidos-orden.sql</strong>{" "}
                      o <strong>torneo-express-partidos-programado.sql</strong> y
                      recarga.
                    </p>
                  </div>
                )}
                <PartidosGrupo
                  partidos={bundle.partidosPorGrupo[grupo.id] ?? []}
                  parejas={bundle.parejasPorGrupo[grupo.id] ?? []}
                  editable={faseTorneo === "grupos"}
                  allowReorder={partidosOrdenDisponible}
                  canchaEditable={partidosCanchaDisponible}
                  horarioEditable={partidosProgramadoDisponible}
                  savingPartidoId={savingPartidoId}
                  savingCanchaId={savingCanchaId}
                  savingProgramadoId={savingProgramadoId}
                  savingOrden={savingOrden}
                  onSaveResultado={
                    faseTorneo === "grupos" ? saveResultado : undefined
                  }
                  onSaveCancha={
                    faseTorneo === "grupos" && partidosCanchaDisponible
                      ? saveCancha
                      : undefined
                  }
                  onSaveProgramado={
                    faseTorneo === "grupos" && partidosProgramadoDisponible
                      ? saveProgramado
                      : undefined
                  }
                  onSaveOrden={
                    faseTorneo === "grupos" && partidosOrdenDisponible
                      ? saveOrden
                      : undefined
                  }
                />
              </section>

              <aside className="te-gestion-layout__aside">
                <h3 className="te-grupos-card__standings-title te-label-section">
                  Clasificación
                </h3>
                <p className="te-grupos-card__standings-hint">
                  Se actualiza sola al guardar resultados en los partidos.
                </p>
                <TablaGrupo
                  rows={standingsByGrupo[grupo.id] ?? []}
                  scoringHelpVariant="express"
                />
              </aside>
            </div>
          )}
        </div>
      )}

      <TorneoExpressResetEliminatoriaModal
        open={resetElimOpen}
        resetting={reiniciandoEliminatoria}
        onCancel={() => setResetElimOpen(false)}
        onConfirm={() => {
          void resetEliminatoriaTorneo()
            .then(() => {
              setResetElimOpen(false);
              setVista("grupos");
              setConfirmFinalizar(false);
              setBracketOpen(true);
              showActionToast(
                "Eliminatoria reiniciada. Puedes configurarla de nuevo.",
                "success"
              );
            })
            .catch(() => {
              showActionToast(
                "Error al reiniciar. Intenta de nuevo.",
                "error"
              );
            });
        }}
      />

      <TorneoExpressBracketModal
        torneoId={torneoId}
        torneoNombre={bundle.torneo.nombre}
        open={bracketOpen}
        onClose={() => setBracketOpen(false)}
        onConfirmed={() => {
          setBracketOpen(false);
          setVista("eliminatoria");
          void reload();
        }}
      />
    </TePageShell>
  );
};
