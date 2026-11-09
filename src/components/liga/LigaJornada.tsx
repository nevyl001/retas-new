import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { computeJornadaPublicStats } from "../../lib/liga/jornadaStats";
import type {
  LigaDetalle,
  LigaEquipoRankingItem,
  LigaJornada,
  LigaPartido,
  RankingItem,
} from "../../lib/liga/types";
import {
  actualizarMotivoCorreccion,
  actualizarPuntosInscripcion,
  listarCorreccionesPuntos,
  type CorreccionPuntosLiga,
  finishJornada,
  getLigaById,
  getRanking,
  getRankingEquipos,
  resetPartidoResult,
  resyncLigaJornadaCareer,
  resyncLigaJornadaCareerIfMissing,
  startJornada,
  regenerarPartidosJornadaRotativo,
  updateScore,
  updateScoreParejasFijas,
  updateScoreParejasFijasPlayoffs,
  updateJornadaFecha,
  updateJornadaHoraInicio,
} from "../../services/ligaService";
import {
  buildSetsFromDraft,
  normalizeParejasFijasDraft,
  validateParejasFijasDraft,
  type ParejasFijasSetsDraft,
} from "../../lib/liga/parejasFijasMatchScore";
import {
  buildPlayoffsPayloadFromDraft,
  type PlayoffsScoreDraft,
} from "../../lib/liga/parejasFijasPlayoffsMatchScore";
import {
  isEquiposModalidad,
  isParejasFijasLegacy,
  isParejasFijasPlayoffs,
} from "../../lib/liga/ligaModalidad";
import { ligaJornadaTitulo } from "../../lib/liga/types";
import { getSetsDraftForPartido } from "./LigaPartidoSetsScoreForm";
import { getPlayoffsDraftForPartido } from "./LigaPartidoPlayoffsScoreForm";
import { jornadaFechaDraft } from "./LigaPartidoProgramacionFields";
import { Button } from "../ui";
import { LigaPageShell } from "./LigaPageShell";
import { uniqueCanchas } from "./ligaPartidoCaptureUi";
import { JornadaAdminHeader } from "./jornada-admin/JornadaAdminHeader";
import { JornadaScheduleToolbar } from "./jornada-admin/JornadaScheduleToolbar";
import { JornadaStartBar } from "./jornada-admin/JornadaStartBar";
import { ResultsToolbar } from "./jornada-admin/ResultsToolbar";
import { RoundSection } from "./jornada-admin/RoundSection";
import { MatchScoreCard } from "./jornada-admin/MatchScoreCard";
import { JornadaStandings, type JornadaStandingsColumn } from "./jornada-admin/JornadaStandings";
import {
  filterPartidosByCancha,
  groupPartidosByRonda,
  parejaLabel,
  rondaHoraLabel,
} from "./jornada-admin/jornadaAdminUtils";
import { resolveLigaJugadorPublicProfiles } from "../../lib/liga/publicParejaAvatars";
import { ligaGestionarPath, navigateLiga, publicLigaJornadaUrl } from "./ligaNav";
import type { SimpleRankingPresentationRow } from "../../lib/modePresentation/standingsRowAdapters";
import "./liga-page.css";
import "./jornada-admin/liga-jornada-admin.css";

interface LigaJornadaProps {
  ligaId: string;
  numero: number;
}

function rondaCompleta(partidos: LigaPartido[]): boolean {
  return (
    partidos.length > 0 && partidos.every((p) => p.estado === "completed")
  );
}

function rondaEnCurso(partidos: LigaPartido[]): boolean {
  return partidos.some((p) => p.estado === "in_progress");
}

function jornadaEstadoLabel(estado: LigaJornada["estado"]): string {
  switch (estado) {
    case "upcoming":
      return "Próxima";
    case "in_progress":
      return "En curso";
    case "completed":
      return "Completada";
    default:
      return estado;
  }
}

export function jornadaEstadoStatusVariant(
  estado: LigaJornada["estado"]
): "live" | "pending" | "gold" | "muted" {
  switch (estado) {
    case "in_progress":
      return "live";
    case "completed":
      return "gold";
    default:
      return "pending";
  }
}

async function activarSiguienteRonda(
  jornadaId: string,
  rondaActual: number
): Promise<void> {
  const { error } = await supabase
    .from("liga_partidos")
    .update({ estado: "in_progress" })
    .eq("jornada_id", jornadaId)
    .eq("ronda", rondaActual + 1)
    .eq("estado", "upcoming");

  if (error) throw new Error(error.message);
}

const PAREJAS_JORNADA_RANKING_COLUMNS: JornadaStandingsColumn[] = [
  { key: "pos", header: "POS", align: "center", render: (r) => r.position },
  { key: "nombre", header: "Pareja", render: (r) => r.label },
  { key: "pj", header: "PJ", align: "center", render: (r) => r.matchesPlayed ?? 0 },
  { key: "pg", header: "PG", align: "center", render: (r) => r.pg ?? 0 },
  { key: "pp", header: "PP", align: "center", render: (r) => r.pp ?? 0 },
  { key: "gf", header: "GF", align: "center", render: (r) => r.pointsFav ?? 0 },
  { key: "gc", header: "GC", align: "center", render: (r) => r.pointsCon ?? 0 },
  {
    key: "dif",
    header: "DIF",
    align: "center",
    render: (r) => (r.pointsFav ?? 0) - (r.pointsCon ?? 0),
  },
  {
    key: "pts",
    header: "PTS",
    align: "right",
    emphasis: true,
    render: (r) => r.points,
  },
];

function IconoLapiz() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" />
    </svg>
  );
}

