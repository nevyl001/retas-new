import React, { useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import {
  copyToClipboard,
  publicEliminatoriaUrl,
} from "../../services/torneoExpressService";
import { buildSharePublicOgUrlFromPlayUrl } from "../../lib/retaAbierta/shareOgUrl";
import { PublicTorneoExpressShell } from "./public/PublicTorneoExpressShell";
import { TEPublicEliminatoria } from "./public/TEPublicEliminatoria";
import { PublicEventNeutralLoading } from "../../club-experience";
import { TE_PUBLIC_POLL_INTERVAL_MS } from "../../lib/torneoExpress/publicPoll";

export const VistaPublicaEliminatoria: React.FC<{ torneoId: string }> = ({
  torneoId,
}) => {
  const {
    bundle,
    loading,
    error,
    lastRefreshedAt,
    realtimeConnected,
    eliminatoriaLabelMap,
  } = useTorneoExpress(torneoId, {
    publicMode: true,
    realtime: true,
    pollIntervalMs: TE_PUBLIC_POLL_INTERVAL_MS,
  });
  const [copyMsg, setCopyMsg] = useState("");

  const copyLink = async () => {
    const play = publicEliminatoriaUrl(torneoId);
    const ok = await copyToClipboard(
      buildSharePublicOgUrlFromPlayUrl(play) || play
    );
    setCopyMsg(ok ? "Enlace copiado" : "No se pudo copiar");
    setTimeout(() => setCopyMsg(""), 2500);
  };

  if (loading && !bundle) {
    return (
      <PublicTorneoExpressShell className="te-public--eliminatoria">
        <PublicEventNeutralLoading
          className="te-pub-elim-loading"
          message="Cargando fase eliminatoria…"
        />
      </PublicTorneoExpressShell>
    );
  }

  const enEliminatoria =
    bundle?.torneo.fase_torneo === "eliminatoria" ||
    bundle?.torneo.fase_torneo === "cerrado";
  const hasElimPartidos = (bundle?.eliminatoriaPartidos.length ?? 0) > 0;

  if (!bundle || !enEliminatoria || !hasElimPartidos) {
    return (
      <PublicTorneoExpressShell className="te-public--eliminatoria">
        <p className="te-public-error">
          {error ??
            "Este torneo aún no tiene fase eliminatoria o no fue encontrado."}
        </p>
        {bundle ? (
          <p className="te-public-error">
            <a href={`/torneo-express/${torneoId}/grupos`}>
              Ver grupos y resultados
            </a>
          </p>
        ) : null}
      </PublicTorneoExpressShell>
    );
  }

  return (
    <PublicTorneoExpressShell
      className="te-public--eliminatoria"
      organizadorId={bundle.torneo.organizador_id}
    >
      <TEPublicEliminatoria
        bundle={bundle}
        labelMap={eliminatoriaLabelMap}
        lastRefreshedAt={lastRefreshedAt}
        realtimeConnected={realtimeConnected}
        onCopyLink={copyLink}
        copyMsg={copyMsg || undefined}
        gruposHref={`/torneo-express/${torneoId}/grupos`}
      />
    </PublicTorneoExpressShell>
  );
};
