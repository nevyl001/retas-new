import React, { useState } from "react";
import { useUser } from "../../contexts/UserContext";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import { useTorneoPublicDisplayNombre } from "../../hooks/useTorneoPublicDisplayNombre";
import { copyToClipboard, publicGeneralUrl } from "../../services/torneoExpressService";
import { buildSharePublicOgUrlFromPlayUrl } from "../../lib/retaAbierta/shareOgUrl";
import { PublicStandingsSection } from "./public/PublicStandingsSection";
import { PublicTorneoExpressHeader } from "./public/PublicTorneoExpressHeader";
import { PublicTorneoExpressShell } from "./public/PublicTorneoExpressShell";
import { PublicTorneoExpressSyncFooter } from "./public/PublicTorneoExpressSyncFooter";
import { PublicEventNeutralLoading } from "../../club-experience";
import { TE_PUBLIC_POLL_INTERVAL_MS } from "../../lib/torneoExpress/publicPoll";
import { Button } from "../ui";
import {
  getTorneoExpressGeneralBack,
  navigateTorneoExpress,
} from "./torneoExpressNav";

export const VistaPublicaGeneral: React.FC<{ torneoId: string }> = ({ torneoId }) => {
  const { user } = useUser();
  const { bundle, loading, error, standingsGeneral, lastRefreshedAt, realtimeConnected } =
    useTorneoExpress(torneoId, {
      publicMode: true,
      realtime: true,
      pollIntervalMs: TE_PUBLIC_POLL_INTERVAL_MS,
    });
  const displayNombre = useTorneoPublicDisplayNombre(bundle?.torneo);
  const [copyMsg, setCopyMsg] = useState("");

  const goBack = () => {
    navigateTorneoExpress(getTorneoExpressGeneralBack(torneoId));
  };

  const copyLink = async () => {
    const play = publicGeneralUrl(torneoId);
    const ok = await copyToClipboard(
      buildSharePublicOgUrlFromPlayUrl(play) || play
    );
    setCopyMsg(ok ? "Enlace copiado" : "No se pudo copiar");
    setTimeout(() => setCopyMsg(""), 2500);
  };

  const notFound = !loading && !bundle;

  return (
    <PublicTorneoExpressShell
      organizadorId={bundle?.torneo.organizador_id ?? null}
    >
      {loading && !bundle ? (
        <PublicEventNeutralLoading message="Cargando tabla general…" />
      ) : null}
      {notFound ? (
        <p className="te-public-error">{error ?? "Torneo no encontrado"}</p>
      ) : null}
      {bundle ? (
        <>
          <PublicTorneoExpressHeader
            torneoNombre={displayNombre || bundle.torneo.nombre}
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

          <PublicTorneoExpressSyncFooter
            lastRefreshedAt={lastRefreshedAt}
            realtimeConnected={realtimeConnected}
          />
        </>
      ) : null}
    </PublicTorneoExpressShell>
  );
};
