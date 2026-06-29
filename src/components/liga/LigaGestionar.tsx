import { useClubModeEyebrow } from "../../club-experience";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  calendarioDesactualizado,
  tieneJornadasEnCurso,
} from "../../lib/liga/calendario";
import type { LigaDetalle, LigaEquipo, LigaJugadorPoolItem } from "../../lib/liga/types";
import { ligaModalidadLabel } from "../../lib/liga/types";
import { formatFechaLegible, dateInputValue } from "../../lib/liga/programacion";
import { JugadorCategoriaBadge } from "../jugadores/JugadorCategoriaBadge";
import { navigateJugadoresLista } from "../jugadores/jugadoresGeneroNav";
import "../jugadores/riviera-jugadores.css";
import {
  createEquipoLiga,
  deleteEquipoLiga,
  deleteLiga,
  desinscribirJugador,
  finishLiga,
  getJugadoresOrganizador,
  getLigaById,
  inscribirJugador,
  publicLigaUrl,
  regenerarCalendarioLiga,
  resetLiga,
  startLiga,
} from "../../services/ligaService";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { PublicShareSection } from "../platform/PublicShareSection";
import {
  ligaJornadaPath,
  navigateLiga,
} from "./ligaNav";
import { LigaPageShell } from "./LigaPageShell";
import "./liga-page.css";

interface LigaGestionarProps {
  ligaId: string;
}

function estadoLigaLabel(estado: LigaDetalle["estado"]): string {
  switch (estado) {
    case "upcoming":
      return "Próxima";
    case "in_progress":
      return "En curso";
    case "completed":
      return "Finalizada";
    default:
      return estado;
  }
}

function equipoNombre(e: LigaEquipo): string {
  return (
    e.nombre?.trim() ||
    `${e.jugador1?.nombre ?? "?"} / ${e.jugador2?.nombre ?? "?"}`
  );
}

