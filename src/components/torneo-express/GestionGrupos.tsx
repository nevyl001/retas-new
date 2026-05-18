import React, { useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import {
  copyToClipboard,
  publicGeneralUrl,
  publicGrupoUrl,
} from "../../services/torneoExpressService";
import { GrupoBadge } from "./GrupoBadge";
import { PartidosGrupo } from "./PartidosGrupo";
import { TablaGrupo } from "./TablaGrupo";
import {
  navigateTorneoExpress,
  setTorneoExpressGeneralBack,
} from "./torneoExpressNav";
import { torneoExpressEstadoLabel } from "../../lib/torneoExpress/labels";
import "./torneo-express.css";

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
    saveCancha,
    savingCanchaId,
  } = useTorneoExpress(torneoId, { publicMode: false, realtime: true });

  const [activeGrupoId, setActiveGrupoId] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState("");

  const grupoId =
    activeGrupoId ?? bundle?.grupos[0]?.id ?? null;
  const grupo = bundle?.grupos.find((g) => g.id === grupoId);

  const copyLink = async (url: string) => {
    const ok = await copyToClipboard(url);
    setCopyMsg(ok ? "Enlace copiado" : "No se pudo copiar");
    setTimeout(() => setCopyMsg(""), 2000);
  };

  if (loading && !bundle) {
    return (
      <div className="torneo-express-page">
        <p>Cargando torneo…</p>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="torneo-express-page">
        <p className="te-error">
          {error ?? "Torneo no encontrado. ¿Ejecutaste la migración SQL en Supabase?"}
        </p>
        <button
          type="button"
          className="torneo-express-btn"
          onClick={() => navigateTorneoExpress("/torneo-express")}
        >
          Volver al listado
        </button>
      </div>
    );
  }

  return (
    <div className="torneo-express-page">
      <header className="te-header">
        <div>
          <h1 className="te-title">{bundle.torneo.nombre}</h1>
          <p className="te-subtitle te-subtitle--meta">
            <span className="te-subtitle__product">Torneo Express</span>
            <span
              className={`te-estado te-estado--${bundle.torneo.estado}`}
            >
              {torneoExpressEstadoLabel(bundle.torneo.estado)}
            </span>
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="torneo-express-btn"
            onClick={() => {
              setTorneoExpressGeneralBack(
                torneoId,
                `/torneo-express/${torneoId}/gestionar`
              );
              navigateTorneoExpress(`/torneo-express/${torneoId}/general`);
            }}
          >
            Ver tabla general
          </button>
          <button
            type="button"
            className="torneo-express-btn"
            onClick={() => navigateTorneoExpress("/torneo-express")}
          >
            Listado
          </button>
        </div>
      </header>

      {error && <p className="te-error">{error}</p>}

      <div className="torneo-express-card">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "var(--te-gold)" }}>
          Enlaces públicos
        </h2>
        <div className="te-links-row">
          <button
            type="button"
            className="torneo-express-btn torneo-express-btn--primary"
            onClick={() => copyLink(publicGeneralUrl(torneoId))}
          >
            Copiar enlace tabla general
          </button>
          {grupo && (
            <button
              type="button"
              className="torneo-express-btn"
              onClick={() => copyLink(publicGrupoUrl(torneoId, grupo.id))}
            >
              Copiar enlace grupo activo
            </button>
          )}
        </div>
        {copyMsg && <span className="te-copy-ok">{copyMsg}</span>}
      </div>

      <div className="torneo-express-card te-grupos-card">
        <h2 className="te-grupos-card__title">Grupos</h2>
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
              className={`torneo-express-btn te-grupos-tab${
                g.id === grupoId
                  ? " torneo-express-btn--primary te-grupos-tab--active"
                  : ""
              }`}
              onClick={() => setActiveGrupoId(g.id)}
            >
              <GrupoBadge nombre={g.nombre} orden={g.orden} />
            </button>
          ))}
        </div>

        {grupo && (
          <div className="te-grupos-card__body">
            <h3 className="te-grupos-card__active-name">{grupo.nombre}</h3>
            <TablaGrupo rows={standingsByGrupo[grupo.id] ?? []} />
            <h3 className="te-grupos-card__partidos-title">Partidos</h3>
            {(!partidosOrdenDisponible || !partidosCanchaDisponible) && (
              <div className="te-partidos-migration-hint" role="alert">
                <p>
                  Faltan columnas en Supabase para{" "}
                  {!partidosOrdenDisponible && (
                    <>
                      <code>orden</code>
                      {!partidosCanchaDisponible ? " y " : ""}
                    </>
                  )}
                  {!partidosCanchaDisponible && <code>cancha</code>}.
                </p>
                <p className="te-partidos-migration-hint__sql">
                  SQL Editor → ejecuta{" "}
                  <strong>supabase/torneo-express-partidos-orden.sql</strong> y
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
              savingPartidoId={savingPartidoId}
              savingCanchaId={savingCanchaId}
              savingOrden={savingOrden}
              onSaveResultado={saveResultado}
              onSaveCancha={partidosCanchaDisponible ? saveCancha : undefined}
              onSaveOrden={partidosOrdenDisponible ? saveOrden : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
};
