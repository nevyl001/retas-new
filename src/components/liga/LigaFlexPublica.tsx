import React, { useEffect, useMemo, useState } from "react";
import { ClubExperienceScope, PublicEventBrandIdentity, useOrganizerDisplayName } from "../../club-experience";
import type { LigaDetalle, LigaJornada } from "../../lib/liga/types";
import { honorResolution, rankFlexSeason, seasonMovement } from "../../lib/liga/flex/season";
import { loadFlexLeague, type FlexBundle } from "../../services/ligaFlexService";
import "./liga-flex.css";

function fechaFlex(jornada: LigaJornada | undefined, inicio: string | null | undefined, fin: string | null | undefined): string {
  if (!jornada?.fecha) return "Fecha por definir";
  const [year, month, day] = jornada.fecha.split("-").map(Number);
  if (!year || !month || !day) return jornada.fecha;
  const label = new Date(year, month - 1, day).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const hours = [inicio, fin].filter(Boolean).join("–");
  return hours ? `${label} · ${hours} · America/Mexico_City` : `${label} · America/Mexico_City`;
}

export const LigaFlexPublica: React.FC<{ detalle: LigaDetalle }> = ({ detalle }) => (
  <ClubExperienceScope organizadorId={detalle.organizador_id}>
    <LigaFlexPublicaBody detalle={detalle} />
  </ClubExperienceScope>
);

