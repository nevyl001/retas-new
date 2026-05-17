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
    savingPartidoId,
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

      <div className="torneo-express-card">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Grupos</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
          {bundle.grupos.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`torneo-express-btn${g.id === grupoId ? " torneo-express-btn--primary" : ""}`}
              onClick={() => setActiveGrupoId(g.id)}
            >
              <GrupoBadge nombre={g.nombre} orden={g.orden} />
            </button>
          ))}
        </div>

        {grupo && (
          <>
            <h3 style={{ fontSize: "1rem", color: "var(--te-gold)" }}>{grupo.nombre}</h3>
            <TablaGrupo rows={standingsByGrupo[grupo.id] ?? []} />
            <h3 style={{ marginTop: "1.25rem", fontSize: "1rem" }}>Partidos</h3>
            <PartidosGrupo
              partidos={bundle.partidosPorGrupo[grupo.id] ?? []}
              parejas={bundle.parejasPorGrupo[grupo.id] ?? []}
              editable
              savingPartidoId={savingPartidoId}
              onSaveResultado={saveResultado}
            />
          </>
        )}
      </div>
    </div>
  );
};