export const LigaGestionar: React.FC<LigaGestionarProps> = ({ ligaId }) => {
  const modeEyebrow = useClubModeEyebrow();
  const [detalle, setDetalle] = useState<LigaDetalle | null>(null);
  const [jugadoresPool, setJugadoresPool] = useState<LigaJugadorPoolItem[]>([]);
  const [tab, setTab] = useState<"jugadores" | "parejas" | "jornadas">("jugadores");
  const [seleccionParejaIds, setSeleccionParejaIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, pool] = await Promise.all([
        getLigaById(ligaId),
        getJugadoresOrganizador(),
      ]);
      setDetalle(d);
      setJugadoresPool(pool);
      if (d.modalidad === "parejas_fijas") {
        setTab((prev) => (prev === "jugadores" ? "parejas" : prev));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [ligaId]);

  useEffect(() => {
    load();
  }, [load]);

  const inscritosIds = useMemo(
    () => new Set(detalle?.inscripciones.map((i) => i.jugador_id) ?? []),
    [detalle]
  );

  const esParejasFijas = detalle?.modalidad === "parejas_fijas";

  const jugadoresEnEquipo = useMemo(() => {
    const s = new Set<string>();
    for (const e of detalle?.equipos ?? []) {
      s.add(e.jugador1_id);
      s.add(e.jugador2_id);
    }
    return s;
  }, [detalle]);

  const jugadoresDisponiblesPareja = useMemo(
    () => jugadoresPool.filter((j) => !jugadoresEnEquipo.has(j.id)),
    [jugadoresPool, jugadoresEnEquipo]
  );

  const parejaSeleccionCompleta = seleccionParejaIds.length === 2;

  const toggleJugadorEnPareja = (jugadorId: string) => {
    setSeleccionParejaIds((prev) => {
      if (prev.includes(jugadorId)) {
        return prev.filter((id) => id !== jugadorId);
      }
      if (prev.length >= 2) return prev;
      return [...prev, jugadorId];
    });
  };

  const limpiarSeleccionPareja = () => setSeleccionParejaIds([]);

  const calendarioStale = useMemo(
    () => (detalle ? calendarioDesactualizado(detalle) : false),
    [detalle]
  );

  const jornadasActivas = useMemo(
    () => (detalle ? tieneJornadasEnCurso(detalle) : false),
    [detalle]
  );

  const puedeIniciar = useMemo(() => {
    if (!detalle || detalle.estado === "completed") return false;
    if (detalle.jornadas.length > 0) return false;
    if (detalle.modalidad === "parejas_fijas") {
      return detalle.equipos.length >= 3;
    }
    const n = detalle.inscripciones.length;
    return n >= 4 && n % 2 === 0;
  }, [detalle]);

  const puedeRegenerar = useMemo(() => {
    if (!detalle || detalle.estado === "completed") return false;
    if (detalle.modalidad === "parejas_fijas") {
      return detalle.equipos.length >= 3;
    }
    const n = detalle.inscripciones.length;
    return n >= 4 && n % 2 === 0;
  }, [detalle]);

  const puedeFinalizarLiga = useMemo(() => {
    if (!detalle || detalle.estado !== "in_progress") return false;
    return (
      detalle.jornadas.length > 0 &&
      detalle.jornadas.every((j) => j.estado === "completed")
    );
  }, [detalle]);

  const ligaEditable = detalle?.estado !== "completed";

  const handleCrearEquipo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parejaSeleccionCompleta) {
      setError("Selecciona dos jugadores distintos de la lista.");
      return;
    }
    const [jugador1_id, jugador2_id] = seleccionParejaIds;
    setBusy(true);
    setError(null);
    try {
      await createEquipoLiga(ligaId, { jugador1_id, jugador2_id });
      setSeleccionParejaIds([]);
      setMessage("Pareja registrada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEquipo = async (equipoId: string) => {
    if (!window.confirm("¿Eliminar esta pareja?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEquipoLiga(equipoId);
      setMessage("Pareja eliminada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const toggleInscripcion = async (jugadorId: string, inscrito: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (inscrito) {
        await desinscribirJugador(ligaId, jugadorId);
        setMessage("Jugador desinscrito.");
      } else {
        await inscribirJugador(ligaId, jugadorId);
        setMessage("Jugador inscrito.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleStartLiga = async () => {
    setBusy(true);
    setError(null);
    try {
      await startLiga(ligaId);
      setMessage("Liga iniciada. Jornadas generadas.");
      await load();
      setTab("jornadas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar");
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerar = async () => {
    const msg = jornadasActivas
      ? "Se borrarán TODAS las jornadas y resultados. ¿Regenerar calendario con los inscritos actuales?"
      : "¿Regenerar el calendario con los inscritos actuales?";
    if (!window.confirm(msg)) return;

    const resetPuntos =
      jornadasActivas &&
      window.confirm("¿También reiniciar el ranking de puntos a cero?");

    setBusy(true);
    setError(null);
    try {
      await regenerarCalendarioLiga(ligaId, { resetPuntos });
      setMessage("Calendario regenerado.");
      await load();
      setTab("jornadas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteLiga = async () => {
    if (!detalle) return;
    if (
      !window.confirm(
        `¿Eliminar «${detalle.nombre}»? Se borrarán inscripciones, jornadas y resultados. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteLiga(ligaId);
      navigateLiga("/liga");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setBusy(false);
    }
  };

  const handleResetLiga = async () => {
    if (
      !window.confirm(
        "¿Reiniciar la liga por completo? Se eliminarán jornadas, partidos y puntos. Volverás al estado «Próxima»."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetLiga(ligaId);
      setMessage("Liga reiniciada. Puedes editar inscritos e iniciar de nuevo.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleFinishLiga = async () => {
    if (!window.confirm("¿Finalizar la liga?")) return;
    setBusy(true);
    setError(null);
    try {
      await finishLiga(ligaId);
      setMessage("Liga finalizada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !detalle) {
    return (
      <LigaPageShell>
        <p>Cargando…</p>
      </LigaPageShell>
    );
  }

  if (!detalle) {
    return (
      <LigaPageShell>
        <p className="liga-error">{error ?? "Liga no encontrada"}</p>
        <Button type="button" variant="secondary" onClick={() => navigateLiga("/liga")}>
          Volver
        </Button>
      </LigaPageShell>
    );
  }

  return (
    <LigaPageShell>
      <ActionBar className="liga-toolbar riviera-back-toolbar">
        <Button type="button" variant="back" onClick={() => navigateLiga("/liga")}>
          ← Ligas
        </Button>
      </ActionBar>

      <ModeHeader
        className="liga-header rv-mode-header"
        eyebrow={modeEyebrow}
        title={`Liga: ${detalle.nombre}`}
        subtitle={`${ligaModalidadLabel(detalle.modalidad)} · ${
          esParejasFijas
            ? `${detalle.equipos.length} parejas`
            : `${detalle.inscripciones.length} inscritos`
        } · ${estadoLigaLabel(detalle.estado)}${
          esParejasFijas ? ` · ${detalle.vueltas} vuelta${detalle.vueltas > 1 ? "s" : ""}` : ""
        }`}
      />

      <PublicShareSection
        publicUrl={publicLigaUrl(ligaId)}
        title="Enlace público"
        infoLines={["Comparte el enlace para ver ranking y jornadas (solo lectura)."]}
        onCopy={async () => {
          try {
            await navigator.clipboard.writeText(publicLigaUrl(ligaId));
            setMessage("Enlace público copiado.");
          } catch {
            setError("No se pudo copiar el enlace.");
          }
        }}
      />

      <ActionBar className="liga-actions">
        {detalle.estado !== "completed" && detalle.jornadas.length === 0 && (
          <Button
            type="button"
            variant="primary"
            disabled={!puedeIniciar || busy}
            onClick={handleStartLiga}
            title={
              !puedeIniciar
                ? esParejasFijas
                  ? "Necesitas al menos 3 parejas inscritas"
                  : "Necesitas al menos 4 inscritos y cantidad par"
                : undefined
            }
          >
            Iniciar liga
          </Button>
        )}
        {puedeRegenerar && detalle.jornadas.length > 0 && ligaEditable && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={handleRegenerar}
          >
            Regenerar calendario
          </Button>
        )}
        {ligaEditable && (
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={handleResetLiga}
          >
            Reiniciar liga
          </Button>
        )}
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={busy}
          onClick={() => void handleDeleteLiga()}
        >
          Eliminar liga
        </Button>
        {puedeFinalizarLiga && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={handleFinishLiga}
          >
            Finalizar liga
          </Button>
        )}
      </ActionBar>

      {calendarioStale && ligaEditable && (
        <div className="liga-banner liga-banner--warn" role="status">
          {esParejasFijas
            ? "Las parejas inscritas no coinciden con el calendario actual. Usa «Regenerar calendario» para actualizar jornadas."
            : "Los inscritos no coinciden con el calendario actual. Usa «Regenerar calendario» para actualizar jornadas y parejas."}
        </div>
      )}

      {ligaEditable && esParejasFijas && detalle.equipos.length < 3 && (
        <p className="liga-hint">
          Mínimo 3 parejas inscritas para generar el calendario.
        </p>
      )}

      {ligaEditable && !esParejasFijas && detalle.inscripciones.length < 4 && (
        <p className="liga-hint">
          Mínimo 4 jugadores inscritos (cantidad par) para generar jornadas.
        </p>
      )}
      {ligaEditable &&
        !esParejasFijas &&
        detalle.inscripciones.length >= 4 &&
        detalle.inscripciones.length % 2 !== 0 && (
          <p className="liga-error">La cantidad de inscritos debe ser par.</p>
        )}

      {message ? <p className="liga-success">{message}</p> : null}
      {error ? <p className="liga-error">{error}</p> : null}

      <div className="liga-tabs">
        {esParejasFijas ? (
          <button
            type="button"
            className={`liga-tab${tab === "parejas" ? " liga-tab--active" : ""}`}
            onClick={() => setTab("parejas")}
          >
            Parejas
          </button>
        ) : (
          <button
            type="button"
            className={`liga-tab${tab === "jugadores" ? " liga-tab--active" : ""}`}
            onClick={() => setTab("jugadores")}
          >
            Jugadores
          </button>
        )}
        <button
          type="button"
          className={`liga-tab${tab === "jornadas" ? " liga-tab--active" : ""}`}
          onClick={() => setTab("jornadas")}
        >
          Jornadas
        </button>
      </div>

      {tab === "jugadores" && !esParejasFijas && (
        <>
          <div className="liga-card rv-card">
            <h2 className="liga-card__title">Inscripciones en esta liga</h2>
            <ul className="liga-list">
              {jugadoresPool.map((j) => {
                const inscrito = inscritosIds.has(j.id);
                return (
                  <li key={j.id} className="liga-list-item">
                    <div className="liga-list-item__main">
                      <div className="liga-list-item__head">
                        <p className="liga-list-item__title">{j.nombre}</p>
                        {j.categoria ? (
                          <JugadorCategoriaBadge
                            categoria={j.categoria}
                            className="liga-list-item__cat"
                          />
                        ) : (
                          <span className="liga-list-item__cat-missing">
                            Sin categoría
                          </span>
                        )}
                      </div>
                      <p className="liga-list-item__meta">
                        {inscrito ? "Inscrito en esta liga" : "Sin inscribir"}
                      </p>
                    </div>
                    {ligaEditable && (
                      <div className="liga-list-item__actions">
                        <Button
                          type="button"
                          variant={inscrito ? "danger" : "secondary"}
                          size="sm"
                          disabled={busy}
                          onClick={() => toggleInscripcion(j.id, inscrito)}
                        >
                          {inscrito ? "Desinscribir" : "Inscribir"}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {jugadoresPool.length === 0 && (
              <div className="liga-empty">
                <p>Aún no hay jugadores en el registro.</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => navigateJugadoresLista("M")}
                >
                  Ir al registro de jugadores
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "parejas" && esParejasFijas && (
        <>
          {ligaEditable && detalle.jornadas.length === 0 && (
            <form
              className="liga-card rv-card liga-equipo-form"
              onSubmit={(e) => void handleCrearEquipo(e)}
            >
              <h2 className="liga-card__title">Nueva pareja</h2>
              <p className="liga-hint">
                Solo aparecen jugadores de tu registro Riviera. Toca dos nombres
                distintos; los que ya están en otra pareja no se muestran.
              </p>

              {seleccionParejaIds.length > 0 && (
                <div className="liga-equipo-seleccion" aria-live="polite">
                  <span className="liga-equipo-seleccion__label">
                    Selección ({seleccionParejaIds.length}/2)
                  </span>
                  <div className="liga-equipo-seleccion__chips">
                    {seleccionParejaIds.map((id, index) => {
                      const j = jugadoresPool.find((p) => p.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className="liga-equipo-seleccion__chip"
                          disabled={busy}
                          onClick={() => toggleJugadorEnPareja(id)}
                          title="Quitar de la selección"
                        >
                          <span className="liga-equipo-seleccion__orden">
                            {index + 1}
                          </span>
                          {j?.nombre ?? "?"}
                          <span className="liga-equipo-seleccion__quitar" aria-hidden>
                            ×
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={limpiarSeleccionPareja}
                  >
                    Limpiar
                  </Button>
                </div>
              )}

              {jugadoresDisponiblesPareja.length === 0 ? (
                <p className="liga-empty">
                  No quedan jugadores libres. Elimina una pareja o agrega más al
                  registro.
                </p>
              ) : (
                <ul className="liga-equipo-pool" role="listbox" aria-label="Jugadores disponibles">
                  {jugadoresDisponiblesPareja.map((j) => {
                    const selected = seleccionParejaIds.includes(j.id);
                    const bloqueado =
                      !selected && seleccionParejaIds.length >= 2;
                    return (
                      <li key={j.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`liga-equipo-pool__item${
                            selected ? " liga-equipo-pool__item--selected" : ""
                          }${bloqueado ? " liga-equipo-pool__item--bloqueado" : ""}`}
                          disabled={busy || bloqueado}
                          onClick={() => toggleJugadorEnPareja(j.id)}
                        >
                          <span className="liga-equipo-pool__nombre">{j.nombre}</span>
                          {j.categoria ? (
                            <JugadorCategoriaBadge
                              categoria={j.categoria}
                              className="liga-equipo-pool__cat"
                            />
                          ) : null}
                          {selected ? (
                            <span className="liga-equipo-pool__check" aria-hidden>
                              ✓
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="liga-actions">
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={busy || !parejaSeleccionCompleta}
                >
                  Agregar pareja
                </Button>
              </div>
            </form>
          )}

          <div className="liga-card rv-card">
            <h2 className="liga-card__title">Parejas inscritas</h2>
            {detalle.equipos.length === 0 ? (
              <p className="liga-empty">Aún no hay parejas registradas.</p>
            ) : (
              <ul className="liga-list">
                {detalle.equipos.map((eq) => (
                  <li key={eq.id} className="liga-list-item">
                    <div className="liga-list-item__main">
                      <p className="liga-list-item__title">{equipoNombre(eq)}</p>
                        <p className="liga-list-item__meta">
                        {eq.partidos_jugados > 0
                          ? `${eq.puntos} pts · ${eq.partidos_jugados} PJ`
                          : "Sin partidos jugados"}
                      </p>
                    </div>
                    {ligaEditable && detalle.jornadas.length === 0 && (
                      <div className="liga-list-item__actions">
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleDeleteEquipo(eq.id)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {jugadoresPool.length === 0 && (
              <div className="liga-empty">
                <p>Aún no hay jugadores en el registro.</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => navigateJugadoresLista("M")}
                >
                  Ir al registro de jugadores
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "jornadas" && (
        <div className="liga-card rv-card">
          <h2 className="liga-card__title">Jornadas</h2>
          {detalle.jornadas.length === 0 ? (
            <p className="liga-empty">
              {ligaEditable
                ? "Inicia la liga o regenera el calendario cuando tengas inscritos listos."
                : "Sin jornadas."}
            </p>
          ) : (
            <ul className="liga-list">
              {detalle.jornadas.map((j) => (
                <li key={j.id} className="liga-list-item">
                  <div className="liga-list-item__main">
                    <p className="liga-list-item__title">Jornada {j.numero}</p>
                    <p className="liga-list-item__meta">
                      {j.estado}
                      {j.fecha
                        ? ` · ${formatFechaLegible(dateInputValue(j.fecha))}`
                        : ""}
                    </p>
                  </div>
                  <div className="liga-list-item__actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        navigateLiga(ligaJornadaPath(ligaId, j.numero))
                      }
                    >
                      Ir a jornada
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </LigaPageShell>
  );
};
