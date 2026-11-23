import React, { useEffect, useMemo, useState } from "react";
import {
  ClubExperienceScope,
  PublicEventBrandIdentity,
  PublicScopedBrandGate,
  useOrganizerDisplayName,
} from "../../club-experience";
import { isPubDsV2Enabled } from "../../config/peds";
import { useVisiblePolling } from "../../hooks/useVisiblePolling";
import { honorResolution, rankFlexSeason, type FlexAward } from "../../lib/liga/flex/season";
import {
  flexPointsSeries,
  flexPublicJornadaEstado,
  flexPublicMovement,
} from "../../lib/liga/flex/publicView";
import { LIGA_PUBLIC_POLL_INTERVAL_MS } from "../../lib/liga/publicPoll";
import { resolveLigaJugadorPublicProfiles } from "../../lib/liga/publicParejaAvatars";
import type { LigaDetalle } from "../../lib/liga/types";
import { loadFlexLeague, type FlexBundle } from "../../services/ligaFlexService";
import { publicLigaJornadaUrl } from "../../services/ligaService";
import { PublicModeShell } from "../platform/PublicModeShell";
import { StatusBadge } from "../platform/StatusBadge";
import { PublicHero } from "../public/peds";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { buildPublicJugadorByRivieraIdPath } from "../jugadores/jugadoresPublicNav";
import { fechaCorta, horarioFlex, movementLabel, useFlexPublicTitle } from "./flex-public/flexPublicUi";
import "./liga-public-pantalla.css";
import "./liga-public-individual-2026.css";
import "../jugadores/riviera-jugadores.css";

type PublicProfile = { fotoUrl: string | null; rivieraId?: string | null };

export const LigaFlexPublica: React.FC<{ detalle: LigaDetalle }> = ({ detalle }) => (
  <ClubExperienceScope organizadorId={detalle.organizador_id} pendingUntilOrganizador>
    <LigaFlexPublicaBody detalle={detalle} />
  </ClubExperienceScope>
);

