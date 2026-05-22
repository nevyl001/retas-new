import React, { useState } from "react";
import { useUser } from "../../contexts/UserContext";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import { copyToClipboard, publicGeneralUrl } from "../../services/torneoExpressService";
import { PublicStandingsSection } from "./public/PublicStandingsSection";
import { PublicTorneoExpressHeader } from "./public/PublicTorneoExpressHeader";
import { PublicTorneoExpressShell } from "./public/PublicTorneoExpressShell";
import { Button } from "../ui";
import {
  getTorneoExpressGeneralBack,
  navigateTorneoExpress,
} from "./torneoExpressNav";

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
    setCopyMsg(ok ? "Enlace copiado" : "No se pudo copiar");
    setTimeout(() => setCopyMsg(""), 2500);
  };

  if (loading && !bundle) {
    return (
      <PublicTorneoExpressShell>
        <div className="te-public-loading">
          <div className="te-public-loading__pulse" aria-hidden />
          <p>Cargando tabla general…</p>
        </div>
      </PublicTorneoExpressShell>
    );
  }

  if (!bundle) {
    return (
      <PublicTorneoExpressShell>
        <p className="te-public-error">{error ?? "Torneo no encontrado"}</p>
      </PublicTorneoExpressShell>
    );
  }

  return (
    <PublicTorneoExpressShell>
      <PublicTorneoExpressHeader
        torneoNombre={bundle.torneo.nombre}
        categoria={bundle.torneo.categoria}
        subtitle="Tabla general · todos los grupos"
        onCopyLink={copyLink}
        copyMsg={copyMsg || undefined}
        extraActions={
          user ? (
            <Button type="button" variant="back" size="sm" onClick={goBack}>
              ← Regresar
            </Button>
          ) : undefined
        }
      />

      <PublicStandingsSection
        rows={standingsGeneral}
        showGrupoColumn
        title="Tabla general"
      />
    </PublicTorneoExpressShell>
  );
};
