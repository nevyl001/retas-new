import React, { useEffect, useMemo, useState } from "react";
import type { LigaDetalle, LigaJugadorPoolItem, LigaPartido } from "../../lib/liga/types";
import {
  generateFlexSchedule,
  officialFlexLayout,
  regenerateFlexSchedule,
  scheduleHasCapturedResults,
  type FlexSchedule,
} from "../../lib/liga/flex/schedule";
import { rankFlexJornada } from "../../lib/liga/flex/standings";
import { rankFlexSeason } from "../../lib/liga/flex/season";
import { estimateFlexJornada, windowMinutes } from "../../lib/liga/flex/time";
import { addJugadorLiga } from "../../services/ligaService";
import {
  applyFlexJornada,
  closeFlexLeague,
  confirmFlexSchedule,
  loadFlexLeague,
  markFlexFinal,
  reopenFlexLeague,
  resizeFlexCalendar,
  saveFlexJornadaSetup,
  saveFlexMatchScore,
  setFlexParticipantes,
  startFlexJornada,
  type FlexBundle,
} from "../../services/ligaFlexService";
import { Button } from "../ui";
import { LigaPageShell } from "./LigaPageShell";
import { navigateLiga } from "./ligaNav";
import "./liga-flex.css";

type Props = {
  detalle: LigaDetalle;
  pool: LigaJugadorPoolItem[];
  onReload: () => void;
};

