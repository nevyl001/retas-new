import { useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { RealtimeChannel } from "@supabase/supabase-js";

interface UseRealtimeSubscriptionOptions {
  tournamentId: string;
  onUpdate: () => void;
  enabled?: boolean; // Permitir desactivar si es necesario
}

/**
 * Hook para suscribirse a cambios en tiempo real de Supabase
 * 
 * Se suscribe a cambios en:
 * - matches (partidos del torneo)
 * - games (juegos de los partidos)
 * 
 * Si falla la conexión, no rompe nada y el componente puede seguir usando polling
 */
export const useRealtimeSubscription = ({
  tournamentId,
  onUpdate,
  enabled = true,
}: UseRealtimeSubscriptionOptions) => {
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const isSubscribedRef = useRef(false);

  const handleUpdate = useCallback(() => {
    console.log("🔄 Cambio detectado en tiempo real, actualizando...");
    // Pequeño debounce para evitar múltiples actualizaciones muy rápidas
    setTimeout(() => {
      onUpdate();
    }, 300);
  }, [onUpdate]);

  useEffect(() => {
    if (!tournamentId || !enabled) {
      return;
    }

    // Limpiar suscripciones anteriores si existen (por si cambió el tournamentId)
    if (isSubscribedRef.current && channelsRef.current.length > 0) {
      console.log("🔌 Limpiando suscripciones anteriores...");
      channelsRef.current.forEach((channel) => {
        try {
          supabase.removeChannel(channel);
        } catch (error) {
          console.error("Error al limpiar canal:", error);
        }
      });
      channelsRef.current = [];
      isSubscribedRef.current = false;
    }

    try {
      console.log("🔌 Iniciando suscripciones en tiempo real para torneo:", tournamentId);

      // Suscribirse a cambios en matches del torneo
      const matchesChannel = supabase
        .channel(`matches:${tournamentId}`)
        .on(
          "postgres_changes",
          {
            event: "*", // INSERT, UPDATE, DELETE
            schema: "public",
            table: "matches",
            filter: `tournament_id=eq.${tournamentId}`,
          },
          (payload) => {
            console.log("📊 Cambio en matches:", payload.eventType);
            handleUpdate();
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            console.log("✅ Suscrito a cambios en matches");
          } else if (status === "CHANNEL_ERROR") {
            console.warn("⚠️ Error en suscripción a matches, usando polling como fallback");
          }
        });

      // Suscribirse a cambios en games (todos los games, ya que no tenemos filtro directo por tournament_id)
      // Nota: Esto escuchará todos los games, pero solo actualizaremos si es necesario
      const gamesChannel = supabase
        .channel(`games:${tournamentId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "games",
          },
          (payload) => {
            console.log("🎮 Cambio en games:", payload.eventType);
            // Solo actualizar si el cambio es relevante (podríamos filtrar más si es necesario)
            handleUpdate();
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            console.log("✅ Suscrito a cambios en games");
          } else if (status === "CHANNEL_ERROR") {
            console.warn("⚠️ Error en suscripción a games, usando polling como fallback");
          }
        });

      channelsRef.current = [matchesChannel, gamesChannel];
      isSubscribedRef.current = true;

      console.log("✅ Suscripciones en tiempo real activadas");
    } catch (error) {
      console.error("❌ Error configurando suscripciones en tiempo real:", error);
      console.log("ℹ️ Continuando con polling como método de actualización");
      // No lanzar el error, solo loguearlo - el polling seguirá funcionando
    }

    // Cleanup: desuscribirse cuando el componente se desmonte o cambie el tournamentId
    return () => {
      console.log("🔌 Desuscribiendo de canales en tiempo real");
      channelsRef.current.forEach((channel) => {
        try {
          supabase.removeChannel(channel);
        } catch (error) {
          console.error("Error al desuscribirse:", error);
        }
      });
      channelsRef.current = [];
      isSubscribedRef.current = false;
    };
  }, [tournamentId, enabled, handleUpdate]);

  // Retornar función para desactivar manualmente si es necesario
  return {
    isSubscribed: isSubscribedRef.current,
    unsubscribe: () => {
      channelsRef.current.forEach((channel) => {
        try {
          supabase.removeChannel(channel);
        } catch (error) {
          console.error("Error al desuscribirse:", error);
        }
      });
      channelsRef.current = [];
      isSubscribedRef.current = false;
    },
  };
};
