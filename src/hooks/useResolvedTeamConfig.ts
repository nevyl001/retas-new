import { useEffect, useMemo, useState } from "react";
import type { Pair, Tournament } from "../lib/database";
import {
  loadTeamConfigForTournament,
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
    if (syncConfig) {
      setRemoteConfig(null);
      return;
    }

    let cancelled = false;
    void loadTeamConfigForTournament(tournament).then((config) => {
      if (!cancelled) setRemoteConfig(config);
    });

    return () => {
      cancelled = true;
    };
  }, [tournament, syncConfig, pairIdsKey]);

  return syncConfig ?? remoteConfig;
}
