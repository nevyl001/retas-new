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
      <TePageShell>
        <p>Cargando torneo…</p>
      </TePageShell>
    );
  }

  if (!bundle) {
    return (
      <TePageShell>
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
    <TePageShell>
      <header className="te-header">
        <div>
          <h1 className="te-title">{bundle.torneo.nombre}</h1>
          <p className="te-subtitle te-subtitle--meta">
            {formatTorneoExpressCategoria(bundle.torneo.categoria) && (
              <span className="te-categoria-pill">
                {formatTorneoExpressCategoria(bundle.torneo.categoria)}
              </span>
            )}
            <Badge variant={torneoEstadoBadgeVariant(bundle.torneo.estado)}>
              {torneoExpressEstadoLabel(bundle.torneo.estado)}
            </Badge>
          </p>
        </div>
        <div className="te-header__actions">
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
            Ver tabla general
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigateTorneoExpress("/torneo-express")}
          >
            Listado
          </Button>
        </div>
      </header>

      {error && <p className="te-error">{error}</p>}

      <div className="torneo-express-card te-public-links-card">
        <h2 className="te-public-links-card__title">Enlaces públicos</h2>
        <p className="te-public-links-card__hint">
          Comparte la clasificación de cada grupo en una sola página, la tabla
          general combinada, o el grupo que estés gestionando.
        </p>
        <div className="te-links-row">
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="te-links-row__btn"
            onClick={() => copyLink(publicGruposUrl(torneoId))}
          >
            Copiar enlace tablas por grupo
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="te-links-row__btn"
            onClick={() => copyLink(publicGeneralUrl(torneoId))}
          >
            Copiar enlace tabla general
          </Button>
          {grupo && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="te-links-row__btn"
              onClick={() => copyLink(publicGrupoUrl(torneoId, grupo.id))}
            >
              Copiar enlace grupo activo
            </Button>
          )}
        </div>
        {copyMsg && <span className="te-copy-ok">{copyMsg}</span>}
      </div>

      <div className="torneo-express-card te-grupos-card">
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
          <div className="te-grupos-card__body">
            <h3 className="te-grupos-card__active-name te-label-section">
              {grupo.nombre}
            </h3>
            <TablaGrupo rows={standingsByGrupo[grupo.id] ?? []} />
            <h3 className="te-grupos-card__partidos-title te-label-section">
              Partidos
            </h3>
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
                  <strong>supabase/torneo-express-partidos-orden.sql</strong> o{" "}
                  <strong>torneo-express-partidos-programado.sql</strong> y
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
          </div>
        )}
      </div>
    </TePageShell>
  );
};
