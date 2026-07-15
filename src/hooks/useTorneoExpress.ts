import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildEliminatoriaLabelMap } from "../lib/torneoExpress/eliminatoriaLabels";
import {
  buildStandingsForGrupo,
  buildStandingsGeneral,
} from "../lib/torneoExpress/standings";
import type { PartidoSetScore, StandingRowExpress, TorneoExpressBundle } from "../lib/torneoExpress/types";
import {
  checkPartidosCanchaColumnAvailable,
  checkPartidosOrdenColumnAvailable,
  checkPartidosProgramadoColumnAvailable,
  fetchTorneoExpressBundle,
  PartidosCanchaColumnMissingError,
  PartidosOrdenColumnMissingError,
  PartidosProgramadoColumnMissingError,
  finalizarTorneoExpressEliminatoria as persistFinalizarTorneoEliminatoria,
  reabrirTorneoExpressEliminatoria as persistReabrirTorneoEliminatoria,
  resetEliminatoriaTorneoExpress as persistResetEliminatoria,
  saveEliminatoriaCancha as persistEliminatoriaCancha,
  saveEliminatoriaProgramado as persistEliminatoriaProgramado,
  saveEliminatoriaResultado as persistEliminatoriaResultado,
  saveGrupoNombre as persistGrupoNombre,
  savePartidoCancha,
  savePartidoProgramado,
  savePartidoResultado,
  savePartidosOrden,
  subscribeTorneoExpress,
} from "../services/torneoExpressService";

