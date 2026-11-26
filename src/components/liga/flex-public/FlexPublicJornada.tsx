import React, { useEffect, useMemo, useState } from "react";
import {
  ClubExperienceScope,
  PublicEventBrandIdentity,
  PublicEventNeutralLoading,
  PublicScopedBrandGate,
  useOrganizerDisplayName,
} from "../../../club-experience";
import { isPubDsV2Enabled } from "../../../config/peds";
import { useVisiblePolling } from "../../../hooks/useVisiblePolling";
import { honorResolution, rankFlexSeason } from "../../../lib/liga/flex/season";
import { aplicarRatingsPendientesFlex } from "../../../lib/rivieraJugadores/aplicarRatingPartido";
import { rankFlexJornada } from "../../../lib/liga/flex/standings";
import { flexPublicJornadaEstado } from "../../../lib/liga/flex/publicView";
import { LIGA_PUBLIC_POLL_INTERVAL_MS } from "../../../lib/liga/publicPoll";
import { resolveLigaJugadorPublicProfiles } from "../../../lib/liga/publicParejaAvatars";
import type {
  LigaDetalle,
  LigaJornada,
  LigaJornadaPareja,
  LigaPartido,
} from "../../../lib/liga/types";
import { isFlexLeague } from "../../../lib/liga/ligaModalidad";
import {
  loadFlexLeague,
  type FlexBundle,
} from "../../../services/ligaFlexService";
import { getLigaById, publicLigaUrl } from "../../../services/ligaService";
import { PublicModeShell } from "../../platform/PublicModeShell";
import { StatusBadge } from "../../platform/StatusBadge";
import { PublicHero } from "../../public/peds";
import { buildPublicJugadorByRivieraIdPath } from "../../jugadores/jugadoresPublicNav";
import {
  fechaCorta,
  FlexNeutralAvatar,
  horarioFlex,
  useFlexPublicTitle,
} from "./flexPublicUi";
import { FlexPublicLiveBoard } from "./FlexPublicLiveBoard";
import "../liga-public-pantalla.css";
import "../liga-public-premium-2026.css";
import "./flex-public-jornada.css";

type PublicProfile = {
  fotoUrl: string | null;
  rivieraId?: string | null;
  rating?: number | null;
};

export type FlexJornadaStandingRow = {
  jugadorId: string;
  posicion: number;
  puntos: number;
  partidos: number;
  ganados: number;
  gamesFavor: number;
  gamesContra: number;
};

/** Orden de la grilla: quien va sumando en la jornada queda arriba. */
export function orderParticipantsByJornadaStanding(
  ids: readonly string[],
  standingByPlayer: ReadonlyMap<string, { posicion: number }>
): string[] {
  return [...ids].sort((a, b) => {
    const left = standingByPlayer.get(a)?.posicion;
    const right = standingByPlayer.get(b)?.posicion;
    if (left != null && right != null && left !== right) return left - right;
    if (left != null) return -1;
    if (right != null) return 1;
    return 0;
  });
}

export type FlexRoundVisualState = "confirmada" | "actual" | "pendiente";

export type FlexRoundNavItem = {
  ronda: number;
  estado: FlexRoundVisualState;
  hasPartidos: boolean;
};

function roundVisualStateLabel(estado: FlexRoundVisualState): string {
  if (estado === "confirmada") return "Confirmada";
  if (estado === "actual") return "Actual";
  return "Pendiente";
}