const LigaFlexPublicaBody: React.FC<{ detalle: LigaDetalle }> = ({ detalle }) => {
  const club = useOrganizerDisplayName(detalle.organizador_id);
  const [bundle, setBundle] = useState<FlexBundle | null>(null);
  const [jornadaId, setJornadaId] = useState<string | null>(detalle.jornadas[0]?.id ?? null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadFlexLeague(detalle.id)
      .then((next) => {
        if (active) setBundle(next);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "No se pudo cargar la liga.");
      });
    return () => {
      active = false;
    };
  }, [detalle.id, detalle.estado, detalle.jornadas]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of detalle.jugadores) map.set(player.id, player.nombre);
    for (const row of detalle.inscripciones) {
      if (row.jugador?.nombre) map.set(row.jugador_id, row.jugador.nombre);
    }
    return map;
  }, [detalle]);

  const awards = (bundle?.posiciones ?? []).map((row) => ({
    jornadaNumero: detalle.jornadas.find((jornada) => jornada.id === row.jornadaId)?.numero ?? 0,
    jugadorId: row.jugadorId,
    posicion: row.posicion,
    puntos: row.puntos,
  }));
  const season = rankFlexSeason({ awards, resolution: honorResolution(bundle?.honores) });
  const current = detalle.jornadas.find((jornada) => jornada.id === jornadaId) ?? detalle.jornadas[0];
  const next = detalle.jornadas
    .filter((jornada) => jornada.estado !== "completed")
    .sort((a, b) => a.numero - b.numero)[0];
  const currentFlex = bundle?.jornadas.find((row) => row.jornadaId === current?.id);
  const nextFlex = bundle?.jornadas.find((row) => row.jornadaId === next?.id);
  const completed = detalle.jornadas
    .filter((jornada) => jornada.estado === "completed")
    .sort((a, b) => a.numero - b.numero);
  const latest = completed.length > 0 ? completed[completed.length - 1] : undefined;
  const before = latest
    ? rankFlexSeason({ awards: awards.filter((row) => row.jornadaNumero < latest.numero) })
    : null;
  const after = season.ok ? season.rows : [];
  const highlight = latest && before?.ok
    ? after
        .map((row) =>
          seasonMovement(
            before.rows,
            after.map((item) => ({
              ...item,
              puntosJornada:
                awards.find(
                  (award) => award.jugadorId === item.jugadorId && award.jornadaNumero === latest.numero
                )?.puntos ?? 0,
            })),
            row.jugadorId
          )
        )
        .find((row) => row && row.puntos > 0) ?? null
    : null;

  const estado =
    detalle.estado === "completed"
      ? "Finalizada"
      : detalle.estado === "archived"
        ? "Archivada"
        : detalle.estado === "in_progress"
          ? "En curso"
          : "Por comenzar";

  return (
    <main className="liga-flex liga-flex--public">
      <PublicEventBrandIdentity />
      <header className="liga-flex__head">
        <p className="liga-flex__kicker">Riviera Flex League · by Riviera Open</p>
        <h1>{detalle.nombre}</h1>
        <p>
          {club || "Club"} · {bundle?.config.categoria || "Categoría por definir"} · {estado}
        </p>
        <p>
          {current ? `Jornada ${current.numero} · ${fechaFlex(current, currentFlex?.horaInicio, currentFlex?.horaFin)}` : "Sin jornada publicada"}
        </p>
        {next ? <p>Próxima: jornada {next.numero} · {fechaFlex(next, nextFlex?.horaInicio, nextFlex?.horaFin)}</p> : null}
      </header>
      {error ? <p className="liga-error">{error}</p> : null}
      {highlight ? (
        <p className="liga-flex__move">
          {names.get(highlight.jugadorId) ?? "Jugador"} · +{highlight.puntos} puntos · Posición general: {highlight.posicion}º
          {highlight.delta > 0 ? ` · Subió ${highlight.delta} ${highlight.delta === 1 ? "lugar" : "lugares"}` : ""}
        </p>
      ) : null}
      {bundle?.honores ? (
        <ol className="liga-flex__podio">
          <li><p className="liga-flex__kicker">Campeón</p>{names.get(bundle.honores.campeonId) ?? "Jugador"}</li>
          <li><p className="liga-flex__kicker">Subcampeón</p>{names.get(bundle.honores.subcampeonId) ?? "Jugador"}</li>
          <li><p className="liga-flex__kicker">Tercer lugar</p>{bundle.honores.tercerId ? names.get(bundle.honores.tercerId) ?? "Jugador" : "Sin tercer lugar"}</li>
        </ol>
      ) : null}
      <section>
        <h2>Clasificación</h2>
        {season.ok ? (
          <div className="liga-flex__table-wrap">
          <table className="liga-flex__table">
            <thead>
              <tr>
                <th>Pos.</th>
                <th>Jugador</th>
                <th>JJ</th>
                <th>Puntos</th>
              </tr>
            </thead>
            <tbody>
              {season.rows.map((row) => (
                <tr key={row.jugadorId} onClick={() => setPlayerId(row.jugadorId)}>
                  <td>{row.posicion}</td>
                  <td>{names.get(row.jugadorId) ?? "Jugador"}</td>
                  <td>{row.jornadasJugadas}</td>
                  <td>{row.puntos}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <p className="liga-flex__empty">{season.reason}</p>
        )}
      </section>
      {playerId && season.ok ? (
        <section className="liga-flex__panel">
          <h2>{names.get(playerId) ?? "Jugador"}</h2>
          <table className="liga-flex__table">
            <thead>
              <tr>
                <th>Jornada</th>
                <th>Posición</th>
                <th>Puntos</th>
              </tr>
            </thead>
            <tbody>
              {season.rows
                .find((row) => row.jugadorId === playerId)
                ?.historial.map((row) => (
                  <tr key={`${playerId}-${row.jornadaNumero}`}>
                    <td>J{row.jornadaNumero}</td>
                    <td>{row.posicion}º</td>
                    <td>{row.puntos}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <div className="liga-flex__jornadas">
        {detalle.jornadas.map((jornada) => (
          <button
            key={jornada.id}
            type="button"
            className={jornada.id === current?.id ? "is-selected" : ""}
            onClick={() => setJornadaId(jornada.id)}
          >
            J{jornada.numero}
            {jornada.fecha ? ` · ${jornada.fecha.slice(8, 10)}/${jornada.fecha.slice(5, 7)}` : ""}
          </button>
        ))}
      </div>
      {current ? (
        <section className="liga-flex__panel">
          <h2>Jornada {current.numero}</h2>
          {(current.partidos ?? []).length === 0 ? <p>La programación todavía no está confirmada.</p> : null}
          {(current.partidos ?? [])
            .slice()
            .sort((a, b) => a.ronda - b.ronda || (a.cancha ?? 0) - (b.cancha ?? 0))
            .map((partido) => {
              const pairs = new Map((current.parejas ?? []).map((pareja) => [pareja.id, pareja]));
              const left = partido.pareja1 ?? pairs.get(partido.pareja1_id);
              const right = partido.pareja2 ?? pairs.get(partido.pareja2_id);
              return (
              <p key={partido.id}>
                Ronda {partido.ronda} · Cancha {partido.cancha ?? "—"}: {side(left, names)} vs{" "}
                {side(right, names)}
                {partido.score_pareja1 != null && partido.score_pareja2 != null
                  ? ` · ${partido.score_pareja1}-${partido.score_pareja2}`
                  : ""}
              </p>
              );
            })}
          <h3>Puntos de la jornada</h3>
          {(bundle?.posiciones ?? [])
            .filter((row) => row.jornadaId === current.id)
            .sort((a, b) => a.posicion - b.posicion)
            .map((row) => (
              <p key={row.jugadorId}>
                {row.posicion}º {names.get(row.jugadorId) ?? "Jugador"} · {row.puntos} puntos
              </p>
            ))}
        </section>
      ) : null}
    </main>
  );
};

function side(
  pareja: { jugador1_id: string; jugador2_id: string } | undefined,
  names: Map<string, string>
): string {
  if (!pareja) return "Pareja";
  return `${names.get(pareja.jugador1_id) ?? "Jugador"} / ${names.get(pareja.jugador2_id) ?? "Jugador"}`;
}
