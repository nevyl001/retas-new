import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildJornadaParejaMatchBreakdowns,
  computeJornadaPublicStats,
  formatSignedPoints,
} from "../../lib/liga/jornadaStats";
import {
  statsParejaJornadaVictoria,
} from "../../lib/liga/jornadaCelebrate";
import {
  formatJornadaParejaNombre,
  getPartidoPublicScoreboard,
  partidoMatchWinnerSide,
} from "../../lib/liga/publicDisplay";
import { jornadaHoraInicioLabel } from "../../lib/liga/programacion";
import type { LigaDetalle, LigaJornada, LigaJornadaPareja, LigaPartido } from "../../lib/liga/types";
import { isEquiposModalidad, isParejasFijasPlayoffs } from "../../lib/liga/ligaModalidad";
import { LIGA_PUBLIC_POLL_INTERVAL_MS } from "../../lib/liga/publicPoll";
import { resolveLigaJugadorPublicFotos } from "../../lib/liga/publicParejaAvatars";
import { getLigaById } from "../../services/ligaService";
import { ClubExperienceScope, PublicEventBrandIdentity, PublicEventNeutralLoading, PublicScopedBrandGate, useClubExperience, useOrganizerDisplayName } from "../../club-experience";
import { isPubDsV2Enabled } from "../../config/peds";
import { useLigaRealtime } from "../../hooks/useLigaRealtime";
import { useVisiblePolling } from "../../hooks/useVisiblePolling";
import type { PublicRetaWinnerAvatar } from "../public/PublicRetaWinnerSection";
import { PublicModeShell } from "../platform/PublicModeShell";
import { StatusBadge } from "../platform/StatusBadge";
import { PublicHero } from "../public/peds";
import { LigaParejaVictoriaCelebrate } from "./LigaParejaVictoriaCelebrate";
import { LigaMotionValue } from "./LigaMotionValue";
import {
  LigaPublicParejaPlayers,
  parejaPlayerNames,
} from "./LigaPublicParejaFaces";
import { LigaJornadaMatchCardFinal } from "./jornada-public/LigaJornadaMatchCardFinal";
import { LigaJornadaMatchCardPending } from "./jornada-public/LigaJornadaMatchCardPending";
import {
  useFlipReorder,
  useInViewOnce,
  useLigaPublicEnterOnce,
} from "../../lib/liga/ligaPublicMotion";
import "./liga-pareja-victoria-celebrate.css";
import "./liga-public-pantalla.css";
import "./liga-public-premium-2026.css";
import "./liga-public-motion.css";
import "./jornada-public/liga-jornada-public-match.css";
import "../jugadores/riviera-jugadores.css";

function jornadaEstadoLabel(estado: LigaJornada["estado"]): string {
  if (estado === "completed") return "Finalizada";
  if (estado === "in_progress") return "En curso";
  return "Próxima";
}

function jornadaEstadoBadgeVariant(
  estado: LigaJornada["estado"]
): "live" | "muted" | "pending" {
  if (estado === "in_progress") return "live";
  if (estado === "completed") return "muted";
  return "pending";
}

function formatJornadaFechaPublica(fecha: string | null | undefined): string | null {
  if (!fecha) return null;
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;
}

interface LigaJornadaPublicaProps {
  ligaId: string;
  numero: number;
}

function rondaLabel(estado: string): string {
  if (estado === "live") return "En curso";
  if (estado === "done") return "Completada";
  return "Pendiente";
}

function partidoPublicEstadoLabel(estado: LigaPartido["estado"]): string {
  if (estado === "completed") return "Final";
  if (estado === "in_progress") return "En juego";
  return "Pendiente";
}

function partidoPublicEstadoMod(
  estado: LigaPartido["estado"]
): "pending" | "live" | "done" {
  if (estado === "completed") return "done";
  if (estado === "in_progress") return "live";
  return "pending";
}

function scoreDisplay(
  partido: LigaPartido
): { s1: string; s2: string } {
  if (partido.estado !== "completed") {
    return { s1: "—", s2: "—" };
  }
  return {
    s1: String(partido.score_pareja1 ?? 0),
    s2: String(partido.score_pareja2 ?? 0),
  };
}

