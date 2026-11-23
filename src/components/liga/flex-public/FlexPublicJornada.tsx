import React, { useEffect, useMemo, useState } from "react";
import {
  ClubExperienceScope,
  PublicEventBrandIdentity,
  PublicEventNeutralLoading,
  useOrganizerDisplayName,
} from "../../../club-experience";
import { useVisiblePolling } from "../../../hooks/useVisiblePolling";
import { honorResolution, rankFlexSeason } from "../../../lib/liga/flex/season";
import { rankFlexJornada } from "../../../lib/liga/flex/standings";
import { flexPublicJornadaEstado } from "../../../lib/liga/flex/publicView";
import { LIGA_PUBLIC_POLL_INTERVAL_MS } from "../../../lib/liga/publicPoll";
import { resolveLigaJugadorPublicProfiles } from "../../../lib/liga/publicParejaAvatars";
import type { LigaDetalle, LigaJornada, LigaJornadaPareja, LigaPartido } from "../../../lib/liga/types";
import { isFlexLeague } from "../../../lib/liga/ligaModalidad";
import { loadFlexLeague, type FlexBundle } from "../../../services/ligaFlexService";
import { getLigaById, publicLigaUrl } from "../../../services/ligaService";
import {
  fechaCorta,
  FlexFace,
  horarioFlex,
  useFlexPublicFonts,
  useFlexPublicTitle,
} from "./flexPublicUi";
import "./flex-public.css";

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
      <main className="flex-pub">
        <div className="flex-pub__inner">
          <p className="flex-pub__empty">Esta pantalla es de Riviera Flex League.</p>
        </div>
      </main>
    );
  }
  return <FlexPublicJornada detalle={detalle} numero={numero} pantalla />;
};

