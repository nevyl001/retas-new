import React, { useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import { copyToClipboard, publicGrupoUrl } from "../../services/torneoExpressService";
import { GrupoBadge } from "./GrupoBadge";
import { PartidosGrupo } from "./PartidosGrupo";
import { TablaGrupo } from "./TablaGrupo";
import "./torneo-express.css";

export const VistaPublicaGrupo: React.FC<{
  torneoId: string;
  grupoId: string;
}> = ({ torneoId, grupoId }) => {
  const { bundle, loading, error, standingsByGrupo } = useTorneoExpress(torneoId, {
    publicMode: true,
    realtime: true,
  });
  const [copyMsg, setCopyMsg] = useState("");

  const grupo = bundle?.grupos.find((g) => g.id === grupoId);

  const copyLink = async () => {
    const ok = await copyToClipboard(publicGrupoUrl(torneoId, grupoId));
    setCopyMsg(ok ? "Copiado" : "Error");
    setTimeout(() => setCopyMsg(""), 2000);
  };

  if (loading && !bundle) {
    return (
      <div className="torneo-express-page">
        <p>Cargando…</p>
      </div>
    );
  }

  if (!bundle || !grupo) {
    return (
      <div className="torneo-express-page">
        <p className="te-error">{error ?? "Grupo no encontrado"}</p>
      </div>
    );
  }

  return (
    <div className="torneo-express-page App--public-full-width">
      <header className="te-header">
        <div>
          <h1 className="te-title">{bundle.torneo.nombre}</h1>
          <p className="te-subtitle">
            <GrupoBadge nombre={grupo.nombre} orden={grupo.orden} />
          </p>
        </div>
        <button type="button" className="torneo-express-btn" onClick={copyLink}>
          Copiar enlace
        </button>
      </header>
      {copyMsg && <span className="te-copy-ok">{copyMsg}</span>}

      <div className="torneo-express-card">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "var(--te-gold)" }}>
          Clasificación
        </h2>
        <TablaGrupo rows={standingsByGrupo[grupoId] ?? []} />
      </div>

      <div className="torneo-express-card">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Partidos</h2>
        <PartidosGrupo
          partidos={bundle.partidosPorGrupo[grupoId] ?? []}
          parejas={bundle.parejasPorGrupo[grupoId] ?? []}
        />
      </div>
    </div>
  );
};
