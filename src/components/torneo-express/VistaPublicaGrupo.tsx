import React, { useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import { copyToClipboard, publicGrupoUrl } from "../../services/torneoExpressService";
import { PublicPartidosByRoundSection } from "./public/PublicPartidosByRoundSection";
import { PublicGrupoLeaderCelebrate } from "./public/PublicGrupoLeaderCelebrate";
import { PublicStandingsSection } from "./public/PublicStandingsSection";
import { PublicTorneoExpressHeader } from "./public/PublicTorneoExpressHeader";
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
        categoria={bundle.torneo.categoria}
        grupoLabel={grupo.nombre}
        onCopyLink={copyLink}
        copyMsg={copyMsg || undefined}
      />

      <PublicStandingsSection rows={standingsByGrupo[grupoId] ?? []} />

      <PublicGrupoLeaderCelebrate
        grupoNombre={grupo.nombre}
        rows={standingsByGrupo[grupoId] ?? []}
        partidos={bundle.partidosPorGrupo[grupoId] ?? []}
        torneoNombre={bundle.torneo.nombre}
      />

      <PublicPartidosByRoundSection
        partidos={bundle.partidosPorGrupo[grupo.id] ?? []}
        parejas={bundle.parejasPorGrupo[grupo.id] ?? []}
        title="Partidos"
      />

      <PublicTorneoExpressSyncFooter lastRefreshedAt={lastRefreshedAt} />
    </PublicTorneoExpressShell>
  );
};
