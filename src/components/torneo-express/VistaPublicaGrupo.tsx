import React, { useMemo, useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import { copyToClipboard, publicGrupoUrl } from "../../services/torneoExpressService";
import {
  buildTEPublicGrupoProps,
  TEPublicGrupos,
} from "./public/TEPublicGrupos";
import { PublicTorneoExpressShell } from "./public/PublicTorneoExpressShell";
import { PublicTorneoExpressSyncFooter } from "./public/PublicTorneoExpressSyncFooter";
import { TE_PUBLIC_POLL_INTERVAL_MS } from "../../lib/torneoExpress/publicPoll";

export const VistaPublicaGrupo: React.FC<{
  torneoId: string;
  grupoId: string;
}> = ({ torneoId, grupoId }) => {
  const { bundle, loading, error, standingsByGrupo, lastRefreshedAt } =
    useTorneoExpress(torneoId, {
      publicMode: true,
      realtime: true,
      pollIntervalMs: TE_PUBLIC_POLL_INTERVAL_MS,
    });
  const [copyMsg, setCopyMsg] = useState("");

  const grupoProps = useMemo(
    () =>
      bundle
        ? buildTEPublicGrupoProps(bundle, standingsByGrupo, grupoId)
        : null,
    [bundle, standingsByGrupo, grupoId]
  );

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
          <p>Cargando grupo…</p>
        </div>
      </PublicTorneoExpressShell>
    );
  }

  if (!bundle || !grupoProps || grupoProps.grupos.length === 0) {
    return (
      <PublicTorneoExpressShell>
        <p className="te-public-error">{error ?? "Grupo no encontrado"}</p>
      </PublicTorneoExpressShell>
    );
  }

  return (
    <PublicTorneoExpressShell className="te-public--grupos-wide">
      <TEPublicGrupos
        {...grupoProps}
        onCopyLink={copyLink}
        copyMsg={copyMsg || undefined}
      />
      <PublicTorneoExpressSyncFooter lastRefreshedAt={lastRefreshedAt} />
    </PublicTorneoExpressShell>
  );
};
