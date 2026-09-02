import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";

type RankingChannelEntry = {
  channel: RealtimeChannel;
  refCount: number;
  listeners: Set<() => void>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  ready: boolean;
};

/** Un canal por organizador — evita registrar postgres_changes tras subscribe() (Supabase ≥2.95). */
const rankingChannels = new Map<string, RankingChannelEntry>();

function notifyRankingListeners(entry: RankingChannelEntry): void {
  if (!entry.ready) return;
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
  entry.debounceTimer = setTimeout(() => {
    entry.listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        /* listener no debe tumbar el canal compartido */
      }
    });
  }, 500);
}

function ensureRankingChannel(organizadorId: string): RankingChannelEntry {
  const existing = rankingChannels.get(organizadorId);
  if (existing) return existing;

  const entry: RankingChannelEntry = {
    channel: supabase.channel(`riviera-ranking:${organizadorId}`),
    refCount: 0,
    listeners: new Set(),
    debounceTimer: null,
    ready: false,
  };

  const handler = () => notifyRankingListeners(entry);

  entry.channel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "jugador_stats",
      },
      handler
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "riviera_jugadores",
        filter: `organizador_id=eq.${organizadorId}`,
      },
      handler
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "jugador_participaciones",
      },
      handler
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setTimeout(() => {
          entry.ready = true;
        }, 600);
      }
    });

  rankingChannels.set(organizadorId, entry);
  return entry;
}

/** Realtime + debounce para ranking público (stats y altas de jugadores). */
export function subscribeRivieraRanking(
  organizadorId: string,
  onChange: () => void
): () => void {
  const entry = ensureRankingChannel(organizadorId);
  entry.refCount += 1;
  entry.listeners.add(onChange);

  return () => {
    entry.listeners.delete(onChange);
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount > 0) return;

    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.ready = false;
    void supabase.removeChannel(entry.channel);
    rankingChannels.delete(organizadorId);
  };
}
