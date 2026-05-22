import React, { useMemo, useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import {
  copyToClipboard,
  publicGruposUrl,
} from "../../services/torneoExpressService";
import { PublicStandingsSection } from "./public/PublicStandingsSection";
import { PublicStandingsScoringHelp } from "./public/PublicStandingsScoringHelp";
import { PublicTorneoExpressHeader } from "./public/PublicTorneoExpressHeader";
import { PublicTorneoExpressShell } from "./public/PublicTorneoExpressShell";

export const VistaPublicaGrupos: React.FC<{ torneoId: string }> = ({
  torneoId,
}) => {
  const { bundle, loading, error, standingsByGrupo } = useTorneoExpress(torneoId, {
    publicMode: true,
    realtime: true,
  });
  const [copyMsg, setCopyMsg] = useState("");

  const gruposOrdenados = useMemo(
    () =>
      bundle?.grupos
        ? [...bundle.grupos].sort((a, b) => a.orden - b.orden)
        : [],
    [bundle]
  );

  const copyLink = async () => {
    const ok = await copyToClipboard(publicGruposUrl(torneoId));
    setCopyMsg(ok ? "Enlace copiado" : "No se pudo copiar");
    setTimeout(() => setCopyMsg(""), 2500);
  };

  if (loading && !bundle) {
    return (
      <PublicTorneoExpressShell>
        <div className="te-public-loading">
          <div className="te-public-loading__pulse" aria-hidden />
          <p>Cargando tablas por grupo…</p>
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
        subtitle="Clasificación por grupo"
        onCopyLink={copyLink}
        copyMsg={copyMsg || undefined}
      />

      {gruposOrdenados.length > 0 && (
        <div className="te-public-grupos-help te-pub-fade-in">
          <PublicStandingsScoringHelp />
        </div>
      )}

      <div className="te-public-grupos-stack">
        {gruposOrdenados.length === 0 ? (
          <p className="te-public-empty">Sin grupos en este torneo.</p>
        ) : (
          gruposOrdenados.map((grupo) => (
            <PublicStandingsSection
              key={grupo.id}
              rows={standingsByGrupo[grupo.id] ?? []}
              title={grupo.nombre}
              showScoringHelp={false}
            />
          ))
        )}
      </div>
    </PublicTorneoExpressShell>
  );
};
