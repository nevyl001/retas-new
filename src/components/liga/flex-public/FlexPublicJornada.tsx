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
import { rankFlexJornada } from "../../../lib/liga/flex/standings";
import { flexPublicJornadaEstado } from "../../../lib/liga/flex/publicView";
import type { PublicRondaEstadoItem } from "../../../lib/liga/jornadaTemporal";
import { LIGA_PUBLIC_POLL_INTERVAL_MS } from "../../../lib/liga/publicPoll";
import { resolveLigaJugadorPublicProfiles } from "../../../lib/liga/publicParejaAvatars";
import type { LigaDetalle, LigaJornada, LigaJornadaPareja, LigaPartido } from "../../../lib/liga/types";
import { isFlexLeague } from "../../../lib/liga/ligaModalidad";
import { loadFlexLeague, type FlexBundle } from "../../../services/ligaFlexService";
import { getLigaById, publicLigaUrl } from "../../../services/ligaService";
import { PublicModeShell } from "../../platform/PublicModeShell";
import { StatusBadge } from "../../platform/StatusBadge";
import { PublicHero } from "../../public/peds";
import { PublicSplitVsPlayerPanel } from "../../public/split-vs";
import { JugadorAvatar } from "../../jugadores/JugadorAvatar";
import { buildPublicJugadorByRivieraIdPath } from "../../jugadores/jugadoresPublicNav";
import { LigaJornadaMatchCardFinal } from "../jornada-public/LigaJornadaMatchCardFinal";
import { LigaJornadaMatchCardPending } from "../jornada-public/LigaJornadaMatchCardPending";
import { LigaJornadaPublicRoundSelector } from "../jornada-public/LigaJornadaPublicRoundSelector";
import type { LigaJornadaMatchPairSide } from "../jornada-public/ligaJornadaMatchTypes";
import { fechaCorta, horarioFlex, useFlexPublicTitle } from "./flexPublicUi";
import "../liga-public-pantalla.css";
import "../liga-public-premium-2026.css";
import "../liga-public-individual-2026.css";
import "../jornada-public/liga-jornada-public-match.css";
import "../jornada-public/liga-jornada-public-round-selector.css";
import "../../jugadores/riviera-jugadores.css";

