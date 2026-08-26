import { useClubModeEyebrow } from "../../club-experience";
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
  resyncLigaJornadaCareer,
  getLigaById,
  getRanking,
  getRankingEquipos,
  recalcularPuntosLiga,
  startJornada,
  updateScore,
  updateScoreParejasFijas,
  updateScoreParejasFijasPlayoffs,
  updateJornadaFecha,
  updateJornadaHorarioPartidos,
  updatePartidoProgramacion,
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
import {
  getSetsDraftForPartido,
  LigaPartidoSetsScoreForm,
} from "./LigaPartidoSetsScoreForm";
import {
  getPlayoffsDraftForPartido,
  LigaPartidoPlayoffsScoreForm,
} from "./LigaPartidoPlayoffsScoreForm";
import {
  getProgramacionDraftForPartido,
  jornadaFechaDraft,
  LigaJornadaFechaCard,
  LigaPartidoProgramacionFields,
  type PartidoProgramacionDraft,
} from "./LigaPartidoProgramacionFields";
import { resolveLigaJugadorPublicFotos } from "../../lib/liga/publicParejaAvatars";
import { Button } from "../ui";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { ActionBar } from "../platform/ActionBar";
import { ModeEventHeader } from "../platform";
import { ModeHeader } from "../platform/ModeHeader";
import { PublicShareSection } from "../platform/PublicShareSection";
import { ligaGestionarPath, navigateLiga, publicLigaJornadaUrl } from "./ligaNav";
import { LigaPageShell } from "./LigaPageShell";
import { LigaSimpleRankingDual } from "./LigaSimpleRankingDual";
import type { SimpleRankingPresentationRow } from "../../lib/modePresentation/standingsRowAdapters";
import "./liga-page.css";
import "../jugadores/riviera-jugadores.css";

interface LigaJornadaProps {
  ligaId: string;
  numero: number;
}

