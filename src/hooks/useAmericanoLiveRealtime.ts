import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { debugLog } from "../lib/debug/debugLog";

interface UseAmericanoLiveRealtimeOptions {
  tournamentId: string | null | undefined;
  onUpdate: () => void;
  enabled?: boolean;
}

/**
 * Realtime para vistas públicas de Americano (vista pública / pantalla TV).
 * El "live" del Americano se publica en tournament_public_config.americano_live
 * (ver fetchAmericanoLivePublic en src/lib/database.ts), que sí tiene
 * tournament_id como columna directa: filtro exacto por evento, sin
 * necesidad de filtrado en cliente.
 */
export const useAmericanoLiveRealtime = ({
  tournamentId,
  onUpdate,
  enabled = true,
}: UseAmericanoLiveRealtimeOptions) => {
  const onUpdateRef = useRef(onUpdate);
  const channelRef = useRef<RealtimeChannel | null>(null);

  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!tournamentId || !enabled) return;

    const handleUpdate = () => {
      setTimeout(() => onUpdateRef.current(), 300);
    };

    const channel = supabase
      .channel(`americano-live:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_public_config",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          debugLog("🔄 Cambio en tournament_public_config (americano_live)");
          handleUpdate();
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn(
            "⚠️ Error en suscripción realtime de americano, usando polling como fallback"
          );
        }
      });

    channelRef.current = channel;

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (error) {
        console.error("Error al desuscribirse de americano realtime:", error);
      }
      channelRef.current = null;
    };
  }, [tournamentId, enabled]);
};
