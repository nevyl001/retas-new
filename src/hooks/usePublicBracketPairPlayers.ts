import { useEffect, useMemo, useState } from "react";
import type { PublicMatchupCard } from "../lib/torneoExpress/publicBracketModel";
import {
  resolvePlayerPublicProfiles,
  type PlayerAvatarLookupEntry,
} from "../lib/rivieraJugadores/publicPlayerAvatars";
import { fetchPairsByIdsPublic } from "../services/torneoExpressService";
import type { PublicRetaPairPlayer } from "../components/public/PublicRetaPairSide";

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
        const entries: PlayerAvatarLookupEntry[] = pairs.flatMap((p) => [
          { id: p.player1_id, name: p.player1_name },
          { id: p.player2_id, name: p.player2_name },
        ]);
        const profiles = await resolvePlayerPublicProfiles(organizadorId, entries, {
          publicOnly: true,
        });
        if (cancelled) return;

        const next: Record<string, PublicRetaPairPlayer[]> = {};
        for (const pair of pairs) {
          next[pair.id] = [
            {
              id: pair.player1_id,
              name: pair.player1_name,
              fotoUrl: profiles[pair.player1_id]?.fotoUrl ?? null,
              rating: profiles[pair.player1_id]?.rating ?? 3,
            },
            {
              id: pair.player2_id,
              name: pair.player2_name,
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
