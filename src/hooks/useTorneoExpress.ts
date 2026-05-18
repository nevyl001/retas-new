import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildStandingsForGrupo,
  buildStandingsGeneral,
} from "../lib/torneoExpress/standings";
import type { StandingRowExpress, TorneoExpressBundle } from "../lib/torneoExpress/types";
import {
  checkPartidosCanchaColumnAvailable,
  checkPartidosOrdenColumnAvailable,
  fetchTorneoExpressBundle,
  PartidosCanchaColumnMissingError,
  PartidosOrdenColumnMissingError,
  savePartidoCancha,
  savePartidoResultado,
  savePartidosOrden,
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
  const [savingOrden, setSavingOrden] = useState(false);
  const [partidosOrdenDisponible, setPartidosOrdenDisponible] = useState(true);
  const [partidosCanchaDisponible, setPartidosCanchaDisponible] = useState(true);
  const [savingCanchaId, setSavingCanchaId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!torneoId) {
      setBundle(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [data, ordenOk, canchaOk] = await Promise.all([
        fetchTorneoExpressBundle(torneoId, publicMode),
        checkPartidosOrdenColumnAvailable(),
        checkPartidosCanchaColumnAvailable(),
      ]);
      setBundle(data);
      setPartidosOrdenDisponible(ordenOk);
      setPartidosCanchaDisponible(canchaOk);
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

  const saveCancha = useCallback(
    async (partidoId: string, cancha: string | null) => {
      setSavingCanchaId(partidoId);
      setError(null);
      try {
        await savePartidoCancha(partidoId, cancha);
        await reload();
      } catch (e) {
        if (e instanceof PartidosCanchaColumnMissingError) {
          setPartidosCanchaDisponible(false);
        }
        setError(
          e instanceof Error ? e.message : "No se pudo guardar la cancha"
        );
        throw e;
      } finally {
        setSavingCanchaId(null);
      }
    },
    [reload]
  );

  const saveOrden = useCallback(
    async (updates: Array<{ id: string; orden: number }>) => {
      setSavingOrden(true);
      setError(null);
      try {
        await savePartidosOrden(updates);
        await reload();
      } catch (e) {
        if (e instanceof PartidosOrdenColumnMissingError) {
          setPartidosOrdenDisponible(false);
        }
        setError(
          e instanceof Error ? e.message : "No se pudo guardar el orden"
        );
      } finally {
        setSavingOrden(false);
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
    saveCancha,
    saveOrden,
    savingPartidoId,
    savingCanchaId,
    savingOrden,
    partidosOrdenDisponible,
    partidosCanchaDisponible,
  };
}
