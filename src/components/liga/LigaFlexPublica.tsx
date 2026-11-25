import React, { useEffect, useMemo, useState } from "react";
import {
  ClubExperienceScope,
  PublicEventBrandIdentity,
  PublicScopedBrandGate,
} from "../../club-experience";
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
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { buildPublicJugadorByRivieraIdPath } from "../jugadores/jugadoresPublicNav";
import { fechaCorta, horarioFlex, movementLabel, useFlexPublicTitle } from "./flex-public/flexPublicUi";
import "./liga-public-pantalla.css";
import "../jugadores/riviera-jugadores.css";
import "./flex-public/flex-public-liga.css";

type PublicProfile = { fotoUrl: string | null; rivieraId?: string | null };

export const LigaFlexPublica: React.FC<{ detalle: LigaDetalle }> = ({ detalle }) => (
  <ClubExperienceScope organizadorId={detalle.organizador_id} pendingUntilOrganizador>
    <LigaFlexPublicaBody detalle={detalle} />
  </ClubExperienceScope>
);

const LigaFlexPublicaBody: React.FC<{ detalle: LigaDetalle }> = ({ detalle }) => {
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

  useEffect(() => {
    if (!playerId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlayerId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playerId]);

  const sortedJornadas = useMemo(
    () => detalle.jornadas.slice().sort((a, b) => a.numero - b.numero),
    [detalle.jornadas]
  );
  const completed = sortedJornadas.filter((jornada) => jornada.estado === "completed");
  const activeJornada = sortedJornadas.find((jornada) => jornada.estado === "in_progress");
  const next = sortedJornadas.find((jornada) => jornada.estado !== "completed");
  const focusJornada = activeJornada ?? next ?? completed[completed.length - 1] ?? null;
  const focusFlex = bundle?.jornadas.find((row) => row.jornadaId === focusJornada?.id);

  const awards = useMemo(() => officialAwards(detalle, bundle), [detalle, bundle]);
  const season = rankFlexSeason({ awards, resolution: honorResolution(bundle?.honores) });
  const movement = flexPublicMovement(awards, completed.map((jornada) => jornada.numero));
  const leader = season.ok ? season.rows[0] : undefined;

  // El detalle del jugador solo se abre bajo demanda cuando el usuario selecciona a alguien.
  const selected =
    season.ok && playerId
      ? season.rows.find((row) => row.jugadorId === playerId) ?? null
      : null;
  const series = selected
    ? flexPointsSeries(awards, selected.jugadorId, completed.map((j) => j.numero))
    : [];

  const estado =
    detalle.estado === "completed"
      ? "Finalizada"
      : detalle.estado === "in_progress" || activeJornada != null || completed.length > 0
        ? "En curso"
        : "Próxima";
  const statusTone =
    estado === "Finalizada" ? "done" : estado === "En curso" ? "live" : "upcoming";

  const players = new Set<string>([
    ...detalle.inscripciones.map((row) => row.jugador_id),
    ...Object.values(bundle?.participantes ?? {}).flat(),
  ]);

  const totalJornadas = sortedJornadas.length || bundle?.config.jornadasPlaneadas || 12;
  const currentJornadaSummary = activeJornada
    ? `J${String(activeJornada.numero).padStart(2, "0")} · En curso`
    : next
      ? `J${String(next.numero).padStart(2, "0")} · Próxima`
      : completed.length > 0
        ? `J${String(completed[completed.length - 1]!.numero).padStart(2, "0")} · Final`
        : "Por definir";

  const leaderName = leader ? names.get(leader.jugadorId) ?? "Jugador" : "Por definir";
  const categoriaLabel = bundle?.config.categoria || null;

  return (
    <PublicScopedBrandGate message="Cargando liga…">
      <div className="flex-pub-liga liga-pantalla App--public-full-width ro-public-view ro-surface-dark">
        <PublicModeShell className="liga-pantalla__inner flex-liga-shell">
          {/* 1) HERO / CABECERA SUPERIOR */}
          <header className="flex-liga-hero" aria-label="Cabecera de la liga">
            <div className="flex-liga-hero__topbar">
              <div className="flex-liga-hero__brand-wrap">
                <PublicEventBrandIdentity className="flex-liga-hero__brand" />
              </div>

              <span className={`flex-liga-status-badge flex-liga-status-badge--${statusTone}`}>
                <span className="flex-liga-status-badge__dot" aria-hidden />
                <span>{estado}</span>
              </span>
            </div>

            <div className="flex-liga-hero__main">
              <p className="flex-liga-hero__eyebrow">
                Riviera Flex League{categoriaLabel ? ` · ${categoriaLabel}` : ""}
              </p>
              <h1 className="flex-liga-hero__title">{detalle.nombre}</h1>
            </div>

            <div className="flex-liga-hero__footer">
              <div className="flex-liga-hero__schedule">
                {focusJornada ? (
                  <>
                    <span className="flex-liga-hero__schedule-tag">
                      {activeJornada
                        ? `Jornada ${String(focusJornada.numero).padStart(2, "0")} en juego`
                        : next
                          ? `Próxima · Jornada ${String(focusJornada.numero).padStart(2, "0")}`
                          : `Última · Jornada ${String(focusJornada.numero).padStart(2, "0")}`}
                    </span>
                    <span>
                      {fechaCorta(focusJornada.fecha)} ·{" "}
                      {horarioFlex(focusFlex?.horaInicio, focusFlex?.horaFin)}
                    </span>
                  </>
                ) : (
                  <span>Temporada oficial · Riviera Open</span>
                )}
              </div>

              {focusJornada ? (
                <a
                  className="flex-liga-hero__cta"
                  href={publicLigaJornadaUrl(detalle.id, focusJornada.numero)}
                >
                  <span>
                    Ver jornada {String(focusJornada.numero).padStart(2, "0")}
                  </span>
                  <span aria-hidden>→</span>
                </a>
              ) : null}
            </div>
          </header>

          {/* 2) BLOQUE DE RESUMEN RÁPIDO */}
          <section className="flex-liga-summary" aria-label="Resumen rápido de temporada">
            <article className="flex-liga-summary__item">
              <span className="flex-liga-summary__label">Total jornadas</span>
              <strong className="flex-liga-summary__value">{totalJornadas}</strong>
              <span className="flex-liga-summary__sub">
                {completed.length} completadas
              </span>
            </article>

            <article className="flex-liga-summary__item">
              <span className="flex-liga-summary__label">Jornada actual</span>
              <strong className="flex-liga-summary__value">{currentJornadaSummary}</strong>
              <span className="flex-liga-summary__sub">
                {focusJornada ? fechaCorta(focusJornada.fecha) : "Calendario"}
              </span>
            </article>

            <article className="flex-liga-summary__item">
              <span className="flex-liga-summary__label">Jugadores activos</span>
              <strong className="flex-liga-summary__value">{players.size}</strong>
              <span className="flex-liga-summary__sub">Ranking individual</span>
            </article>

            <article className="flex-liga-summary__item flex-liga-summary__item--highlight">
              <span className="flex-liga-summary__label">Líder actual</span>
              <strong className="flex-liga-summary__value">{leaderName}</strong>
              <span className="flex-liga-summary__sub">
                {leader ? `Posición #1` : "Sin jornadas cerradas"}
              </span>
            </article>

            <article className="flex-liga-summary__item flex-liga-summary__item--highlight">
              <span className="flex-liga-summary__label">Puntos del líder</span>
              <strong className="flex-liga-summary__value">
                {leader ? `${leader.puntos} PTS` : "—"}
              </strong>
              <span className="flex-liga-summary__sub">
                {leader
                  ? `${leader.jornadasJugadas} ${
                      leader.jornadasJugadas === 1 ? "jornada" : "jornadas"
                    }`
                  : "En espera"}
              </span>
            </article>

            <article className="flex-liga-summary__item">
              <span className="flex-liga-summary__label">Estado temporada</span>
              <strong className="flex-liga-summary__value">{estado}</strong>
              <span className="flex-liga-summary__sub">
                {completed.length}/{totalJornadas} fechas
              </span>
            </article>
          </section>

          {error ? <p className="flex-liga-empty">{error}</p> : null}

          {/* 3) CLASIFICACIÓN GENERAL — TOP 3 + RESTO DEL RANKING */}
          <section className="flex-liga-standings" aria-label="Clasificación general">
            <header className="flex-liga-section-head">
              <div className="flex-liga-section-head__titles">
                <p className="flex-liga-section-head__kicker">Ranking oficial</p>
                <h2 className="flex-liga-section-head__title">Clasificación general</h2>
              </div>
              <p className="flex-liga-section-head__hint">
                Toca un jugador para consultar su detalle por jornada
              </p>
            </header>

            {season.ok && season.rows.length > 0 ? (
              <>
                {/* A. Top 3 Destacado */}
                <div className="flex-liga-top3" role="list" aria-label="Top 3 de la temporada">
                  {season.rows.slice(0, 3).map((row) => {
                    const name = names.get(row.jugadorId) ?? "Jugador";
                    const profile = profiles[row.jugadorId];
                    const isSelected = playerId === row.jugadorId;
                    const move = movementLabel(movement.get(row.jugadorId) ?? null);
                    const jornadasLabel = `${row.jornadasJugadas} ${
                      row.jornadasJugadas === 1 ? "jornada" : "jornadas"
                    }${move !== "—" ? ` · ${move}` : ""}`;

                    if (row.posicion === 1) {
                      return (
                        <article
                          key={row.jugadorId}
                          role="listitem"
                          className={`flex-liga-top3__card flex-liga-top3__card--1${
                            isSelected ? " is-selected" : ""
                          }`}
                        >
                          <button
                            type="button"
                            className="flex-liga-top3__hit"
                            onClick={() => setPlayerId(row.jugadorId)}
                          >
                            <div className="flex-liga-top3__leader-left">
                              <div className="flex-liga-top3__avatar-wrap">
                                <JugadorAvatar
                                  fotoUrl={profile?.fotoUrl}
                                  nombre={name}
                                  size="lg"
                                  className="flex-liga-top3__avatar"
                                  alt=""
                                />
                                <span className="flex-liga-top3__pos-badge" aria-hidden>
                                  1
                                </span>
                              </div>
                              <div className="flex-liga-top3__identity">
                                <span className="flex-liga-top3__role-tag">1.º Lugar · Líder</span>
                                <p className="flex-liga-top3__name">{name}</p>
                                <p className="flex-liga-top3__riviera-id">
                                  {profile?.rivieraId ?? "Riviera Open"}
                                </p>
                              </div>
                            </div>

                            <div className="flex-liga-top3__metrics">
                              <p className="flex-liga-top3__pts">
                                <span className="flex-liga-top3__pts-value">{row.puntos}</span>
                                <span className="flex-liga-top3__pts-unit">PTS</span>
                              </p>
                              <p className="flex-liga-top3__jornadas">{jornadasLabel}</p>
                            </div>
                          </button>
                        </article>
                      );
                    }

                    return (
                      <article
                        key={row.jugadorId}
                        role="listitem"
                        className={`flex-liga-top3__card flex-liga-top3__card--${row.posicion}${
                          isSelected ? " is-selected" : ""
                        }`}
                      >
                        <button
                          type="button"
                          className="flex-liga-top3__hit"
                          onClick={() => setPlayerId(row.jugadorId)}
                        >
                          <div className="flex-liga-top3__compact-top">
                            <div className="flex-liga-top3__avatar-wrap">
                              <JugadorAvatar
                                fotoUrl={profile?.fotoUrl}
                                nombre={name}
                                size="md"
                                className="flex-liga-top3__avatar"
                                alt=""
                              />
                              <span className="flex-liga-top3__pos-badge" aria-hidden>
                                {row.posicion}
                              </span>
                            </div>

                            <div className="flex-liga-top3__metrics">
                              <p className="flex-liga-top3__pts">
                                <span className="flex-liga-top3__pts-value">{row.puntos}</span>
                                <span className="flex-liga-top3__pts-unit">PTS</span>
                              </p>
                              <p className="flex-liga-top3__jornadas">{jornadasLabel}</p>
                            </div>
                          </div>

                          <div className="flex-liga-top3__compact-bottom">
                            <div className="flex-liga-top3__identity">
                              <p className="flex-liga-top3__name">{name}</p>
                              <p className="flex-liga-top3__riviera-id">
                                {profile?.rivieraId ?? "Riviera Open"}
                              </p>
                            </div>
                          </div>
                        </button>
                      </article>
                    );
                  })}
                </div>

                {/* B. Resto de la clasificación (posiciones 4+) */}
                {season.rows.length > 3 ? (
                  <div className="flex-liga-table">
                    <div className="flex-liga-table__head" aria-hidden>
                      <span>Pos</span>
                      <span />
                      <span>Jugador</span>
                      <span>Jornadas</span>
                      <span className="flex-liga-table__head-right">Puntos</span>
                      <span className="flex-liga-table__head-chevron" />
                    </div>
                    <ol className="flex-liga-table__list">
                      {season.rows.slice(3).map((row) => {
                        const name = names.get(row.jugadorId) ?? "Jugador";
                        const profile = profiles[row.jugadorId];
                        const isSelected = playerId === row.jugadorId;
                        const move = movementLabel(movement.get(row.jugadorId) ?? null);
                        return (
                          <li key={row.jugadorId} className="flex-liga-table__item">
                            <button
                              type="button"
                              className={`flex-liga-row${isSelected ? " is-selected" : ""}`}
                              onClick={() => setPlayerId(row.jugadorId)}
                            >
                              <span className="flex-liga-row__pos">{row.posicion}</span>
                              <JugadorAvatar
                                fotoUrl={profile?.fotoUrl}
                                nombre={name}
                                size="sm"
                                className="flex-liga-row__avatar"
                                alt=""
                              />
                              <span className="flex-liga-row__identity">
                                <span className="flex-liga-row__name">{name}</span>
                                {profile?.rivieraId ? (
                                  <span className="flex-liga-row__riviera-id">
                                    {profile.rivieraId}
                                  </span>
                                ) : null}
                              </span>
                              <span className="flex-liga-row__jj">
                                {row.jornadasJugadas} J{move !== "—" ? ` · ${move}` : ""}
                              </span>
                              <span className="flex-liga-row__pts">
                                <strong>{row.puntos}</strong>
                                <small>PTS</small>
                              </span>
                              <span className="flex-liga-row__chevron" aria-hidden>
                                ›
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="flex-liga-empty">
                {season.ok
                  ? "Todavía no hay jornadas cerradas con puntos oficiales."
                  : "La clasificación oficial está en espera de un desempate registrado."}
              </p>
            )}
          </section>

          {/* 6) CALENDARIO DE TEMPORADA */}
          <section className="flex-liga-calendar" aria-label="Calendario de temporada">
            <header className="flex-liga-section-head">
              <div className="flex-liga-section-head__titles">
                <p className="flex-liga-section-head__kicker">Temporada</p>
                <h2 className="flex-liga-section-head__title">Calendario de temporada</h2>
              </div>
              <p className="flex-liga-section-head__hint">
                {completed.length} de {totalJornadas} finalizadas
              </p>
            </header>

            <div className="flex-liga-calendar__grid">
              {sortedJornadas.map((jornada) => {
                const flex = bundle?.jornadas.find((row) => row.jornadaId === jornada.id);
                const status = flexPublicJornadaEstado({
                  estado: jornada.estado,
                  fecha: jornada.fecha,
                  confirmada: flex?.programacionEstado === "confirmada",
                });
                const isNext = next?.id === jornada.id && status.key !== "en_curso";
                const cardVariant =
                  status.key === "finalizada"
                    ? "done"
                    : status.key === "en_curso"
                      ? "live"
                      : isNext || status.key === "programada"
                        ? "next"
                        : "pending";
                const statusLabel =
                  status.key === "finalizada"
                    ? "Finalizada"
                    : status.key === "en_curso"
                      ? "En curso"
                      : isNext
                        ? "Próxima"
                        : status.key === "programada"
                          ? "Próxima"
                          : "Por programar";

                return (
                  <a
                    key={jornada.id}
                    className={`flex-liga-cal-card flex-liga-cal-card--${cardVariant}`}
                    href={publicLigaJornadaUrl(detalle.id, jornada.numero)}
                  >
                    <div className="flex-liga-cal-card__top">
                      <span className="flex-liga-cal-card__num">
                        J{String(jornada.numero).padStart(2, "0")}
                      </span>
                      <span className="flex-liga-cal-card__dot" aria-hidden />
                    </div>
                    <span className="flex-liga-cal-card__status">{statusLabel}</span>
                    {jornada.fecha ? (
                      <span className="flex-liga-cal-card__date">
                        {fechaCorta(jornada.fecha)}
                      </span>
                    ) : null}
                  </a>
                );
              })}
            </div>
          </section>

          {/* 4 & 5) DETALLE DE JUGADOR BAJO DEMANDA (MODAL / DRAWER CONTEXTUAL) */}
          {selected ? (
            <div
              className="flex-liga-drawer-backdrop"
              role="dialog"
              aria-modal="true"
              aria-label={`Detalle de ${names.get(selected.jugadorId) ?? "Jugador"}`}
              onClick={() => setPlayerId(null)}
            >
              <div
                className="flex-liga-drawer"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="flex-liga-drawer__head">
                  <div className="flex-liga-drawer__player">
                    <JugadorAvatar
                      fotoUrl={profiles[selected.jugadorId]?.fotoUrl}
                      nombre={names.get(selected.jugadorId) ?? "Jugador"}
                      size="lg"
                      className="flex-liga-drawer__avatar"
                      alt=""
                    />
                    <div className="flex-liga-drawer__identity">
                      <p className="flex-liga-drawer__kicker">Ficha de temporada</p>
                      <h3 className="flex-liga-drawer__name">
                        {names.get(selected.jugadorId) ?? "Jugador"}
                      </h3>
                      {profiles[selected.jugadorId]?.rivieraId ? (
                        <p className="flex-liga-drawer__riviera-id">
                          {profiles[selected.jugadorId]!.rivieraId}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="flex-liga-drawer__close"
                    aria-label="Cerrar detalle del jugador"
                    onClick={() => setPlayerId(null)}
                  >
                    ✕
                  </button>
                </header>

                <div className="flex-liga-drawer__kpis">
                  <div className="flex-liga-drawer__kpi flex-liga-drawer__kpi--accent">
                    <span className="flex-liga-drawer__kpi-label">Posición actual</span>
                    <strong className="flex-liga-drawer__kpi-val">
                      #{selected.posicion}
                    </strong>
                  </div>
                  <div className="flex-liga-drawer__kpi flex-liga-drawer__kpi--accent">
                    <span className="flex-liga-drawer__kpi-label">Puntos</span>
                    <strong className="flex-liga-drawer__kpi-val">
                      {selected.puntos} PTS
                    </strong>
                  </div>
                  <div className="flex-liga-drawer__kpi">
                    <span className="flex-liga-drawer__kpi-label">Jornadas</span>
                    <strong className="flex-liga-drawer__kpi-val">
                      {selected.jornadasJugadas}
                    </strong>
                  </div>
                </div>

                <div className="flex-liga-drawer__history">
                  <h4 className="flex-liga-drawer__history-title">
                    Detalle por jornada
                  </h4>
                  {series.length === 0 ? (
                    <p className="flex-liga-empty">
                      Este jugador todavía no tiene jornadas cerradas.
                    </p>
                  ) : (
                    <ol className="flex-liga-drawer__history-list">
                      {selected.historial.map((row) => (
                        <li
                          key={`${selected.jugadorId}-${row.jornadaNumero}`}
                          className="flex-liga-drawer__history-row"
                        >
                          <span className="flex-liga-drawer__history-jornada">
                            J{String(row.jornadaNumero).padStart(2, "0")}
                          </span>
                          <span className="flex-liga-drawer__history-pos">
                            Posición #{row.posicion}
                          </span>
                          <span className="flex-liga-drawer__history-pts">
                            {row.puntos}
                            <small>PTS</small>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <footer className="flex-liga-drawer__footer">
                  <button
                    type="button"
                    className="flex-liga-drawer__btn-secondary"
                    onClick={() => setPlayerId(null)}
                  >
                    Cerrar
                  </button>
                  {profiles[selected.jugadorId]?.rivieraId ? (
                    <a
                      className="flex-liga-drawer__btn-primary"
                      href={buildPublicJugadorByRivieraIdPath(
                        profiles[selected.jugadorId]!.rivieraId!
                      )}
                    >
                      <span>Ver perfil</span>
                      <span aria-hidden>→</span>
                    </a>
                  ) : null}
                </footer>
              </div>
            </div>
          ) : null}
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
