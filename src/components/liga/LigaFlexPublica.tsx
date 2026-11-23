import React, { useEffect, useMemo, useState } from "react";
import {
  ClubExperienceScope,
  PublicEventBrandIdentity,
  useOrganizerDisplayName,
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
import { buildPublicJugadorByRivieraIdPath } from "../jugadores/jugadoresPublicNav";
import { loadFlexLeague, type FlexBundle } from "../../services/ligaFlexService";
import { publicLigaJornadaUrl } from "../../services/ligaService";
import {
  fechaCorta,
  FlexFace,
  FlexPointsChart,
  horarioFlex,
  movementLabel,
  useFlexPublicFonts,
  useFlexPublicTitle,
} from "./flex-public/flexPublicUi";
import "./flex-public/flex-public.css";

export const LigaFlexPublica: React.FC<{ detalle: LigaDetalle }> = ({ detalle }) => (
  <ClubExperienceScope organizadorId={detalle.organizador_id}>
    <LigaFlexPublicaBody detalle={detalle} />
  </ClubExperienceScope>
);

const LigaFlexPublicaBody: React.FC<{ detalle: LigaDetalle }> = ({ detalle }) => {
  const club = useOrganizerDisplayName(detalle.organizador_id);
  const [bundle, setBundle] = useState<FlexBundle | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<
    Record<string, { fotoUrl: string | null; rivieraId?: string | null }>
  >({});
  useFlexPublicFonts();
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
  const completedNumeros = completed.map((jornada) => jornada.numero);
  const awards = useMemo(() => officialAwards(detalle, bundle), [detalle, bundle]);
  const season = rankFlexSeason({ awards, resolution: honorResolution(bundle?.honores) });
  const movement = flexPublicMovement(awards, completedNumeros);
  const next = detalle.jornadas
    .filter((jornada) => jornada.estado !== "completed")
    .sort((a, b) => a.numero - b.numero)[0];
  const nextFlex = bundle?.jornadas.find((row) => row.jornadaId === next?.id);
  const leader = season.ok ? season.rows[0] : undefined;
  const selected = season.ok
    ? season.rows.find((row) => row.jugadorId === playerId) ?? null
    : null;
  const series = selected
    ? flexPointsSeries(awards, selected.jugadorId, completedNumeros)
    : [];
  const inicio = detalle.jornadas
    .map((jornada) => jornada.fecha)
    .filter((fecha): fecha is string => Boolean(fecha))
    .sort()[0];
  const estado =
    detalle.estado === "completed"
      ? "Finalizada"
      : detalle.estado === "in_progress"
        ? "En curso"
        : "Por comenzar";
  const players = new Set<string>([
    ...detalle.inscripciones.map((row) => row.jugador_id),
    ...Object.values(bundle?.participantes ?? {}).flat(),
  ]);

  return (
    <main className="flex-pub">
      <PublicEventBrandIdentity />
      <div className="flex-pub__inner">
        <header className="flex-pub__hero">
          <p className="flex-pub__kicker">{club || "Club"} · by Riviera Open</p>
          <h1>{detalle.nombre}</h1>
          <p className="flex-pub__meta">
            Riviera Flex League · {bundle?.config.categoria || "Categoría por definir"} · {estado}
          </p>
          <p className="flex-pub__lead">
            {detalle.jornadas.length} jornadas
            {inicio ? ` · Inicia ${fechaCorta(inicio)}` : ""}
            {next
              ? ` · Próxima: Jornada ${String(next.numero).padStart(2, "0")} · ${fechaCorta(next.fecha)} · ${horarioFlex(nextFlex?.horaInicio, nextFlex?.horaFin)}`
              : ""}
          </p>
        </header>

        {error ? <p className="flex-pub__empty">{error}</p> : null}

        <section className="flex-pub__kpis" aria-label="Temporada">
          <article className="flex-pub__kpi">
            <span>Jornadas</span>
            <strong>
              {completed.length} / {detalle.jornadas.length || 12}
            </strong>
          </article>
          <article className="flex-pub__kpi">
            <span>Jugadores</span>
            <strong>{players.size}</strong>
          </article>
          <article className="flex-pub__kpi">
            <span>Próxima jornada</span>
            <strong>{next ? `Jornada ${String(next.numero).padStart(2, "0")}` : "Temporada cerrada"}</strong>
          </article>
          <article className="flex-pub__kpi">
            <span>Líder</span>
            <strong>{leader ? names.get(leader.jugadorId) ?? "Jugador" : "Sin resultados"}</strong>
          </article>
        </section>

        <section className="flex-pub__section" aria-label="Clasificación general">
          <h2>Clasificación</h2>
          {season.ok && season.rows.length > 0 ? (
            <table className="flex-pub__table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Jugador</th>
                  <th className="flex-pub__col-secondary">J</th>
                  <th>PTS</th>
                  <th className="flex-pub__col-secondary">Evolución</th>
                </tr>
              </thead>
              <tbody>
                {season.rows.map((row) => {
                  const profile = profiles[row.jugadorId];
                  const name = names.get(row.jugadorId) ?? "Jugador";
                  const delta = movement.get(row.jugadorId) ?? null;
                  return (
                    <tr
                      key={row.jugadorId}
                      className={row.posicion <= 3 ? `flex-pub__row--${row.posicion}` : undefined}
                    >
                      <td>{row.posicion}</td>
                      <td>
                        <button
                          type="button"
                          className="flex-pub__select flex-pub__player"
                          onClick={() => setPlayerId(row.jugadorId)}
                        >
                          <FlexFace name={name} foto={profile?.fotoUrl ?? null} />
                          <span className="flex-pub__who">
                            <strong>{name}</strong>
                            <span>{profile?.rivieraId || "Sin Riviera ID"}</span>
                            <span className="flex-pub__mobile-meta">
                              {row.jornadasJugadas} J · {movementLabel(delta)}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="flex-pub__col-secondary">{row.jornadasJugadas}</td>
                      <td>{row.puntos}</td>
                      <td className="flex-pub__col-secondary">{movementLabel(delta)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="flex-pub__empty">
              {season.ok
                ? "Todavía no hay jornadas cerradas con puntos oficiales."
                : "La clasificación oficial está en espera de un desempate registrado."}
            </p>
          )}
          <p className="flex-pub__note">Cada jornada cuenta. Cada punto construye tu historia.</p>
        </section>

        <section className="flex-pub__section" aria-label="Evolución">
          <h2>{selected ? names.get(selected.jugadorId) ?? "Jugador" : "Evolución"}</h2>
          {selected ? (
            <div className="flex-pub__panel">
              <p className="flex-pub__lead">
                Posición {selected.posicion} · {selected.puntos} puntos · {selected.jornadasJugadas}{" "}
                jornadas
              </p>
              {profiles[selected.jugadorId]?.rivieraId ? (
                <p>
                  <a href={buildPublicJugadorByRivieraIdPath(profiles[selected.jugadorId]!.rivieraId!)}>
                    Ver perfil Riviera
                  </a>
                </p>
              ) : null}
              {series.length > 0 ? (
                <FlexPointsChart points={series} />
              ) : (
                <p className="flex-pub__empty">Este jugador todavía no tiene jornadas cerradas.</p>
              )}
              <table className="flex-pub__table">
                <thead>
                  <tr>
                    <th>Jornada</th>
                    <th>Posición</th>
                    <th>Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.historial.map((row) => (
                    <tr key={`${selected.jugadorId}-${row.jornadaNumero}`}>
                      <td>J{String(row.jornadaNumero).padStart(2, "0")}</td>
                      <td>{row.posicion}</td>
                      <td>{row.puntos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="flex-pub__empty">
              Elige un jugador de la clasificación para ver su progreso.
            </p>
          )}
        </section>

        <section className="flex-pub__section" aria-label="Calendario de temporada">
          <h2>Calendario de temporada</h2>
          <div className="flex-pub__calendar">
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
                const convocados = bundle?.participantes[jornada.id]?.length ?? 0;
                return (
                  <a
                    key={jornada.id}
                    className="flex-pub__jornada"
                    href={publicLigaJornadaUrl(detalle.id, jornada.numero)}
                  >
                    <strong>Jornada {String(jornada.numero).padStart(2, "0")}</strong>
                    <span>{fechaCorta(jornada.fecha)}</span>
                    <span>{horarioFlex(flex?.horaInicio, flex?.horaFin)}</span>
                    <span>{status.label}</span>
                    {convocados > 0 ? <span>{convocados} convocados</span> : null}
                  </a>
                );
              })}
          </div>
        </section>
      </div>
    </main>
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