type PublicProfile = { fotoUrl: string | null; rivieraId?: string | null };
type StandingRow = {
  jugadorId: string;
  posicion: number;
  puntos: number;
  partidos: number;
};

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
        <PublicEventNeutralLoading message={error ?? "Cargando pantalla…"} />
      </ClubExperienceScope>
    );
  }
  if (!isFlexLeague(detalle.modalidad)) {
    return (
      <ClubExperienceScope organizadorId={detalle.organizador_id}>
        <PublicScopedBrandGate message="Cargando pantalla…">
          <div className="liga-pantalla App--public-full-width ro-public-view ro-surface-dark">
            <PublicModeShell className="liga-pantalla__inner">
              <p className="liga-pantalla__loading">Esta pantalla es de Riviera Flex League.</p>
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
  <ClubExperienceScope organizadorId={detalle.organizador_id} pendingUntilOrganizador>
    <FlexPublicJornadaBody detalle={detalle} numero={numero} pantalla={pantalla} />
  </ClubExperienceScope>
);

const FlexPublicJornadaBody: React.FC<{
  detalle: LigaDetalle;
  numero: number;
  pantalla: boolean;
}> = ({ detalle, numero, pantalla }) => {
  const club = useOrganizerDisplayName(detalle.organizador_id);
  const jornada = detalle.jornadas.find((item) => item.numero === numero) ?? null;
  const [bundle, setBundle] = useState<FlexBundle | null>(null);
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({});
  const [round, setRound] = useState<number | null>(null);
  useFlexPublicTitle(
    jornada
      ? `Jornada ${jornada.numero} · ${detalle.nombre}`
      : `${detalle.nombre} · Riviera Flex League`
  );

  const reload = React.useCallback(async () => {
    try {
      setBundle(await loadFlexLeague(detalle.id));
    } catch {
      setBundle(null);
    }
  }, [detalle.id]);
  useVisiblePolling({ callback: reload, intervalMs: LIGA_PUBLIC_POLL_INTERVAL_MS });

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of detalle.jugadores) map.set(player.id, player.nombre);
    for (const row of detalle.inscripciones) {
      if (row.jugador?.nombre) map.set(row.jugador_id, row.jugador.nombre);
    }
    for (const pareja of jornada?.parejas ?? []) {
      if (pareja.jugador1?.nombre) map.set(pareja.jugador1_id, pareja.jugador1.nombre);
      if (pareja.jugador2?.nombre) map.set(pareja.jugador2_id, pareja.jugador2.nombre);
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
  }, [detalle.organizador_id, ids, names]);

  const seasonPos = useMemo(() => {
    const closed = new Set(
      detalle.jornadas.filter((item) => item.estado === "completed").map((item) => item.id)
    );
    const numeroById = new Map(detalle.jornadas.map((item) => [item.id, item.numero]));
    const awards = (bundle?.posiciones ?? [])
      .filter((row) => closed.has(row.jornadaId))
      .map((row) => ({
        jornadaNumero: numeroById.get(row.jornadaId) ?? 0,
        jugadorId: row.jugadorId,
        posicion: row.posicion,
        puntos: row.puntos,
      }))
      .filter((row) => row.jornadaNumero > 0);
    const ranked = rankFlexSeason({
      awards,
      resolution: honorResolution(bundle?.honores),
    });
    const map = new Map<string, number>();
    if (ranked.ok) {
      for (const row of ranked.rows) map.set(row.jugadorId, row.posicion);
    }
    return map;
  }, [bundle, detalle.jornadas]);

  if (!jornada) {
    return (
      <PublicScopedBrandGate message="Cargando jornada…">
        <div className="liga-pantalla App--public-full-width ro-public-view ro-surface-dark liga-pantalla--jornada-fijas">
          <PublicModeShell className="liga-pantalla__inner">
            <p className="liga-pantalla__loading">Esa jornada no está en el calendario.</p>
            <a className="liga-pantalla-jornada-card__link" href={publicLigaUrl(detalle.id)}>
              Volver a la liga
            </a>
          </PublicModeShell>
        </div>
      </PublicScopedBrandGate>
    );
  }

  const flex = bundle?.jornadas.find((row) => row.jornadaId === jornada.id);
  const status = flexPublicJornadaEstado({
    estado: jornada.estado,
    fecha: jornada.fecha,
    confirmada: flex?.programacionEstado === "confirmada",
  });
  const convocados = bundle?.participantes[jornada.id] ?? [];
  const partidos = (jornada.partidos ?? [])
    .slice()
    .sort((a, b) => a.ronda - b.ronda || (a.cancha ?? 0) - (b.cancha ?? 0));
  const rounds = Array.from(new Set(partidos.map((partido) => partido.ronda)));
  const focus =
    rounds.find((ronda) =>
      partidos
        .filter((partido) => partido.ronda === ronda)
        .some((partido) => partido.score_pareja1 == null || partido.score_pareja2 == null)
    ) ??
    rounds[rounds.length - 1] ??
    null;
  const visibleRound = pantalla ? focus : (round ?? focus);
  const visible =
    visibleRound != null
      ? partidos.filter((partido) => partido.ronda === visibleRound)
      : partidos;
  const official = jornada.estado === "completed";
  const posiciones = (bundle?.posiciones ?? [])
    .filter((row) => row.jornadaId === jornada.id)
    .sort((a, b) => a.posicion - b.posicion);
  const provisional = !official ? provisionalRank(jornada, names, convocados) : null;
  const standingRows: StandingRow[] = official
    ? posiciones.map((row) => ({
        jugadorId: row.jugadorId,
        posicion: row.posicion,
        puntos: row.puntos,
        partidos: row.partidos,
      }))
    : provisional?.ok
      ? provisional.rows.map((row) => ({
          jugadorId: row.jugadorId,
          posicion: row.posicion,
          puntos: row.puntos,
          partidos: row.partidos,
        }))
      : [];
  const rondaEstados: PublicRondaEstadoItem[] = rounds.map((ronda) => {
    const ofRound = partidos.filter((partido) => partido.ronda === ronda);
    const scored = ofRound.every(
      (partido) => partido.score_pareja1 != null && partido.score_pareja2 != null
    );
    if (scored) return { ronda, estado: "done" };
    if (jornada.estado === "in_progress" && ronda === focus) return { ronda, estado: "live" };
    return { ronda, estado: "pending" };
  });
  const pantallaHref = `${publicLigaUrl(detalle.id)}/jornada/${jornada.numero}/pantalla`;
  const fecha = fechaCorta(jornada.fecha);
  const horario = horarioFlex(flex?.horaInicio, flex?.horaFin);
  const badgeVariant =
    status.key === "finalizada" ? "muted" : status.key === "en_curso" ? "live" : "pending";
  const groups = groupByRound(visible);

  const enterFullscreen = () => {
    const node = document.documentElement;
    if (node.requestFullscreen) void node.requestFullscreen().catch(() => undefined);
  };

  return (
    <PublicScopedBrandGate message="Cargando jornada…">
      <div
        className={`liga-pantalla App--public-full-width ro-public-view ro-surface-dark liga-pantalla--jornada-fijas liga-pantalla--individual${
          pantalla ? " liga-pantalla--flex-screen" : ""
        }`}
      >
        <div className="liga-pantalla__grain" aria-hidden />
        <PublicModeShell className="liga-pantalla__inner">
          {isPubDsV2Enabled ? (
            <PublicHero
              className="liga-pantalla-jornada-hero"
              logoClub={<PublicEventBrandIdentity className="peds-hero__club-identity" />}
              estado={<StatusBadge variant={badgeVariant}>{status.label}</StatusBadge>}
              nombreEvento={detalle.nombre}
              club={club || undefined}
              categoria={`Jornada ${String(jornada.numero).padStart(2, "0")}`}
              fecha={fecha === "Por programar" ? "Por programar" : `${fecha} · ${horario}`}
              meta={
                pantalla && visibleRound
                  ? `Ronda ${String(visibleRound).padStart(2, "0")} · ${flex?.canchas ?? "—"} canchas`
                  : `${flex?.canchas ?? "—"} canchas · ${flex?.rondas ?? "—"} rondas · ${convocados.length} jugadores`
              }
            />
          ) : (
            <header className="liga-pantalla__header">
              <h1 className="liga-pantalla__title">{detalle.nombre}</h1>
              <p className="liga-pantalla__subtitle">
                Jornada {String(jornada.numero).padStart(2, "0")} · {status.label}
              </p>
            </header>
          )}

          <p className="liga-pantalla-ronda__meta liga-pantalla-ronda__meta--centered">
            <a className="liga-pantalla-jornada-card__link" href={publicLigaUrl(detalle.id)}>
              Volver a la liga
            </a>
            {pantalla ? (
              <button type="button" className="liga-pantalla-jornada-card__link" onClick={enterFullscreen}>
                Pantalla completa
              </button>
            ) : (
              <a className="liga-pantalla-jornada-card__link" href={pantallaHref}>
                Ver en pantalla
              </a>
            )}
          </p>

          {!pantalla ? (
            <section className="liga-pantalla-ranking" aria-label="Participantes">
              <h2 className="liga-pantalla-ranking__title">Participantes</h2>
              {convocados.length === 0 ? (
                <article className="liga-pantalla-jornada-card">
                  <div className="liga-pantalla-jornada-card__body">
                    <p className="liga-pantalla-jornada-card__hint">
                      Todavía no hay jugadores convocados.
                    </p>
                  </div>
                </article>
              ) : (
                <div className="flex-pub-roster">
                  {convocados.map((id) => {
                    const name = names.get(id) ?? "Jugador";
                    const profile = profiles[id];
                    const pos = seasonPos.get(id);
                    return (
                      <article key={id} className="flex-pub-roster__card">
                        <PublicSplitVsPlayerPanel name={name} foto={profile?.fotoUrl ?? null} />
                        <p className="flex-pub-roster__id">
                          {profile?.rivieraId || "Sin Riviera ID"}
                          {pos ? ` · ${pos}º en la liga` : ""}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          <div className="liga-pantalla__layout liga-pantalla__layout--parejas">
            <div className="liga-pantalla__rondas">
              {partidos.length === 0 ? (
                <article className="liga-pantalla-jornada-card">
                  <div className="liga-pantalla-jornada-card__head">
                    <h2 className="liga-pantalla-jornada-card__num">Programación</h2>
                  </div>
                  <div className="liga-pantalla-jornada-card__body">
                    <p className="liga-pantalla-jornada-card__hint">
                      La programación todavía no está confirmada.
                    </p>
                  </div>
                </article>
              ) : (
                <>
                  {!pantalla && rondaEstados.length > 1 ? (
                    <LigaJornadaPublicRoundSelector
                      rondas={rondaEstados}
                      selectedRonda={visibleRound ?? rondaEstados[0]!.ronda}
                      onSelect={setRound}
                    />
                  ) : null}
                  {groups.map(([ronda, matches]) => (
                    <section
                      key={ronda}
                      className="liga-pantalla-ronda liga-pantalla-ronda--courts liga-pantalla-ronda--selected"
                    >
                      <div className="liga-pantalla-ronda__head">
                        <h2 className="liga-pantalla-ronda__title">
                          {pantalla
                            ? `Jornada ${String(jornada.numero).padStart(2, "0")} — Ronda ${String(ronda).padStart(2, "0")}`
                            : `Ronda ${ronda}`}
                        </h2>
                      </div>
                      <div
                        className="liga-pantalla-ronda__matches liga-pantalla-ronda__matches--courts"
                        data-cols={String(Math.max(1, Math.min(flex?.canchas ?? matches.length, matches.length)))}
                      >
                        {matches.map((partido) => (
                          <FlexMatchCard
                            key={partido.id}
                            partido={partido}
                            parejas={jornada.parejas ?? []}
                            names={names}
                            profiles={profiles}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </>
              )}
            </div>

            {!pantalla && standingRows.length > 0 ? (
              <aside className="liga-pantalla-ranking liga-pantalla-ranking--individual-primary" aria-label={official ? "Resultados oficiales" : "Clasificación provisional"}>
                <header className="liga-ind-rankhead">
                  <p className="liga-ind-rankhead__kicker">
                    {official ? "Resultados oficiales" : "Clasificación provisional"}
                  </p>
                  <h2 className="liga-ind-rankhead__liga">
                    Jornada {String(jornada.numero).padStart(2, "0")}
                  </h2>
                  <p className="liga-ind-rankhead__meta">Puntos de esta jornada</p>
                </header>
                {official ? (
                  <div className="liga-ind-top3" role="list">
                    {standingRows.slice(0, 3).map((row) => (
                      <StandingPortrait
                        key={row.jugadorId}
                        row={row}
                        name={names.get(row.jugadorId) ?? "Jugador"}
                        profile={profiles[row.jugadorId]}
                      />
                    ))}
                  </div>
                ) : null}
                <ol className="liga-ind-rest__list">
                  {standingRows.slice(official ? 3 : 0).map((row) => (
                    <StandingLine
                      key={row.jugadorId}
                      row={row}
                      name={names.get(row.jugadorId) ?? "Jugador"}
                      profile={profiles[row.jugadorId]}
                    />
                  ))}
                </ol>
                {official ? (
                  <aside className="liga-ind-podio-note">
                    <p className="liga-ind-podio-note__title">
                      Felicidades a nuestros destacados. Cada jornada es una nueva oportunidad para seguir sumando.
                    </p>
                  </aside>
                ) : null}
              </aside>
            ) : null}
          </div>
        </PublicModeShell>
      </div>
    </PublicScopedBrandGate>
  );
};

function FlexMatchCard({
  partido,
  parejas,
  names,
  profiles,
}: {
  partido: LigaPartido;
  parejas: LigaJornadaPareja[];
  names: Map<string, string>;
  profiles: Record<string, PublicProfile>;
}) {
  const byId = new Map(parejas.map((pareja) => [pareja.id, pareja]));
  const left = partido.pareja1 ?? byId.get(partido.pareja1_id);
  const right = partido.pareja2 ?? byId.get(partido.pareja2_id);
  const side1 = toSide(left, names, profiles);
  const side2 = toSide(right, names, profiles);
  const hasScore = partido.score_pareja1 != null && partido.score_pareja2 != null;
  const tie = hasScore && partido.score_pareja1 === partido.score_pareja2;
  const estadoMod = hasScore ? (tie ? "draw" : "done") : partido.estado === "in_progress" ? "live" : "pending";
  const estadoText = hasScore ? (tie ? "Empate" : "Final") : estadoMod === "live" ? "En juego" : "Pendiente";
  if (!hasScore) {
    return (
      <LigaJornadaMatchCardPending
        canchaNum={partido.cancha ?? "—"}
        estadoMod={estadoMod === "draw" || estadoMod === "done" ? "pending" : estadoMod}
        estadoText={estadoText}
        side1={side1}
        side2={side2}
        matchLabel={`Ronda ${partido.ronda}`}
      />
    );
  }
  return (
    <LigaJornadaMatchCardFinal
      canchaNum={partido.cancha ?? "—"}
      estadoMod={estadoMod}
      estadoText={estadoText}
      side1={side1}
      side2={side2}
      board={{ kind: "simple", s1: partido.score_pareja1 as number, s2: partido.score_pareja2 as number }}
      p1Wins={!tie && (partido.score_pareja1 as number) > (partido.score_pareja2 as number)}
      p2Wins={!tie && (partido.score_pareja2 as number) > (partido.score_pareja1 as number)}
      scoreSummaryOnly
      matchLabel={`Ronda ${partido.ronda}`}
    />
  );
}

function toSide(
  pareja: LigaJornadaPareja | undefined,
  names: Map<string, string>,
  profiles: Record<string, PublicProfile>
): LigaJornadaMatchPairSide {
  const id1 = pareja?.jugador1_id ?? "";
  const id2 = pareja?.jugador2_id ?? "";
  return {
    name1: pareja?.jugador1?.nombre || names.get(id1) || "Jugador",
    name2: pareja?.jugador2?.nombre || names.get(id2) || "Jugador",
    foto1: profiles[id1]?.fotoUrl ?? null,
    foto2: profiles[id2]?.fotoUrl ?? null,
  };
}

function StandingPortrait({
  row,
  name,
  profile,
}: {
  row: StandingRow;
  name: string;
  profile?: PublicProfile;
}) {
  return (
    <article className={`liga-ind-top3__card liga-ind-top3__card--${row.posicion}`} role="listitem">
      <div className="liga-ind-top3__portrait">
        <JugadorAvatar fotoUrl={profile?.fotoUrl} nombre={name} size="xl" className="liga-ind-top3__photo" alt="" />
        <span className="liga-ind-top3__pos" aria-hidden>
          {row.posicion}
        </span>
      </div>
      <div className="liga-ind-top3__body">
        <p className="liga-ind-top3__name">{name}</p>
        {profile?.rivieraId ? (
          <p className="liga-ind-top3__riviera-id">
            <a href={buildPublicJugadorByRivieraIdPath(profile.rivieraId)}>{profile.rivieraId}</a>
          </p>
        ) : null}
        <p className="liga-ind-top3__pts">
          <span className="liga-ind-top3__pts-value">{row.puntos}</span>
          <span className="liga-ind-top3__pts-label">pts</span>
        </p>
        <p className="liga-ind-top3__support">{row.partidos} partidos</p>
      </div>
    </article>
  );
}

function StandingLine({
  row,
  name,
  profile,
}: {
  row: StandingRow;
  name: string;
  profile?: PublicProfile;
}) {
  return (
    <li className="liga-ind-rest__row">
      <span className="liga-ind-rest__rank">{row.posicion}</span>
      <JugadorAvatar fotoUrl={profile?.fotoUrl} nombre={name} size="sm" className="liga-ind-rest__avatar" alt="" />
      <span className="liga-ind-rest__identity">
        <span className="liga-ind-rest__name">{name}</span>
        {profile?.rivieraId ? <span className="liga-ind-rest__riviera-id">{profile.rivieraId}</span> : null}
      </span>
      <span className="liga-ind-rest__stats">
        <span className="liga-ind-rest__pts">
          <strong>{row.puntos}</strong>
          <small>pts</small>
        </span>
        <span className="liga-ind-rest__jorn">{row.partidos} PJ</span>
      </span>
    </li>
  );
}

function groupByRound(partidos: LigaPartido[]): [number, LigaPartido[]][] {
  const map = new Map<number, LigaPartido[]>();
  for (const partido of partidos) {
    const list = map.get(partido.ronda) ?? [];
    list.push(partido);
    map.set(partido.ronda, list);
  }
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}

function provisionalRank(
  jornada: LigaJornada,
  names: Map<string, string>,
  convocados: string[]
) {
  const partidos = jornada.partidos ?? [];
  if (partidos.length === 0) return null;
  if (partidos.some((partido) => partido.score_pareja1 == null || partido.score_pareja2 == null)) {
    return null;
  }
  const parejas = new Map((jornada.parejas ?? []).map((pareja) => [pareja.id, pareja]));
  const ids = convocados.length
    ? convocados
    : Array.from(
        new Set((jornada.parejas ?? []).flatMap((pareja) => [pareja.jugador1_id, pareja.jugador2_id]))
      );
  return rankFlexJornada({
    players: ids.map((id) => ({ id, name: names.get(id) ?? "Jugador" })),
    matches: partidos.map((partido) => {
      const left = partido.pareja1 ?? parejas.get(partido.pareja1_id);
      const right = partido.pareja2 ?? parejas.get(partido.pareja2_id);
      return {
        round: partido.ronda,
        pairA: [left?.jugador1_id ?? "", left?.jugador2_id ?? ""] as [string, string],
        pairB: [right?.jugador1_id ?? "", right?.jugador2_id ?? ""] as [string, string],
        scoreA: partido.score_pareja1,
        scoreB: partido.score_pareja2,
      };
    }),
  });
}
