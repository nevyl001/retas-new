import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildStandingsForGrupo,
  buildStandingsGeneral,
} from "../lib/torneoExpress/standings";
import type { StandingRowExpress, TorneoExpressBundle } from "../lib/torneoExpress/types";
import {
  fetchTorneoExpressBundle,
  savePartidoResultado,
  subscribeTorneoExpress,
} from "../services/torneoExpressService";

export function useTorneoExpress(
  torneoId: string | null,
  options?: { publicMode?: boolean; realtime?: boolean }
) {
  const publicMode = options?.publicMode ?? false;
  const realtime = options?.realtime ?? true;

  const [bundle, setBundle] = useState<TorneoExpressBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingPartidoId, setSavingPartidoId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!torneoId) {
      setBundle(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTorneoExpressBundle(torneoId, publicMode);
      setBundle(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar torneo express");
    } finally {
      setLoading(false);
    }
  }, [torneoId, publicMode]);

  useEffect(() => {
    reload();
  }, [reload]);

  const grupoIdsKey = useMemo(() => {
    const ids = bundle?.grupos.map((g) => g.id) ?? [];
    if (!ids.length) return "";
    return [...ids].sort().join(",");
  }, [bundle]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!torneoId || !realtime || !grupoIdsKey) return;

    const grupoIds = grupoIdsKey.split(",").filter(Boolean);
    return subscribeTorneoExpress(torneoId, grupoIds, () => {
      void reloadRef.current();
    });
  }, [torneoId, realtime, grupoIdsKey]);

  const standingsByGrupo = useMemo(() => {
    if (!bundle) return {} as Record<string, StandingRowExpress[]>;
    const out: Record<string, StandingRowExpress[]> = {};
    bundle.grupos.forEach((grupo) => {
      out[grupo.id] = buildStandingsForGrupo(
        grupo,
        bundle.parejasPorGrupo[grupo.id] ?? [],
        bundle.partidosPorGrupo[grupo.id] ?? []
      );
    });
    return out;
  }, [bundle]);

  const standingsGeneral = useMemo(() => {
    if (!bundle) return [] as StandingRowExpress[];
    return buildStandingsGeneral(
      bundle.grupos,
      bundle.parejasPorGrupo,
      bundle.partidosPorGrupo
    );
  }, [bundle]);

  const saveResultado = useCallback(
    async (partidoId: string, puntosLocal: number, puntosVisitante: number) => {
      setSavingPartidoId(partidoId);
      setError(null);
      try {
        await savePartidoResultado(partidoId, puntosLocal, puntosVisitante);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar el resultado");
        throw e;
      } finally {
        setSavingPartidoId(null);
      }
    },
    [reload]
  );

  return {
    bundle,
    loading,
    error,
    setError,
    reload,
    standingsByGrupo,
    standingsGeneral,
    saveResultado,
    savingPartidoId,
  };
}