export const LigaJornadaView: React.FC<LigaJornadaProps> = ({
  ligaId,
  numero,
}) => {
  const [detalle, setDetalle] = useState<LigaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scores, setScores] = useState<Record<string, { s1: string; s2: string }>>(
    {}
  );
  const [setsDrafts, setSetsDrafts] = useState<
    Record<string, ParejasFijasSetsDraft>
  >({});
  const [playoffsDrafts, setPlayoffsDrafts] = useState<
    Record<string, PlayoffsScoreDraft>
  >({});
  const [jornadaFechaDrafts, setJornadaFechaDrafts] = useState<
    Record<string, string>
  >({});
  const [jornadaHoraDraft, setJornadaHoraDraft] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [savedPartidoFlash, setSavedPartidoFlash] = useState<string | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [rankingEquipos, setRankingEquipos] = useState<LigaEquipoRankingItem[]>(
    []
  );
  const [manualPuntos, setManualPuntos] = useState<Record<string, string>>({});
  const [manualMotivos, setManualMotivos] = useState<Record<string, string>>(
    {}
  );
  const [correcciones, setCorrecciones] = useState<CorreccionPuntosLiga[]>([]);
  const [editCorreccionId, setEditCorreccionId] = useState<string | null>(null);
  const [editCorreccionTexto, setEditCorreccionTexto] = useState("");
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [canchaFilter, setCanchaFilter] = useState<number | "all">("all");
  const [jugadorFotos, setJugadorFotos] = useState<
    Record<string, string | null>
  >({});
  const autoCareerResyncRef = useRef<string | null>(null);
  const autoRepairScheduleRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getLigaById(ligaId);
      setDetalle(d);
      if (isEquiposModalidad(d.modalidad)) {
        const rEq = await getRankingEquipos(ligaId);
        setRankingEquipos(rEq);
        setRanking([]);
        setCorrecciones([]);
        setManualPuntos({});
      } else {
        const [rank, historial] = await Promise.all([
          getRanking(ligaId),
          listarCorreccionesPuntos(ligaId),
        ]);
        setRanking(rank);
        setCorrecciones(historial);
        setRankingEquipos([]);
        setManualPuntos(
          Object.fromEntries(rank.map((r) => [r.jugador_id, String(r.puntos)]))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [ligaId]);

  useEffect(() => {
    load();
  }, [load]);

  const jornada = useMemo(
    () => detalle?.jornadas.find((j) => j.numero === numero),
    [detalle, numero]
  );

  useEffect(() => {
    const organizadorId = detalle?.organizador_id;
    if (!organizadorId || !jornada) {
      setJugadorFotos({});
      return;
    }
    const byId = new Map<string, string>();
    for (const p of jornada.parejas ?? []) {
      if (p.jugador1_id) {
        byId.set(p.jugador1_id, p.jugador1?.nombre ?? "");
      }
      if (p.jugador2_id) {
        byId.set(p.jugador2_id, p.jugador2?.nombre ?? "");
      }
    }
    for (const j of detalle.jugadores ?? []) {
      if (!byId.has(j.id)) byId.set(j.id, j.nombre);
    }
    const entries = Array.from(byId.entries()).map(([id, name]) => ({
      id,
      name,
    }));
    if (entries.length === 0) {
      setJugadorFotos({});
      return;
    }
    let cancelled = false;
    void resolveLigaJugadorPublicProfiles(organizadorId, entries)
      .then((profiles) => {
        if (cancelled || !profiles) return;
        const fotos: Record<string, string | null> = {};
        for (const entry of entries) {
          fotos[entry.id] = profiles[entry.id]?.fotoUrl ?? null;
        }
        setJugadorFotos(fotos);
      })
      .catch((err) => {
        console.warn("[liga] fotos jornada admin:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [detalle, jornada]);

  // Al abrir una jornada ya cerrada, reparar historial Riviera automáticamente
  // (idempotente). Cubre el caso “Completada” sin GANADOR JORNADA N.
  useEffect(() => {
    if (!jornada?.id) return;
    const partidos = jornada.partidos ?? [];
    const completa =
      partidos.length > 0 && partidos.every((p) => p.estado === "completed");
    if (!completa) return;
    if (!(jornada.estado === "completed" || jornada.puntos_aplicados)) return;
    if (autoCareerResyncRef.current === jornada.id) return;

    const jornadaId = jornada.id;
    // Una sola pasada automática por jornada abierta. Reintentar en cada
    // refresh relanzaba el ensure de todas las cesiones del club.
    autoCareerResyncRef.current = jornadaId;
    let cancelled = false;
    void (async () => {
      try {
        const outcome = await resyncLigaJornadaCareerIfMissing(jornadaId);
        if (cancelled) return;
        if (outcome.alreadyRecorded) return;
        if (outcome.careerSyncOk) {
          setMessage(
            "Historial Riviera sincronizado: ganadores y puntos de la jornada."
          );
        } else if (outcome.careerSyncMessage) {
          setError(outcome.careerSyncMessage);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[liga] auto-resync jornada career:", err);
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo sincronizar el historial Riviera de la jornada."
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jornada]);

  useEffect(() => {
    if (!jornada?.partidos?.length) {
      setJornadaHoraDraft("");
      return;
    }
    const rounds = groupPartidosByRonda(jornada.partidos);
    const ronda1 = rounds.find(([ronda]) => ronda === 1)?.[1] ?? [];
    setJornadaHoraDraft(rondaHoraLabel(ronda1) ?? "");
  }, [jornada?.id, jornada?.partidos]);

  const esParejasFijas = detalle ? isEquiposModalidad(detalle.modalidad) : false;
  const esPlayoffs = detalle
    ? isParejasFijasPlayoffs(detalle.modalidad)
    : false;
  const esFijasLegacy = detalle
    ? isParejasFijasLegacy(detalle.modalidad)
    : false;

  const jornadaStats = useMemo(
    () => computeJornadaPublicStats(jornada, { parejasFijas: esParejasFijas }),
    [jornada, esParejasFijas]
  );

  const flashPartidoSaved = (partidoId: string) => {
    setSavedPartidoFlash(partidoId);
    window.setTimeout(() => {
      setSavedPartidoFlash((current) =>
        current === partidoId ? null : current
      );
    }, 2000);
  };

  const rankingEquiposRows = useMemo<SimpleRankingPresentationRow[]>(
    () =>
      rankingEquipos.map((row) => ({
        key: row.equipo_id,
        position: row.posicion,
        label: row.nombre,
        points: row.puntos,
        matchesPlayed: row.partidos_jugados,
        pg: row.partidos_ganados,
        pp: row.partidos_perdidos,
        pointsFav: row.games_favor,
        pointsCon: row.games_contra,
      })),
    [rankingEquipos]
  );

  const jornadaParejasRows = useMemo<SimpleRankingPresentationRow[]>(
    () =>
      jornadaStats.rankingParejas.map((row) => ({
        key: row.parejaId,
        position: row.posicion,
        label: row.nombre,
        points: row.puntos,
        matchesPlayed: row.victorias + row.derrotas + row.empates,
        pg: row.victorias,
        pp: row.derrotas,
        pointsFav: row.games_favor,
        pointsCon: row.games_contra,
      })),
    [jornadaStats.rankingParejas]
  );

  const rankingJugadoresRows = useMemo<SimpleRankingPresentationRow[]>(
    () =>
      ranking.map((row) => ({
        key: row.jugador_id,
        position: row.posicion,
        label: row.nombre,
        points: row.puntos,
        matchesPlayed: row.jornadas_jugadas,
      })),
    [ranking]
  );

  const partidosByRonda = useMemo(() => {
    const map = new Map<number, LigaPartido[]>();
    for (const p of jornada?.partidos ?? []) {
      const list = map.get(p.ronda) ?? [];
      list.push(p);
      map.set(p.ronda, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ronda, partidos]) => [
        ronda,
        [...partidos].sort((a, b) => {
          const byCancha = (a.cancha ?? 0) - (b.cancha ?? 0);
          if (byCancha !== 0) return byCancha;
          return a.id.localeCompare(b.id);
        }),
      ] as [number, LigaPartido[]]);
  }, [jornada]);

  const rondaActiva = useMemo(() => {
    for (const [ronda, partidos] of partidosByRonda) {
      if (rondaEnCurso(partidos)) return ronda;
    }
    for (const [ronda, partidos] of partidosByRonda) {
      if (!rondaCompleta(partidos)) return ronda;
    }
    return null;
  }, [partidosByRonda]);

  const partidosJornadaOrdenados = useMemo(
    () =>
      [...(jornada?.partidos ?? [])].sort((a, b) => {
        const byRonda = (a.ronda ?? 0) - (b.ronda ?? 0);
        if (byRonda !== 0) return byRonda;
        const byCancha = (a.cancha ?? 0) - (b.cancha ?? 0);
        if (byCancha !== 0) return byCancha;
        return a.id.localeCompare(b.id);
      }),
    [jornada]
  );

  const canchasEnJornada = useMemo(
    () => uniqueCanchas(partidosJornadaOrdenados),
    [partidosJornadaOrdenados]
  );

  const partidosByRondaFiltered = useMemo(
    () =>
      partidosByRonda
        .map(
          ([ronda, partidos]) =>
            [ronda, filterPartidosByCancha(partidos, canchaFilter)] as [
              number,
              LigaPartido[],
            ]
        )
        .filter(([, list]) => list.length > 0),
    [partidosByRonda, canchaFilter]
  );

  const handleStartJornada = async () => {
    if (!jornada) return;
    setBusy(true);
    setError(null);
    try {
      await startJornada(jornada.id);
      setMessage(
        detalle?.modalidad === "parejas_fijas"
          ? "Jornada iniciada."
          : "Jornada iniciada. Partidos generados."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerarPartidos = async (opts?: { silent?: boolean }) => {
    if (!jornada || esParejasFijas || !detalle) return;
    const nP = jornada.parejas?.length ?? 0;
    const maxPorRonda = Math.min(
      Math.max(1, detalle.canchas_disponibles ?? 1),
      Math.floor(nP / 2)
    );
    const esperadas =
      maxPorRonda > 0 ? Math.ceil((nP * (nP - 1)) / 2 / maxPorRonda) : 0;
    const tieneResultados = (jornada.partidos ?? []).some(
      (p) => p.estado === "completed"
    );
    if (!opts?.silent) {
      const ok = window.confirm(
        tieneResultados
          ? "Hay resultados guardados. ¿Borrar partidos y regenerar el calendario con todas las canchas? Se perderán los marcadores de esta jornada."
          : `¿Regenerar el calendario? Con ${nP} parejas y ${detalle.canchas_disponibles} canchas deben ser ${esperadas} rondas (máx. ${maxPorRonda} partidos por ronda).`
      );
      if (!ok) return;
    } else if (tieneResultados) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await regenerarPartidosJornadaRotativo(jornada.id);
      setMessage(
        `Calendario corregido: ${result.partidos} partidos en ${result.rondas} rondas (llena las canchas).`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  // Auto-repara calendarios greedy (6 parejas / 3 canchas → 5 rondas, no 7).
  useEffect(() => {
    if (!jornada?.id || !detalle || esParejasFijas || busy || loading) return;
    if (jornada.estado === "completed") return;
    const partidos = jornada.partidos ?? [];
    if (partidos.length === 0) return;
    if (partidos.some((p) => p.estado === "completed")) return;
    if (autoRepairScheduleRef.current === jornada.id) return;

    const nP = jornada.parejas?.length ?? 0;
    if (nP < 3) return;
    const maxPorRonda = Math.min(
      Math.max(1, detalle.canchas_disponibles ?? 1),
      Math.floor(nP / 2)
    );
    const esperadas = Math.ceil((nP * (nP - 1)) / 2 / maxPorRonda);
    const byRonda = new Map<number, number>();
    for (const p of partidos) {
      byRonda.set(p.ronda, (byRonda.get(p.ronda) ?? 0) + 1);
    }
    const rondas = byRonda.size;
    const incompletas = Array.from(byRonda.values()).filter(
      (n) => n < maxPorRonda
    ).length;
    const tieneHuecos = rondas > esperadas || incompletas >= 2;
    if (!tieneHuecos) return;

    autoRepairScheduleRef.current = jornada.id;
    void handleRegenerarPartidos({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    jornada?.id,
    jornada?.estado,
    jornada?.partidos,
    jornada?.parejas,
    detalle,
    esParejasFijas,
    busy,
    loading,
  ]);

  const saveScore = async (partido: LigaPartido, force = false) => {
    const draft = scores[partido.id] ?? {
      s1: String(partido.score_pareja1 ?? ""),
      s2: String(partido.score_pareja2 ?? ""),
    };
    const s1 = Number(draft.s1);
    const s2 = Number(draft.s2);
    if (Number.isNaN(s1) || Number.isNaN(s2)) {
      setError("Scores inválidos.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateScore(partido.id, s1, s2, force || partido.estado === "completed");
      setMessage(
        partido.estado === "completed"
          ? "Resultado corregido."
          : "Resultado guardado."
      );
      flashPartidoSaved(partido.id);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      if (msg.includes("sobrescribir") && !force) {
        if (window.confirm(`${msg} ¿Continuar?`)) {
          await saveScore(partido, true);
          return;
        }
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const saveScoreParejasFijasPlayoffs = async (
    partido: LigaPartido,
    force = false
  ) => {
    const draft = getPlayoffsDraftForPartido(partido, playoffsDrafts);
    // Corregir siempre sobrescribe el marcador previo y recalcula ranking.
    const forceWrite = force || partido.estado === "completed";
    setBusy(true);
    setError(null);
    try {
      const built = buildPlayoffsPayloadFromDraft({
        ...draft,
        woWinner: null,
      });
      const result = await updateScoreParejasFijasPlayoffs(
        partido.id,
        built.score1,
        built.score2,
        built.payload,
        { force: forceWrite }
      );
      if (!result.ok) {
        if (result.error === "conflict" && !forceWrite) {
          if (
            window.confirm(
              "Ya hay un resultado distinto. ¿Sobrescribir?"
            )
          ) {
            await saveScoreParejasFijasPlayoffs(partido, true);
            return;
          }
        }
        throw new Error(result.error ?? "No se pudo guardar");
      }
      setPlayoffsDrafts((prev) => {
        const next = { ...prev };
        delete next[partido.id];
        return next;
      });
      setMessage(
        partido.estado === "completed"
          ? "Resultado corregido. Ranking actualizado."
          : "Resultado guardado. Ranking actualizado."
      );
      flashPartidoSaved(partido.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const saveScoreParejasFijas = async (partido: LigaPartido, force = false) => {
    const draft = normalizeParejasFijasDraft(
      getSetsDraftForPartido(partido, setsDrafts)
    );
    const validationError = validateParejasFijasDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sets = buildSetsFromDraft(draft);
      await updateScoreParejasFijas(
        partido.id,
        sets,
        force || partido.estado === "completed"
      );
      setSetsDrafts((prev) => {
        const next = { ...prev };
        delete next[partido.id];
        return next;
      });
      setMessage(
        partido.estado === "completed" ? "Resultado corregido." : "Resultado guardado."
      );
      flashPartidoSaved(partido.id);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      if (msg.includes("sobrescribir") && !force) {
        if (window.confirm(`${msg} ¿Continuar?`)) {
          await saveScoreParejasFijas(partido, true);
          return;
        }
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const resetPartido = async (partido: LigaPartido) => {
    if (partido.estado !== "completed") return;
    if (
      !window.confirm(
        "¿Resetear este partido? Se borrará el resultado y podrás capturarlo de nuevo. El ranking se recalcula."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPartidoResult(partido.id, ligaId);
      setSetsDrafts((prev) => {
        const next = { ...prev };
        delete next[partido.id];
        return next;
      });
      setPlayoffsDrafts((prev) => {
        const next = { ...prev };
        delete next[partido.id];
        return next;
      });
      setScores((prev) => {
        const next = { ...prev };
        delete next[partido.id];
        return next;
      });
      setMessage("Partido reseteado. Puedes capturar el resultado otra vez.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const saveJornadaProgramacion = async () => {
    if (!jornada) return;
    const fecha = jornadaFechaDraft(jornada.fecha, jornadaFechaDrafts, jornada.id);
    setBusy(true);
    setError(null);
    try {
      await updateJornadaFecha(jornada.id, fecha || null);
      await updateJornadaHoraInicio(
        jornada.id,
        jornadaHoraDraft || null,
        detalle?.canchas_disponibles ?? 1
      );
      setMessage("Programación guardada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleActivarSiguienteRonda = async (ronda: number) => {
    if (!jornada) return;
    setBusy(true);
    setError(null);
    try {
      await activarSiguienteRonda(jornada.id, ronda);
      setMessage(`Ronda ${ronda + 1} activada.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleFinalizarJornada = async () => {
    if (!jornada) return;
    if (
      !window.confirm(
        "¿Finalizar la jornada? El ranking se actualizará con los resultados guardados."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await finishJornada(jornada.id);
      if (outcome.careerSyncOk === false) {
        setError(
          outcome.careerSyncMessage ||
            "La jornada se cerró, pero no se registró el historial Riviera. Usa «Sincronizar ranking» para reintentar."
        );
        setMessage("Jornada finalizada; historial Riviera pendiente.");
      } else {
        setMessage("Jornada finalizada. Ranking actualizado.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleResyncJornadaCareer = async () => {
    if (!jornada) return;
    if (
      !window.confirm(
        "¿Sincronizar el ranking Riviera de esta jornada?\n\nLa jornada ya está cerrada. Solo se completan escrituras faltantes (p. ej. +50 al ganador)."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await resyncLigaJornadaCareer(jornada.id);
      if (outcome.careerSyncOk === false) {
        setError(
          outcome.careerSyncMessage ||
            "No se pudo sincronizar el historial Riviera de la jornada."
        );
        setMessage("Historial Riviera pendiente.");
      } else {
        setMessage("Ranking Riviera sincronizado para esta jornada.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleGuardarPuntosManual = async (jugadorId: string) => {
    const raw = manualPuntos[jugadorId];
    const pts = Number(raw);
    if (Number.isNaN(pts) || pts < 0) {
      setError("Puntos inválidos.");
      return;
    }
    const motivo = (manualMotivos[jugadorId] ?? "").trim();
    if (motivo.length < 3) {
      setError(
        "Escribe el motivo del ajuste (mínimo 3 caracteres) para que el jugador lo vea."
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await actualizarPuntosInscripcion(ligaId, jugadorId, pts, motivo);
      setManualMotivos((prev) => {
        const next = { ...prev };
        delete next[jugadorId];
        return next;
      });
      setMessage("Puntos actualizados. El motivo queda visible para el jugador.");
      setEditCorreccionId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleGuardarTextoCorreccion = async (item: CorreccionPuntosLiga) => {
    const texto = editCorreccionTexto.trim();
    if (texto.length < 3) {
      setError("El texto de la corrección necesita al menos 3 caracteres.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await actualizarMotivoCorreccion({
        id: item.id,
        ligaId,
        jugadorId: item.jugador_id,
        motivo: texto,
      });
      setEditCorreccionId(null);
      setMessage("Texto de la corrección actualizado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !detalle) {
    return (
      <LigaPageShell>
        <p>Cargando jornada…</p>
      </LigaPageShell>
    );
  }

  if (!detalle || !jornada) {
    return (
      <LigaPageShell>
        <p className="liga-error">{error ?? "Jornada no encontrada"}</p>
        <Button
          type="button"
          variant="back"
          onClick={() => navigateLiga(ligaGestionarPath(ligaId))}
        >
          Volver
        </Button>
      </LigaPageShell>
    );
  }

  const puedeIniciar = esParejasFijas
    ? jornada.estado === "upcoming" && (jornada.partidos?.length ?? 0) > 0
    : jornada.estado === "upcoming" && (jornada.parejas?.length ?? 0) >= 3;

  const todosPartidosCompletos =
    (jornada.partidos?.length ?? 0) > 0 &&
    jornada.partidos!.every((p) => p.estado === "completed");

  const puntosPendientes =
    todosPartidosCompletos && !jornada.puntos_aplicados;

  /** Jornada ya cerrada localmente: permitir reparar historial Riviera. */
  const puedeResyncCareer =
    todosPartidosCompletos &&
    (jornada.estado === "completed" || jornada.puntos_aplicados);

  const totalPartidos = jornada.partidos?.length ?? 0;
  const nParejas = jornada.parejas?.length ?? 0;
  const partidosEsperados = (nParejas * (nParejas - 1)) / 2;
  const maxPartidosPorRonda = Math.min(
    Math.max(1, detalle.canchas_disponibles ?? 1),
    Math.floor(nParejas / 2)
  );
  const rondasEsperadas =
    maxPartidosPorRonda > 0
      ? Math.ceil(partidosEsperados / maxPartidosPorRonda)
      : 0;
  const calendarioConHuecos =
    !esParejasFijas &&
    totalPartidos > 0 &&
    (partidosByRonda.length > rondasEsperadas ||
      partidosByRonda.filter(([, list]) => list.length < maxPartidosPorRonda)
        .length >= 2);

  const partidosParaCaptura = esParejasFijas
    ? partidosJornadaOrdenados
    : jornada.partidos ?? [];
  const partidosCapturados = partidosParaCaptura.filter(
    (p) => p.estado === "completed"
  ).length;
  const captureTotal = partidosParaCaptura.length;
  const courtFilterActive = canchaFilter !== "all";
  const publicPlayUrl = publicLigaJornadaUrl(ligaId, numero);
  const jornadaTitulo = ligaJornadaTitulo(
    numero,
    detalle.modalidad,
    detalle.equipos?.length
  );

  const handleCopyPublicLink = async () => {
    try {
      const { buildSharePublicOgUrlFromPlayUrl } = await import(
        "../../lib/retaAbierta/shareOgUrl"
      );
      await navigator.clipboard.writeText(
        buildSharePublicOgUrlFromPlayUrl(publicPlayUrl) || publicPlayUrl
      );
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError("No se pudo copiar el enlace.");
    }
  };

  const cancelPartidoEdit = (partidoId: string) => {
    setSetsDrafts((prev) => {
      const next = { ...prev };
      delete next[partidoId];
      return next;
    });
    setPlayoffsDrafts((prev) => {
      const next = { ...prev };
      delete next[partidoId];
      return next;
    });
    setScores((prev) => {
      const next = { ...prev };
      delete next[partidoId];
      return next;
    });
  };

  const renderParejasFijasCard = (partido: LigaPartido) => {
    const bloqueado = jornada.estado === "upcoming";
    const label1 = parejaLabel(partido.pareja1_id, jornada);
    const label2 = parejaLabel(partido.pareja2_id, jornada);
    const setsDraft = getSetsDraftForPartido(partido, setsDrafts);
    const playoffsDraft = getPlayoffsDraftForPartido(partido, playoffsDrafts);

    if (esPlayoffs) {
      return (
        <MatchScoreCard
          key={partido.id}
          partido={partido}
          jornada={jornada}
          mode="playoffs"
          locked={bloqueado}
          busy={busy}
          pareja1Label={label1}
          pareja2Label={label2}
          fotoByJugadorId={jugadorFotos}
          playoffsDraft={playoffsDraft}
          justSaved={savedPartidoFlash === partido.id}
          onPlayoffsChange={(next) =>
            setPlayoffsDrafts((prev) => ({ ...prev, [partido.id]: next }))
          }
          onSave={() => saveScoreParejasFijasPlayoffs(partido)}
          onReset={() => resetPartido(partido)}
          onCancelEdit={() => cancelPartidoEdit(partido.id)}
        />
      );
    }

    if (esFijasLegacy) {
      return (
        <MatchScoreCard
          key={partido.id}
          partido={partido}
          jornada={jornada}
          mode="sets"
          locked={bloqueado}
          busy={busy}
          pareja1Label={label1}
          pareja2Label={label2}
          fotoByJugadorId={jugadorFotos}
          setsDraft={setsDraft}
          justSaved={savedPartidoFlash === partido.id}
          onSetsChange={(next) =>
            setSetsDrafts((prev) => ({ ...prev, [partido.id]: next }))
          }
          onSave={() => saveScoreParejasFijas(partido)}
          onReset={() => resetPartido(partido)}
          onCancelEdit={() => cancelPartidoEdit(partido.id)}
        />
      );
    }

    return null;
  };

  const renderRotativoCard = (partido: LigaPartido, ronda: number) => {
    const draft = scores[partido.id] ?? {
      s1: String(partido.score_pareja1 ?? ""),
      s2: String(partido.score_pareja2 ?? ""),
    };
    const bloqueado =
      partido.estado === "upcoming" && rondaActiva !== ronda;
    const label1 = parejaLabel(partido.pareja1_id, jornada);
    const label2 = parejaLabel(partido.pareja2_id, jornada);

    return (
      <MatchScoreCard
        key={partido.id}
        partido={partido}
        jornada={jornada}
        mode="rotativo"
        locked={bloqueado}
        busy={busy}
        pareja1Label={label1}
        pareja2Label={label2}
        fotoByJugadorId={jugadorFotos}
        rotativoDraft={draft}
        justSaved={savedPartidoFlash === partido.id}
        onRotativoChange={(next) =>
          setScores((prev) => ({ ...prev, [partido.id]: next }))
        }
        onSave={() => saveScore(partido)}
        onReset={() => resetPartido(partido)}
        onCancelEdit={() => cancelPartidoEdit(partido.id)}
      />
    );
  };

  return (
    <LigaPageShell className="liga-jornada-admin-page">
      <div
        className={`jornada-admin${
          courtFilterActive ? " jornada-admin--court-filter" : ""
        }`}
      >
        <JornadaAdminHeader
          ligaNombre={detalle.nombre}
          jornadaTitulo={jornadaTitulo}
          estadoLabel={jornadaEstadoLabel(jornada.estado)}
          partidosCount={totalPartidos}
          publicUrl={publicPlayUrl}
          copyFeedback={linkCopied}
          onCopyLink={() => void handleCopyPublicLink()}
          onBack={() => navigateLiga(ligaGestionarPath(ligaId))}
        />

        {(jornada.partidos?.length ?? 0) > 0 ? (
          <JornadaScheduleToolbar
            fecha={jornadaFechaDraft(
              jornada.fecha,
              jornadaFechaDrafts,
              jornada.id
            )}
            hora={jornadaHoraDraft}
            showBulkHorario
            disabled={busy}
            busy={busy}
            onFechaChange={(fecha) =>
              setJornadaFechaDrafts((prev) => ({
                ...prev,
                [jornada.id]: fecha,
              }))
            }
            onHoraChange={setJornadaHoraDraft}
            onSave={() => void saveJornadaProgramacion()}
          />
        ) : null}

        {message ? (
          <p className="jornada-admin-feedback jornada-admin-feedback--ok">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="jornada-admin-feedback jornada-admin-feedback--err">
            {error}
          </p>
        ) : null}

        {jornada.estado === "upcoming" ? (
          <JornadaStartBar
            puedeIniciar={puedeIniciar}
            busy={busy}
            hint={
              esParejasFijas
                ? "Cada pareja juega un partido esta jornada."
                : nParejas >= 3
                  ? `Se generarán ${partidosEsperados} partidos en varias rondas (máx. ${detalle.canchas_disponibles} canchas por ronda).`
                  : undefined
            }
            onStart={handleStartJornada}
          />
        ) : null}

        {!esParejasFijas && totalPartidos > 0 && jornada.estado !== "completed" ? (
          <div
            className={`jornada-admin-banner${
              calendarioConHuecos ? " jornada-admin-banner--warn" : ""
            }`}
          >
            {calendarioConHuecos ? (
              <p>
                Calendario mal armado: con {nParejas} parejas y{" "}
                {detalle.canchas_disponibles} canchas deben ser {rondasEsperadas}{" "}
                rondas (máx. {maxPartidosPorRonda} partidos por ronda). Ahora hay{" "}
                {partidosByRonda.length}. Regenera para llenar las canchas.
              </p>
            ) : (
              <p>
                Si el calendario no llena las canchas, puedes regenerarlo sin
                resetear toda la liga.
              </p>
            )}
            <Button
              type="button"
              variant={calendarioConHuecos ? "primary" : "secondary"}
              size="sm"
              disabled={busy}
              onClick={() => void handleRegenerarPartidos()}
            >
              Regenerar partidos
            </Button>
          </div>
        ) : null}

        {captureTotal > 0 ? (
          <>
            <ResultsToolbar
              capturados={partidosCapturados}
              total={captureTotal}
              canchas={canchasEnJornada}
              canchaFilter={canchaFilter}
              onCanchaFilterChange={setCanchaFilter}
            />

            <div className="jornada-rounds">
            {partidosByRondaFiltered.map(([ronda, partidos]) => {
              const completa = rondaCompleta(partidos);
              const enCurso = rondaEnCurso(partidos);
              const statusLabel = completa
                ? "Completada"
                : enCurso
                  ? "En curso"
                  : "Pendiente";

              const siguienteRonda = partidosByRonda.find(
                ([r]) => r === ronda + 1
              );
              const haySiguiente = Boolean(siguienteRonda);
              const siguienteSoloUpcoming =
                haySiguiente &&
                siguienteRonda![1].every((p) => p.estado === "upcoming");
              const puedeActivarSiguiente =
                !esParejasFijas &&
                completa &&
                haySiguiente &&
                siguienteSoloUpcoming;

              const tone = completa
                ? "complete"
                : enCurso
                  ? "active"
                  : "pending";
              /* Activa abierta; completada con CTA de activar siguiente también abierta. */
              const defaultCollapsed =
                !esParejasFijas &&
                !(enCurso || puedeActivarSiguiente);

              return (
                <RoundSection
                  key={ronda}
                  ronda={ronda}
                  partidos={partidos}
                  statusLabel={!esParejasFijas ? statusLabel : undefined}
                  resultadosGuardados={
                    partidos.filter((p) => p.estado === "completed").length
                  }
                  tone={!esParejasFijas ? tone : enCurso ? "active" : undefined}
                  defaultCollapsed={defaultCollapsed}
                  footerActions={
                    puedeActivarSiguiente ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={busy}
                        onClick={() => handleActivarSiguienteRonda(ronda)}
                      >
                        Activar ronda {ronda + 1}
                      </Button>
                    ) : null
                  }
                >
                  {partidos.map((partido) =>
                    esParejasFijas
                      ? renderParejasFijasCard(partido)
                      : renderRotativoCard(partido, ronda)
                  )}
                </RoundSection>
              );
            })}
            </div>
          </>
        ) : null}

        {puntosPendientes ? (
          <div className="jornada-admin-banner" role="status">
            Todos los partidos tienen resultado. Al guardar el último, el ranking
            se actualiza solo; si no se reflejó, puedes finalizar la jornada.
          </div>
        ) : null}

        {puntosPendientes ? (
          <div className="jornada-admin-actions">
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={handleFinalizarJornada}
            >
              Finalizar jornada
            </Button>
          </div>
        ) : null}

        {!puntosPendientes && puedeResyncCareer ? (
          <div className="jornada-admin-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={handleResyncJornadaCareer}
            >
              Sincronizar ranking Riviera
            </Button>
          </div>
        ) : null}

        {!esParejasFijas &&
        (jornadaParejasRows.length > 0 || rankingJugadoresRows.length > 0) ? (
          <div className="jornada-standings-dual">
            <JornadaStandings
              sectionId="jornada-ranking-jornada"
              title="Ranking de la jornada"
              hint="Por pareja de esta jornada. PTS → DIF (obtenidos − recibidos) → G (ganados)."
              rows={jornadaParejasRows}
              columns={PAREJAS_JORNADA_RANKING_COLUMNS}
              emptyMessage="Sin resultados en esta jornada aún."
            />
            <JornadaStandings
              sectionId="jornada-ranking-general"
              title="Ranking general"
              hint="Puntos de la liga. Se recalcula al guardar o finalizar."
              rows={rankingJugadoresRows}
              columns={[
                { key: "pos", header: "POS", align: "center", render: (r) => r.position },
                { key: "nombre", header: "Jugador", render: (r) => r.label },
                {
                  key: "pts",
                  header: "PTS",
                  align: "right",
                  emphasis: true,
                  render: (r) => r.points,
                },
                {
                  key: "jorn",
                  header: "Jorn.",
                  align: "center",
                  render: (r) => r.matchesPlayed ?? 0,
                },
              ]}
            />
          </div>
        ) : null}

        {esParejasFijas ? (
          <div className="jornada-standings-dual">
            <JornadaStandings
              sectionId="jornada-ranking-jornada"
              title="Ranking de la jornada"
              hint="Resultados solo de esta jornada. Se recalcula al guardar resultados."
              rows={jornadaParejasRows}
              columns={PAREJAS_JORNADA_RANKING_COLUMNS}
              emptyMessage="Sin resultados en esta jornada aún."
            />
            <JornadaStandings
              sectionId="jornada-ranking-general"
              title="Ranking general"
              hint="Acumulado de toda la liga. Se actualiza al guardar resultados o finalizar la jornada."
              rows={rankingEquiposRows}
              columns={PAREJAS_JORNADA_RANKING_COLUMNS}
            />
          </div>
        ) : null}

        {!esParejasFijas && (
          <div
            className={`liga-jornada-manual${
              showManualEdit ? " liga-jornada-manual--open" : ""
            }`}
          >
            <Button
              type="button"
              variant={showManualEdit ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowManualEdit((v) => !v)}
            >
              {showManualEdit
                ? "Cerrar corrección"
                : "Corregir puntos manualmente"}
            </Button>
            {showManualEdit && (
              <section
                className="liga-jornada-manual__panel"
                aria-labelledby="liga-manual-adjust-title"
              >
                <header className="liga-jornada-manual__panel-head">
                  <p
                    id="liga-manual-adjust-title"
                    className="liga-jornada-manual__panel-title"
                  >
                    Corrección de puntos
                  </p>
                  <p className="liga-jornada-manual__panel-hint">
                    Solo para excepciones. El historial conserva cada
                    corrección. El lápiz cambia solo el texto. Recalcular
                    desde partidos borra el ajuste visible en el ranking.
                  </p>
                </header>
                <ul className="liga-jornada-manual__list">
                  {ranking.map((row) => {
                    const draftPts =
                      manualPuntos[row.jugador_id] ?? String(row.puntos);
                    const ptsNum = Number(draftPts);
                    const changed =
                      Number.isFinite(ptsNum) && ptsNum !== row.puntos;
                    const delta = changed ? ptsNum - row.puntos : 0;
                    const motivo = manualMotivos[row.jugador_id] ?? "";
                    const canSave =
                      changed && motivo.trim().length >= 3 && !busy;
                    const historial = correcciones.filter(
                      (item) => item.jugador_id === row.jugador_id
                    );
                    return (
                      <li
                        key={row.jugador_id}
                        className={`liga-jornada-manual__card${
                          changed ? " is-dirty" : ""
                        }`}
                      >
                        <div className="liga-jornada-manual__card-top">
                          <span className="liga-jornada-manual__name">
                            {row.nombre}
                          </span>
                          <span className="liga-jornada-manual__current">
                            Actual: {row.puntos}
                          </span>
                        </div>
                        <div className="liga-jornada-manual__historial">
                          <span className="liga-jornada-manual__field-label">
                            Historial
                          </span>
                          {historial.length === 0 ? (
                            <p className="liga-jornada-manual__historial-vacio">
                              Sin correcciones
                            </p>
                          ) : (
                            <ul className="liga-jornada-manual__historial-list">
                              {historial.map((item) => {
                                const editando = editCorreccionId === item.id;
                                return (
                                  <li
                                    key={item.id}
                                    className="liga-jornada-manual__historial-item"
                                  >
                                    <div className="liga-jornada-manual__historial-copy">
                                      <span className="liga-jornada-manual__historial-meta">
                                        {new Date(item.created_at).toLocaleString(
                                          "es-MX",
                                          {
                                            dateStyle: "medium",
                                            timeStyle: "short",
                                          }
                                        )}
                                        {" · "}
                                        {item.puntos_antes == null
                                          ? `${item.puntos_despues} pts`
                                          : `${item.puntos_antes} → ${item.puntos_despues}`}
                                      </span>
                                      {editando ? (
                                        <input
                                          type="text"
                                          className="liga-jornada-manual__motivo"
                                          value={editCorreccionTexto}
                                          maxLength={240}
                                          disabled={busy}
                                          aria-label={`Texto de la corrección de ${row.nombre}`}
                                          onChange={(event) =>
                                            setEditCorreccionTexto(
                                              event.target.value
                                            )
                                          }
                                        />
                                      ) : (
                                        <p className="liga-jornada-manual__historial-texto">
                                          {item.motivo}
                                        </p>
                                      )}
                                    </div>
                                    {editando ? (
                                      <button
                                        type="button"
                                        className="liga-jornada-manual__lapiz"
                                        disabled={
                                          busy ||
                                          editCorreccionTexto.trim().length < 3
                                        }
                                        onClick={() =>
                                          void handleGuardarTextoCorreccion(item)
                                        }
                                      >
                                        Guardar
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="liga-jornada-manual__lapiz"
                                        aria-label={`Editar texto de la corrección de ${row.nombre}`}
                                        disabled={busy}
                                        onClick={() => {
                                          setEditCorreccionId(item.id);
                                          setEditCorreccionTexto(item.motivo);
                                        }}
                                      >
                                        <IconoLapiz />
                                      </button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                        <div className="liga-jornada-manual__card-fields">
                          <label
                            className="liga-jornada-manual__field"
                            htmlFor={`jornada-manual-puntos-${row.jugador_id}`}
                          >
                            <span className="liga-jornada-manual__field-label">
                              Nuevos puntos
                            </span>
                            <input
                              id={`jornada-manual-puntos-${row.jugador_id}`}
                              name={`jornada-manual-puntos-${row.jugador_id}`}
                              type="number"
                              min={0}
                              className="liga-jornada-manual__input"
                              value={draftPts}
                              disabled={busy}
                              onChange={(event) =>
                                setManualPuntos((prev) => ({
                                  ...prev,
                                  [row.jugador_id]: event.target.value,
                                }))
                              }
                              aria-label={`Nuevos puntos ${row.nombre}`}
                            />
                          </label>
                          <label
                            className="liga-jornada-manual__field liga-jornada-manual__field--motivo"
                            htmlFor={`jornada-manual-motivo-${row.jugador_id}`}
                          >
                            <span className="liga-jornada-manual__field-label">
                              Motivo
                            </span>
                            <input
                              id={`jornada-manual-motivo-${row.jugador_id}`}
                              name={`jornada-manual-motivo-${row.jugador_id}`}
                              type="text"
                              className="liga-jornada-manual__motivo"
                              value={motivo}
                              disabled={busy}
                              maxLength={240}
                              placeholder="Ej. Corrección por error de captura"
                              onChange={(event) =>
                                setManualMotivos((prev) => ({
                                  ...prev,
                                  [row.jugador_id]: event.target.value,
                                }))
                              }
                              aria-label={`Motivo del ajuste de ${row.nombre}`}
                            />
                          </label>
                        </div>
                        <div className="liga-jornada-manual__card-actions">
                          {changed ? (
                            <span
                              className={`liga-jornada-manual__delta${
                                delta > 0
                                  ? " is-up"
                                  : delta < 0
                                    ? " is-down"
                                    : ""
                              }`}
                            >
                              {delta > 0 ? `+${delta}` : delta} pts
                            </span>
                          ) : (
                            <span className="liga-jornada-manual__delta is-muted">
                              Sin cambio
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            disabled={!canSave}
                            onClick={() =>
                              handleGuardarPuntosManual(row.jugador_id)
                            }
                          >
                            Guardar ajuste
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </LigaPageShell>
  );
};