const LigaFlexPublicaBody: React.FC<{ detalle: LigaDetalle }> = ({ detalle }) => {
  const club = useOrganizerDisplayName(detalle.organizador_id);
  const [bundle, setBundle] = useState<FlexBundle | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({});
  useFlexPublicTitle(`${detalle.nombre} · Riviera Flex League`);

  const reload = React.useCallback(async () => {
    try {
      setBundle(await loadFlexLeague(detalle.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la liga.");
    }
  }, [detalle.id]);
  useVisiblePolling({ callback: reload, intervalMs: LIGA_PUBLIC_POLL_INTERVAL_MS });

  const names = useMemo(() => namesOf(detalle), [detalle]);
  const rosterIds = useMemo(() => Array.from(names.keys()), [names]);
  useEffect(() => {
    let active = true;
    void resolveLigaJugadorPublicProfiles(
      detalle.organizador_id ?? "",
      rosterIds.map((id) => ({ id, name: names.get(id) ?? "Jugador" })),
      { publicOnly: true }
    ).then((next) => {
      if (active) setProfiles(next);
    });
    return () => {
      active = false;
    };
  }, [detalle.organizador_id, names, rosterIds]);

  const completed = detalle.jornadas.filter((jornada) => jornada.estado === "completed");
  const awards = useMemo(() => officialAwards(detalle, bundle), [detalle, bundle]);
  const season = rankFlexSeason({ awards, resolution: honorResolution(bundle?.honores) });
  const movement = flexPublicMovement(awards, completed.map((jornada) => jornada.numero));
  const next = detalle.jornadas
    .filter((jornada) => jornada.estado !== "completed")
    .sort((a, b) => a.numero - b.numero)[0];
  const nextFlex = bundle?.jornadas.find((row) => row.jornadaId === next?.id);
  const leader = season.ok ? season.rows[0] : undefined;
  const selected = season.ok
    ? season.rows.find((row) => row.jugadorId === playerId) ?? season.rows[0] ?? null
    : null;
  const series = selected ? flexPointsSeries(awards, selected.jugadorId, completed.map((j) => j.numero)) : [];
  const estado =
    detalle.estado === "completed"
      ? "Finalizada"
      : detalle.estado === "in_progress"
        ? "En curso"
        : "Por comenzar";
  const badge = detalle.estado === "completed" ? "muted" : detalle.estado === "in_progress" ? "live" : "pending";
  const players = new Set<string>([
    ...detalle.inscripciones.map((row) => row.jugador_id),
    ...Object.values(bundle?.participantes ?? {}).flat(),
  ]);

  return (
    <PublicScopedBrandGate message="Cargando liga…">
      <div className="liga-pantalla App--public-full-width ro-public-view ro-surface-dark liga-pantalla--individual">
        <div className="liga-pantalla__grain" aria-hidden />
        <PublicModeShell className="liga-pantalla__inner">
          {isPubDsV2Enabled ? (
            <PublicHero
              logoClub={<PublicEventBrandIdentity className="peds-hero__club-identity" />}
              estado={<StatusBadge variant={badge}>{estado}</StatusBadge>}
              nombreEvento={detalle.nombre}
              club={club || undefined}
              categoria="Riviera Flex League"
              nivel={bundle?.config.categoria || undefined}
              fecha={
                next
                  ? `Próxima: Jornada ${String(next.numero).padStart(2, "0")} · ${fechaCorta(next.fecha)} · ${horarioFlex(nextFlex?.horaInicio, nextFlex?.horaFin)}`
                  : "Temporada cerrada"
              }
              meta={`${completed.length} / ${detalle.jornadas.length || 12} jornadas · ${players.size} jugadores · ${
                leader ? `Líder ${names.get(leader.jugadorId) ?? "Jugador"}` : "Sin resultados"
              }`}
            />
          ) : (
            <header className="liga-pantalla__header">
              <h1 className="liga-pantalla__title">{detalle.nombre}</h1>
              <p className="liga-pantalla__subtitle">Riviera Flex League · {estado}</p>
            </header>
          )}

          {error ? <p className="liga-pantalla__loading">{error}</p> : null}

          <section className="liga-pantalla-ranking liga-pantalla-ranking--individual-primary" aria-label="Clasificación general">
            <header className="liga-ind-rankhead">
              <p className="liga-ind-rankhead__kicker">Clasificación general</p>
              <h2 className="liga-ind-rankhead__liga">{detalle.nombre}</h2>
              <p className="liga-ind-rankhead__meta">Cada jornada cuenta. Cada punto construye tu historia.</p>
            </header>
            {season.ok && season.rows.length > 0 ? (
              <>
                <div className="liga-ind-top3" role="list">
                  {season.rows.slice(0, 3).map((row) => {
                    const name = names.get(row.jugadorId) ?? "Jugador";
                    const profile = profiles[row.jugadorId];
                    return (
                      <article
                        key={row.jugadorId}
                        role="listitem"
                        className={`liga-ind-top3__card liga-ind-top3__card--${row.posicion}`}
                      >
                        <button type="button" className="flex-pub-roster__hit" onClick={() => setPlayerId(row.jugadorId)}>
                          <div className="liga-ind-top3__portrait">
                            <JugadorAvatar fotoUrl={profile?.fotoUrl} nombre={name} size="xl" className="liga-ind-top3__photo" alt="" />
                            <span className="liga-ind-top3__pos" aria-hidden>{row.posicion}</span>
                          </div>
                          <div className="liga-ind-top3__body">
                            <p className="liga-ind-top3__name">{name}</p>
                            {profile?.rivieraId ? <p className="liga-ind-top3__riviera-id">{profile.rivieraId}</p> : null}
                            <p className="liga-ind-top3__pts">
                              <span className="liga-ind-top3__pts-value">{row.puntos}</span>
                              <span className="liga-ind-top3__pts-label">pts</span>
                            </p>
                            <p className="liga-ind-top3__support">
                              {row.jornadasJugadas} jornadas · {movementLabel(movement.get(row.jugadorId) ?? null)}
                            </p>
                          </div>
                        </button>
                      </article>
                    );
                  })}
                </div>
                <ol className="liga-ind-rest__list">
                  {season.rows.slice(3).map((row) => {
                    const name = names.get(row.jugadorId) ?? "Jugador";
                    const profile = profiles[row.jugadorId];
                    return (
                      <li key={row.jugadorId} className="liga-ind-rest__row">
                        <button type="button" className="flex-pub-roster__hit flex-pub-roster__hit--row" onClick={() => setPlayerId(row.jugadorId)}>
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
                            <span className="liga-ind-rest__jorn">
                              {row.jornadasJugadas} J · {movementLabel(movement.get(row.jugadorId) ?? null)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                {selected ? (
                  <div className="liga-ind-jornadas__panel">
                    <header className="liga-ind-jornadas__panel-head">
                      <div>
                        <h3 className="liga-ind-jornadas__panel-title">{names.get(selected.jugadorId)}</h3>
                        <p className="liga-ind-jornadas__panel-fecha">
                          Posición {selected.posicion} · {selected.puntos} puntos · {selected.jornadasJugadas} jornadas
                        </p>
                      </div>
                      {profiles[selected.jugadorId]?.rivieraId ? (
                        <a
                          className="liga-ind-jornadas__link"
                          href={buildPublicJugadorByRivieraIdPath(profiles[selected.jugadorId]!.rivieraId!)}
                        >
                          Ver perfil
                        </a>
                      ) : null}
                    </header>
                    {series.length === 0 ? (
                      <p className="liga-pantalla-jornada-card__hint">Este jugador todavía no tiene jornadas cerradas.</p>
                    ) : (
                      <ol className="liga-ind-rest__list">
                        {selected.historial.map((row) => (
                          <li key={`${selected.jugadorId}-${row.jornadaNumero}`} className="liga-ind-rest__row">
                            <span className="liga-ind-rest__rank">J{String(row.jornadaNumero).padStart(2, "0")}</span>
                            <span className="liga-ind-rest__identity">
                              <span className="liga-ind-rest__name">Posición {row.posicion}</span>
                            </span>
                            <span className="liga-ind-rest__stats">
                              <span className="liga-ind-rest__pts">
                                <strong>{row.puntos}</strong>
                                <small>pts</small>
                              </span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="liga-pantalla__loading">
                {season.ok
                  ? "Todavía no hay jornadas cerradas con puntos oficiales."
                  : "La clasificación oficial está en espera de un desempate registrado."}
              </p>
            )}
          </section>

          <section className="liga-pantalla-jornadas liga-pantalla-jornadas--individual-secondary" aria-label="Calendario de temporada">
            <h2 className="liga-pantalla-jornadas__title">Calendario de temporada</h2>
            <div className="liga-ind-jornadas">
              <div className="liga-ind-jornadas__index">
                {detalle.jornadas
                  .slice()
                  .sort((a, b) => a.numero - b.numero)
                  .map((jornada) => {
                    const flex = bundle?.jornadas.find((row) => row.jornadaId === jornada.id);
                    const status = flexPublicJornadaEstado({
                      estado: jornada.estado,
                      fecha: jornada.fecha,
                      confirmada: flex?.programacionEstado === "confirmada",
                    });
                    const tone =
                      status.key === "finalizada" ? "done" : status.key === "en_curso" ? "live" : "upcoming";
                    return (
                      <a
                        key={jornada.id}
                        className={`liga-ind-jornadas__tab liga-ind-jornadas__tab--${tone}`}
                        href={publicLigaJornadaUrl(detalle.id, jornada.numero)}
                      >
                        <span className="liga-ind-jornadas__tab-num">{String(jornada.numero).padStart(2, "0")}</span>
                        <span className="liga-ind-jornadas__tab-label">{status.label}</span>
                      </a>
                    );
                  })}
              </div>
            </div>
          </section>
        </PublicModeShell>
      </div>
    </PublicScopedBrandGate>
  );
};

function officialAwards(detalle: LigaDetalle, bundle: FlexBundle | null): FlexAward[] {
  const numeroById = new Map(detalle.jornadas.map((jornada) => [jornada.id, jornada.numero]));
  const closed = new Set(
    detalle.jornadas.filter((jornada) => jornada.estado === "completed").map((jornada) => jornada.id)
  );
  return (bundle?.posiciones ?? [])
    .filter((row) => closed.has(row.jornadaId))
    .map((row) => ({
      jornadaNumero: numeroById.get(row.jornadaId) ?? 0,
      jugadorId: row.jugadorId,
      posicion: row.posicion,
      puntos: row.puntos,
    }))
    .filter((row) => row.jornadaNumero > 0);
}

function namesOf(detalle: LigaDetalle): Map<string, string> {
  const map = new Map<string, string>();
  for (const player of detalle.jugadores) map.set(player.id, player.nombre);
  for (const row of detalle.inscripciones) {
    if (row.jugador?.nombre) map.set(row.jugador_id, row.jugador.nombre);
  }
  for (const jornada of detalle.jornadas) {
    for (const pareja of jornada.parejas ?? []) {
      if (pareja.jugador1?.nombre) map.set(pareja.jugador1_id, pareja.jugador1.nombre);
      if (pareja.jugador2?.nombre) map.set(pareja.jugador2_id, pareja.jugador2.nombre);
    }
  }
  return map;
}
