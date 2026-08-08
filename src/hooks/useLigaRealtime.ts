import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { debugLog } from "../lib/debug/debugLog";

interface UseLigaRealtimeOptions {
  ligaId: string | null | undefined;
  /** jornada_id de la liga actual; liga_partidos no tiene columna liga_id directa. */
  jornadaIds: string[];
  onUpdate: () => void;
  enabled?: boolean;
}

/**
 * Realtime para vistas públicas de Liga (detalle/jornada), mismo patrón que
 * useRealtimeSubscription (Reta) y subscribeRivieraRanking (Ranking).
 *
 * liga_jornadas / liga_inscripciones tienen liga_id: filtro directo en Postgres.
 * liga_partidos no tiene liga_id (solo jornada_id) — se escucha sin filtro de
 * servidor y se descarta en cliente todo cambio cuyo jornada_id no pertenezca
 * a esta liga, para no disparar recargas por partidos de otra liga.
 */
export const useLigaRealtime = ({
  ligaId,
  jornadaIds,
  onUpdate,
  enabled = true,
}: UseLigaRealtimeOptions) => {
  const jornadaIdsRef = useRef<Set<string>>(new Set());
  const onUpdateRef = useRef(onUpdate);
  const channelRef = useRef<RealtimeChannel | null>(null);

  onUpdateRef.current = onUpdate;

  useEffect(() => {
    jornadaIdsRef.current = new Set(jornadaIds);
  }, [jornadaIds]);

  useEffect(() => {
    if (!ligaId || !enabled) return;

    const handleUpdate = () => {
      setTimeout(() => onUpdateRef.current(), 300);
    };

    const channel = supabase
      .channel(`liga:${ligaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "liga_jornadas",
          filter: `liga_id=eq.${ligaId}`,
        },
        () => {
          debugLog("🔄 Cambio en liga_jornadas");
          handleUpdate();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "liga_inscripciones",
          filter: `liga_id=eq.${ligaId}`,
        },
        () => {
          debugLog("🔄 Cambio en liga_inscripciones");
          handleUpdate();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "liga_partidos" },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            | { jornada_id?: string }
            | null;
          const jornadaId = row?.jornada_id;
          if (jornadaId && jornadaIdsRef.current.has(jornadaId)) {
            debugLog("🔄 Cambio en liga_partidos de esta liga");
            handleUpdate();
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn(
            "⚠️ Error en suscripción realtime de liga, usando polling como fallback"
          );
        }
      });

    channelRef.current = channel;

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (error) {
        console.error("Error al desuscribirse de liga realtime:", error);
      }
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligaId, enabled]);
};
