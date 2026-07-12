import { useCallback, useEffect, useRef, useState } from "react";
import { getPlayers, type Player } from "../lib/database";
import {
  PoolRequestGate,
  commitPoolFetchResult,
  shouldFetchOrganizerPool,
} from "./organizerPlayerPoolLogic";

export function normalizeOrganizerId(
  value?: string | null
): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

export type OrganizerPlayerPoolState = {
  players: Player[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  organizerId: string | null;
};

/**
 * Pool de jugadores del organizador para Reta (Gestión de jugadores / parejas).
 * - No fetch sin organizerId válido
 * - tournamentId no afecta el pool (getPlayers lo ignora) → no refetch por él
 * - Anti-race por requestId: respuestas viejas no alteran estado
 * - Refetch conserva players visibles (loading solo en primera carga sin datos)
 */
export function useOrganizerPlayerPool(
  organizerIdInput?: string | null
): OrganizerPlayerPoolState {
  const organizerId = normalizeOrganizerId(organizerIdInput);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(shouldFetchOrganizerPool(organizerId));
  const [error, setError] = useState<string | null>(null);
  const gateRef = useRef(new PoolRequestGate());
  const playersRef = useRef<Player[]>([]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const refresh = useCallback(async () => {
    if (!shouldFetchOrganizerPool(organizerId)) {
      gateRef.current.invalidate();
      setPlayers([]);
      setLoading(false);
      setError(null);
      return;
    }

    const requestId = gateRef.current.begin();
    const isFirstLoad = playersRef.current.length === 0;
    if (isFirstLoad) {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await getPlayers(organizerId);
      const commit = commitPoolFetchResult(gateRef.current, requestId, {
        ok: true,
        players: data,
      });
      if (commit.kind === "ignore") return;
      if (commit.kind === "success") {
        setPlayers(commit.players);
        setError(null);
      }
    } catch (err) {
      const commit = commitPoolFetchResult(gateRef.current, requestId, {
        ok: false,
        message:
          err instanceof Error ? err.message : "Error al cargar jugadores",
      });
      if (commit.kind === "ignore") return;
      if (commit.kind === "error") {
        setError(commit.message);
      }
    } finally {
      if (gateRef.current.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  }, [organizerId]);

  useEffect(() => {
    const gate = gateRef.current;
    void refresh();
    return () => {
      gate.invalidate();
    };
  }, [refresh]);

  return {
    players,
    loading,
    error,
    refresh,
    organizerId,
  };
}
