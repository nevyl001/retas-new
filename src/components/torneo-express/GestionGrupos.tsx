import React, { useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import {
  copyToClipboard,
  publicGeneralUrl,
  publicGrupoUrl,
  publicGruposUrl,
} from "../../services/torneoExpressService";
import { formatTorneoExpressCategoria } from "../../lib/torneoExpress/formatCategoria";
import { torneoExpressEstadoLabel } from "../../lib/torneoExpress/labels";
import { GrupoBadge } from "./GrupoBadge";
import { PartidosGrupo } from "./PartidosGrupo";
import { TablaGrupo } from "./TablaGrupo";
import { TePageShell } from "./TePageShell";
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
  } = useTorneoExpress(torneoId, { publicMode: false, realtime: true });

  const [activeGrupoId, setActiveGrupoId] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState("");

  const grupoId = activeGrupoId ?? bundle?.grupos[0]?.id ?? null;
  const grupo = bundle?.grupos.find((g) => g.id === grupoId);

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
            <Badge
              variant={torneoEstadoBadgeVariant(bundle.torneo.estado)}
              className="te-gestion-estado-pill"
            >
              {torneoExpressEstadoLabel(bundle.torneo.estado)}
            </Badge>
          </div>
        </div>
        <div className="te-header__actions te-gestion-header__actions">
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
        {grupo ? (
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
                editable
                allowReorder={partidosOrdenDisponible}
                canchaEditable={partidosCanchaDisponible}
                horarioEditable={partidosProgramadoDisponible}
                savingPartidoId={savingPartidoId}
                savingCanchaId={savingCanchaId}
                savingProgramadoId={savingProgramadoId}
                savingOrden={savingOrden}
                onSaveResultado={saveResultado}
                onSaveCancha={partidosCanchaDisponible ? saveCancha : undefined}
                onSaveProgramado={
                  partidosProgramadoDisponible ? saveProgramado : undefined
                }
                onSaveOrden={partidosOrdenDisponible ? saveOrden : undefined}
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
    </TePageShell>
  );
};
