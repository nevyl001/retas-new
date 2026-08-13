import React, { useMemo, useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import { useTorneoPublicDisplayNombre } from "../../hooks/useTorneoPublicDisplayNombre";
import { copyToClipboard, publicGrupoUrl } from "../../services/torneoExpressService";
import { buildSharePublicOgUrlFromPlayUrl } from "../../lib/retaAbierta/shareOgUrl";
import {
  buildTEPublicGrupoProps,
  TEPublicGrupos,
} from "./public/TEPublicGrupos";
import { PublicTorneoExpressShell } from "./public/PublicTorneoExpressShell";
import { PublicTorneoExpressSyncFooter } from "./public/PublicTorneoExpressSyncFooter";
import { PublicEventNeutralLoading } from "../../club-experience";
import { TE_PUBLIC_POLL_INTERVAL_MS } from "../../lib/torneoExpress/publicPoll";

export const VistaPublicaGrupo: React.FC<{
  torneoId: string;
  grupoId: string;
}> = ({ torneoId, grupoId }) => {
  const { bundle, loading, error, standingsByGrupo, lastRefreshedAt, realtimeConnected } =
    useTorneoExpress(torneoId, {
      publicMode: true,
      realtime: true,
      pollIntervalMs: TE_PUBLIC_POLL_INTERVAL_MS,
    });
  const displayNombre = useTorneoPublicDisplayNombre(bundle?.torneo);
  const [copyMsg, setCopyMsg] = useState("");

  const grupoProps = useMemo(
    () =>
      bundle
        ? {
            ...buildTEPublicGrupoProps(bundle, standingsByGrupo, grupoId),
            torneoNombre: displayNombre || bundle.torneo.nombre,
          }
        : null,
    [bundle, standingsByGrupo, grupoId, displayNombre]
  );

  const copyLink = async () => {
    const play = publicGrupoUrl(torneoId, grupoId);
    const ok = await copyToClipboard(
      buildSharePublicOgUrlFromPlayUrl(play) || play
    );
    setCopyMsg(ok ? "Enlace copiado" : "No se pudo copiar");
    setTimeout(() => setCopyMsg(""), 2500);
  };

  const notFound =
    !loading && (!bundle || !grupoProps || grupoProps.grupos.length === 0);

  return (
    <PublicTorneoExpressShell
      className="te-public--grupos-wide"
      organizadorId={bundle?.torneo.organizador_id ?? null}
    >
      {loading && !bundle ? (
        <PublicEventNeutralLoading message="Cargando grupo…" />
      ) : null}
      {notFound ? (
        <p className="te-public-error">{error ?? "Grupo no encontrado"}</p>
      ) : null}
      {bundle && grupoProps && grupoProps.grupos.length > 0 ? (
        <>
          <TEPublicGrupos
            {...grupoProps}
            onCopyLink={copyLink}
            copyMsg={copyMsg || undefined}
          />
          <PublicTorneoExpressSyncFooter
            lastRefreshedAt={lastRefreshedAt}
            realtimeConnected={realtimeConnected}
          />
        </>
      ) : null}
    </PublicTorneoExpressShell>
  );
};
