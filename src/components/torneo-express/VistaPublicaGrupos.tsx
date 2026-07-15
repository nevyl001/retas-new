import React, { useMemo, useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import { hasCategoriaEliminatoria } from "../../lib/torneoExpress/categoriaPublicPhase";
import {
  copyToClipboard,
  publicGruposUrl,
} from "../../services/torneoExpressService";
import {
  buildTEPublicGruposProps,
  TEPublicGrupos,
} from "./public/TEPublicGrupos";
import { PublicTorneoExpressShell } from "./public/PublicTorneoExpressShell";
import { PublicTorneoExpressSyncFooter } from "./public/PublicTorneoExpressSyncFooter";
import { TE_PUBLIC_POLL_INTERVAL_MS } from "../../lib/torneoExpress/publicPoll";

export const VistaPublicaGrupos: React.FC<{ torneoId: string }> = ({
  torneoId,
}) => {
  const { bundle, loading, error, standingsByGrupo, lastRefreshedAt, realtimeConnected } =
    useTorneoExpress(torneoId, {
      publicMode: true,
      realtime: true,
      pollIntervalMs: TE_PUBLIC_POLL_INTERVAL_MS,
    });
  const [copyMsg, setCopyMsg] = useState("");

  const gruposProps = useMemo(
    () =>
      bundle
        ? buildTEPublicGruposProps(bundle, standingsByGrupo)
        : null,
    [bundle, standingsByGrupo]
  );

  const faseFinalHref = useMemo(() => {
    if (!bundle) return undefined;
    const hasElim = hasCategoriaEliminatoria(
      bundle.torneo.fase_torneo,
      bundle.eliminatoriaPartidos.length
    );
    return hasElim ? `/torneo-express/${torneoId}/eliminatoria` : undefined;
  }, [bundle, torneoId]);

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
          <p>Cargando fase de grupos…</p>
        </div>
      </PublicTorneoExpressShell>
    );
  }

  if (!bundle || !gruposProps) {
    return (
      <PublicTorneoExpressShell>
        <p className="te-public-error">{error ?? "Torneo no encontrado"}</p>
      </PublicTorneoExpressShell>
    );
  }

  return (
    <PublicTorneoExpressShell
      className="te-public--grupos-wide"
      organizadorId={bundle.torneo.organizador_id}
    >
      <TEPublicGrupos
        {...gruposProps}
        onCopyLink={copyLink}
        copyMsg={copyMsg || undefined}
        faseFinalHref={faseFinalHref}
      />
      <PublicTorneoExpressSyncFooter
        lastRefreshedAt={lastRefreshedAt}
        realtimeConnected={realtimeConnected}
      />
    </PublicTorneoExpressShell>
  );
};
