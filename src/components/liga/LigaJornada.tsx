import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { computeJornadaPublicStats } from "../../lib/liga/jornadaStats";
import type {
  LigaDetalle,
  LigaJornada,
  LigaPartido,
  RankingItem,
} from "../../lib/liga/types";
import {
  actualizarPuntosInscripcion,
  finishJornada,
  getLigaById,
  getRanking,
  recalcularPuntosLiga,
  startJornada,
  updateScore,
} from "../../services/ligaService";
import { Button } from "../ui";
import { ligaGestionarPath, navigateLiga, publicLigaJornadaUrl } from "./ligaNav";
import "./liga-page.css";

interface LigaJornadaProps {
  ligaId: string;
  numero: number;
}

function parejaLabel(
  parejaId: string,
  jornada: LigaJornada | undefined
): string {
  const p = jornada?.parejas?.find((x) => x.id === parejaId);
  if (!p) return "Pareja";
  const n1 = p.jugador1?.nombre ?? "?";
  const n2 = p.jugador2?.nombre ?? "?";
  return `${n1} / ${n2}`;
}

function rondaCompleta(partidos: LigaPartido[]): boolean {
  return (
    partidos.length > 0 && partidos.every((p) => p.estado === "completed")
  );
}

function rondaEnCurso(partidos: LigaPartido[]): boolean {
  return partidos.some((p) => p.estado === "in_progress");
}

async function activarSiguienteRonda(
  jornadaId: string,
  rondaActual: number
): Promise<void> {
  const { error } = await supabase
    .from("liga_partidos")
    .update({ estado: "in_progress" })
    .eq("jornada_id", jornadaId)
    .eq("ronda", rondaActual + 1)
    .eq("estado", "upcoming");

  if (error) throw new Error(error.message);
}

