import { useCallback, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Realtime de convocatoria abierta + refetch al recuperar foco/visibilidad.
 * Prefiere registration_id; cae a tournament_id para filas v1.
 */
export function useRetaAbiertaRealtime(opts: {
  registrationId?: string | null;
  tournamentId?: string | null;
  enabled?: boolean;
  onUpdate: () => void;
}): void {
  const {
    registrationId,
    tournamentId,
    enabled = true,
    onUpdate,
  } = opts;
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const notify = useCallback(() => {
    window.setTimeout(() => onUpdateRef.current(), 250);
  }, []);

  useEffect(() => {
    if ((!registrationId && !tournamentId) || !enabled) return;

    const filter = registrationId
      ? `registration_id=eq.${registrationId}`
      : `tournament_id=eq.${tournamentId}`;

    const entriesCh = supabase
      .channel(`convocatoria-entries:${registrationId || tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_open_registration_entries",
          filter,
        },
        () => notify()
      )
      .subscribe();

    const cfgFilter = registrationId
      ? `id=eq.${registrationId}`
      : `tournament_id=eq.${tournamentId}`;

    const cfgCh = supabase
      .channel(`convocatoria-cfg:${registrationId || tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_open_registration",
          filter: cfgFilter,
        },
        () => notify()
      )
      .subscribe();

    channelsRef.current = [entriesCh, cfgCh];

    const onFocus = () => notify();
    const onVis = () => {
      if (document.visibilityState === "visible") notify();
    };
    const onOnline = () => notify();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      channelsRef.current.forEach((ch) => {
        try {
          supabase.removeChannel(ch);
        } catch {
          /* ignore */
        }
      });
      channelsRef.current = [];
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [registrationId, tournamentId, enabled, notify]);
}