export const FlexPublicJornada: React.FC<{
  detalle: LigaDetalle;
  numero: number;
  pantalla?: boolean;
}> = ({ detalle, numero, pantalla = false }) => (
  <ClubExperienceScope organizadorId={detalle.organizador_id}>
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
  const [profiles, setProfiles] = useState<
    Record<string, { fotoUrl: string | null; rivieraId?: string | null }>
  >({});
  const [round, setRound] = useState<number | null>(null);
  useFlexPublicFonts();
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
      <main className="flex-pub">
        <div className="flex-pub__inner">
          <p className="flex-pub__empty">Esa jornada no está en el calendario.</p>
          <a href={publicLigaUrl(detalle.id)}>Volver a la liga</a>
        </div>
      </main>
    );
  }

  const flex = bundle?.jornadas.find((row) => row.jornadaId === jornada.id);
  const status = flexPublicJornadaEstado({
    estado: jornada.estado,
    fecha: jornada.fecha,
    confirmada: flex?.programacionEstado === "confirmada",
  });
  const convocados = bundle?.participantes[jornada.id] ?? [];
  const partidos = (jornada.partidos ?? []).slice().sort((a, b) => a.ronda - b.ronda || (a.cancha ?? 0) - (b.cancha ?? 0));
  const rounds = Array.from(new Set(partidos.map((partido) => partido.ronda)));
  const focus = rounds.find((ronda) =>
    partidos
      .filter((partido) => partido.ronda === ronda)
      .some((partido) => partido.score_pareja1 == null || partido.score_pareja2 == null)
  ) ?? rounds[rounds.length - 1] ?? null;
  const visibleRound = pantalla ? focus : round;
  const visible =
    visibleRound != null
      ? partidos.filter((partido) => partido.ronda === visibleRound)
      : partidos;
  const official = jornada.estado === "completed";
  const posiciones = (bundle?.posiciones ?? [])
    .filter((row) => row.jornadaId === jornada.id)
    .sort((a, b) => a.posicion - b.posicion);
  const provisional = !official ? provisionalRank(jornada, names, convocados) : null;
  const pantallaHref = `${publicLigaUrl(detalle.id)}/jornada/${jornada.numero}/pantalla`;

  const enterFullscreen = () => {
    const node = document.documentElement;
    if (node.requestFullscreen) void node.requestFullscreen().catch(() => undefined);
  };

  return (
    <main className={pantalla ? "flex-pub flex-pub--pantalla" : "flex-pub"}>
      <PublicEventBrandIdentity />
      <div className="flex-pub__inner">
        <header className="flex-pub__hero">
          <p className="flex-pub__kicker">{club || "Club"} · by Riviera Open</p>
          <h1>
            {pantalla && visibleRound
              ? `Jornada ${String(jornada.numero).padStart(2, "0")} — Ronda ${String(visibleRound).padStart(2, "0")}`
              : `Jornada ${String(jornada.numero).padStart(2, "0")}`}
          </h1>
          <p className="flex-pub__meta">{detalle.nombre}</p>
          <p className="flex-pub__lead">
            {fechaCorta(jornada.fecha)} · {horarioFlex(flex?.horaInicio, flex?.horaFin)} · {status.label}
            {flex ? ` · ${flex.canchas} canchas · ${flex.rondas} rondas` : ""}
            {` · ${convocados.length} jugadores`}
          </p>
          <div className="flex-pub__actions">
            <a href={publicLigaUrl(detalle.id)}>Volver a la liga</a>
            {pantalla ? (
              <button type="button" onClick={enterFullscreen}>
                Pantalla completa
              </button>
            ) : (
              <a href={pantallaHref}>Ver en pantalla</a>
            )}
          </div>
        </header>

        {!pantalla ? (
          <section className="flex-pub__section" aria-label="Participantes">
            <h2>Participantes</h2>
            {convocados.length === 0 ? (
              <p className="flex-pub__empty">Todavía no hay jugadores convocados.</p>
            ) : (
              <div className="flex-pub__people">
                {convocados.map((id) => (
                  <article key={id} className="flex-pub__person">
                    <FlexFace name={names.get(id) ?? "Jugador"} foto={profiles[id]?.fotoUrl ?? null} />
                    <span className="flex-pub__who">
                      <strong>{names.get(id) ?? "Jugador"}</strong>
                      <span>{profiles[id]?.rivieraId || "Sin Riviera ID"}</span>
                      {seasonPos.has(id) ? <span>{seasonPos.get(id)}º en la liga</span> : null}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <section className="flex-pub__section" aria-label="Rondas">
          {!pantalla && rounds.length > 1 ? (
            <div className="flex-pub__actions">
              <button type="button" onClick={() => setRound(null)}>
                Todas
              </button>
              {rounds.map((ronda) => (
                <button key={ronda} type="button" onClick={() => setRound(ronda)}>
                  Ronda {String(ronda).padStart(2, "0")}
                </button>
              ))}
            </div>
          ) : null}
          {visible.length === 0 ? (
            <p className="flex-pub__empty">La programación todavía no está confirmada.</p>
          ) : (
            groupByRound(visible).map(([ronda, matches]) => (
              <div key={ronda} className="flex-pub__round">
                {pantalla ? null : (
                  <h3>Ronda {String(ronda).padStart(2, "0")}</h3>
                )}
                <div className="flex-pub__courts">
                  {matches.map((partido) => (
                    <MatchCard
                      key={partido.id}
                      partido={partido}
                      parejas={jornada.parejas ?? []}
                      names={names}
                      profiles={profiles}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        {!pantalla && official && posiciones.length > 0 ? (
          <section className="flex-pub__section" aria-label="Resultados oficiales">
            <h2>Resultados oficiales</h2>
            <Standings rows={posiciones} names={names} profiles={profiles} />
            <Podium rows={posiciones.slice(0, 3)} names={names} profiles={profiles} />
            <p className="flex-pub__note">
              Felicidades a nuestros destacados. Cada jornada es una nueva oportunidad para seguir sumando.
            </p>
          </section>
        ) : null}

        {!pantalla && !official && provisional?.ok ? (
          <section className="flex-pub__section" aria-label="Clasificación provisional">
            <h2>Clasificación provisional</h2>
            <Standings
              rows={provisional.rows.map((row) => ({
                jugadorId: row.jugadorId,
                posicion: row.posicion,
                puntos: row.puntos,
                partidos: row.partidos,
              }))}
              names={names}
              profiles={profiles}
            />
          </section>
        ) : null}
      </div>
    </main>
  );
};

function MatchCard({
  partido,
  parejas,
  names,
  profiles,
}: {
  partido: LigaPartido;
  parejas: LigaJornadaPareja[];
  names: Map<string, string>;
  profiles: Record<string, { fotoUrl: string | null }>;
}) {
  const byId = new Map(parejas.map((pareja) => [pareja.id, pareja]));
  const left = partido.pareja1 ?? byId.get(partido.pareja1_id);
  const right = partido.pareja2 ?? byId.get(partido.pareja2_id);
  const hasScore = partido.score_pareja1 != null && partido.score_pareja2 != null;
  return (
    <article className="flex-pub__match">
      <p className="flex-pub__eyebrow">
        Ronda {String(partido.ronda).padStart(2, "0")} · Cancha {String(partido.cancha ?? "—").padStart(2, "0")}
      </p>
      <div className="flex-pub__vs">
        <Side pareja={left} names={names} profiles={profiles} align="left" />
        <b>VS</b>
        <Side pareja={right} names={names} profiles={profiles} align="right" />
      </div>
      <p className="flex-pub__score">
        {hasScore ? `${partido.score_pareja1} – ${partido.score_pareja2}` : "Sin marcador"}
      </p>
    </article>
  );
}

function Side({
  pareja,
  names,
  profiles,
  align,
}: {
  pareja: LigaJornadaPareja | undefined;
  names: Map<string, string>;
  profiles: Record<string, { fotoUrl: string | null }>;
  align: "left" | "right";
}) {
  const ids = pareja ? [pareja.jugador1_id, pareja.jugador2_id] : [];
  return (
    <div className={align === "right" ? "flex-pub__side flex-pub__side--right" : "flex-pub__side"}>
      {ids.map((id) => (
        <span key={id} className="flex-pub__player">
          <FlexFace name={names.get(id) ?? "Jugador"} foto={profiles[id]?.fotoUrl ?? null} />
          <strong>{names.get(id) ?? "Jugador"}</strong>
        </span>
      ))}
    </div>
  );
}

function Standings({
  rows,
  names,
  profiles,
}: {
  rows: { jugadorId: string; posicion: number; puntos: number; partidos: number }[];
  names: Map<string, string>;
  profiles: Record<string, { fotoUrl: string | null; rivieraId?: string | null }>;
}) {
  return (
    <table className="flex-pub__table">
      <thead>
        <tr>
          <th>Pos</th>
          <th>Jugador</th>
          <th className="flex-pub__col-secondary">PJ</th>
          <th>PTS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.jugadorId}>
            <td>{row.posicion}</td>
            <td>
              <span className="flex-pub__player">
                <FlexFace name={names.get(row.jugadorId) ?? "Jugador"} foto={profiles[row.jugadorId]?.fotoUrl ?? null} />
                <span className="flex-pub__who">
                  <strong>{names.get(row.jugadorId) ?? "Jugador"}</strong>
                  <span>{profiles[row.jugadorId]?.rivieraId || ""}</span>
                  <span className="flex-pub__mobile-meta">{row.partidos} PJ</span>
                </span>
              </span>
            </td>
            <td className="flex-pub__col-secondary">{row.partidos}</td>
            <td>{row.puntos}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Podium({
  rows,
  names,
  profiles,
}: {
  rows: { jugadorId: string; posicion: number; puntos: number }[];
  names: Map<string, string>;
  profiles: Record<string, { fotoUrl: string | null }>;
}) {
  const first = rows[0];
  const rest = rows.slice(1, 3);
  if (!first) return null;
  return (
    <div className="flex-pub__podio">
      <PodiumCard row={first} names={names} profiles={profiles} large />
      <div className="flex-pub__podio-rest">
        {rest.map((row) => (
          <PodiumCard key={row.jugadorId} row={row} names={names} profiles={profiles} />
        ))}
      </div>
    </div>
  );
}

function PodiumCard({
  row,
  names,
  profiles,
  large = false,
}: {
  row: { jugadorId: string; posicion: number; puntos: number };
  names: Map<string, string>;
  profiles: Record<string, { fotoUrl: string | null }>;
  large?: boolean;
}) {
  const name = names.get(row.jugadorId) ?? "Jugador";
  return (
    <article className="flex-pub__podio-card">
      <p className="flex-pub__eyebrow">{row.posicion}º lugar</p>
      <FlexFace name={name} foto={profiles[row.jugadorId]?.fotoUrl ?? null} large={large} />
      <h3 className="flex-pub__display">{name}</h3>
      <p>{row.puntos} puntos</p>
    </article>
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
        new Set(
          (jornada.parejas ?? []).flatMap((pareja) => [pareja.jugador1_id, pareja.jugador2_id])
        )
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
