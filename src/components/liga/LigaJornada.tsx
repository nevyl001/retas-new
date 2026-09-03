import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { computeJornadaPublicStats } from "../../lib/liga/jornadaStats";
import { timeInputValue } from "../../lib/liga/programacion";
import type {
  LigaDetalle,
  LigaEquipoRankingItem,
  LigaJornada,
  LigaPartido,
  RankingItem,
} from "../../lib/liga/types";
import {
  actualizarPuntosInscripcion,
  finishJornada,
  getLigaById,
  getRanking,
  getRankingEquipos,
  resetPartidoResult,
  resyncLigaJornadaCareer,
  startJornada,
  updateScore,
  updateScoreParejasFijas,
  updateScoreParejasFijasPlayoffs,
  updateJornadaFecha,
  updateJornadaHoraInicio,
  updateRondaProgramacion,
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
  const [rondaHoraDrafts, setRondaHoraDrafts] = useState<Record<number, string>>(
    {}
  );
  const [jornadaHoraDraft, setJornadaHoraDraft] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [savedPartidoFlash, setSavedPartidoFlash] = useState<string | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [rankingEquipos, setRankingEquipos] = useState<LigaEquipoRankingItem[]>(
    []
  );
  const [manualPuntos, setManualPuntos] = useState<Record<string, string>>({});
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [canchaFilter, setCanchaFilter] = useState<number | "all">("all");

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
        setManualPuntos({});
      } else {
        const rank = await getRanking(ligaId);
        setRanking(rank);
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
    if (!jornada?.partidos?.length) {
      setJornadaHoraDraft("");
      setRondaHoraDrafts({});
      return;
    }
    const rounds = groupPartidosByRonda(jornada.partidos);
    const ronda1 = rounds.find(([ronda]) => ronda === 1)?.[1] ?? [];
    setJornadaHoraDraft(rondaHoraLabel(ronda1) ?? "");
    const drafts: Record<number, string> = {};
    for (const [ronda, partidos] of rounds) {
      const hora = rondaHoraLabel(partidos);
      if (hora) drafts[ronda] = hora;
    }
    setRondaHoraDrafts(drafts);
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

  const jornadaJugadoresRows = useMemo<SimpleRankingPresentationRow[]>(
    () =>
      jornadaStats.rankingJugadores.map((row) => ({
        key: row.jugadorId,
        position: row.posicion,
        label: row.nombre,
        points: row.puntos,
      })),
    [jornadaStats.rankingJugadores]
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

  const saveJornadaFecha = async () => {
    if (!jornada) return;
    const fecha = jornadaFechaDraft(jornada.fecha, jornadaFechaDrafts, jornada.id);
    setBusy(true);
    setError(null);
    try {
      await updateJornadaFecha(jornada.id, fecha || null);
      setMessage("Día de jornada guardado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const saveRondaHorario = async (ronda: number) => {
    if (!jornada) return;
    const hora = rondaHoraDrafts[ronda] ?? "";
    setBusy(true);
    setError(null);
    try {
      await updateRondaProgramacion(
        jornada.id,
        ronda,
        { hora_inicio: hora || null },
        detalle?.canchas_disponibles ?? 1
      );
      setMessage(`Horario aplicado a la ronda ${ronda}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const saveJornadaHorario = async () => {
    if (!jornada) return;
    setBusy(true);
    setError(null);
    try {
      await updateJornadaHoraInicio(
        jornada.id,
        jornadaHoraDraft || null,
        detalle?.canchas_disponibles ?? 1
      );
      setMessage("Hora de inicio guardada.");
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
    setBusy(true);
    setError(null);
    try {
      await actualizarPuntosInscripcion(ligaId, jugadorId, pts);
      setMessage("Puntos del jugador actualizados.");
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
            onSaveFecha={saveJornadaFecha}
            onApplyHorario={saveJornadaHorario}
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

              return (
                <RoundSection
                  key={ronda}
                  ronda={ronda}
                  partidos={partidos}
                  statusLabel={!esParejasFijas ? statusLabel : undefined}
                  rondaHorario={
                    !esParejasFijas ? (
                      <div className="jornada-round__schedule">
                        <input
                          id={`jornada-ronda-${ronda}-hora`}
                          name={`jornada-ronda-${ronda}-hora`}
                          type="time"
                          value={rondaHoraDrafts[ronda] ?? ""}
                          disabled={busy}
                          onChange={(event) =>
                            setRondaHoraDrafts((prev) => ({
                              ...prev,
                              [ronda]: timeInputValue(event.target.value),
                            }))
                          }
                          aria-label={`Horario ronda ${ronda}`}
                        />
                        <button
                          type="button"
                          className="jornada-round__schedule-btn"
                          disabled={busy}
                          onClick={() => saveRondaHorario(ronda)}
                        >
                          Aplicar
                        </button>
                      </div>
                    ) : null
                  }
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

        {!esParejasFijas && jornadaJugadoresRows.length > 0 ? (
          <JornadaStandings
            sectionId="jornada-ranking-jornada"
            title="Ranking de la jornada"
            hint="Calculado desde los partidos guardados (games por jugador)."
            rows={jornadaJugadoresRows}
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
            ]}
          />
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
        ) : (
          <JornadaStandings
            sectionId="jornada-ranking-general"
            title="Ranking general"
            hint="Puntos en base de datos de la liga. Al guardar resultados o finalizar, se recalcula automáticamente."
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
        )}

        {!esParejasFijas && (
          <div className="liga-jornada-manual">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowManualEdit((v) => !v)}
            >
              {showManualEdit
                ? "Ocultar ajuste manual"
                : "Corregir puntos manualmente"}
            </Button>
            {showManualEdit && (
              <div className="liga-jornada-manual__list">
                <p className="liga-hint">
                  Solo para correcciones excepcionales. Recalcular volverá a
                  calcular desde los partidos.
                </p>
                {ranking.map((row) => (
                  <div key={row.jugador_id} className="liga-jornada-manual__row">
                    <span className="liga-jornada-manual__name">
                      {row.nombre}
                    </span>
                    <input
                      id={`jornada-manual-puntos-${row.jugador_id}`}
                      name={`jornada-manual-puntos-${row.jugador_id}`}
                      type="number"
                      min={0}
                      className="liga-jornada-manual__input"
                      value={manualPuntos[row.jugador_id] ?? String(row.puntos)}
                      disabled={busy}
                      onChange={(event) =>
                        setManualPuntos((prev) => ({
                          ...prev,
                          [row.jugador_id]: event.target.value,
                        }))
                      }
                      aria-label={`Puntos ${row.nombre}`}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleGuardarPuntosManual(row.jugador_id)}
                    >
                      Guardar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </LigaPageShell>
  );
};