export const FlexPublicPantallaPage: React.FC<{
  ligaId: string;
  numero: number;
}> = ({ ligaId, numero }) => {
  const [detalle, setDetalle] = useState<LigaDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = React.useCallback(async () => {
    try {
      const next = await getLigaById(ligaId, true);
      setDetalle(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No disponible");
    }
  }, [ligaId]);
  useVisiblePolling({ callback: load, intervalMs: LIGA_PUBLIC_POLL_INTERVAL_MS });

  if (!detalle) {
    return (
      <ClubExperienceScope organizadorId={null} pendingUntilOrganizador>
        <PublicEventNeutralLoading message={error ?? "Cargando jornada…"} />
      </ClubExperienceScope>
    );
  }
  if (!isFlexLeague(detalle.modalidad)) {
    return (
      <ClubExperienceScope organizadorId={detalle.organizador_id}>
        <PublicScopedBrandGate message="Cargando jornada…">
          <div className="liga-pantalla App--public-full-width ro-public-view ro-surface-dark">
            <PublicModeShell className="liga-pantalla__inner">
              <p className="liga-pantalla__loading">
                Esta vista es de Riviera Flex League.
              </p>
            </PublicModeShell>
          </div>
        </PublicScopedBrandGate>
      </ClubExperienceScope>
    );
  }
  return <FlexPublicJornada detalle={detalle} numero={numero} pantalla />;
};

export const FlexPublicJornada: React.FC<{
  detalle: LigaDetalle;
  numero: number;
  pantalla?: boolean;
}> = ({ detalle, numero, pantalla = false }) => (
  <ClubExperienceScope
    organizadorId={detalle.organizador_id}
    pendingUntilOrganizador
  >
    <FlexPublicJornadaBody
      detalle={detalle}
      numero={numero}
      pantalla={pantalla}
    />
  </ClubExperienceScope>
);

const FlexPublicJornadaBody: React.FC<{
  detalle: LigaDetalle;
  numero: number;
  pantalla: boolean;
}> = ({ detalle, numero, pantalla }) => {
  const club = useOrganizerDisplayName(detalle.organizador_id);
  const jornada =
    detalle.jornadas.find((item) => item.numero === numero) ?? null;
  const [bundle, setBundle] = useState<FlexBundle | null>(null);
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({});
  const [ratingGeneration, setRatingGeneration] = useState(0);
  const [round, setRound] = useState<number | null>(null);
  const [dataStale, setDataStale] = useState(false);

  useFlexPublicTitle(
    jornada
      ? `Jornada ${jornada.numero} · ${detalle.nombre}`
      : `${detalle.nombre} · Riviera Flex League`
  );

  const reload = React.useCallback(async () => {
    try {
      setBundle(await loadFlexLeague(detalle.id));
      setDataStale(false);
    } catch {
      setDataStale(true);
    }
  }, [detalle.id]);

  useVisiblePolling({
    callback: reload,
    intervalMs: LIGA_PUBLIC_POLL_INTERVAL_MS,
  });

  useEffect(() => {
    void reload();
  }, [reload, jornada?.estado, jornada?.partidos]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of detalle.jugadores) map.set(player.id, player.nombre);
    for (const row of detalle.inscripciones) {
      if (row.jugador?.nombre) map.set(row.jugador_id, row.jugador.nombre);
    }
    for (const pareja of jornada?.parejas ?? []) {
      if (pareja.jugador1?.nombre) {
        map.set(pareja.jugador1_id, pareja.jugador1.nombre);
      }
      if (pareja.jugador2?.nombre) {
        map.set(pareja.jugador2_id, pareja.jugador2.nombre);
      }
    }
    return map;
  }, [detalle, jornada]);

  const ids = useMemo(() => Array.from(names.keys()), [names]);
  useEffect(() => {
    let active = true;
    void resolveLigaJugadorPublicProfiles(
      detalle.organizador_id ?? "",
      ids.map((id) => ({ id, name: names.get(id) ?? "Jugador" })),
      { publicOnly: true }
    ).then((next) => {
      if (active) setProfiles(next);
    });
    return () => {
      active = false;
    };
  }, [detalle.organizador_id, ids, names, ratingGeneration]);

  useEffect(() => {
    const organizadorId = detalle.organizador_id;
    if (!organizadorId) return;
    let active = true;
    void aplicarRatingsPendientesFlex(detalle.id, organizadorId)
      .then((applied) => {
        if (active && applied) setRatingGeneration((current) => current + 1);
      })
      .catch((error) => {
        console.warn("[rating] flex pendientes:", error);
      });
    return () => {
      active = false;
    };
  }, [detalle.id, detalle.organizador_id]);

  const fallbackParticipantIds = useMemo(
    () =>
      Array.from(
        new Set(
          (jornada?.parejas ?? [])
            .flatMap((pareja) => [pareja.jugador1_id, pareja.jugador2_id])
            .filter((id): id is string => Boolean(id))
        )
      ),
    [jornada?.parejas]
  );

  const convocados = useMemo(() => {
    const fromBundle = jornada ? bundle?.participantes[jornada.id] ?? [] : [];
    return fromBundle.length > 0 ? fromBundle : fallbackParticipantIds;
  }, [bundle?.participantes, jornada, fallbackParticipantIds]);

  const provisionalRows = useMemo(
    () =>
      jornada
        ? computeFlexJornadaProvisionalStandings(jornada, names, convocados)
        : [],
    [jornada, names, convocados]
  );

  const official = jornada?.estado === "completed";
  const posiciones = useMemo(
    () =>
      jornada
        ? (bundle?.posiciones ?? [])
            .filter((row) => row.jornadaId === jornada.id)
            .sort((a, b) => a.posicion - b.posicion)
        : [],
    [bundle?.posiciones, jornada]
  );

  const matchTallies = useMemo(
    () => (jornada ? tallyScoredMatches(jornada) : new Map()),
    [jornada]
  );

  const standingRows: FlexJornadaStandingRow[] = useMemo(
    () =>
      official && posiciones.length > 0
        ? posiciones.map((row) => {
            const tally = matchTallies.get(row.jugadorId);
            return {
              jugadorId: row.jugadorId,
              posicion: row.posicion,
              puntos: row.puntos,
              partidos: row.partidos,
              ganados: tally?.ganados ?? 0,
              gamesFavor: row.gamesFavor,
              gamesContra: row.gamesContra,
            };
          })
        : provisionalRows,
    [official, posiciones, provisionalRows, matchTallies]
  );

  const standingByPlayer = useMemo(() => {
    const map = new Map<string, FlexJornadaStandingRow>();
    for (const row of standingRows) {
      map.set(row.jugadorId, row);
    }
    return map;
  }, [standingRows]);

  const orderedConvocados = useMemo(
    () => orderParticipantsByJornadaStanding(convocados, standingByPlayer),
    [convocados, standingByPlayer]
  );

  const seasonView = useMemo(() => {
    const numeroById = new Map(
      detalle.jornadas.map((item) => [item.id, item.numero])
    );
    const closed = new Set(
      detalle.jornadas
        .filter((item) => item.estado === "completed")
        .map((item) => item.id)
    );
    const awards = (bundle?.posiciones ?? [])
      .filter((row) => closed.has(row.jornadaId))
      .map((row) => ({
        jornadaNumero: numeroById.get(row.jornadaId) ?? 0,
        jugadorId: row.jugadorId,
        posicion: row.posicion,
        puntos: row.puntos,
      }))
      .filter((row) => row.jornadaNumero > 0);
    const season = rankFlexSeason({
      awards,
      resolution: honorResolution(bundle?.honores),
    });
    const rows = season.ok ? season.rows : [];
    const points = new Map<string, number>();
    for (const row of rows) points.set(row.jugadorId, row.puntos);
    return { ok: season.ok, rows, points };
  }, [bundle?.honores, bundle?.posiciones, detalle.jornadas]);

  const seasonRows = seasonView.rows;
  const seasonPoints = seasonView.points;

  const closeRows = useMemo(() => {
    if (!official) return [];
    const top = posiciones
      .filter((row) => row.posicion >= 1 && row.posicion <= 3)
      .sort((a, b) => a.posicion - b.posicion)
      .slice(0, 3);
    const ready =
      top.length === 3 &&
      top.every((row, index) => row.posicion === index + 1);
    return ready ? top : [];
  }, [official, posiciones]);

  if (!jornada) {
    return (
      <PublicScopedBrandGate message="Cargando jornada…">
        <div className="flex-pub-jornada liga-pantalla App--public-full-width ro-public-view ro-surface-dark liga-pantalla--jornada-fijas">
          <PublicModeShell className="liga-pantalla__inner">
            <p className="liga-pantalla__loading">
              Esa jornada no está en el calendario.
            </p>
            <a
              className="flex-pub-toolbar__back"
              href={publicLigaUrl(detalle.id)}
            >
              Volver a la liga
            </a>
          </PublicModeShell>
        </div>
      </PublicScopedBrandGate>
    );
  }

  const flex = bundle?.jornadas.find((row) => row.jornadaId === jornada.id);
  const partidos = (jornada.partidos ?? [])
    .slice()
    .sort((a, b) => a.ronda - b.ronda || (a.cancha ?? 0) - (b.cancha ?? 0));

  const hasMatchActivity = partidos.some(
    (p) =>
      (p.score_pareja1 != null && p.score_pareja2 != null) ||
      p.estado === "in_progress" ||
      p.estado === "completed"
  );

  const status = flexPublicJornadaEstado({
    estado: jornada.estado,
    fecha: jornada.fecha,
    confirmada:
      flex?.programacionEstado === "confirmada" || partidos.length > 0,
    enJuego: hasMatchActivity,
  });

  const programmedRounds = Array.from(
    new Set(partidos.map((partido) => partido.ronda))
  ).sort((a, b) => a - b);

  const focusRound =
    programmedRounds.find((ronda) =>
      partidos
        .filter((partido) => partido.ronda === ronda)
        .some(
          (partido) =>
            partido.score_pareja1 == null || partido.score_pareja2 == null
        )
    ) ??
    programmedRounds[programmedRounds.length - 1] ??
    null;

  const visibleRound = pantalla
    ? focusRound
    : round != null && programmedRounds.includes(round)
      ? round
      : focusRound;

  const visibleMatches =
    visibleRound != null
      ? partidos.filter((partido) => partido.ronda === visibleRound)
      : partidos;

  const totalConfiguredRounds = Math.max(
    flex?.rondas ?? 0,
    programmedRounds.length
  );
  const allRoundNumbers =
    totalConfiguredRounds > programmedRounds.length
      ? Array.from({ length: totalConfiguredRounds }, (_, idx) => idx + 1)
      : programmedRounds;

  const roundNavItems: FlexRoundNavItem[] = allRoundNumbers.map((ronda) => {
    const ofRound = partidos.filter((partido) => partido.ronda === ronda);
    if (ofRound.length === 0) {
      return { ronda, estado: "pendiente", hasPartidos: false };
    }
    const allScored = ofRound.every(
      (partido) =>
        partido.score_pareja1 != null && partido.score_pareja2 != null
    );
    if (allScored) {
      return { ronda, estado: "confirmada", hasPartidos: true };
    }
    if (ronda === focusRound) {
      return { ronda, estado: "actual", hasPartidos: true };
    }
    return { ronda, estado: "pendiente", hasPartidos: true };
  });

  const activeRoundMeta =
    roundNavItems.find((item) => item.ronda === visibleRound) ??
    roundNavItems[0] ??
    null;

  const uniqueCourts = new Set(
    visibleMatches
      .map((m) => m.cancha)
      .filter((c): c is number => typeof c === "number" && Number.isFinite(c))
  ).size;
  const canchasEnRonda = Math.max(
    1,
    uniqueCourts || visibleMatches.length || flex?.canchas || 3
  );

  const fecha = fechaCorta(jornada.fecha);
  const horario = horarioFlex(flex?.horaInicio, flex?.horaFin);
  const badgeVariant =
    status.key === "finalizada"
      ? "muted"
      : status.key === "en_curso"
        ? "live"
        : "pending";

  if (pantalla) {
    return (
      <PublicScopedBrandGate message="Cargando jornada…">
        <FlexPublicLiveBoard
          club={club}
          leagueName={detalle.nombre}
          jornadaNumero={jornada.numero}
          fecha={fecha}
          horario={horario}
          statusLabel={status.label}
          totalRounds={totalConfiguredRounds}
          focusRound={focusRound}
          rounds={roundNavItems}
          partidos={partidos}
          parejas={jornada.parejas ?? []}
          names={names}
          profiles={profiles}
          convocados={orderedConvocados}
          standingRows={standingRows}
          seasonPoints={seasonPoints}
          official={official}
          jornadaHref={publicLigaUrl(detalle.id) + `/jornada/${jornada.numero}`}
          seasonAwards={(bundle?.posiciones ?? [])
            .filter((row) =>
              detalle.jornadas.some(
                (item) => item.id === row.jornadaId && item.estado === "completed"
              )
            )
            .map((row) => ({
              jornadaNumero:
                detalle.jornadas.find((item) => item.id === row.jornadaId)?.numero ?? 0,
              jugadorId: row.jugadorId,
              posicion: row.posicion,
              puntos: row.puntos,
            }))
            .filter((row) => row.jornadaNumero > 0)}
          seasonResolution={bundle?.honores ?? null}
          dataStale={dataStale}
        />
      </PublicScopedBrandGate>
    );
  }

  return (
    <PublicScopedBrandGate message="Cargando jornada…">
      <div
        className={`flex-pub-jornada liga-pantalla App--public-full-width ro-public-view ro-surface-dark liga-pantalla--jornada-fijas${
          pantalla ? " liga-pantalla--flex-screen" : ""
        }`}
      >
        <div className="liga-pantalla__grain" aria-hidden />
        <PublicModeShell className="liga-pantalla__inner">
          {/* 1 & 2. HEADER OFICIAL DEL CLUB Y RIVIERA OPEN + INFORMACIÓN DE LIGA Y JORNADA */}
          {isPubDsV2Enabled ? (
            <PublicHero
              className="liga-pantalla-jornada-hero"
              logoClub={
                <PublicEventBrandIdentity className="peds-hero__club-identity" />
              }
              estado={
                <StatusBadge variant={badgeVariant}>{status.label}</StatusBadge>
              }
              nombreEvento={detalle.nombre}
              club={club || undefined}
              categoria={`Jornada ${String(jornada.numero).padStart(2, "0")}`}
              fecha={
                fecha === "Por programar"
                  ? "Por programar"
                  : `${fecha} · ${horario}`
              }
              meta={
                pantalla && visibleRound
                  ? `Ronda ${String(visibleRound).padStart(2, "0")} · ${flex?.canchas ?? canchasEnRonda} canchas`
                  : `${flex?.canchas ?? canchasEnRonda} canchas · ${flex?.rondas ?? (programmedRounds.length || "—")} rondas · ${convocados.length} jugadores`
              }
            />
          ) : (
            <header className="liga-pantalla__header">
              <h1 className="liga-pantalla__title">{detalle.nombre}</h1>
              <p className="liga-pantalla__subtitle">
                Jornada {String(jornada.numero).padStart(2, "0")} ·{" "}
                {status.label}
              </p>
            </header>
          )}

          <div className="flex-pub-toolbar">
            <div className="flex-pub-toolbar__meta">
              <a
                className="flex-pub-toolbar__back"
                href={publicLigaUrl(detalle.id)}
              >
                ← Volver a la liga
              </a>
              <div className="flex-pub-toolbar__pills">
                <span className="flex-pub-toolbar__pill">
                  Jornada {String(jornada.numero).padStart(2, "0")}
                </span>
                <span className="flex-pub-toolbar__pill">
                  {flex?.canchas ?? canchasEnRonda} canchas
                </span>
                <span className="flex-pub-toolbar__pill">
                  {flex?.rondas ?? (programmedRounds.length || "—")} rondas
                </span>
                <span className="flex-pub-toolbar__pill">
                  {convocados.length} participantes
                </span>
              </div>
            </div>
          </div>

          <div className="flex-pub-sections">
            {/* 3. RONDA ACTUAL Y PARTIDOS (PROTAGONISTAS) */}
            <section
              className="flex-pub-matches-section"
              aria-label="Ronda actual y partidos"
            >
              {partidos.length === 0 ? (
                <>
                  <header className="flex-pub-rounds-header">
                    <div className="flex-pub-rounds-header__titles">
                      <h2 className="flex-pub-rounds-header__title">
                        PROGRAMACIÓN DE PARTIDOS
                      </h2>
                      <p className="flex-pub-rounds-header__subtitle">
                        {flex?.canchas ?? 3} CANCHAS · PENDIENTE DE CONFIRMACIÓN
                      </p>
                    </div>
                  </header>
                  <div className="flex-pub-empty-card">
                    La programación todavía no está confirmada.
                  </div>
                </>
              ) : (
                <>
                  <header className="flex-pub-rounds-header">
                    <div className="flex-pub-rounds-header__titles">
                      <div className="flex-pub-rounds-header__title-row">
                        <h2 className="flex-pub-rounds-header__title">
                          RONDA {String(visibleRound ?? 1).padStart(2, "0")}
                        </h2>
                        {activeRoundMeta ? (
                          <span
                            className={`flex-pub-round-status-badge flex-pub-round-status-badge--${activeRoundMeta.estado}`}
                          >
                            <span
                              className="flex-pub-round-status-badge__dot"
                              aria-hidden
                            />
                            {roundVisualStateLabel(activeRoundMeta.estado)}
                          </span>
                        ) : null}
                      </div>
                      <p className="flex-pub-rounds-header__subtitle">
                        {canchasEnRonda}{" "}
                        {canchasEnRonda === 1 ? "CANCHA" : "CANCHAS"} ·{" "}
                        {visibleMatches.length}{" "}
                        {visibleMatches.length === 1 ? "PARTIDO" : "PARTIDOS"}
                      </p>
                    </div>

                    {!pantalla && roundNavItems.length > 1 ? (
                      <div className="flex-pub-rounds-header__right">
                        <nav
                          className="flex-pub-round-nav"
                          aria-label="Navegación de rondas"
                        >
                          {roundNavItems.map((item) => {
                            const selected = item.ronda === visibleRound;
                            return (
                              <button
                                key={item.ronda}
                                type="button"
                                disabled={!item.hasPartidos}
                                aria-pressed={selected}
                                className={`flex-pub-round-nav__btn${
                                  selected ? " is-selected" : ""
                                } is-${item.estado}`}
                                onClick={() => {
                                  if (item.hasPartidos) setRound(item.ronda);
                                }}
                              >
                                <span>RONDA {item.ronda}</span>
                                <span className="flex-pub-round-nav__state">
                                  {roundVisualStateLabel(item.estado)}
                                </span>
                              </button>
                            );
                          })}
                        </nav>
                      </div>
                    ) : null}
                  </header>

                  <div className="flex-pub-matches-grid">
                    {visibleMatches.map((partido, index) => (
                      <FlexMatchCard
                        key={partido.id}
                        partido={partido}
                        fallbackCourt={index + 1}
                        parejas={jornada.parejas ?? []}
                        names={names}
                        profiles={profiles}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* 4. PARTICIPANTES Y PUNTOS INDIVIDUALES (TARJETAS HORIZONTALES COMPACTAS) */}
            {!pantalla ? (
              <section
                className="flex-pub-participants-section"
                aria-label="Participantes"
              >
                <header className="flex-pub-section-head">
                  <div className="flex-pub-section-head__titles">
                    <h2 className="flex-pub-section-head__title">
                      Participantes
                    </h2>
                    <p className="flex-pub-section-head__subtitle">
                      Jugadores convocados y puntos individuales de la jornada
                    </p>
                  </div>
                  <span className="flex-pub-section-head__count">
                    {convocados.length}{" "}
                    {convocados.length === 1 ? "Jugador" : "Jugadores"}
                  </span>
                </header>

                {convocados.length === 0 ? (
                  <div className="flex-pub-empty-card">
                    Todavía no hay jugadores convocados.
                  </div>
                ) : (
                  <div className="flex-pub-participants-grid">
                    {orderedConvocados.map((id) => {
                      const name = names.get(id) ?? "Jugador";
                      const profile = profiles[id];
                      const standing = standingByPlayer.get(id);
                      const hasResult =
                        standing != null && standing.partidos > 0;
                      const rivieraId = profile?.rivieraId?.trim() || null;
                      const leaguePoints = seasonPoints.get(id) ?? 0;

                      return (
                        <article
                          key={id}
                          className={`flex-pub-participant-card${
                            standing?.posicion === 1 ? " is-leader" : ""
                          }`}
                        >
                          <FlexNeutralAvatar
                            name={name}
                            fotoUrl={profile?.fotoUrl}
                            variant="participant"
                          />

                          <div className="flex-pub-participant-card__center">
                            <p className="flex-pub-participant-card__name">
                              {name}
                            </p>
                            <p className="flex-pub-participant-card__id">
                              {rivieraId ? (
                                <a
                                  href={buildPublicJugadorByRivieraIdPath(
                                    rivieraId
                                  )}
                                >
                                  {rivieraId}
                                </a>
                              ) : (
                                "Sin Riviera ID"
                              )}
                            </p>
                            {hasResult ? (
                              <p
                                className="flex-pub-participant-card__record"
                                title="Partidos jugados, partidos ganados, games a favor y games en contra. La posición sigue los games a favor y, si empatan, la diferencia."
                              >
                                {standing.partidos} PJ · {standing.ganados} PG ·{" "}
                                {standing.gamesFavor}–{standing.gamesContra}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex-pub-participant-card__right">
                            <span
                              className={`flex-pub-participant-card__pts-value${
                                hasResult
                                  ? ""
                                  : " flex-pub-participant-card__pts-value--pending"
                              }`}
                            >
                              {hasResult ? standing.puntos : "—"}
                            </span>
                            <span className="flex-pub-participant-card__pts-label">
                              PTS JORNADA
                            </span>
                            <span
                              className={`flex-pub-participant-card__pts-status${
                                hasResult
                                  ? " flex-pub-participant-card__pts-status--scored"
                                  : ""
                              }`}
                            >
                              {hasResult
                                ? `${standing.posicion}º · ${
                                    official ? "Oficial" : "Provisional"
                                  }`
                                : "Pendiente"}
                            </span>
                            <span className="flex-pub-participant-card__league">
                              {leaguePoints}
                              <small>PTS LIGA</small>
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}

            {/* 5. CLASIFICACIÓN DE LA JORNADA Y GENERAL, EN LA MISMA FILA */}
            {!pantalla ? (
            <div className="flex-pub-standings-pair">
            {standingRows.length > 0 ? (
              <section
                className="flex-pub-standings-section"
                aria-label="Clasificación de la jornada"
              >
                <header className="flex-pub-section-head">
                  <div className="flex-pub-section-head__titles">
                    <h2 className="flex-pub-section-head__title">
                      CLASIFICACIÓN DE LA JORNADA
                    </h2>
                    <p
                      className="flex-pub-section-head__subtitle"
                      title="PJ partidos jugados, PG ganados, GF games a favor, GC games en contra. La posición sigue GF y, si empatan, la diferencia."
                    >
                      PJ · PG · GF · GC
                    </p>
                  </div>
                  <span
                    className={`flex-pub-round-status-badge ${
                      official
                        ? "flex-pub-round-status-badge--confirmada"
                        : "flex-pub-round-status-badge--actual"
                    }`}
                  >
                    <span
                      className="flex-pub-round-status-badge__dot"
                      aria-hidden
                    />
                    {official
                      ? "Resultados oficiales"
                      : "Clasificación provisional"}
                  </span>
                </header>

                <div className="flex-pub-standings-card">
                  <div className="flex-pub-standings-table-wrap">
                    <table className="flex-pub-standings-table flex-pub-standings-table--jornada">
                      <thead>
                        <tr>
                          <th className="is-pos">Pos</th>
                          <th>Jugador</th>
                          <th className="is-num" title="Partidos jugados">PJ</th>
                          <th className="is-num" title="Partidos ganados">PG</th>
                          <th className="is-num" title="Games a favor">GF</th>
                          <th className="is-num" title="Games en contra">GC</th>
                          <th className="is-num" title="Diferencia">Dif</th>
                          <th className="is-num is-pts" title="Puntos">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standingRows.map((row) => {
                          const name = names.get(row.jugadorId) ?? "Jugador";
                          const profile = profiles[row.jugadorId];
                          const rivieraId = profile?.rivieraId?.trim() || null;

                          return (
                            <tr
                              key={row.jugadorId}
                              className={
                                row.posicion === 1
                                  ? "is-leader"
                                  : row.posicion <= 3
                                    ? "is-podium"
                                    : undefined
                              }
                            >
                              <td className="is-pos">
                                <span
                                  className={`flex-pub-standings-pos${
                                    row.posicion <= 3
                                      ? " flex-pub-standings-pos--top"
                                      : ""
                                  }`}
                                >
                                  #{row.posicion}
                                </span>
                              </td>
                              <td>
                                <div className="flex-pub-standings-player">
                                  <FlexNeutralAvatar
                                    name={name}
                                    fotoUrl={profile?.fotoUrl}
                                    variant="table"
                                  />
                                  <div className="flex-pub-standings-player__info">
                                    <span className="flex-pub-standings-player__name">
                                      {name}
                                    </span>
                                    {rivieraId ? (
                                      <span className="flex-pub-standings-player__id">
                                        <a
                                          href={buildPublicJugadorByRivieraIdPath(
                                            rivieraId
                                          )}
                                        >
                                          {rivieraId}
                                        </a>
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              <td className="is-num">
                                <span className="flex-pub-standings-pj">
                                  {row.partidos}
                                </span>
                              </td>
                              <td className="is-num">
                                <span className="flex-pub-standings-pj">
                                  {row.ganados}
                                </span>
                              </td>
                              <td className="is-num">
                                <span className="flex-pub-standings-pj">
                                  {row.gamesFavor}
                                </span>
                              </td>
                              <td className="is-num">
                                <span className="flex-pub-standings-pj">
                                  {row.gamesContra}
                                </span>
                              </td>
                              <td className="is-num">
                                <span className="flex-pub-standings-pj">
                                  {formatSigned(row.gamesFavor - row.gamesContra)}
                                </span>
                              </td>
                              <td className="is-num is-pts">
                                <span className="flex-pub-standings-pts">
                                  {row.puntos}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

              <section
                className="flex-pub-standings-section"
                aria-label="Clasificación general"
              >
                <header className="flex-pub-section-head">
                  <div className="flex-pub-section-head__titles">
                    <h2 className="flex-pub-section-head__title">
                      CLASIFICACIÓN GENERAL
                    </h2>
                    <p className="flex-pub-section-head__subtitle">
                      Puntos oficiales de las jornadas cerradas
                    </p>
                  </div>
                </header>
                {seasonRows.length === 0 ? (
                  <div className="flex-pub-empty-card">
                    {seasonView.ok
                      ? "Todavía no hay jornadas cerradas con puntos oficiales."
                      : "La clasificación general se publica cuando el empate del podio queda resuelto."}
                  </div>
                ) : (
                  <div className="flex-pub-standings-card">
                    <div className="flex-pub-standings-table-wrap">
                      <table className="flex-pub-standings-table">
                        <thead>
                          <tr>
                            <th className="is-pos">Pos</th>
                            <th>Jugador</th>
                            <th className="is-num">Jornadas</th>
                            <th className="is-num">Puntos de liga</th>
                          </tr>
                        </thead>
                        <tbody>
                          {seasonRows.map((row) => {
                            const name = names.get(row.jugadorId) ?? "Jugador";
                            const profile = profiles[row.jugadorId];
                            const rivieraId = profile?.rivieraId?.trim() || null;
                            return (
                              <tr
                                key={row.jugadorId}
                                className={
                                  row.posicion === 1 ? "is-leader" : undefined
                                }
                              >
                                <td className="is-pos">
                                  <span
                                    className={`flex-pub-standings-pos${
                                      row.posicion <= 3
                                        ? " flex-pub-standings-pos--top"
                                        : ""
                                    }`}
                                  >
                                    #{row.posicion}
                                  </span>
                                </td>
                                <td>
                                  <div className="flex-pub-standings-player">
                                    <FlexNeutralAvatar
                                      name={name}
                                      fotoUrl={profile?.fotoUrl}
                                      variant="table"
                                    />
                                    <div className="flex-pub-standings-player__info">
                                      <span className="flex-pub-standings-player__name">
                                        {name}
                                      </span>
                                      {rivieraId ? (
                                        <span className="flex-pub-standings-player__id">
                                          {rivieraId}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </td>
                                <td className="is-num">
                                  <span className="flex-pub-standings-pj">
                                    {row.jornadasJugadas}
                                  </span>
                                </td>
                                <td className="is-num">
                                  <span className="flex-pub-standings-pts flex-pub-standings-pts--league">
                                    {row.puntos}
                                    <small>PTS</small>
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            </div>
            ) : null}

            {closeRows.length === 3 ? (
              <section
                className="flex-pub-jornada-close"
                aria-label="Cierre de la jornada"
              >
                <div className="flex-pub-jornada-close__stage">
                  <div className="flex-pub-jornada-close__rule" aria-hidden />
                  <PublicEventBrandIdentity
                    logoOnly
                    className="flex-pub-jornada-close__logo"
                  />
                  <p className="flex-pub-jornada-close__league">{detalle.nombre}</p>
                  <p className="flex-pub-jornada-close__jornada">
                    Jornada {String(jornada.numero).padStart(2, "0")} · Finalizada
                  </p>
                  <h2 className="flex-pub-jornada-close__headline">¡Felicidades!</h2>
                  <p className="flex-pub-jornada-close__places">
                    Los 3 primeros lugares
                  </p>
                  <p className="flex-pub-jornada-close__lead">
                    La constancia marca la diferencia.
                  </p>
                  <ol className="flex-pub-jornada-close__podium">
                    {closeRows.map((row) => {
                      const name = names.get(row.jugadorId) ?? "Jugador";
                      const profile = profiles[row.jugadorId];
                      const place =
                        row.posicion === 1
                          ? "1er lugar"
                          : row.posicion === 2
                            ? "2do lugar"
                            : "3er lugar";
                      return (
                        <li
                          key={row.jugadorId}
                          className={`flex-pub-jornada-close__card flex-pub-jornada-close__card--${row.posicion}`}
                        >
                          <FlexNeutralAvatar
                            name={name}
                            fotoUrl={profile?.fotoUrl}
                            variant="close"
                          />
                          <span
                            className="flex-pub-jornada-close__shade"
                            aria-hidden
                          />
                          <span className="flex-pub-jornada-close__rank">
                            {row.posicion}
                          </span>
                          <div className="flex-pub-jornada-close__meta">
                            <span className="flex-pub-jornada-close__place">
                              {place}
                            </span>
                            <span className="flex-pub-jornada-close__name">
                              {name}
                            </span>
                            <span className="flex-pub-jornada-close__pts">
                              {row.puntos} PTS
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="flex-pub-jornada-close__rule" aria-hidden />
                  <p className="flex-pub-jornada-close__keep">
                    Sigue compitiendo. Sigue evolucionando.
                  </p>
                  <p className="flex-pub-jornada-close__story">Crea tu historia.</p>
                  <p className="flex-pub-jornada-close__sign">Vive Riviera Open</p>
                </div>
              </section>
            ) : null}
          </div>
        </PublicModeShell>
      </div>
    </PublicScopedBrandGate>
  );
};

type FlexPairResolved = {
  id1: string;
  name1: string;
  foto1: string | null;
  rivieraId1: string | null;
  rating1: number | null;
  id2: string;
  name2: string;
  foto2: string | null;
  rivieraId2: string | null;
  rating2: number | null;
};

function resolvePairPlayers(
  pareja: LigaJornadaPareja | undefined,
  names: Map<string, string>,
  profiles: Record<string, PublicProfile>
): FlexPairResolved {
  const id1 = pareja?.jugador1_id ?? "";
  const id2 = pareja?.jugador2_id ?? "";
  return {
    id1,
    name1: pareja?.jugador1?.nombre || names.get(id1) || "Jugador",
    foto1: profiles[id1]?.fotoUrl ?? null,
    rivieraId1: profiles[id1]?.rivieraId?.trim() || null,
    rating1: finiteRating(profiles[id1]?.rating),
    id2,
    name2: pareja?.jugador2?.nombre || names.get(id2) || "Jugador",
    foto2: profiles[id2]?.fotoUrl ?? null,
    rivieraId2: profiles[id2]?.rivieraId?.trim() || null,
    rating2: finiteRating(profiles[id2]?.rating),
  };
}

function FlexMatchCard({
  partido,
  fallbackCourt,
  parejas,
  names,
  profiles,
}: {
  partido: LigaPartido;
  fallbackCourt: number;
  parejas: LigaJornadaPareja[];
  names: Map<string, string>;
  profiles: Record<string, PublicProfile>;
}) {
  const byId = new Map(parejas.map((pareja) => [pareja.id, pareja]));
  const left = partido.pareja1 ?? byId.get(partido.pareja1_id);
  const right = partido.pareja2 ?? byId.get(partido.pareja2_id);
  const pairA = resolvePairPlayers(left, names, profiles);
  const pairB = resolvePairPlayers(right, names, profiles);

  const hasScore =
    partido.score_pareja1 != null && partido.score_pareja2 != null;
  const s1 = hasScore ? (partido.score_pareja1 as number) : null;
  const s2 = hasScore ? (partido.score_pareja2 as number) : null;
  const tie = hasScore && s1 === s2;
  const p1Wins = hasScore && !tie && (s1 as number) > (s2 as number);
  const p2Wins = hasScore && !tie && (s2 as number) > (s1 as number);

  const estadoMod = hasScore
    ? "done"
    : partido.estado === "in_progress"
      ? "live"
      : "pending";
  const estadoText = hasScore
    ? "Finalizado"
    : estadoMod === "live"
      ? "En curso"
      : "Pendiente";

  const courtNumber =
    typeof partido.cancha === "number" && Number.isFinite(partido.cancha)
      ? partido.cancha
      : fallbackCourt;
  const courtLabel = `CANCHA ${String(courtNumber).padStart(2, "0")}`;

  return (
    <article
      className={`flex-pub-match-card${
        estadoMod === "live" ? " flex-pub-match-card--live" : ""
      }`}
    >
      <header className="flex-pub-match-card__head">
        <span className="flex-pub-match-card__court">{courtLabel}</span>
        <span
          className={`flex-pub-match-card__status flex-pub-match-card__status--${estadoMod}`}
        >
          <span className="flex-pub-match-card__status-dot" aria-hidden />
          {estadoText}
        </span>
      </header>

      <div className="flex-pub-match-court">
        <div className="flex-pub-match-court__photos">
          {[
            { key: "a1", name: pairA.name1, foto: pairA.foto1, rating: pairA.rating1, win: p1Wins },
            { key: "b1", name: pairB.name1, foto: pairB.foto1, rating: pairB.rating1, win: p2Wins },
            { key: "a2", name: pairA.name2, foto: pairA.foto2, rating: pairA.rating2, win: p1Wins },
            { key: "b2", name: pairB.name2, foto: pairB.foto2, rating: pairB.rating2, win: p2Wins },
          ].map((slot) => (
            <div
              key={slot.key}
              className={`flex-pub-match-court__player${slot.win ? " is-win" : ""}`}
            >
              <div className="flex-pub-match-court__frame">
                <FlexNeutralAvatar
                  name={slot.name}
                  fotoUrl={slot.foto}
                  variant="match"
                />
                <div className="flex-pub-match-court__caption">
                  <p className="flex-pub-match-court__name">{slot.name}</p>
                  {slot.rating != null ? (
                    <span className="flex-pub-match-court__rating">
                      {slot.rating.toFixed(2)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          <span className="flex-pub-match-court__vs" aria-hidden>
            VS
          </span>
        </div>
      </div>

      <p
        className={`flex-pub-match-score${hasScore ? "" : " is-pending"}`}
        aria-label={hasScore ? `Resultado ${s1} a ${s2}` : "Partido por jugar"}
      >
        {hasScore ? (
          <>
            <span className={p1Wins ? "is-win" : ""}>{s1}</span>
            <span className="flex-pub-match-score__sep">–</span>
            <span className={p2Wins ? "is-win" : ""}>{s2}</span>
          </>
        ) : (
          "Por jugar"
        )}
      </p>
    </article>
  );
}

export function computeFlexJornadaProvisionalStandings(
  jornada: LigaJornada,
  names: Map<string, string>,
  convocados: string[]
): FlexJornadaStandingRow[] {
  const partidos = jornada.partidos ?? [];
  const scoredPartidos = partidos.filter(
    (partido) =>
      partido.score_pareja1 != null && partido.score_pareja2 != null
  );
  if (scoredPartidos.length === 0) return [];

  const parejas = new Map(
    (jornada.parejas ?? []).map((pareja) => [pareja.id, pareja])
  );
  const matches = scoredPartidos.map((partido) => {
    const left = partido.pareja1 ?? parejas.get(partido.pareja1_id);
    const right = partido.pareja2 ?? parejas.get(partido.pareja2_id);
    return {
      round: partido.ronda,
      pairA: [
        left?.jugador1_id ?? "",
        left?.jugador2_id ?? "",
      ] as [string, string],
      pairB: [
        right?.jugador1_id ?? "",
        right?.jugador2_id ?? "",
      ] as [string, string],
      scoreA: partido.score_pareja1,
      scoreB: partido.score_pareja2,
    };
  });

  const playedSet = new Set<string>();
  for (const match of matches) {
    for (const id of [...match.pairA, ...match.pairB]) {
      if (id) playedSet.add(id);
    }
  }

  const baseIds = convocados.length
    ? convocados
    : Array.from(
        new Set(
          (jornada.parejas ?? []).flatMap((pareja) => [
            pareja.jugador1_id,
            pareja.jugador2_id,
          ])
        )
      );
  const activeIds = baseIds.filter((id) => playedSet.has(id));
  for (const id of Array.from(playedSet)) {
    if (!activeIds.includes(id)) activeIds.push(id);
  }
  if (activeIds.length === 0) return [];

  const players = activeIds.map((id) => ({
    id,
    name: names.get(id) ?? "Jugador",
  }));

  const tallies = tallyScoredMatches(jornada);
  const direct = rankFlexJornada({ players, matches });
  if (direct.ok) {
    return direct.rows.map((row) =>
      withMatchTally(row, tallies.get(row.jugadorId))
    );
  }

  // Si existen empates parciales entre rondas antes del cierre oficial,
  // reutilizamos rankFlexJornada con el orden de convocatoria como resolución
  // provisional de visualización (sin alterar el cierre oficial).
  const withProvisionalOrder = rankFlexJornada({
    players,
    matches,
    resolution: activeIds,
  });
  if (withProvisionalOrder.ok) {
    return withProvisionalOrder.rows.map((row) =>
      withMatchTally(row, tallies.get(row.jugadorId))
    );
  }
  return [];
}

function withMatchTally(
  row: {
    jugadorId: string;
    posicion: number;
    puntos: number;
    partidos: number;
    gamesFavor: number;
    gamesContra: number;
  },
  tally: MatchTally | undefined
): FlexJornadaStandingRow {
  return {
    jugadorId: row.jugadorId,
    posicion: row.posicion,
    puntos: row.puntos,
    partidos: row.partidos,
    ganados: tally?.ganados ?? 0,
    gamesFavor: row.gamesFavor,
    gamesContra: row.gamesContra,
  };
}

type MatchTally = {
  partidos: number;
  ganados: number;
  gamesFavor: number;
  gamesContra: number;
};

function tallyScoredMatches(jornada: LigaJornada): Map<string, MatchTally> {
  const map = new Map<string, MatchTally>();
  const parejas = new Map(
    (jornada.parejas ?? []).map((pareja) => [pareja.id, pareja])
  );
  for (const partido of jornada.partidos ?? []) {
    if (partido.score_pareja1 == null || partido.score_pareja2 == null) continue;
    const left = partido.pareja1 ?? parejas.get(partido.pareja1_id);
    const right = partido.pareja2 ?? parejas.get(partido.pareja2_id);
    const scoreA = partido.score_pareja1;
    const scoreB = partido.score_pareja2;
    const sides = [
      {
        ids: [left?.jugador1_id, left?.jugador2_id],
        favor: scoreA,
        contra: scoreB,
        won: scoreA > scoreB,
      },
      {
        ids: [right?.jugador1_id, right?.jugador2_id],
        favor: scoreB,
        contra: scoreA,
        won: scoreB > scoreA,
      },
    ];
    for (const side of sides) {
      for (const id of side.ids) {
        if (!id) continue;
        const current = map.get(id) ?? {
          partidos: 0,
          ganados: 0,
          gamesFavor: 0,
          gamesContra: 0,
        };
        current.partidos += 1;
        current.gamesFavor += side.favor;
        current.gamesContra += side.contra;
        if (side.won) current.ganados += 1;
        map.set(id, current);
      }
    }
  }
  return map;
}

function finiteRating(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}