function parejaLabel(
  parejaId: string,
  jornada: LigaJornada | undefined
): string {
  const p = jornada?.parejas?.find((x) => x.id === parejaId);
  if (!p) return "Pareja";
  const n1 = p.jugador1?.nombre ?? "?";
  const n2 = p.jugador2?.nombre ?? "?";
  return `${n1} / ${n2}`;
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
      return "Finalizada";
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

export const LigaJornadaView: React.FC<LigaJornadaProps> = ({
  ligaId,
  numero,
}) => {
  const modeEyebrow = useClubModeEyebrow();
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
  const [programacionDrafts, setProgramacionDrafts] = useState<
    Record<string, PartidoProgramacionDraft>
  >({});
  const [rondaHoraDrafts, setRondaHoraDrafts] = useState<Record<number, string>>(
    {}
  );
  const [jornadaHoraDraft, setJornadaHoraDraft] = useState("");
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [rankingEquipos, setRankingEquipos] = useState<LigaEquipoRankingItem[]>(
    []
  );
  const [manualPuntos, setManualPuntos] = useState<Record<string, string>>({});
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [parejaFotos, setParejaFotos] = useState<Record<string, string | null>>(
    {}
  );

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

  const jornadaParejasRows = useMemo<SimpleRankingPresentationRow[]>(
    () =>
      jornadaStats.rankingParejas.map((row) => ({
        key: row.parejaId,
        position: row.posicion,
        label: row.nombre,
        points: row.puntos,
        pg: row.victorias,
      })),
    [jornadaStats.rankingParejas]
  );

  useEffect(() => {
    const organizadorId = detalle?.organizador_id;
    const parejas = jornada?.parejas ?? [];
    if (!organizadorId || parejas.length === 0) {
      setParejaFotos({});
      return;
    }

    const entries = parejas.flatMap((p) => {
      const list: { id: string; name: string }[] = [];
      if (p.jugador1_id) {
        list.push({ id: p.jugador1_id, name: p.jugador1?.nombre ?? "" });
      }
      if (p.jugador2_id) {
        list.push({ id: p.jugador2_id, name: p.jugador2?.nombre ?? "" });
      }
      return list;
    });

    let cancelled = false;
    void resolveLigaJugadorPublicFotos(organizadorId, entries, {
      publicOnly: false,
    }).then((fotos) => {
      if (!cancelled) setParejaFotos(fotos);
    });

    return () => {
      cancelled = true;
    };
  }, [detalle?.organizador_id, jornada?.parejas]);

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
        [...partidos].sort((a, b) => (a.cancha ?? 0) - (b.cancha ?? 0)),
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
      [...(jornada?.partidos ?? [])].sort(
        (a, b) => (a.cancha ?? 0) - (b.cancha ?? 0)
      ),
    [jornada]
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
      await updateScore(partido.id, s1, s2, force);
      setMessage("Resultado guardado.");
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
    setBusy(true);
    setError(null);
    try {
      const built = buildPlayoffsPayloadFromDraft(draft);
      const result = await updateScoreParejasFijasPlayoffs(
        partido.id,
        built.score1,
        built.score2,
        built.payload,
        { force }
      );
      if (!result.ok) {
        if (result.error === "conflict" && !force) {
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
          ? "Resultado corregido."
          : "Resultado guardado."
      );
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
      await updateScoreParejasFijas(partido.id, sets, force);
      setSetsDrafts((prev) => {
        const next = { ...prev };
        delete next[partido.id];
        return next;
      });
      setMessage(
        partido.estado === "completed" ? "Resultado corregido." : "Resultado guardado."
      );
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

  const savePartidoProgramacion = async (partido: LigaPartido) => {
    const draft = getProgramacionDraftForPartido(partido, programacionDrafts);
    const cancha = Number(draft.cancha);
    if (!draft.cancha || Number.isNaN(cancha)) {
      setError("Selecciona una cancha.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePartidoProgramacion(
        partido.id,
        { cancha, hora_inicio: draft.hora || null },
        detalle?.canchas_disponibles ?? 1
      );
      setMessage("Cancha y horario guardados.");
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
      await updateJornadaHorarioPartidos(
        jornada.id,
        jornadaHoraDraft || null,
        detalle?.canchas_disponibles ?? 1
      );
      setMessage("Horario aplicado a todos los partidos.");
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
    const msg = jornada.puntos_aplicados
      ? "¿Recalcular el ranking de toda la liga según los resultados guardados? Esto sobrescribe ajustes manuales."
      : "¿Finalizar la jornada y sumar los puntos al ranking acumulado?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await finishJornada(jornada.id);
      if (outcome.careerSyncOk === false) {
        setError(
          outcome.careerSyncMessage ||
            "La jornada se cerró en la liga, pero no se registró el historial Riviera. Usa «Sincronizar historial» para reintentar."
        );
        setMessage(
          jornada.puntos_aplicados
            ? "Ranking recalculado; historial Riviera pendiente."
            : "Jornada finalizada; historial Riviera pendiente."
        );
      } else {
        setMessage(
          jornada.puntos_aplicados
            ? "Ranking recalculado desde la base de datos."
            : "Jornada finalizada. Puntos aplicados al ranking."
        );
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
        "¿Sincronizar el historial Riviera de esta jornada?\n\nLa jornada no se reabre. Solo se completan escrituras faltantes."
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
            "No se pudo sincronizar el historial Riviera."
        );
        setMessage("Historial Riviera pendiente.");
      } else {
        setMessage("Historial Riviera sincronizado.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleRecalcularLiga = async () => {
    if (
      !window.confirm(
        "¿Recalcular todo el ranking de la liga desde los partidos completados?"
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recalcularPuntosLiga(ligaId);
      setMessage("Ranking de la liga recalculado.");
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

  const puedeFinalizar = todosPartidosCompletos;

  const totalPartidos = jornada.partidos?.length ?? 0;
  const nParejas = jornada.parejas?.length ?? 0;
  const partidosEsperados = (nParejas * (nParejas - 1)) / 2;

  return (
    <LigaPageShell>
      <ActionBar className="liga-toolbar riviera-back-toolbar">
        <Button
          type="button"
          variant="back"
          onClick={() => navigateLiga(ligaGestionarPath(ligaId))}
        >
          ← {detalle.nombre}
        </Button>
      </ActionBar>

      {/* Desktop: header actual sin cambios, oculto solo en móvil (≤767px)
       * para no duplicar con ModeEventHeader — ver docs/GAME-MODES-UI-ARCHITECTURE.md
       * Fase 2A punto 2 ("LigaJornadaView en su vista móvil"). */}
      <ModeHeader
        className="liga-header rv-mode-header liga-jornada-header-desktop"
        eyebrow={modeEyebrow}
        title={`Liga: ${detalle.nombre} — ${ligaJornadaTitulo(
          numero,
          detalle.modalidad,
          detalle.equipos?.length
        )}`}
        subtitle={`Estado: ${jornadaEstadoLabel(jornada.estado)}${
          totalPartidos > 0
            ? esParejasFijas
              ? ` · ${totalPartidos} partidos programados`
              : ` · ${totalPartidos} partidos (${nParejas} parejas, todos vs todos)`
            : ""
        }`}
      />

      {/* Móvil (≤767px): mismo contenido (nombre de la liga, jornada, estado,
       * info de partidos), reorganizado en las mismas piezas de ModeEventHeader.
       * Usa su propia visibilidad móvil-only por defecto (mode-mobile-shell.css),
       * sin overrides — nunca coexiste visualmente con el header de arriba. */}
      <ModeEventHeader
        eyebrow={modeEyebrow}
        title={ligaJornadaTitulo(
          numero,
          detalle.modalidad,
          detalle.equipos?.length
        )}
        modality={detalle.nombre}
        statusLabel={jornadaEstadoLabel(jornada.estado)}
        statusVariant={jornadaEstadoStatusVariant(jornada.estado)}
        summary={
          totalPartidos > 0
            ? esParejasFijas
              ? `${totalPartidos} partidos programados`
              : `${totalPartidos} partidos (${nParejas} parejas, todos vs todos)`
            : undefined
        }
      />

      <PublicShareSection
        className="liga-jornada-share"
        publicUrl={publicLigaJornadaUrl(ligaId, numero)}
        title="Enlace vista pública"
        infoLines={["Proyecta esta jornada en vista pública (TV o tablet)."]}
        copyButtonLabel="Copiar enlace"
        previewLabel="Abrir vista pública"
        onCopy={async () => {
          try {
            const { buildSharePublicOgUrlFromPlayUrl } = await import(
              "../../lib/retaAbierta/shareOgUrl"
            );
            const play = publicLigaJornadaUrl(ligaId, numero);
            await navigator.clipboard.writeText(
              buildSharePublicOgUrlFromPlayUrl(play) || play
            );
            setMessage("Enlace copiado. También puedes abrir la vista pública.");
          } catch {
            setError("No se pudo copiar el enlace.");
          }
        }}
      />

      {message ? <p className="liga-success">{message}</p> : null}
      {error ? <p className="liga-error">{error}</p> : null}

      {(jornada.partidos?.length ?? 0) > 0 && (
        <LigaJornadaFechaCard
          fecha={jornadaFechaDraft(
            jornada.fecha,
            jornadaFechaDrafts,
            jornada.id
          )}
          disabled={busy}
          busy={busy}
          onChange={(fecha) =>
            setJornadaFechaDrafts((prev) => ({
              ...prev,
              [jornada.id]: fecha,
            }))
          }
          onSave={saveJornadaFecha}
        />
      )}

      <div className="liga-card rv-card">
        <div className="liga-jornada-parejas-head">
          <h2 className="liga-card__title">Parejas de la jornada</h2>
          {nParejas > 0 ? (
            <span className="liga-jornada-parejas-count">{nParejas}</span>
          ) : null}
        </div>
        {nParejas === 0 ? (
          <p className="liga-hint">Aún no hay parejas en esta jornada.</p>
        ) : (
          <ul className="liga-jornada-parejas" aria-label="Parejas de la jornada">
            {(jornada.parejas ?? []).map((p) => {
              const name1 = p.jugador1?.nombre?.trim() || "?";
              const name2 = p.jugador2?.nombre?.trim() || "?";
              return (
                <li key={p.id} className="liga-jornada-pareja">
                  <div className="liga-jornada-pareja__players">
                    <div className="liga-jornada-pareja__person">
                      <JugadorAvatar
                        fotoUrl={parejaFotos[p.jugador1_id] ?? null}
                        nombre={name1}
                        size="sm"
                        className="liga-jornada-pareja__avatar"
                      />
                      <span className="liga-jornada-pareja__name">{name1}</span>
                    </div>
                    <div className="liga-jornada-pareja__person">
                      <JugadorAvatar
                        fotoUrl={parejaFotos[p.jugador2_id] ?? null}
                        nombre={name2}
                        size="sm"
                        className="liga-jornada-pareja__avatar"
                      />
                      <span className="liga-jornada-pareja__name">{name2}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {jornada.estado === "upcoming" && (
          <div className="liga-actions liga-jornada-parejas-actions">
            <Button
              type="button"
              variant="primary"
              disabled={!puedeIniciar || busy}
              onClick={handleStartJornada}
            >
              Iniciar jornada
            </Button>
            {!puedeIniciar && (
              <p className="liga-error">Se requieren al menos 3 parejas.</p>
            )}
            {puedeIniciar && esParejasFijas && (
              <p className="liga-hint">
                Cada pareja juega un partido esta jornada (en paralelo en distintas
                canchas).
              </p>
            )}
            {puedeIniciar && !esParejasFijas && nParejas >= 3 && (
              <p className="liga-hint">
                Se generarán {partidosEsperados} partidos en varias rondas (máx.{" "}
                {detalle.canchas_disponibles} canchas por ronda).
              </p>
            )}
          </div>
        )}
      </div>

      <div className="liga-jornada-admin">
        <div className="liga-jornada-admin__main">
      {esParejasFijas && partidosJornadaOrdenados.length > 0 && (
        <div className="liga-card rv-card">
          <h2 className="liga-card__title">Partidos de la jornada</h2>
          <p className="liga-hint">
            Cada pareja juega un enfrentamiento distinto. Ajusta cancha y horario
            para rotar entre canchas.
          </p>
          <div className="liga-ronda-programacion liga-jornada-horario-bulk">
            <label className="liga-programacion-field">
              <span className="liga-programacion-field__label">
                Horario jornada
              </span>
              <input
                type="time"
                value={jornadaHoraDraft}
                disabled={busy}
                onChange={(e) => setJornadaHoraDraft(timeInputValue(e.target.value))}
                aria-label="Horario de la jornada"
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={saveJornadaHorario}
            >
              Aplicar a todos
            </Button>
          </div>
          {partidosJornadaOrdenados.map((partido) => {
            const setsDraft = getSetsDraftForPartido(partido, setsDrafts);
            const playoffsDraft = getPlayoffsDraftForPartido(
              partido,
              playoffsDrafts
            );
            const progDraft = getProgramacionDraftForPartido(
              partido,
              programacionDrafts
            );
            const bloqueado = jornada.estado === "upcoming";

            return (
              <div
                key={partido.id}
                className={`liga-partido-row${
                  bloqueado ? " liga-partido-row--locked" : ""
                }`}
              >
                <p className="liga-partido-row__teams">
                  {parejaLabel(partido.pareja1_id, jornada)} vs{" "}
                  {parejaLabel(partido.pareja2_id, jornada)}
                  {partido.bracket_slot ? (
                    <span className="liga-hint"> · {partido.bracket_slot}</span>
                  ) : null}
                </p>
                <LigaPartidoProgramacionFields
                  partido={partido}
                  draft={progDraft}
                  canchasDisponibles={detalle.canchas_disponibles}
                  disabled={bloqueado}
                  busy={busy}
                  onChange={(next) =>
                    setProgramacionDrafts((prev) => ({
                      ...prev,
                      [partido.id]: next,
                    }))
                  }
                  onSave={() => savePartidoProgramacion(partido)}
                />
                {esPlayoffs ? (
                  <LigaPartidoPlayoffsScoreForm
                    partido={partido}
                    draft={playoffsDraft}
                    disabled={bloqueado}
                    busy={busy}
                    onChange={(next) =>
                      setPlayoffsDrafts((prev) => ({
                        ...prev,
                        [partido.id]: next,
                      }))
                    }
                    onSave={() => saveScoreParejasFijasPlayoffs(partido)}
                  />
                ) : esFijasLegacy ? (
                  <LigaPartidoSetsScoreForm
                    partido={partido}
                    draft={setsDraft}
                    disabled={bloqueado}
                    busy={busy}
                    onChange={(next) =>
                      setSetsDrafts((prev) => ({
                        ...prev,
                        [partido.id]: next,
                      }))
                    }
                    onSave={() => saveScoreParejasFijas(partido)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {!esParejasFijas && partidosByRonda.length > 0 && (
        <div className="liga-card rv-card">
          <h2 className="liga-card__title">Partidos por ronda</h2>
          {partidosByRonda.map(([ronda, partidos]) => {
            const completa = rondaCompleta(partidos);
            const enCurso = rondaEnCurso(partidos);
            const siguienteRonda = partidosByRonda.find(([r]) => r === ronda + 1);
            const haySiguiente = Boolean(siguienteRonda);
            const siguienteSoloUpcoming =
              haySiguiente &&
              siguienteRonda![1].every((p) => p.estado === "upcoming");
            const puedeActivarSiguiente =
              completa && haySiguiente && siguienteSoloUpcoming;

            return (
              <section
                key={ronda}
                className={`liga-ronda-block${
                  rondaActiva === ronda ? " liga-ronda-block--active" : ""
                }`}
              >
                <div className="liga-ronda-block__head">
                  <h3 className="liga-ronda-label">Ronda {ronda}</h3>
                  <span className="liga-badge">
                    {completa
                      ? "Completada"
                      : enCurso
                        ? "En curso"
                        : "Pendiente"}
                  </span>
                </div>

                <div className="liga-ronda-programacion">
                  <label className="liga-programacion-field">
                    <span className="liga-programacion-field__label">
                      Horario ronda
                    </span>
                    <input
                      type="time"
                      value={rondaHoraDrafts[ronda] ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        setRondaHoraDrafts((prev) => ({
                          ...prev,
                          [ronda]: timeInputValue(e.target.value),
                        }))
                      }
                      aria-label={`Horario ronda ${ronda}`}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => saveRondaHorario(ronda)}
                  >
                    Aplicar a ronda
                  </Button>
                </div>

                {partidos.map((partido) => {
                  const draft = scores[partido.id] ?? {
                    s1: String(partido.score_pareja1 ?? ""),
                    s2: String(partido.score_pareja2 ?? ""),
                  };
                  const progDraft = getProgramacionDraftForPartido(
                    partido,
                    programacionDrafts
                  );
                  const bloqueado =
                    partido.estado === "upcoming" && rondaActiva !== ronda;

                  return (
                    <div
                      key={partido.id}
                      className={`liga-partido-row${
                        bloqueado ? " liga-partido-row--locked" : ""
                      }`}
                    >
                      <p className="liga-partido-row__teams">
                        {parejaLabel(partido.pareja1_id, jornada)} vs{" "}
                        {parejaLabel(partido.pareja2_id, jornada)}
                      </p>
                      <LigaPartidoProgramacionFields
                        partido={partido}
                        draft={progDraft}
                        canchasDisponibles={detalle.canchas_disponibles}
                        disabled={bloqueado}
                        busy={busy}
                        onChange={(next) =>
                          setProgramacionDrafts((prev) => ({
                            ...prev,
                            [partido.id]: next,
                          }))
                        }
                        onSave={() => savePartidoProgramacion(partido)}
                      />
                      <div className="liga-score-row">
                        <input
                          type="number"
                          min={0}
                          value={draft.s1}
                          disabled={bloqueado || busy}
                          onChange={(e) =>
                            setScores((prev) => ({
                              ...prev,
                              [partido.id]: { ...draft, s1: e.target.value },
                            }))
                          }
                          aria-label="Puntos pareja 1"
                        />
                        <span>—</span>
                        <input
                          type="number"
                          min={0}
                          value={draft.s2}
                          disabled={bloqueado || busy}
                          onChange={(e) =>
                            setScores((prev) => ({
                              ...prev,
                              [partido.id]: { ...draft, s2: e.target.value },
                            }))
                          }
                          aria-label="Puntos pareja 2"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={bloqueado || busy}
                          onClick={() => saveScore(partido)}
                        >
                          Guardar
                        </Button>
                        {partido.estado === "completed" && (
                          <span className="liga-badge liga-badge--done">✓</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {puedeActivarSiguiente && (
                  <div className="liga-actions liga-ronda-block__footer">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleActivarSiguienteRonda(ronda)}
                    >
                      Activar ronda {ronda + 1}
                    </Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {puntosPendientes && (
        <div className="liga-banner liga-banner--warn" role="status">
          Todos los partidos tienen resultado. Pulsa &quot;Finalizar jornada&quot;
          para aplicar los puntos al ranking acumulado.
        </div>
      )}

      {puedeFinalizar && (
        <div className="liga-actions liga-jornada-admin__finish">
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={handleFinalizarJornada}
          >
            {jornada.puntos_aplicados
              ? "Recalcular puntos y ranking"
              : "Finalizar jornada"}
          </Button>
          {jornada.puntos_aplicados ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              title="Completa historial Riviera faltante sin recalcular ranking local"
              onClick={() => {
                void handleResyncJornadaCareer();
              }}
            >
              Sincronizar historial
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={handleRecalcularLiga}
          >
            Recalcular toda la liga
          </Button>
        </div>
      )}
        </div>

        <aside className="liga-jornada-admin__aside">
          {!esParejasFijas && (
          <>
            <LigaSimpleRankingDual
              title="Puntos de esta jornada"
              hint="Calculado desde los partidos guardados (games por jugador)."
              rows={jornadaJugadoresRows}
              columns={[
                { key: "pos", header: "#", render: (r) => r.position },
                { key: "nombre", header: "Jugador", render: (r) => r.label },
                { key: "pts", header: "Pts", render: (r) => r.points },
              ]}
              topRowClassName={(r) =>
                r.position <= 3 ? "liga-ranking-top" : undefined
              }
            />

            {jornadaParejasRows.length > 0 && (
              <LigaSimpleRankingDual
                title="Parejas"
                rows={jornadaParejasRows}
                columns={[
                  { key: "pos", header: "#", render: (r) => r.position },
                  { key: "nombre", header: "Pareja", render: (r) => r.label },
                  { key: "v", header: "V", render: (r) => r.pg ?? 0 },
                  { key: "pts", header: "Pts", render: (r) => r.points },
                ]}
                topRowClassName={(r) =>
                  r.key === jornadaStats.ganadorPareja?.parejaId
                    ? "liga-ranking-top"
                    : undefined
                }
              />
            )}

            {jornadaStats.ganadorPareja && todosPartidosCompletos && (
              <p className="liga-jornada-winner" role="status">
                Ganadora: {jornadaStats.ganadorPareja.nombre} (
                {jornadaStats.ganadorPareja.victorias} victorias)
              </p>
            )}
          </>
          )}

          <div className="liga-card liga-jornada-ranking-card">
            <h2 className="liga-card__title">
              {esParejasFijas ? "Ranking por pareja" : "Ranking acumulado"}
            </h2>
            <p className="liga-hint">
              {esPlayoffs
                ? "Puntos por games totales: Diff ≥2 → 3/0 · Diff 1 → 2/1 · Empate + STB → 2/1 · WO → 3/−1. Se recalcula al guardar."
                : esParejasFijas
                ? "Puntos: 3 victoria en 2 sets, 2 con super tie-break. Se recalcula al guardar resultados."
                : "Puntos en base de datos de la liga. Al guardar resultados o finalizar, se recalcula automáticamente."}
            </p>
            {esParejasFijas ? (
              <LigaSimpleRankingDual
                title=""
                rows={rankingEquiposRows}
                embedded
                emptyMessage="Sin puntos en la liga aún."
                columns={[
                  { key: "pos", header: "#", render: (r) => r.position },
                  { key: "nombre", header: "Pareja", render: (r) => r.label },
                  { key: "pj", header: "PJ", render: (r) => r.matchesPlayed ?? 0 },
                  { key: "pg", header: "PG", render: (r) => r.pg ?? 0 },
                  { key: "pp", header: "PP", render: (r) => r.pp ?? 0 },
                  { key: "gf", header: "GF", render: (r) => r.pointsFav ?? 0 },
                  { key: "gc", header: "GC", render: (r) => r.pointsCon ?? 0 },
                  {
                    key: "dif",
                    header: "DIF",
                    render: (r) =>
                      (r.pointsFav ?? 0) - (r.pointsCon ?? 0),
                  },
                  { key: "pts", header: "PTS", render: (r) => r.points },
                ]}
                topRowClassName={(r) =>
                  r.position <= 3 ? "liga-ranking-top" : undefined
                }
              />
            ) : (
              <LigaSimpleRankingDual
                title=""
                rows={rankingJugadoresRows}
                embedded
                emptyMessage="Sin puntos en la liga aún."
                columns={[
                  { key: "pos", header: "#", render: (r) => r.position },
                  { key: "nombre", header: "Jugador", render: (r) => r.label },
                  { key: "pts", header: "Pts", render: (r) => r.points },
                  {
                    key: "jorn",
                    header: "Jorn.",
                    render: (r) => r.matchesPlayed ?? 0,
                  },
                ]}
                topRowClassName={(r) =>
                  r.position <= 3 ? "liga-ranking-top" : undefined
                }
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
                    Solo para correcciones excepcionales. &quot;Recalcular&quot;
                    volverá a calcular desde los partidos.
                  </p>
                  {ranking.map((row) => (
                    <div key={row.jugador_id} className="liga-jornada-manual__row">
                      <span className="liga-jornada-manual__name">
                        {row.nombre}
                      </span>
                      <input
                        type="number"
                        min={0}
                        className="liga-jornada-manual__input"
                        value={manualPuntos[row.jugador_id] ?? String(row.puntos)}
                        disabled={busy}
                        onChange={(e) =>
                          setManualPuntos((prev) => ({
                            ...prev,
                            [row.jugador_id]: e.target.value,
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
        </aside>
      </div>
    </LigaPageShell>
  );
};