export const LigaJornadaView: React.FC<LigaJornadaProps> = ({
  ligaId,
  numero,
}) => {
  const [detalle, setDetalle] = useState<LigaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scores, setScores] = useState<Record<string, { s1: string; s2: string }>>(
    {}
  );
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [manualPuntos, setManualPuntos] = useState<Record<string, string>>({});
  const [showManualEdit, setShowManualEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, rank] = await Promise.all([
        getLigaById(ligaId),
        getRanking(ligaId),
      ]);
      setDetalle(d);
      setRanking(rank);
      setManualPuntos(
        Object.fromEntries(rank.map((r) => [r.jugador_id, String(r.puntos)]))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [ligaId]);

  useEffect(() => {
    load();
  }, [load]);

  const jornada = useMemo(
    () => detalle?.jornadas.find((j) => j.numero === numero),
    [detalle, numero]
  );

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
        [...partidos].sort((a, b) => (a.cancha ?? 0) - (b.cancha ?? 0)),
      ] as [number, LigaPartido[]]);
  }, [jornada]);

  const rondaActiva = useMemo(() => {
    for (const [ronda, partidos] of partidosByRonda) {
      if (rondaEnCurso(partidos)) return ronda;
    }
    for (const [ronda, partidos] of partidosByRonda) {
      if (!rondaCompleta(partidos)) return ronda;
    }
    return null;
  }, [partidosByRonda]);

  const handleStartJornada = async () => {
    if (!jornada) return;
    setBusy(true);
    setError(null);
    try {
      await startJornada(jornada.id);
      setMessage("Jornada iniciada. Partidos generados.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const saveScore = async (partido: LigaPartido, force = false) => {
    const draft = scores[partido.id] ?? {
      s1: String(partido.score_pareja1 ?? ""),
      s2: String(partido.score_pareja2 ?? ""),
    };
    const s1 = Number(draft.s1);
    const s2 = Number(draft.s2);
    if (Number.isNaN(s1) || Number.isNaN(s2)) {
      setError("Scores inválidos.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateScore(partido.id, s1, s2, force);
      setMessage("Resultado guardado.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      if (msg.includes("sobrescribir") && !force) {
        if (window.confirm(`${msg} ¿Continuar?`)) {
          await saveScore(partido, true);
          return;
        }
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleActivarSiguienteRonda = async (ronda: number) => {
    if (!jornada) return;
    setBusy(true);
    setError(null);
    try {
      await activarSiguienteRonda(jornada.id, ronda);
      setMessage(`Ronda ${ronda + 1} activada.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const jornadaStats = useMemo(
    () => computeJornadaPublicStats(jornada),
    [jornada]
  );

  const handleFinalizarJornada = async () => {
    if (!jornada) return;
    const msg = jornada.puntos_aplicados
      ? "¿Recalcular el ranking de toda la liga según los resultados guardados? Esto sobrescribe ajustes manuales."
      : "¿Finalizar la jornada y sumar los puntos al ranking acumulado?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      await finishJornada(jornada.id);
      setMessage(
        jornada.puntos_aplicados
          ? "Ranking recalculado desde la base de datos."
          : "Jornada finalizada. Puntos aplicados al ranking."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleRecalcularLiga = async () => {
    if (
      !window.confirm(
        "¿Recalcular todo el ranking de la liga desde los partidos completados?"
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recalcularPuntosLiga(ligaId);
      setMessage("Ranking de la liga recalculado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleGuardarPuntosManual = async (jugadorId: string) => {
    const raw = manualPuntos[jugadorId];
    const pts = Number(raw);
    if (Number.isNaN(pts) || pts < 0) {
      setError("Puntos inválidos.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await actualizarPuntosInscripcion(ligaId, jugadorId, pts);
      setMessage("Puntos del jugador actualizados.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !detalle) {
    return (
      <div className="liga-page">
        <p>Cargando jornada…</p>
      </div>
    );
  }

  if (!detalle || !jornada) {
    return (
      <div className="liga-page">
        <p className="liga-error">{error ?? "Jornada no encontrada"}</p>
        <Button
          type="button"
          variant="back"
          onClick={() => navigateLiga(ligaGestionarPath(ligaId))}
        >
          Volver
        </Button>
      </div>
    );
  }

  const puedeIniciar =
    jornada.estado === "upcoming" && (jornada.parejas?.length ?? 0) >= 3;

  const todosPartidosCompletos =
    (jornada.partidos?.length ?? 0) > 0 &&
    jornada.partidos!.every((p) => p.estado === "completed");

  const puntosPendientes =
    todosPartidosCompletos && !jornada.puntos_aplicados;

  const puedeFinalizar = todosPartidosCompletos;

  const totalPartidos = jornada.partidos?.length ?? 0;
  const nParejas = jornada.parejas?.length ?? 0;
  const partidosEsperados = (nParejas * (nParejas - 1)) / 2;

  return (
    <div className="liga-page">
      <div className="liga-toolbar riviera-back-toolbar">
        <Button
          type="button"
          variant="back"
          onClick={() => navigateLiga(ligaGestionarPath(ligaId))}
        >
          ← {detalle.nombre}
        </Button>
      </div>

      <div className="liga-actions">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                publicLigaJornadaUrl(ligaId, numero)
              );
              setMessage("Enlace de pantalla copiado.");
            } catch {
              setError("No se pudo copiar el enlace.");
            }
          }}
        >
          Copiar enlace pantalla
        </Button>
      </div>

      <header className="liga-header">
        <h1 className="liga-title">
          Liga: {detalle.nombre} — Jornada {numero}
        </h1>
        <p className="liga-subtitle">
          Estado: {jornada.estado}
          {totalPartidos > 0
            ? ` · ${totalPartidos} partidos (${nParejas} parejas, todos vs todos)`
            : null}
        </p>
      </header>

      {message ? <p className="liga-success">{message}</p> : null}
      {error ? <p className="liga-error">{error}</p> : null}

      <div className="liga-card">
        <h2 className="liga-card__title">Parejas de la jornada</h2>
        <div>
          {(jornada.parejas ?? []).map((p) => (
            <span key={p.id} className="liga-pareja-chip">
              {p.jugador1?.nombre ?? "?"} / {p.jugador2?.nombre ?? "?"}
            </span>
          ))}
        </div>
        {jornada.estado === "upcoming" && (
          <div className="liga-actions">
            <Button
              type="button"
              variant="primary"
              disabled={!puedeIniciar || busy}
              onClick={handleStartJornada}
            >
              Iniciar jornada
            </Button>
            {!puedeIniciar && (
              <p className="liga-error">Se requieren al menos 3 parejas.</p>
            )}
            {puedeIniciar && nParejas >= 3 && (
              <p className="liga-hint">
                Se generarán {partidosEsperados} partidos en varias rondas (máx.{" "}
                {detalle.canchas_disponibles} canchas por ronda).
              </p>
            )}
          </div>
        )}
      </div>

      <div className="liga-jornada-admin">
        <div className="liga-jornada-admin__main">
      {partidosByRonda.length > 0 && (
        <div className="liga-card">
          <h2 className="liga-card__title">Partidos por ronda</h2>
          {partidosByRonda.map(([ronda, partidos]) => {
            const completa = rondaCompleta(partidos);
            const enCurso = rondaEnCurso(partidos);
            const siguienteRonda = partidosByRonda.find(([r]) => r === ronda + 1);
            const haySiguiente = Boolean(siguienteRonda);
            const siguienteSoloUpcoming =
              haySiguiente &&
              siguienteRonda![1].every((p) => p.estado === "upcoming");
            const puedeActivarSiguiente =
              completa && haySiguiente && siguienteSoloUpcoming;

            return (
              <section
                key={ronda}
                className={`liga-ronda-block${
                  rondaActiva === ronda ? " liga-ronda-block--active" : ""
                }`}
              >
                <div className="liga-ronda-block__head">
                  <h3 className="liga-ronda-label">Ronda {ronda}</h3>
                  <span className="liga-badge">
                    {completa
                      ? "Completada"
                      : enCurso
                        ? "En curso"
                        : "Pendiente"}
                  </span>
                </div>

                {partidos.map((partido) => {
                  const draft = scores[partido.id] ?? {
                    s1: String(partido.score_pareja1 ?? ""),
                    s2: String(partido.score_pareja2 ?? ""),
                  };
                  const bloqueado =
                    partido.estado === "upcoming" && rondaActiva !== ronda;

                  return (
                    <div
                      key={partido.id}
                      className={`liga-partido-row${
                        bloqueado ? " liga-partido-row--locked" : ""
                      }`}
                    >
                      <p className="liga-partido-row__teams">
                        Cancha {partido.cancha ?? "?"} —{" "}
                        {parejaLabel(partido.pareja1_id, jornada)} vs{" "}
                        {parejaLabel(partido.pareja2_id, jornada)}
                      </p>
                      <div className="liga-score-row">
                        <input
                          type="number"
                          min={0}
                          value={draft.s1}
                          disabled={bloqueado || busy}
                          onChange={(e) =>
                            setScores((prev) => ({
                              ...prev,
                              [partido.id]: { ...draft, s1: e.target.value },
                            }))
                          }
                          aria-label="Puntos pareja 1"
                        />
                        <span>—</span>
                        <input
                          type="number"
                          min={0}
                          value={draft.s2}
                          disabled={bloqueado || busy}
                          onChange={(e) =>
                            setScores((prev) => ({
                              ...prev,
                              [partido.id]: { ...draft, s2: e.target.value },
                            }))
                          }
                          aria-label="Puntos pareja 2"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={bloqueado || busy}
                          onClick={() => saveScore(partido)}
                        >
                          Guardar
                        </Button>
                        {partido.estado === "completed" && (
                          <span className="liga-badge liga-badge--done">✓</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {puedeActivarSiguiente && (
                  <div className="liga-actions liga-ronda-block__footer">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleActivarSiguienteRonda(ronda)}
                    >
                      Activar ronda {ronda + 1}
                    </Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {puntosPendientes && (
        <div className="liga-banner liga-banner--warn" role="status">
          Todos los partidos tienen resultado. Pulsa &quot;Finalizar jornada&quot;
          para aplicar los puntos al ranking acumulado.
        </div>
      )}

      {puedeFinalizar && (
        <div className="liga-actions liga-jornada-admin__finish">
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={handleFinalizarJornada}
          >
            {jornada.puntos_aplicados
              ? "Recalcular puntos y ranking"
              : "Finalizar jornada"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={handleRecalcularLiga}
          >
            Recalcular toda la liga
          </Button>
        </div>
      )}
        </div>

        <aside className="liga-jornada-admin__aside">
          <div className="liga-card liga-jornada-ranking-card">
            <h2 className="liga-card__title">Puntos de esta jornada</h2>
            <p className="liga-hint">
              Calculado desde los partidos guardados (games por jugador).
            </p>
            {jornadaStats.rankingJugadores.length === 0 ? (
              <p className="liga-empty">Sin resultados aún.</p>
            ) : (
              <table className="liga-ranking-table">
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
                        row.posicion <= 3 ? "liga-ranking-top" : undefined
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
                <h3 className="liga-jornada-ranking-card__subtitle">Parejas</h3>
                <table className="liga-ranking-table">
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
                            ? "liga-ranking-top"
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

            {jornadaStats.ganadorPareja && todosPartidosCompletos && (
              <p className="liga-jornada-winner" role="status">
                Ganadora: {jornadaStats.ganadorPareja.nombre} (
                {jornadaStats.ganadorPareja.victorias} victorias)
              </p>
            )}
          </div>

          <div className="liga-card liga-jornada-ranking-card">
            <h2 className="liga-card__title">Ranking acumulado</h2>
            <p className="liga-hint">
              Puntos en base de datos de la liga. Al guardar resultados o
              finalizar, se recalcula automáticamente.
            </p>
            {ranking.length === 0 ? (
              <p className="liga-empty">Sin puntos en la liga aún.</p>
            ) : (
              <table className="liga-ranking-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Jugador</th>
                    <th>Pts</th>
                    <th>Jorn.</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row) => (
                    <tr
                      key={row.jugador_id}
                      className={
                        row.posicion <= 3 ? "liga-ranking-top" : undefined
                      }
                    >
                      <td>{row.posicion}</td>
                      <td>{row.nombre}</td>
                      <td>{row.puntos}</td>
                      <td>{row.jornadas_jugadas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="liga-jornada-manual">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowManualEdit((v) => !v)}
              >
                {showManualEdit
                  ? "Ocultar ajuste manual"
                  : "Corregir puntos manualmente"}
              </Button>
              {showManualEdit && (
                <div className="liga-jornada-manual__list">
                  <p className="liga-hint">
                    Solo para correcciones excepcionales. &quot;Recalcular&quot;
                    volverá a calcular desde los partidos.
                  </p>
                  {ranking.map((row) => (
                    <div key={row.jugador_id} className="liga-jornada-manual__row">
                      <span className="liga-jornada-manual__name">
                        {row.nombre}
                      </span>
                      <input
                        type="number"
                        min={0}
                        className="liga-jornada-manual__input"
                        value={manualPuntos[row.jugador_id] ?? String(row.puntos)}
                        disabled={busy}
                        onChange={(e) =>
                          setManualPuntos((prev) => ({
                            ...prev,
                            [row.jugador_id]: e.target.value,
                          }))
                        }
                        aria-label={`Puntos ${row.nombre}`}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => handleGuardarPuntosManual(row.jugador_id)}
                      >
                        Guardar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
