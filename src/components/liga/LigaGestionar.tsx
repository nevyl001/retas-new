import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  calendarioDesactualizado,
  tieneJornadasEnCurso,
} from "../../lib/liga/calendario";
import type { LigaDetalle, LigaJugadorPoolItem } from "../../lib/liga/types";
import { JugadorCategoriaBadge } from "../jugadores/JugadorCategoriaBadge";
import "../jugadores/riviera-jugadores.css";
import {
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

export const LigaGestionar: React.FC<LigaGestionarProps> = ({ ligaId }) => {
  const [detalle, setDetalle] = useState<LigaDetalle | null>(null);
  const [jugadoresPool, setJugadoresPool] = useState<LigaJugadorPoolItem[]>([]);
  const [tab, setTab] = useState<"jugadores" | "jornadas">("jugadores");
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
    const n = detalle.inscripciones.length;
    return n >= 4 && n % 2 === 0;
  }, [detalle]);

  const puedeRegenerar = useMemo(() => {
    if (!detalle || detalle.estado === "completed") return false;
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

  const copyPublic = async () => {
    try {
      await navigator.clipboard.writeText(publicLigaUrl(ligaId));
      setMessage("Enlace público copiado.");
    } catch {
      setError("No se pudo copiar el enlace.");
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
      <div className="liga-toolbar riviera-back-toolbar">
        <Button type="button" variant="back" onClick={() => navigateLiga("/liga")}>
          ← Ligas
        </Button>
      </div>

      <header className="liga-header">
        <h1 className="liga-title">Liga: {detalle.nombre}</h1>
        <p className="liga-subtitle">
          {detalle.inscripciones.length} inscritos · {estadoLigaLabel(detalle.estado)}
        </p>
      </header>

      <div className="liga-actions">
        <Button type="button" variant="ghost" size="sm" onClick={copyPublic}>
          Copiar enlace público
        </Button>
        {detalle.estado !== "completed" && detalle.jornadas.length === 0 && (
          <Button
            type="button"
            variant="primary"
            disabled={!puedeIniciar || busy}
            onClick={handleStartLiga}
            title={
              !puedeIniciar
                ? "Necesitas al menos 4 inscritos y cantidad par"
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
      </div>

      {calendarioStale && ligaEditable && (
        <div className="liga-banner liga-banner--warn" role="status">
          Los inscritos no coinciden con el calendario actual. Usa «Regenerar
          calendario» para actualizar jornadas y parejas.
        </div>
      )}

      {ligaEditable && detalle.inscripciones.length < 4 && (
        <p className="liga-hint">
          Mínimo 4 jugadores inscritos (cantidad par) para generar jornadas.
        </p>
      )}
      {ligaEditable &&
        detalle.inscripciones.length >= 4 &&
        detalle.inscripciones.length % 2 !== 0 && (
          <p className="liga-error">La cantidad de inscritos debe ser par.</p>
        )}

      {message ? <p className="liga-success">{message}</p> : null}
      {error ? <p className="liga-error">{error}</p> : null}

      <div className="liga-tabs">
        <button
          type="button"
          className={`liga-tab${tab === "jugadores" ? " liga-tab--active" : ""}`}
          onClick={() => setTab("jugadores")}
        >
          Jugadores
        </button>
        <button
          type="button"
          className={`liga-tab${tab === "jornadas" ? " liga-tab--active" : ""}`}
          onClick={() => setTab("jornadas")}
        >
          Jornadas
        </button>
      </div>

      {tab === "jugadores" && (
        <>
          <div className="liga-card">
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
              <p className="liga-empty">Aún no hay jugadores disponibles.</p>
            )}
          </div>
        </>
      )}

      {tab === "jornadas" && (
        <div className="liga-card">
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
                    <p className="liga-list-item__meta">{j.estado}</p>
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
