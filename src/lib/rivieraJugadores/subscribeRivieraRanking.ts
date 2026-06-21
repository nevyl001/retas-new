import { supabase } from "../supabaseClient";

/** Realtime + debounce para ranking público (stats y altas de jugadores). */
export function subscribeRivieraRanking(
  organizadorId: string,
  onChange: () => void
): () => void {
  let cancelled = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let ready = false;

  const channel = supabase.channel(`riviera-ranking:${organizadorId}`);

  const handler = () => {
    if (cancelled || !ready) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!cancelled) onChange();
    }, 500);
  };

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "jugador_stats",
    },
    handler
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "riviera_jugadores",
      filter: `organizador_id=eq.${organizadorId}`,
    },
    handler
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "jugador_participaciones",
    },
    handler
  );

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      setTimeout(() => {
        ready = true;
      }, 600);
    }
  });

  return () => {
    cancelled = true;
    ready = false;
    if (debounceTimer) clearTimeout(debounceTimer);
    supabase.removeChannel(channel);
  };
}
