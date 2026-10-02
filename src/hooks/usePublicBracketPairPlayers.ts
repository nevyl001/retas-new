import { useEffect, useMemo, useState } from "react";
import type { PublicMatchupCard } from "../lib/torneoExpress/publicBracketModel";
import {
  resolvePlayerPublicProfiles,
  type PlayerAvatarLookupEntry,
} from "../lib/rivieraJugadores/publicPlayerAvatars";
import { fetchPairsByIdsPublic } from "../services/torneoExpressService";
import type { PublicRetaPairPlayer } from "../components/public/PublicRetaPairSide";
import {
  pairPlayer1DisplayName,
  pairPlayer2DisplayName,
} from "../lib/pairPlayerNames";

export function usePublicBracketPairPlayers(
  organizadorId: string | null | undefined,
  cards: PublicMatchupCard[]
): Record<string, PublicRetaPairPlayer[]> {
  const [pairPlayersById, setPairPlayersById] = useState<
    Record<string, PublicRetaPairPlayer[]>
  >({});

  const pairIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const card of cards) {
      if (card.local.parejaId) ids.add(card.local.parejaId);
      if (card.visit.parejaId) ids.add(card.visit.parejaId);
    }
    return Array.from(ids).sort().join(",");
  }, [cards]);

  useEffect(() => {
    if (!organizadorId || !pairIdsKey) {
      setPairPlayersById({});
      return;
    }

    const pairIds = pairIdsKey.split(",").filter(Boolean);
    let cancelled = false;

    void (async () => {
      try {
        const pairs = await fetchPairsByIdsPublic(pairIds);
        const realPairs = pairs.filter(
          (pair): pair is typeof pair & { player1_id: string; player2_id: string } =>
            pair.is_virtual !== true &&
            Boolean(pair.player1_id) &&
            Boolean(pair.player2_id)
        );
        const entries: PlayerAvatarLookupEntry[] = realPairs.flatMap((p) => {
          const named = {
            player1_id: p.player1_id,
            player2_id: p.player2_id,
            player1_name: p.player1_name ?? "",
            player2_name: p.player2_name ?? "",
          };
          return [
            { id: p.player1_id, name: pairPlayer1DisplayName(named) },
            { id: p.player2_id, name: pairPlayer2DisplayName(named) },
          ];
        });
        const profiles = await resolvePlayerPublicProfiles(organizadorId, entries, {
          publicOnly: true,
        });
        if (cancelled) return;

        const next: Record<string, PublicRetaPairPlayer[]> = {};
        for (const pair of realPairs) {
          const named = {
            player1_id: pair.player1_id,
            player2_id: pair.player2_id,
            player1_name: pair.player1_name ?? "",
            player2_name: pair.player2_name ?? "",
          };
          next[pair.id] = [
            {
              id: pair.player1_id,
              name: pairPlayer1DisplayName(named),
              fotoUrl: profiles[pair.player1_id]?.fotoUrl ?? null,
              rating: profiles[pair.player1_id]?.rating ?? 3,
            },
            {
              id: pair.player2_id,
              name: pairPlayer2DisplayName(named),
              fotoUrl: profiles[pair.player2_id]?.fotoUrl ?? null,
              rating: profiles[pair.player2_id]?.rating ?? 3,
            },
          ];
        }
        setPairPlayersById(next);
      } catch (e) {
        console.warn("[eliminatoria-public] avatares:", e);
        if (!cancelled) setPairPlayersById({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [organizadorId, pairIdsKey]);

  return pairPlayersById;
}
