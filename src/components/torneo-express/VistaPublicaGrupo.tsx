import React, { useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import { copyToClipboard, publicGrupoUrl } from "../../services/torneoExpressService";
import { PublicPartidosByRoundSection } from "./public/PublicPartidosByRoundSection";
import { PublicStandingsSection } from "./public/PublicStandingsSection";
import { PublicTorneoExpressHeader } from "./public/PublicTorneoExpressHeader";
import { PublicTorneoExpressShell } from "./public/PublicTorneoExpressShell";

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
    setCopyMsg(ok ? "Enlace copiado" : "No se pudo copiar");
    setTimeout(() => setCopyMsg(""), 2500);
  };

  if (loading && !bundle) {
    return (
      <PublicTorneoExpressShell>
        <div className="te-public-loading">
          <div className="te-public-loading__pulse" aria-hidden />
          <p>Cargando torneo…</p>
        </div>
      </PublicTorneoExpressShell>
    );
  }

  if (!bundle || !grupo) {
    return (
      <PublicTorneoExpressShell>
        <p className="te-public-error">{error ?? "Grupo no encontrado"}</p>
      </PublicTorneoExpressShell>
    );
  }

  return (
    <PublicTorneoExpressShell>
      <PublicTorneoExpressHeader
        torneoNombre={bundle.torneo.nombre}
        grupoLabel={grupo.nombre}
        onCopyLink={copyLink}
        copyMsg={copyMsg || undefined}
      />

      <PublicStandingsSection rows={standingsByGrupo[grupoId] ?? []} />

      <PublicPartidosByRoundSection
        partidos={bundle.partidosPorGrupo[grupo.id] ?? []}
        parejas={bundle.parejasPorGrupo[grupo.id] ?? []}
        grupoLabel={grupo.nombre}
        title="Partidos por ronda"
      />
    </PublicTorneoExpressShell>
  );
};