export function useTorneoExpress(
  torneoId: string | null,
  options?: {
    publicMode?: boolean;
    realtime?: boolean;
    /** Recarga en segundo plano (p. ej. 60000 en vistas públicas). */
    pollIntervalMs?: number;
  }
) {
  const publicMode = options?.publicMode ?? false;
  const realtime = options?.realtime ?? true;
  const pollIntervalMs = options?.pollIntervalMs ?? 0;

  const [bundle, setBundle] = useState<TorneoExpressBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [savingPartidoId, setSavingPartidoId] = useState<string | null>(null);
  const [savingOrden, setSavingOrden] = useState(false);
  const [partidosOrdenDisponible, setPartidosOrdenDisponible] = useState(true);
  const [partidosCanchaDisponible, setPartidosCanchaDisponible] = useState(true);
  const [partidosProgramadoDisponible, setPartidosProgramadoDisponible] =
    useState(true);
  const [savingCanchaId, setSavingCanchaId] = useState<string | null>(null);
  const [savingProgramadoId, setSavingProgramadoId] = useState<string | null>(
    null
  );
  const [savingEliminatoriaId, setSavingEliminatoriaId] = useState<string | null>(
    null
  );
  const [savingEliminatoriaCanchaId, setSavingEliminatoriaCanchaId] = useState<
    string | null
  >(null);
  const [savingEliminatoriaProgramadoId, setSavingEliminatoriaProgramadoId] =
    useState<string | null>(null);
  const [finalizandoTorneo, setFinalizandoTorneo] = useState(false);
  const [reabriendoTorneo, setReabriendoTorneo] = useState(false);
  const [reiniciandoEliminatoria, setReiniciandoEliminatoria] = useState(false);
  const [savingGrupoNombreId, setSavingGrupoNombreId] = useState<string | null>(
    null
  );
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (!torneoId) {
      setBundle(null);
      return;
    }
    const silent = opts?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [data, ordenOk, canchaOk, programadoOk] = await Promise.all([
        fetchTorneoExpressBundle(torneoId, publicMode),
        publicMode
          ? Promise.resolve(true)
          : checkPartidosOrdenColumnAvailable(),
        publicMode
          ? Promise.resolve(true)
          : checkPartidosCanchaColumnAvailable(),
        publicMode
          ? Promise.resolve(true)
          : checkPartidosProgramadoColumnAvailable(),
      ]);
      setBundle(data);
      setPartidosOrdenDisponible(ordenOk);
      setPartidosCanchaDisponible(canchaOk);
      setPartidosProgramadoDisponible(programadoOk);
      setLastRefreshedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el torneo");
    } finally {
      if (!silent) {
        setLoading(false);
      }
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
    if (!torneoId || !realtime) {
      setRealtimeConnected(false);
      return;
    }

    setRealtimeConnected(false);
    const grupoIds = grupoIdsKey ? grupoIdsKey.split(",").filter(Boolean) : [];
    const unsubscribe = subscribeTorneoExpress(
      torneoId,
      grupoIds,
      () => {
        void reloadRef.current({ silent: true });
      },
      (status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      }
    );
    return () => {
      setRealtimeConnected(false);
      unsubscribe();
    };
  }, [torneoId, realtime, grupoIdsKey]);

  useEffect(() => {
    if (!torneoId || pollIntervalMs <= 0) return;

    const id = window.setInterval(() => {
      void reloadRef.current({ silent: true });
    }, pollIntervalMs);

    return () => window.clearInterval(id);
  }, [torneoId, pollIntervalMs]);

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

  const eliminatoriaLabelMap = useMemo(() => {
    if (!bundle) return {} as Record<string, string>;
    return buildEliminatoriaLabelMap(bundle);
  }, [bundle]);

  const saveResultado = useCallback(
    async (partidoId: string, sets: PartidoSetScore[]) => {
      setSavingPartidoId(partidoId);
      setError(null);
      try {
        await savePartidoResultado(partidoId, sets);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar el resultado");
        // Reflejar estado real si el update parcial/remoto ya ocurrió.
        await reload({ silent: true }).catch(() => undefined);
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

  const saveProgramado = useCallback(
    async (partidoId: string, programadoEn: string | null) => {
      setSavingProgramadoId(partidoId);
      setError(null);
      try {
        await savePartidoProgramado(partidoId, programadoEn);
        await reload();
      } catch (e) {
        if (e instanceof PartidosProgramadoColumnMissingError) {
          setPartidosProgramadoDisponible(false);
        }
        setError(
          e instanceof Error ? e.message : "No se pudo guardar fecha y hora"
        );
        throw e;
      } finally {
        setSavingProgramadoId(null);
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
        throw e;
      } finally {
        setSavingOrden(false);
      }
    },
    [reload]
  );

  const saveEliminatoriaResultado = useCallback(
    async (partidoId: string, sets: PartidoSetScore[]) => {
      setSavingEliminatoriaId(partidoId);
      setError(null);
      try {
        await persistEliminatoriaResultado(partidoId, sets);
        await reload();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "No se pudo guardar el resultado"
        );
        // Tras fallo de propagación, recargar para no mostrar llave inconsistente.
        await reload({ silent: true }).catch(() => undefined);
        throw e;
      } finally {
        setSavingEliminatoriaId(null);
      }
    },
    [reload]
  );

  const saveEliminatoriaCancha = useCallback(
    async (partidoId: string, cancha: string | null) => {
      setSavingEliminatoriaCanchaId(partidoId);
      setError(null);
      try {
        await persistEliminatoriaCancha(partidoId, cancha);
        await reload();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "No se pudo guardar la cancha"
        );
        throw e;
      } finally {
        setSavingEliminatoriaCanchaId(null);
      }
    },
    [reload]
  );

  const saveEliminatoriaProgramado = useCallback(
    async (partidoId: string, programadoEn: string | null) => {
      setSavingEliminatoriaProgramadoId(partidoId);
      setError(null);
      try {
        await persistEliminatoriaProgramado(partidoId, programadoEn);
        await reload();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "No se pudo guardar fecha y hora"
        );
        throw e;
      } finally {
        setSavingEliminatoriaProgramadoId(null);
      }
    },
    [reload]
  );

  const finalizarTorneoEliminatoria = useCallback(async () => {
    if (!torneoId) return;
    setFinalizandoTorneo(true);
    setError(null);
    try {
      await persistFinalizarTorneoEliminatoria(torneoId);
      await reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo finalizar el torneo"
      );
      throw e;
    } finally {
      setFinalizandoTorneo(false);
    }
  }, [reload, torneoId]);

  const reabrirTorneoEliminatoria = useCallback(async () => {
    if (!torneoId) return;
    setReabriendoTorneo(true);
    setError(null);
    try {
      await persistReabrirTorneoEliminatoria(torneoId);
      await reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo reabrir el torneo"
      );
      throw e;
    } finally {
      setReabriendoTorneo(false);
    }
  }, [reload, torneoId]);

  const resetEliminatoriaTorneo = useCallback(async () => {
    if (!torneoId) return;
    setReiniciandoEliminatoria(true);
    setError(null);
    try {
      await persistResetEliminatoria(torneoId);
      await reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error al reiniciar. Intenta de nuevo."
      );
      throw e;
    } finally {
      setReiniciandoEliminatoria(false);
    }
  }, [reload, torneoId]);

  const saveGrupoNombre = useCallback(
    async (grupoId: string, nombre: string) => {
      setSavingGrupoNombreId(grupoId);
      setError(null);
      try {
        const updated = await persistGrupoNombre(grupoId, nombre);
        setBundle((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            grupos: prev.grupos.map((g) => (g.id === grupoId ? updated : g)),
          };
        });
        void reload({ silent: true });
        return updated;
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "No se pudo guardar el nombre del grupo"
        );
        throw e;
      } finally {
        setSavingGrupoNombreId(null);
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
    lastRefreshedAt,
    realtimeConnected,
    standingsByGrupo,
    standingsGeneral,
    saveResultado,
    saveCancha,
    saveProgramado,
    saveOrden,
    saveGrupoNombre,
    saveEliminatoriaResultado,
    saveEliminatoriaCancha,
    saveEliminatoriaProgramado,
    finalizarTorneoEliminatoria,
    reabrirTorneoEliminatoria,
    resetEliminatoriaTorneo,
    eliminatoriaLabelMap,
    savingPartidoId,
    savingCanchaId,
    savingProgramadoId,
    savingEliminatoriaId,
    savingEliminatoriaCanchaId,
    savingEliminatoriaProgramadoId,
    finalizandoTorneo,
    reabriendoTorneo,
    reiniciandoEliminatoria,
    savingOrden,
    savingGrupoNombreId,
    partidosOrdenDisponible,
    partidosCanchaDisponible,
    partidosProgramadoDisponible,
  };
}