export const LigaFlexAdmin: React.FC<Props> = ({ detalle, pool, onReload }) => {
  const [bundle, setBundle] = useState<FlexBundle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<FlexSchedule | null>(null);
  const [query, setQuery] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolution, setResolution] = useState("");
  const [targetCount, setTargetCount] = useState(12);
  const [reopenMotivo, setReopenMotivo] = useState("");

  const refresh = async () => {
    const next = await loadFlexLeague(detalle.id);
    setBundle(next);
    setTargetCount(next.config.jornadasPlaneadas);
    setSelectedId((current) => current ?? detalle.jornadas[0]?.id ?? null);
  };

  useEffect(() => {
    let active = true;
    void loadFlexLeague(detalle.id)
      .then((next) => {
        if (!active) return;
        setBundle(next);
        setTargetCount(next.config.jornadasPlaneadas);
        setSelectedId((current) => current ?? detalle.jornadas[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar Flex League.");
      });
    return () => {
      active = false;
    };
  }, [detalle.id, detalle.estado, detalle.jornadas]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of pool) map.set(player.id, player.nombre);
    for (const player of detalle.jugadores) map.set(player.id, player.nombre);
    return map;
  }, [pool, detalle.jugadores]);

  const jornada = detalle.jornadas.find((item) => item.id === selectedId) ?? null;
  const flex = bundle?.jornadas.find((item) => item.jornadaId === selectedId) ?? null;
  const participantIds = selectedId ? bundle?.participantes[selectedId] ?? [] : [];
  const layout = officialFlexLayout(participantIds.length, flex?.canchas ?? 0);
  const hasScores = scheduleHasCapturedResults(
    (jornada?.partidos ?? []).map((partido) => ({
      scoreA: partido.score_pareja1,
      scoreB: partido.score_pareja2,
    }))
  );
  const estimate = flex
    ? estimateFlexJornada({
        rounds: flex.rondas,
        roundMinutes: flex.duracionRondaMin,
        restMinutes: flex.descansoMin,
        availableMinutes: windowMinutes(flex.horaInicio, flex.horaFin),
      })
    : null;

  const season = useMemo(() => {
    if (!bundle) return null;
    return rankFlexSeason({
      awards: bundle.posiciones.map((row) => ({
        jornadaNumero: detalle.jornadas.find((j) => j.id === row.jornadaId)?.numero ?? 0,
        jugadorId: row.jugadorId,
        posicion: row.posicion,
        puntos: row.puntos,
      })),
    });
  }, [bundle, detalle.jornadas]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const playersOf = (ids: string[]) =>
    ids.map((id) => ({ id, name: names.get(id) ?? "Jugador" }));

  const filteredPool = pool.filter((player) => {
    const text = `${player.nombre} ${player.riviera_id ?? ""}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });

  return (
    <LigaPageShell className="liga-flex">
      <header className="liga-flex__head">
        <div>
          <p className="liga-flex__kicker">Riviera Flex League</p>
          <h1>{detalle.nombre}</h1>
          <p>
            {bundle?.config.categoria} · {bundle?.config.horarioSugerido} · participación voluntaria
          </p>
        </div>
        <Button type="button" variant="back" onClick={() => navigateLiga("/liga")}>
          ← Ligas
        </Button>
      </header>

      {error ? <p className="liga-error" role="alert">{error}</p> : null}
      {notice ? <p className="liga-flex__notice">{notice}</p> : null}

      <section className="liga-flex__panel">
        <h2>Temporada</h2>
        <div className="liga-flex__row">
          <label>
            Jornadas
            <input
              type="number"
              min={1}
              max={48}
              value={targetCount}
              onChange={(event) => setTargetCount(Number(event.target.value) || 1)}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await resizeFlexCalendar({
                  ligaId: detalle.id,
                  targetCount,
                  canchas: detalle.canchas_disponibles,
                  jornadas: detalle.jornadas.map((item) => ({
                    id: item.id,
                    numero: item.numero,
                    hasOfficialResults: (bundle?.posiciones ?? []).some(
                      (row) => row.jornadaId === item.id
                    ),
                  })),
                });
              })
            }
          >
            Actualizar calendario
          </Button>
          {detalle.estado === "completed" ? (
            <>
              <input
                value={reopenMotivo}
                placeholder="Motivo de reapertura"
                onChange={(event) => setReopenMotivo(event.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void run(() => reopenFlexLeague(detalle.id, reopenMotivo))}
              >
                Reabrir liga
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const outcome = await closeFlexLeague(detalle.id);
                  if (outcome.needsResolution) {
                    throw new Error(outcome.error || "El podio necesita una resolución.");
                  }
                  setNotice("Liga finalizada. El podio quedó registrado una sola vez.");
                })
              }
            >
              Cerrar liga
            </Button>
          )}
        </div>
        <p className="liga-flex__meta">
          Inscripción de temporada ${bundle?.config.inscripcionTemporadaMxn ?? "—"} MXN · jornada $
          {bundle?.config.participacionJornadaMxn ?? "—"} MXN · {bundle?.config.premioCampeon}
        </p>
      </section>

      <section className="liga-flex__panel">
        <h2>Clasificación</h2>
        {season?.ok ? (
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
                <tr key={row.jugadorId}>
                  <td>{row.posicion}</td>
                  <td>{names.get(row.jugadorId) ?? "Jugador"}</td>
                  <td>{row.jornadasJugadas}</td>
                  <td>{row.puntos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>{season && !season.ok ? season.reason : "Todavía no hay jornadas con puntos oficiales."}</p>
        )}
      </section>

      <div className="liga-flex__jornadas">
        {detalle.jornadas
          .slice()
          .sort((a, b) => a.numero - b.numero)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === selectedId ? "is-selected" : ""}
              onClick={() => {
                setSelectedId(item.id);
                setPreview(null);
              }}
            >
              J{String(item.numero).padStart(2, "0")}
              {bundle?.jornadas.some((row) => row.jornadaId === item.id && row.esFinal) ? " · Final" : ""}
            </button>
          ))}
      </div>

      {jornada && flex ? (
        <section className="liga-flex__panel">
          <h2>Jornada {String(jornada.numero).padStart(2, "0")}</h2>
          <p>
            Participantes {participantIds.length}/16 · canchas utilizadas {layout.ok ? layout.courtsUsed : "—"} · rondas{" "}
            {flex.rondas} · {flex.duracionRondaMin} min · estimado {estimate?.totalMinutes ?? "—"} min ·{" "}
            {jornada.estado === "completed" ? "cerrada" : jornada.estado === "in_progress" ? "en juego" : "pendiente"}
            {flex.esFinal ? " · jornada final" : ""}
          </p>
          {!layout.ok && participantIds.length > 0 ? <p>{layout.error}</p> : null}

          <div className="liga-flex__config">
            <h3>Configuración de jornada</h3>
            <ConfigFields
              flex={flex}
              disabled={busy || hasScores || jornada.estado === "completed"}
              onSave={(patch) => void run(() => saveFlexJornadaSetup(jornada.id, patch))}
            />
            {estimate ? <p>{estimate.message}</p> : null}
          </div>

          <div className="liga-flex__config">
            <h3>Gestionar participantes</h3>
            <input
              value={query}
              placeholder="Buscar por nombre o Riviera ID"
              onChange={(event) => setQuery(event.target.value)}
            />
            <ul className="liga-flex__people">
              {filteredPool.slice(0, 8).map((player) => {
                const selected = participantIds.includes(player.id);
                return (
                  <li key={player.id}>
                    <span>
                      {player.nombre}
                      {player.riviera_id ? ` · ${player.riviera_id}` : ""}
                    </span>
                    <button
                      type="button"
                      disabled={busy || hasScores}
                      onClick={() => {
                        const next = selected
                          ? participantIds.filter((id) => id !== player.id)
                          : [...participantIds, player.id];
                        void run(() => setFlexParticipantes(jornada.id, next));
                      }}
                    >
                      {selected ? "Quitar" : "Agregar"}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="liga-flex__row">
              <input
                value={nuevoNombre}
                placeholder="Jugador nuevo de la temporada"
                onChange={(event) => setNuevoNombre(event.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !nuevoNombre.trim()}
                onClick={() =>
                  void run(async () => {
                    const normalized = nuevoNombre.trim().toLowerCase();
                    if (pool.some((player) => player.nombre.trim().toLowerCase() === normalized)) {
                      throw new Error("Ese jugador ya existe. Selecciónalo de la lista.");
                    }
                    await addJugadorLiga({ nombre: nuevoNombre.trim() });
                    setNuevoNombre("");
                  })
                }
              >
                Dar de alta
              </Button>
            </div>
            <p>En esta fecha: {playersOf(participantIds).map((player) => player.name).join(", ") || "nadie"}.</p>
          </div>

          <div className="liga-flex__actions">
            <Button
              type="button"
              variant="primary"
              disabled={busy || hasScores || !layout.ok}
              onClick={() => {
                const schedule = generateFlexSchedule({
                  players: playersOf(participantIds),
                  courts: flex.canchas,
                  rounds: flex.rondas,
                  seed: Date.now() % 100000,
                });
                if (!schedule.ok) {
                  setError(schedule.error);
                  return;
                }
                if (estimate?.fits === false) {
                  setError(estimate.message);
                  return;
                }
                setPreview(schedule);
                setNotice(
                  schedule.quality.needsConfirmation
                    ? schedule.quality.limitations.join(" ")
                    : "Programación equilibrada lista para confirmar."
                );
              }}
            >
              Generar parejas
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !preview || hasScores}
              onClick={() => {
                if (!preview) return;
                const next = regenerateFlexSchedule({
                  players: playersOf(participantIds),
                  courts: flex.canchas,
                  rounds: flex.rondas,
                  seed: preview.seed,
                  previousSignature: preview.signature,
                });
                if (!next.ok) {
                  setError(next.error);
                  return;
                }
                setPreview(next);
                setNotice(next.changed ? "Hay otra distribución." : "No apareció otra distribución distinta con la misma equidad.");
              }}
            >
              Regenerar parejas
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={busy || !preview}
              onClick={() =>
                preview
                  ? void run(async () => {
                      await confirmFlexSchedule({ jornadaId: jornada.id, schedule: preview });
                      setPreview(null);
                      setNotice("Jornada confirmada.");
                    })
                  : undefined
              }
            >
              Confirmar jornada
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || flex.programacionEstado !== "confirmada" || jornada.estado !== "upcoming"}
              onClick={() => void run(() => startFlexJornada(jornada.id, detalle.id))}
            >
              Iniciar jornada
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || flex.esFinal}
              onClick={() =>
                void run(() =>
                  markFlexFinal({
                    ligaId: detalle.id,
                    jornadaId: jornada.id,
                    numero: jornada.numero,
                    jornadas: detalle.jornadas.map((item) => ({
                      id: item.id,
                      numero: item.numero,
                      hasData:
                        (item.partidos?.length ?? 0) > 0 ||
                        (bundle?.participantes[item.id]?.length ?? 0) > 0,
                    })),
                  })
                )
              }
            >
              Marcar jornada final
            </Button>
          </div>

          {preview ? <RoundPreview schedule={preview} names={names} /> : null}
          {flex.advertencia ? <p>{flex.advertencia}</p> : null}
          <MatchEditor
            partidos={jornada.partidos ?? []}
            names={names}
            disabled={busy || (jornada.estado === "completed" && detalle.estado === "completed")}
            onSave={(partido, scoreA, scoreB) =>
              void run(() => saveFlexMatchScore(partido.id, scoreA, scoreB))
            }
          />
          <div className="liga-flex__row">
            <input
              value={resolution}
              placeholder="Desempate: ids en orden, separados por coma"
              onChange={(event) => setResolution(event.target.value)}
            />
            <Button
              type="button"
              variant="primary"
              disabled={busy || detalle.estado === "completed"}
              onClick={() =>
                void run(async () => {
                  const ranked = rankFlexJornada({
                    players: playersOf(participantIds),
                    matches: (jornada.partidos ?? []).map(toScored),
                    resolution: resolution.split(",").map((id) => id.trim()).filter(Boolean),
                  });
                  if (!ranked.ok) throw new Error(ranked.reason);
                  await applyFlexJornada({ jornadaId: jornada.id, filas: ranked.rows });
                  setNotice("Puntos de la jornada asignados. La tabla general se reconstruyó.");
                })
              }
            >
              Asignar puntos de la jornada
            </Button>
          </div>
        </section>
      ) : null}
    </LigaPageShell>
  );
};

function ConfigFields({
  flex,
  disabled,
  onSave,
}: {
  flex: NonNullable<FlexBundle["jornadas"][number]>;
  disabled: boolean;
  onSave: (patch: {
    canchas: number;
    rondas: number;
    duracionRondaMin: number;
    descansoMin: number;
    horaInicio: string | null;
    horaFin: string | null;
  }) => void;
}) {
  const [canchas, setCanchas] = useState(flex.canchas);
  const [rondas, setRondas] = useState(flex.rondas);
  const [duracion, setDuracion] = useState(flex.duracionRondaMin);
  const [descanso, setDescanso] = useState(flex.descansoMin);
  const [inicio, setInicio] = useState(flex.horaInicio ?? "");
  const [fin, setFin] = useState(flex.horaFin ?? "");
  useEffect(() => {
    setCanchas(flex.canchas);
    setRondas(flex.rondas);
    setDuracion(flex.duracionRondaMin);
    setDescanso(flex.descansoMin);
    setInicio(flex.horaInicio ?? "");
    setFin(flex.horaFin ?? "");
  }, [flex]);
  return (
    <div className="liga-flex__row">
      <label>Canchas<input type="number" min={1} max={12} value={canchas} onChange={(e) => setCanchas(Number(e.target.value) || 1)} /></label>
      <label>Rondas<input type="number" min={1} max={24} value={rondas} onChange={(e) => setRondas(Number(e.target.value) || 1)} /></label>
      <label>Minutos<input type="number" min={5} max={90} value={duracion} onChange={(e) => setDuracion(Number(e.target.value) || 20)} /></label>
      <label>Descanso<input type="number" min={0} max={30} value={descanso} onChange={(e) => setDescanso(Number(e.target.value) || 0)} /></label>
      <label>Inicio<input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
      <label>Fin<input type="time" value={fin} onChange={(e) => setFin(e.target.value)} /></label>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() =>
          onSave({
            canchas,
            rondas,
            duracionRondaMin: duracion,
            descansoMin: descanso,
            horaInicio: inicio || null,
            horaFin: fin || null,
          })
        }
      >
        Guardar configuración
      </Button>
    </div>
  );
}

function RoundPreview({ schedule, names }: { schedule: FlexSchedule; names: Map<string, string> }) {
  return (
    <div className="liga-flex__preview">
      <p>
        Partidos por jugador: {schedule.quality.rounds}. Descansos: {schedule.quality.rests}. Parejas repetidas:{" "}
        {schedule.quality.partnerRepeats}. Repetición máxima de una pareja: {schedule.quality.maxPartnerRepeat}. Rivales
        repetidos: {schedule.quality.rivalRepeats}.
        {schedule.quality.partnerRepeats === 0 ? " Nadie repite compañero." : ""}
      </p>
      {schedule.rounds.map((round) => (
        <article key={round.round}>
          <h3>Ronda {round.round}</h3>
          {round.matches.map((match) => (
            <p key={`${match.round}-${match.court}`}>
              Cancha {match.court}: {label(match.pairA, names)} vs {label(match.pairB, names)}
            </p>
          ))}
          {round.benchIds.length > 0 ? <p>Descansan: {round.benchIds.map((id) => names.get(id) ?? id).join(", ")}</p> : null}
        </article>
      ))}
    </div>
  );
}

function MatchEditor({
  partidos,
  names,
  disabled,
  onSave,
}: {
  partidos: LigaPartido[];
  names: Map<string, string>;
  disabled: boolean;
  onSave: (partido: LigaPartido, scoreA: number, scoreB: number) => void;
}) {
  if (partidos.length === 0) return null;
  return (
    <div className="liga-flex__matches">
      {partidos
        .slice()
        .sort((a, b) => a.ronda - b.ronda || (a.cancha ?? 0) - (b.cancha ?? 0))
        .map((partido) => (
          <ScoreRow key={partido.id} partido={partido} names={names} disabled={disabled} onSave={onSave} />
        ))}
    </div>
  );
}

function ScoreRow({
  partido,
  names,
  disabled,
  onSave,
}: {
  partido: LigaPartido;
  names: Map<string, string>;
  disabled: boolean;
  onSave: (partido: LigaPartido, scoreA: number, scoreB: number) => void;
}) {
  const [a, setA] = useState(partido.score_pareja1?.toString() ?? "");
  const [b, setB] = useState(partido.score_pareja2?.toString() ?? "");
  const pair = (id: "pareja1" | "pareja2") => {
    const side = id === "pareja1" ? partido.pareja1 : partido.pareja2;
    if (!side) return "Pareja";
    return `${names.get(side.jugador1_id) ?? "Jugador"} / ${names.get(side.jugador2_id) ?? "Jugador"}`;
  };
  return (
    <div className="liga-flex__score">
      <strong>R{partido.ronda} · Cancha {partido.cancha ?? "—"}</strong>
      <span>{pair("pareja1")}</span>
      <input inputMode="numeric" value={a} onChange={(event) => setA(event.target.value)} />
      <span>vs</span>
      <input inputMode="numeric" value={b} onChange={(event) => setB(event.target.value)} />
      <span>{pair("pareja2")}</span>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || a === "" || b === ""}
        onClick={() => onSave(partido, Number(a), Number(b))}
      >
        Guardar
      </Button>
    </div>
  );
}

function toScored(partido: LigaPartido) {
  return {
    round: partido.ronda,
    pairA: [partido.pareja1?.jugador1_id ?? "", partido.pareja1?.jugador2_id ?? ""] as [string, string],
    pairB: [partido.pareja2?.jugador1_id ?? "", partido.pareja2?.jugador2_id ?? ""] as [string, string],
    scoreA: partido.score_pareja1,
    scoreB: partido.score_pareja2,
  };
}

function label(pair: [string, string], names: Map<string, string>): string {
  return `${names.get(pair[0]) ?? "Jugador"} / ${names.get(pair[1]) ?? "Jugador"}`;
}