export const LigaJornadaPublica: React.FC<LigaJornadaPublicaProps> = ({
  ligaId,
  numero,
}) => {
  const [detalle, setDetalle] = useState<LigaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [parejaFotos, setParejaFotos] = useState<Record<string, string | null>>(
    {}
  );
  const organizerName = useOrganizerDisplayName(detalle?.organizador_id);
  const { isClubBranded } = useClubExperience();
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, [ligaId, numero]);

  const load = useCallback(async () => {
    try {
      const d = await getLigaById(ligaId, true);
      if (cancelledRef.current) return;
      setDetalle(d);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : "No disponible");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [ligaId]);

  useVisiblePolling({
    callback: load,
    intervalMs: LIGA_PUBLIC_POLL_INTERVAL_MS,
  });

  // Realtime como actualización principal; el polling de arriba queda como respaldo.
  const jornadaIds = useMemo(
    () => (detalle?.jornadas ?? []).map((j) => j.id),
    [detalle]
  );
  useLigaRealtime({
    ligaId,
    jornadaIds,
    onUpdate: load,
    enabled: true,
  });

  const jornada = useMemo(
    () => detalle?.jornadas.find((j) => j.numero === numero),
    [detalle, numero]
  );

  useEffect(() => {
    const organizadorId = detalle?.organizador_id;
    const parejas = jornada?.parejas;
    if (!organizadorId || !parejas?.length) {
      setParejaFotos({});
      return;
    }

    const equiposMap = new Map(
      (detalle?.equipos ?? []).map((e) => [e.id, e] as const)
    );

    const entries = parejas.flatMap((p) => {
      const face = parejaPlayerNames(p, equiposMap);
      const list: { id: string; name: string }[] = [];
      if (face.id1) list.push({ id: face.id1, name: face.name1 });
      if (face.id2) list.push({ id: face.id2, name: face.name2 });
      return list;
    });

    let cancelled = false;
    void resolveLigaJugadorPublicFotos(organizadorId, entries).then((fotos) => {
      if (!cancelled) setParejaFotos(fotos);
    });

    return () => {
      cancelled = true;
    };
  }, [detalle?.organizador_id, detalle?.equipos, jornada?.parejas]);

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

  const rondaEstados = useMemo(() => {
    return partidosByRonda.map(([ronda, partidos]) => {
      const completa = partidos.every((p) => p.estado === "completed");
      const enCurso = partidos.some((p) => p.estado === "in_progress");
      return {
        ronda,
        estado: completa ? "done" : enCurso ? "live" : "pending",
      };
    });
  }, [partidosByRonda]);

  const esParejasFijas = isEquiposModalidad(detalle?.modalidad ?? "individual_rotativo");
  const esParejasFijasPlayoffs = isParejasFijasPlayoffs(
    detalle?.modalidad ?? "individual_rotativo"
  );

  const jornadaStats = useMemo(
    () => computeJornadaPublicStats(jornada, { parejasFijas: esParejasFijas }),
    [jornada, esParejasFijas]
  );

  const jornadaMatchBreakdowns = useMemo(
    () =>
      buildJornadaParejaMatchBreakdowns(jornada, {
        parejasFijas: esParejasFijas,
      }),
    [jornada, esParejasFijas]
  );

  const equiposById = useMemo(
    () => new Map((detalle?.equipos ?? []).map((e) => [e.id, e])),
    [detalle]
  );

  const todosPartidosCompletos =
    (jornada?.partidos?.length ?? 0) > 0 &&
    jornada!.partidos!.every((p) => p.estado === "completed");

  const nombreParejaGanadora = (parejaId: string, fallback: string) => {
    const pareja = jornada?.parejas?.find((p) => p.id === parejaId);
    return pareja
      ? formatJornadaParejaNombre(pareja, equiposById)
      : fallback;
  };

  const winnerAvatarsForPareja = (
    pareja: LigaJornadaPareja | undefined
  ): PublicRetaWinnerAvatar[] | undefined => {
    if (!pareja) return undefined;
    return [
      {
        name: pareja.jugador1?.nombre ?? "?",
        jugadorId: pareja.jugador1_id,
        fotoUrl: parejaFotos[pareja.jugador1_id] ?? undefined,
      },
      {
        name: pareja.jugador2?.nombre ?? "?",
        jugadorId: pareja.jugador2_id,
        fotoUrl: parejaFotos[pareja.jugador2_id] ?? undefined,
      },
    ];
  };

  const resolveParejaFace = (parejaId: string) => {
    const pareja = jornada?.parejas?.find((x) => x.id === parejaId);
    const names = parejaPlayerNames(pareja, equiposById);
    return {
      ...names,
      foto1: names.id1 ? parejaFotos[names.id1] ?? null : null,
      foto2: names.id2 ? parejaFotos[names.id2] ?? null : null,
    };
  };

  const motionReady = Boolean(detalle && jornada);
  const motionResetKey = `${ligaId}:${numero}`;
  const { enterActive, enterDone } = useLigaPublicEnterOnce(
    motionReady && esParejasFijas,
    motionResetKey
  );

  const rankingFlipKeys = useMemo(
    () => jornadaStats.rankingParejas.map((r) => r.parejaId),
    [jornadaStats.rankingParejas]
  );
  const rankingFlipRef = useFlipReorder(
    rankingFlipKeys,
    motionReady && esParejasFijas && enterDone
  );
  const [rankingRevealRef, rankingInView] = useInViewOnce<HTMLOListElement>(
    motionReady && esParejasFijas && enterDone,
    motionResetKey
  );
  const [celebrateRevealRef, celebrateInView] = useInViewOnce<HTMLDivElement>(
    motionReady &&
      esParejasFijas &&
      enterDone &&
      todosPartidosCompletos &&
      Boolean(jornadaStats.ganadorPareja),
    motionResetKey
  );

  const celebratePlayRef = useRef<string | null>(null);
  const [celebratePlay, setCelebratePlay] = useState(false);
  useEffect(() => {
    setCelebratePlay(false);
  }, [motionResetKey]);
  useEffect(() => {
    if (!celebrateInView || !jornadaStats.ganadorPareja) return;
    const key = `${motionResetKey}:${jornadaStats.ganadorPareja.parejaId}`;
    if (celebratePlayRef.current === key) return;
    celebratePlayRef.current = key;
    setCelebratePlay(true);
  }, [celebrateInView, jornadaStats.ganadorPareja, motionResetKey]);

  if (loading && !detalle) {
    return (
      <ClubExperienceScope organizadorId={null} pendingUntilOrganizador>
        <PublicEventNeutralLoading message="Cargando jornada…" />
      </ClubExperienceScope>
    );
  }

  if (!detalle || !jornada) {
    return (
      <ClubExperienceScope
        organizadorId={detalle?.organizador_id ?? null}
        pendingUntilOrganizador={!detalle?.organizador_id}
      >
        <PublicEventNeutralLoading
          message={error ?? "Jornada no encontrada"}
        />
      </ClubExperienceScope>
    );
  }

  const jornadaEstadoText = jornadaEstadoLabel(jornada.estado);
  const jornadaFechaText = formatJornadaFechaPublica(jornada.fecha);
  const jornadaHoraText = jornadaHoraInicioLabel(jornada.partidos ?? []);
  const jornadaFechaHorarioText = [jornadaFechaText, jornadaHoraText]
    .filter(Boolean)
    .join(" · ");
  const canchasDisponibles = Math.max(1, detalle.canchas_disponibles ?? 4);
  const totalPartidos = jornada.partidos?.length ?? 0;

  const renderMatchCard = (
    partido: LigaPartido,
    duelLayout: boolean,
    matchIndex: number
  ) => {
    const { s1, s2 } = scoreDisplay(partido);
    const pending = partido.estado !== "completed";
    const winner = partidoMatchWinnerSide(partido, esParejasFijas);
    const p1Wins = winner === 1;
    const p2Wins = winner === 2;
    const side1 = resolveParejaFace(partido.pareja1_id);
    const side2 = resolveParejaFace(partido.pareja2_id);
    const canchaNum = partido.cancha ?? "?";
    const estadoMod = partidoPublicEstadoMod(partido.estado);
    const estadoText = partidoPublicEstadoLabel(partido.estado);
    const board = getPartidoPublicScoreboard(partido, esParejasFijas);
    const matchStyle = {
      ["--liga-match-i" as string]: matchIndex,
    } as React.CSSProperties;

    if (duelLayout) {
      const pairSide1 = {
        name1: side1.name1,
        name2: side1.name2,
        foto1: side1.foto1,
        foto2: side1.foto2,
      };
      const pairSide2 = {
        name1: side2.name1,
        name2: side2.name2,
        foto1: side2.foto1,
        foto2: side2.foto2,
      };
      const cardProps = {
        canchaNum,
        estadoMod,
        estadoText,
        side1: pairSide1,
        side2: pairSide2,
        board,
        p1Wins,
        p2Wins,
        matchStyle,
      };

      if (partido.estado === "completed") {
        return (
          <LigaJornadaMatchCardFinal key={partido.id} {...cardProps} />
        );
      }

      return (
        <LigaJornadaMatchCardPending
          key={partido.id}
          canchaNum={cardProps.canchaNum}
          estadoMod={cardProps.estadoMod}
          estadoText={cardProps.estadoText}
          side1={cardProps.side1}
          side2={cardProps.side2}
          matchStyle={cardProps.matchStyle}
        />
      );
    }

    return (
      <article
        key={partido.id}
        className="liga-pantalla-match liga-pantalla-match--faces"
        style={matchStyle}
      >
        <header className="liga-pantalla-match__head">
          <span className="liga-pantalla-match__cancha">Cancha {canchaNum}</span>
        </header>
        <div className="liga-pantalla-match__board">
          <div
            className={`liga-pantalla-match__row liga-pantalla-match__row--face${
              p1Wins ? " liga-pantalla-match__row--win" : ""
            }`}
          >
            <LigaPublicParejaPlayers
              name1={side1.name1}
              name2={side1.name2}
              foto1={side1.foto1}
              foto2={side1.foto2}
              size="sm"
              win={p1Wins}
            />
            <span
              className={`liga-pantalla-match__pts${
                pending ? " liga-pantalla-match__pts--pending" : ""
              }`}
            >
              <LigaMotionValue morphKey={s1} value={s1} />
            </span>
          </div>
          <div className="liga-pantalla-match__mid">
            <p className="liga-pantalla-match__vs">vs</p>
          </div>
          <div
            className={`liga-pantalla-match__row liga-pantalla-match__row--face${
              p2Wins ? " liga-pantalla-match__row--win" : ""
            }`}
          >
            <LigaPublicParejaPlayers
              name1={side2.name1}
              name2={side2.name2}
              foto1={side2.foto1}
              foto2={side2.foto2}
              size="sm"
              win={p2Wins}
            />
            <span
              className={`liga-pantalla-match__pts${
                pending ? " liga-pantalla-match__pts--pending" : ""
              }`}
            >
              <LigaMotionValue morphKey={s2} value={s2} />
            </span>
          </div>
        </div>
      </article>
    );
  };

  return (
    <ClubExperienceScope
      organizadorId={detalle.organizador_id}
      pendingUntilOrganizador
    >
    <PublicScopedBrandGate message="Cargando jornada…">
    <div
      className={`liga-pantalla App--public-full-width ro-public-view ro-surface-dark${
        esParejasFijas ? " liga-pantalla--jornada-fijas" : ""
      }${enterActive ? " liga-pantalla--enter" : ""}`}
    >
      <div className="liga-pantalla__grain" aria-hidden />
      <PublicModeShell className="liga-pantalla__inner">
        {isPubDsV2Enabled ? (
          <PublicHero
            className="liga-pantalla-jornada-hero"
            logoClub={
              <PublicEventBrandIdentity className="peds-hero__club-identity" />
            }
            estado={
              <StatusBadge variant={jornadaEstadoBadgeVariant(jornada.estado)}>
                {jornadaEstadoText}
              </StatusBadge>
            }
            nombreEvento={detalle.nombre}
            club={isClubBranded ? organizerName : undefined}
            categoria={`Jornada ${numero}`}
            fecha={jornadaFechaHorarioText || undefined}
            meta={
              totalPartidos > 0
                ? `${partidosByRonda.length} ronda${
                    partidosByRonda.length === 1 ? "" : "s"
                  } · ${canchasDisponibles} canchas`
                : "Liga"
            }
          />
        ) : (
          <header className="liga-pantalla__header">
            <h1 className="liga-pantalla__title">{detalle.nombre}</h1>
            <p className="liga-pantalla__subtitle">
              Jornada {numero}
              {jornadaFechaHorarioText ? ` · ${jornadaFechaHorarioText}` : ""}
              {" · "}
              {jornadaEstadoText}
            </p>
          </header>
        )}

        {/* Roster de parejas solo en el link completo de la liga (LigaDetallePublica).
            En jornada pública: solo partidos + tabla. */}

        <div
          className={`liga-pantalla__layout${
            esParejasFijas ? " liga-pantalla__layout--parejas" : ""
          }`}
        >
          <div className="liga-pantalla__rondas">
            {totalPartidos === 0 ? (
              <p className="liga-pantalla__loading">
                Los partidos aparecerán cuando se inicie la jornada.
              </p>
            ) : (
              partidosByRonda.map(([ronda, partidos]) => {
                const meta = rondaEstados.find((x) => x.ronda === ronda);
                const estado = meta?.estado ?? "pending";
                return (
                  <section
                    key={ronda}
                    className={`liga-pantalla-ronda${
                      esParejasFijas ? " liga-pantalla-ronda--courts" : ""
                    }${estado === "live" ? " liga-pantalla-ronda--live" : ""}`}
                  >
                    <div className="liga-pantalla-ronda__head">
                      <div className="liga-pantalla-ronda__heading">
                        <h2 className="liga-pantalla-ronda__title">
                          Ronda {ronda}
                        </h2>
                        {esParejasFijas ? (
                          <p className="liga-pantalla-ronda__meta">
                            {partidos.length} partido
                            {partidos.length === 1 ? "" : "s"}
                            {" · "}
                            {partidos.length} cancha
                            {partidos.length === 1 ? "" : "s"}
                          </p>
                        ) : null}
                      </div>
                      {estado !== "pending" ? (
                        <span
                          className={`liga-pantalla-ronda__badge${
                            estado === "live"
                              ? " liga-pantalla-ronda__badge--live"
                              : estado === "done"
                                ? " liga-pantalla-ronda__badge--done"
                                : ""
                          }`}
                        >
                          {rondaLabel(estado)}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className={`liga-pantalla-ronda__matches${
                        esParejasFijas
                          ? " liga-pantalla-ronda__matches--courts"
                          : ""
                      }`}
                    >
                      {partidos.map((partido, matchIndex) =>
                        renderMatchCard(partido, esParejasFijas, matchIndex)
                      )}
                    </div>
                  </section>
                );
              })
            )}
          </div>

          <aside
            className={`liga-pantalla-ranking${
              esParejasFijas
                ? " liga-pantalla-ranking--parejas liga-pantalla-ranking--jornada-fijas"
                : ""
            }`}
          >
            {esParejasFijas ? (
              <>
                <h2 className="liga-pantalla-ranking__title">
                  Ranking de la jornada
                </h2>
                <p className="liga-pantalla-ranking__hint">
                  {esParejasFijasPlayoffs
                    ? "PUNTAJE: Victoria 2-0 en sets → Diff games >2 = 3/0 · Diff 1–2 = 2/1. Empate 1-1 en sets → STB a 5 = 2/1. WO = 3/−1. Tabla: PTS → DIF (GF−GC) → enfrentamiento directo."
                    : "Puntos: 3 si gana en 2 sets, 2 si gana en super tie-break, 0 si pierde."}
                </p>
                {jornadaStats.rankingParejas.length === 0 ? (
                  <p className="liga-pantalla__loading">Sin parejas en jornada.</p>
                ) : (
                  <ol
                    ref={(node) => {
                      (
                        rankingFlipRef as React.MutableRefObject<HTMLElement | null>
                      ).current = node;
                      (
                        rankingRevealRef as React.MutableRefObject<HTMLOListElement | null>
                      ).current = node;
                    }}
                    className={`liga-pub-standings liga-pub-standings--jornada liga-motion-reveal${
                      rankingInView ? " is-inview" : ""
                    }`}
                    aria-label="Ranking de la jornada"
                  >
                    {jornadaStats.rankingParejas.map((row, rankIndex) => {
                      const face = resolveParejaFace(row.parejaId);
                      const matchLines =
                        jornadaMatchBreakdowns.get(row.parejaId) ?? [];
                      const gamesDif = row.games_favor - row.games_contra;
                      const gamesDifLabel =
                        gamesDif >= 0 ? `+${gamesDif}` : String(gamesDif);
                      const topClass =
                        row.posicion === 1
                          ? " liga-pub-standings__row--1"
                          : row.posicion === 2
                            ? " liga-pub-standings__row--2"
                            : row.posicion === 3
                              ? " liga-pub-standings__row--3"
                              : "";
                      return (
                        <li
                          key={row.parejaId}
                          data-flip-key={row.parejaId}
                          className={`liga-pub-standings__row${topClass}${
                            rankingInView ? " is-revealing" : ""
                          }`}
                          style={
                            {
                              ["--liga-rank-i" as string]: rankIndex,
                            } as React.CSSProperties
                          }
                        >
                          <div
                            className="liga-pub-standings__pos"
                            aria-label={`Posición ${row.posicion}`}
                          >
                            <span className="liga-pub-standings__pos-num">
                              <LigaMotionValue
                                morphKey={row.posicion}
                                value={row.posicion}
                              />
                            </span>
                            <span className="liga-pub-standings__pos-suffix">
                              °
                            </span>
                          </div>
                          <div className="liga-pub-standings__players">
                            <LigaPublicParejaPlayers
                              name1={face.name1}
                              name2={face.name2}
                              foto1={face.foto1}
                              foto2={face.foto2}
                              size="md"
                              orientation="stack"
                              win={row.posicion === 1}
                            />
                            <p className="liga-pub-standings__meta">
                              <LigaMotionValue
                                morphKey={`${row.victorias}-${row.derrotas}`}
                                value={`${row.victorias} PG · ${row.derrotas} PP`}
                              />
                            </p>
                            <p className="liga-pub-standings__meta liga-pub-standings__meta--games">
                              <LigaMotionValue
                                morphKey={`${row.games_favor}-${row.games_contra}`}
                                value={`${row.games_favor} GF · ${row.games_contra} GC · DIF ${gamesDifLabel}`}
                              />
                            </p>
                            {matchLines.length > 0 ? (
                              <ul
                                className="liga-pub-standings__breakdown"
                                aria-label="Puntos por partido"
                              >
                                {matchLines.map((line, lineIndex) => (
                                  <li
                                    key={line.partidoId}
                                    className="liga-pub-standings__breakdown-line"
                                    style={
                                      {
                                        ["--liga-line-i" as string]: lineIndex,
                                      } as React.CSSProperties
                                    }
                                  >
                                    <span className="liga-pub-standings__breakdown-score">
                                      {line.scoreLabel}
                                    </span>
                                    <span
                                      className="liga-pub-standings__breakdown-arrow"
                                      aria-hidden="true"
                                    >
                                      →
                                    </span>
                                    <span
                                      className="liga-pub-standings__breakdown-pts"
                                      aria-label={`${formatSignedPoints(line.points)} puntos`}
                                    >
                                      {formatSignedPoints(line.points)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                          <div className="liga-pub-standings__pts-block">
                            <span className="liga-pub-standings__pts">
                              <LigaMotionValue
                                morphKey={row.puntos}
                                value={row.puntos}
                              />
                            </span>
                            <span className="liga-pub-standings__pts-label">
                              pts
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </>
            ) : (
              <>
            <h2 className="liga-pantalla-ranking__title">Puntos de la jornada</h2>
            <p className="liga-pantalla-ranking__hint">
              Games anotados en esta jornada (por jugador)
            </p>
            {jornadaStats.rankingJugadores.length === 0 ? (
              <p className="liga-pantalla__loading">Sin resultados aún.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Jugador</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {jornadaStats.rankingJugadores.map((row) => (
                    <tr
                      key={row.jugadorId}
                      className={
                        row.posicion <= 3 ? "liga-pantalla-ranking-top" : undefined
                      }
                    >
                      <td>{row.posicion}</td>
                      <td>{row.nombre}</td>
                      <td>{row.puntos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {jornadaStats.rankingParejas.length > 0 && (
              <>
                <h3 className="liga-pantalla-ranking__subtitle">Parejas</h3>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Pareja</th>
                      <th>V</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jornadaStats.rankingParejas.map((row) => (
                      <tr
                        key={row.parejaId}
                        className={
                          row.parejaId === jornadaStats.ganadorPareja?.parejaId
                            ? "liga-pantalla-ranking-winner"
                            : row.posicion <= 3
                              ? "liga-pantalla-ranking-top"
                              : undefined
                        }
                      >
                        <td>{row.posicion}</td>
                        <td>{row.nombre}</td>
                        <td>{row.victorias}</td>
                        <td>{row.puntos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
              </>
            )}
          </aside>
        </div>

        {!esParejasFijas &&
          todosPartidosCompletos &&
          jornadaStats.ganadorPareja && (
          <div className="liga-pantalla-winner" role="status">
            <p className="liga-pantalla-winner__eyebrow">¡Felicidades!</p>
            <p className="liga-pantalla-winner__title">
              {jornadaStats.ganadorPareja.nombre}
            </p>
            <p className="liga-pantalla-winner__meta">
              Pareja ganadora de la jornada · {jornadaStats.ganadorPareja.victorias}{" "}
              {jornadaStats.ganadorPareja.victorias === 1 ? "victoria" : "victorias"} ·{" "}
              {jornadaStats.ganadorPareja.puntos} pts
            </p>
          </div>
        )}

        {esParejasFijas &&
          todosPartidosCompletos &&
          jornadaStats.ganadorPareja && (
            <div
              ref={celebrateRevealRef}
              className={`liga-parejas-victorias-grid liga-parejas-victorias-grid--winner liga-motion-reveal${
                celebrateInView ? " is-inview" : ""
              }${celebratePlay ? " liga-celebrate--play" : ""}`}
              role="status"
            >
              <LigaParejaVictoriaCelebrate
                pairId={jornadaStats.ganadorPareja.parejaId}
                pairLabel={nombreParejaGanadora(
                  jornadaStats.ganadorPareja.parejaId,
                  jornadaStats.ganadorPareja.nombre
                )}
                torneoNombre={detalle.nombre}
                jornadaNumero={numero}
                matchLines={
                  jornadaMatchBreakdowns.get(
                    jornadaStats.ganadorPareja.parejaId
                  ) ?? []
                }
                stats={statsParejaJornadaVictoria(
                  jornadaStats.ganadorPareja.parejaId,
                  jornada,
                  jornadaStats.ganadorPareja
                )}
                winners={winnerAvatarsForPareja(
                  jornada.parejas?.find(
                    (p) => p.id === jornadaStats.ganadorPareja?.parejaId
                  )
                )}
              />
            </div>
          )}

        <footer className="liga-pantalla__footer">
          Actualización automática
          {lastRefresh
            ? ` · ${lastRefresh.toLocaleTimeString("es-MX", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}`
            : ""}
        </footer>
      </PublicModeShell>
    </div>
    </PublicScopedBrandGate>
    </ClubExperienceScope>
  );
};
