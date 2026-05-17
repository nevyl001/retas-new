import React, { useState } from "react";
import { useUser } from "../../contexts/UserContext";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import { copyToClipboard, publicGeneralUrl } from "../../services/torneoExpressService";
import { TablaGeneral } from "./TablaGeneral";
import {
  getTorneoExpressGeneralBack,
  navigateTorneoExpress,
} from "./torneoExpressNav";
import "./torneo-express.css";

export const VistaPublicaGeneral: React.FC<{ torneoId: string }> = ({ torneoId }) => {
  const { user } = useUser();
  const { bundle, loading, error, standingsGeneral } = useTorneoExpress(torneoId, {
    publicMode: true,
    realtime: true,
  });
  const [copyMsg, setCopyMsg] = useState("");

  const goBack = () => {
    navigateTorneoExpress(getTorneoExpressGeneralBack(torneoId));
  };

  const copyLink = async () => {
    const ok = await copyToClipboard(publicGeneralUrl(torneoId));
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

  if (!bundle) {
    return (
      <div className="torneo-express-page">
        <p className="te-error">{error ?? "Torneo no encontrado"}</p>
      </div>
    );
  }

  return (
    <div className="torneo-express-page App--public-full-width">
      <header className="te-header">
        <div>
          <h1 className="te-title">{bundle.torneo.nombre}</h1>
          <p className="te-subtitle">Tabla general · todos los grupos</p>
        </div>
        <div
          className="te-header__actions"
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
        >
          {user && (
            <button
              type="button"
              className="torneo-express-btn"
              onClick={goBack}
            >
              ← Regresar
            </button>
          )}
          <button type="button" className="torneo-express-btn" onClick={copyLink}>
            Copiar enlace
          </button>
        </div>
      </header>
      {copyMsg && <span className="te-copy-ok">{copyMsg}</span>}

      <div className="torneo-express-card">
        <TablaGeneral rows={standingsGeneral} />
      </div>
    </div>
  );
};
