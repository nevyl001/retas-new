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
} from "../../lib/liga/flex/publicView";
import { LIGA_PUBLIC_POLL_INTERVAL_MS } from "../../lib/liga/publicPoll";
import { resolveLigaJugadorPublicProfiles } from "../../lib/liga/publicParejaAvatars";
import type { LigaDetalle } from "../../lib/liga/types";
import { loadFlexLeague, type FlexBundle } from "../../services/ligaFlexService";
import { publicLigaJornadaUrl } from "../../services/ligaService";
import { PublicModeShell } from "../platform/PublicModeShell";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { buildPublicJugadorByRivieraIdPath } from "../jugadores/jugadoresPublicNav";
import { fechaCorta, useFlexPublicTitle } from "./flex-public/flexPublicUi";
import "./liga-public-pantalla.css";
import "../jugadores/riviera-jugadores.css";
import "./flex-public/flex-public-liga.css";

type PublicProfile = { fotoUrl: string | null; rivieraId?: string | null };

function formatJornadaSchedule(
  fecha: string | null | undefined,
  horaInicio?: string | null,
  horaFin?: string | null
): string {
  if (!fecha) return "Fecha por confirmar";
  const dateLabel = fechaCorta(fecha);
  if (dateLabel === "Por programar") return "Fecha por confirmar";
  const hours = [horaInicio, horaFin].filter(Boolean).join(" – ");
  return hours ? `${dateLabel} · ${hours}` : dateLabel;
}

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
  const nextJornada = sortedJornadas.find((jornada) => jornada.estado !== "completed");

  const totalJornadas = sortedJornadas.length || bundle?.config.jornadasPlaneadas || 12;
  const isSeasonFinished =
    detalle.estado === "completed" ||
    (sortedJornadas.length > 0 && completed.length === sortedJornadas.length);

  // Prioridad: 1) Jornada en curso, 2) Próxima jornada (si la temporada sigue abierta), 3) Última jornada finalizada
  const focusJornada = isSeasonFinished
    ? completed[completed.length - 1] ?? null
    : activeJornada ?? nextJornada ?? completed[completed.length - 1] ?? null;
  const focusFlex = bundle?.jornadas.find((row) => row.jornadaId === focusJornada?.id);

  const awards = useMemo(() => officialAwards(detalle, bundle), [detalle, bundle]);
  const season = rankFlexSeason({ awards, resolution: honorResolution(bundle?.honores) });

  const selected =
    season.ok && playerId
      ? season.rows.find((row) => row.jugadorId === playerId) ?? null
      : null;
  const series = selected
    ? flexPointsSeries(awards, selected.jugadorId, completed.map((j) => j.numero))
    : [];

  const estado = isSeasonFinished
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

  const categoriaLabel =
    (bundle?.config.categoria || (detalle as { categoria?: string | null }).categoria || "").trim() ||
    null;

  const focusJornadaStateLabel = isSeasonFinished
    ? "Finalizada"
    : activeJornada
      ? "En curso"
      : "Próxima";
  const focusJornadaTone = isSeasonFinished
    ? "done"
    : activeJornada
      ? "live"
      : "next";

  const top3Rows = season.ok ? season.rows.slice(0, 3) : [];
  const tableRows = season.ok ? season.rows.slice(3) : [];
  const officialChampionId = isSeasonFinished
    ? bundle?.honores?.campeonId ?? null
    : null;

  return (
    <PublicScopedBrandGate message="Cargando liga…">
      <div className="flex-pub-liga liga-pantalla App--public-full-width ro-public-view ro-surface-dark">
        <PublicModeShell className="liga-pantalla__inner flex-liga-shell">
          {/* 1) ENCABEZADO SIMPLIFICADO DE LA LIGA */}
          <header className="flex-liga-hero" aria-label="Encabezado de la liga">
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
              <h1 className="flex-liga-hero__title">{detalle.nombre}</h1>
              {categoriaLabel ? (
                <p className="flex-liga-hero__category">{categoriaLabel}</p>
              ) : null}
              <p className="flex-liga-hero__meta">
                <span>
                  {players.size} {players.size === 1 ? "jugador" : "jugadores"}
                </span>
                <span className="flex-liga-hero__meta-sep" aria-hidden>
                  ·
                </span>
                <span>
                  {completed.length} de {totalJornadas} jornadas completadas
                </span>
              </p>
            </div>
          </header>

          {/* 2) JORNADA ACTUAL O PRÓXIMA (COMPONENTE COMPACTO ÚNICO) */}
          {focusJornada ? (
            <section
              className={`flex-liga-matchday flex-liga-matchday--${focusJornadaTone}`}
              aria-label="Jornada actual o próxima"
            >
              <div className="flex-liga-matchday__info">
                <span className={`flex-liga-matchday__badge flex-liga-matchday__badge--${focusJornadaTone}`}>
                  {focusJornadaStateLabel}
                </span>
                <strong className="flex-liga-matchday__title">
                  Jornada {String(focusJornada.numero).padStart(2, "0")}
                </strong>
                <span className="flex-liga-matchday__sep" aria-hidden>
                  ·
                </span>
                <span className="flex-liga-matchday__schedule">
                  {isSeasonFinished && !focusJornada.fecha
                    ? "Temporada concluida"
                    : formatJornadaSchedule(
                        focusJornada.fecha,
                        focusFlex?.horaInicio,
                        focusFlex?.horaFin
                      )}
                </span>
              </div>

              <a
                className="flex-liga-matchday__cta"
                href={publicLigaJornadaUrl(detalle.id, focusJornada.numero)}
              >
                <span>Ver jornada</span>
                <span aria-hidden>→</span>
              </a>
            </section>
          ) : null}

          {error ? <p className="flex-liga-empty">{error}</p> : null}

          {/* 3) CLASIFICACIÓN GENERAL CON PODIO TOP 3 */}
          <section className="flex-liga-standings" aria-label="Clasificación general">
            <header className="flex-liga-section-head">
              <div className="flex-liga-section-head__titles">
                <p className="flex-liga-section-head__kicker">Ranking oficial</p>
                <h2 className="flex-liga-section-head__title">Líderes de la temporada</h2>
              </div>
              {season.ok && season.rows.length > 0 ? (
                <span className="flex-liga-section-head__meta">
                  {season.rows.length} clasificados
                </span>
              ) : null}
            </header>

            {season.ok && season.rows.length > 0 ? (
              <div
                className={`flex-liga-standings__layout${
                  tableRows.length === 0 ? " flex-liga-standings__layout--only-top3" : ""
                }`}
              >
                {/* A. Podio Top 3 (Orden visual 2º — 1º — 3º en escritorio y móvil) */}
                <div className="flex-liga-top3-wrap">
                  <div className="flex-liga-top3" role="list" aria-label="Podio Top 3">
                    {top3Rows.map((row) => {
                      const name = names.get(row.jugadorId) ?? "Jugador";
                      const profile = profiles[row.jugadorId];
                      const isSelected = playerId === row.jugadorId;
                      const role =
                        row.posicion !== 1
                          ? null
                          : officialChampionId === row.jugadorId
                            ? "Campeón"
                            : !isSeasonFinished
                              ? "Líder actual"
                              : null;

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
                            aria-label={`${name}, ${row.posicion}º lugar, ${row.puntos} puntos. Ver detalle`}
                            onClick={() => setPlayerId(row.jugadorId)}
                          >
                            <div className="flex-liga-top3__portrait">
                              <JugadorAvatar
                                fotoUrl={profile?.fotoUrl}
                                nombre={name}
                                size="xl"
                                className="flex-liga-top3__avatar"
                                alt=""
                              />
                              <span className="flex-liga-top3__pos" aria-hidden>
                                {row.posicion}
                              </span>
                              <div className="flex-liga-top3__overlay">
                                {role ? (
                                  <p className="flex-liga-top3__role">{role}</p>
                                ) : null}
                                <p className="flex-liga-top3__name">{name}</p>
                                <p className="flex-liga-top3__pts">
                                  <span className="flex-liga-top3__pts-value">{row.puntos}</span>
                                  <span className="flex-liga-top3__pts-unit">PTS</span>
                                </p>
                                {profile?.rivieraId ? (
                                  <p className="flex-liga-top3__id">{profile.rivieraId}</p>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                  <div className="flex-liga-podium-note">
                    <div className="flex-liga-podium-note__rule" aria-hidden />
                    {isSeasonFinished ? (
                      <>
                        <p className="flex-liga-podium-note__title">
                          Una temporada. Una historia.
                        </p>
                        <p className="flex-liga-podium-note__body">
                          Gracias por competir, demostrar tu nivel y formar parte de esta experiencia.
                        </p>
                        <p className="flex-liga-podium-note__line">
                          Nos vemos en la próxima temporada.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="flex-liga-podium-note__title">
                          La historia aún se escribe.
                        </p>
                        <p className="flex-liga-podium-note__body">
                          Todavía tienes la oportunidad de dar lo mejor de ti. Cada jornada cuenta y tu constancia puede hacer la diferencia.
                        </p>
                        <p className="flex-liga-podium-note__line">
                          Sigue compitiendo. Crea tu historia.
                        </p>
                      </>
                    )}
                    <p className="flex-liga-podium-note__sign">Vive Riviera Open</p>
                  </div>
                </div>

                {/* B. Tabla compacta de clasificación (Posiciones 4+) */}
                {tableRows.length > 0 ? (
                  <div className="flex-liga-table" aria-label="Posiciones 4 en adelante">
                    <div className="flex-liga-table__head" aria-hidden>
                      <span className="flex-liga-table__col-pos">Pos</span>
                      <span className="flex-liga-table__col-player">Jugador</span>
                      <span className="flex-liga-table__col-jj">
                        <span className="flex-liga-table__jj-full">Jornadas</span>
                        <span className="flex-liga-table__jj-abbr">JJ</span>
                      </span>
                      <span className="flex-liga-table__col-pts">Puntos</span>
                    </div>
                    <ol className="flex-liga-table__list" start={4}>
                      {tableRows.map((row) => {
                        const name = names.get(row.jugadorId) ?? "Jugador";
                        const profile = profiles[row.jugadorId];
                        const isSelected = playerId === row.jugadorId;
                        return (
                          <li key={row.jugadorId} className="flex-liga-table__item">
                            <button
                              type="button"
                              className={`flex-liga-row${isSelected ? " is-selected" : ""}`}
                              onClick={() => setPlayerId(row.jugadorId)}
                            >
                              <span className="flex-liga-row__pos">{row.posicion}</span>
                              <span className="flex-liga-row__player">
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
                              </span>
                              <span className="flex-liga-row__jj">{row.jornadasJugadas}</span>
                              <span className="flex-liga-row__pts">
                                <strong>{row.puntos}</strong>
                                <small>PTS</small>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="flex-liga-empty">
                {season.ok
                  ? "Todavía no hay jornadas cerradas con puntos oficiales."
                  : "La clasificación oficial está en espera de un desempate registrado."}
              </p>
            )}
          </section>

          {/* 4) CALENDARIO COMPACTO DE TEMPORADA */}
          <section className="flex-liga-calendar" aria-label="Calendario de temporada">
            <header className="flex-liga-section-head">
              <h2 className="flex-liga-section-head__title">Calendario de temporada</h2>
              <div className="flex-liga-calendar__legend" aria-label="Estados de jornada">
                <span className="flex-liga-calendar__legend-item">
                  <span className="flex-liga-cal-dot flex-liga-cal-dot--done" aria-hidden />
                  <span>Finalizada</span>
                </span>
                <span className="flex-liga-calendar__legend-item">
                  <span className="flex-liga-cal-dot flex-liga-cal-dot--live" aria-hidden />
                  <span>En curso</span>
                </span>
                <span className="flex-liga-calendar__legend-item">
                  <span className="flex-liga-cal-dot flex-liga-cal-dot--next" aria-hidden />
                  <span>Próxima</span>
                </span>
                <span className="flex-liga-calendar__legend-item">
                  <span className="flex-liga-cal-dot flex-liga-cal-dot--pending" aria-hidden />
                  <span>Pendiente</span>
                </span>
              </div>
            </header>

            <div className="flex-liga-calendar__grid">
              {sortedJornadas.map((jornada) => {
                const flex = bundle?.jornadas.find((row) => row.jornadaId === jornada.id);
                const status = flexPublicJornadaEstado({
                  estado: jornada.estado,
                  fecha: jornada.fecha,
                  confirmada: flex?.programacionEstado === "confirmada",
                });
                const isNext =
                  !isSeasonFinished &&
                  nextJornada?.id === jornada.id &&
                  status.key !== "en_curso";
                const cardVariant =
                  status.key === "finalizada"
                    ? "done"
                    : status.key === "en_curso"
                      ? "live"
                      : isNext || status.key === "programada"
                        ? "next"
                        : "pending";
                const statusLabel =
                  cardVariant === "done"
                    ? "Finalizada"
                    : cardVariant === "live"
                      ? "En curso"
                      : cardVariant === "next"
                        ? "Próxima"
                        : "Pendiente";

                const hasDate =
                  Boolean(jornada.fecha) && fechaCorta(jornada.fecha) !== "Por programar";
                const hasContent =
                  cardVariant !== "pending" ||
                  hasDate ||
                  (jornada.partidos?.length ?? 0) > 0 ||
                  (bundle?.participantes?.[jornada.id]?.length ?? 0) > 0;

                const codeLabel = `J${String(jornada.numero).padStart(2, "0")}`;
                const cellInner = (
                  <>
                    <div className="flex-liga-cal-cell__top">
                      <span className="flex-liga-cal-cell__num">{codeLabel}</span>
                      <span
                        className={`flex-liga-cal-dot flex-liga-cal-dot--${cardVariant}`}
                        title={statusLabel}
                        aria-hidden
                      />
                    </div>
                    {hasDate ? (
                      <span className="flex-liga-cal-cell__date">
                        {fechaCorta(jornada.fecha)}
                      </span>
                    ) : null}
                  </>
                );

                if (!hasContent) {
                  return (
                    <div
                      key={jornada.id}
                      className={`flex-liga-cal-cell flex-liga-cal-cell--${cardVariant} is-disabled`}
                      aria-label={`${codeLabel} · ${statusLabel}`}
                      title={`${codeLabel} · ${statusLabel}`}
                    >
                      {cellInner}
                    </div>
                  );
                }

                return (
                  <a
                    key={jornada.id}
                    className={`flex-liga-cal-cell flex-liga-cal-cell--${cardVariant}`}
                    href={publicLigaJornadaUrl(detalle.id, jornada.numero)}
                    aria-label={`${codeLabel} · ${statusLabel}${
                      hasDate ? ` · ${fechaCorta(jornada.fecha)}` : ""
                    }`}
                    title={`${codeLabel} · ${statusLabel}`}
                  >
                    {cellInner}
                  </a>
                );
              })}
            </div>
          </section>

          {/* DETALLE DE JUGADOR BAJO DEMANDA (MODAL / DRAWER CONTEXTUAL) */}
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
