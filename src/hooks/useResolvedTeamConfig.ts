import { useEffect, useMemo, useState } from "react";
import type { Pair, Tournament } from "../lib/database";
import { getTournamentById, getTournamentPublicConfigExtended } from "../lib/database";
import {
  resolveEffectiveTeamConfig,
  type TeamConfigLike,
} from "../lib/teamConfigDisplay";

/** Config de equipos: torneo en memoria → BD / config pública → localStorage. */
export function useResolvedTeamConfig(
  tournament: Pick<Tournament, "id" | "format" | "team_config"> | null | undefined,
  pairs: Pair[] = []
): TeamConfigLike | null {
  const syncConfig = useMemo(
    () => (tournament ? resolveEffectiveTeamConfig(tournament) : null),
    [tournament]
  );

  const [remoteConfig, setRemoteConfig] = useState<TeamConfigLike | null>(null);

  const pairIdsKey = useMemo(() => pairs.map((p) => p.id).join(","), [pairs]);

  useEffect(() => {
    if (!tournament?.id) {
      setRemoteConfig(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [publicCfg, freshTournament] = await Promise.all([
          getTournamentPublicConfigExtended(tournament.id),
          getTournamentById(tournament.id),
        ]);
        if (cancelled) return;
        const remote =
          (publicCfg?.team_config &&
          publicCfg.team_config.teamNames?.length &&
          publicCfg.team_config.pairToTeam
            ? publicCfg.team_config
            : null) ||
          (freshTournament?.team_config &&
          freshTournament.team_config.teamNames?.length &&
          freshTournament.team_config.pairToTeam
            ? freshTournament.team_config
            : null);
        setRemoteConfig(remote);
      } catch {
        if (!cancelled) setRemoteConfig(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tournament?.id, pairIdsKey, tournament?.team_config]);

  return useMemo(() => {
    if (syncConfig && remoteConfig) {
      const syncKeys = Object.keys(syncConfig.pairToTeam ?? {}).length;
      const remoteKeys = Object.keys(remoteConfig.pairToTeam ?? {}).length;
      // Tras generar un bloque dinámico, BD suele traer más pairToTeam.
      return remoteKeys >= syncKeys ? remoteConfig : syncConfig;
    }
    return syncConfig ?? remoteConfig;
  }, [syncConfig, remoteConfig]);
}
