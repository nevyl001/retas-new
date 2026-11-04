import React, { useEffect, useMemo, useState } from "react";
import type {
  LigaJornada,
  LigaJugadorPoolItem,
  RankingItem,
} from "../../lib/liga/types";
import {
  LIGA_SUSTITUCION_MOTIVO_OPTIONS,
  listJornadasElegiblesSustitucion,
  pickDefaultJornadaSustitucionId,
  type LigaSustitucionMotivoCategoria,
} from "../../lib/liga/sustitucion";
import { sustituirJugadorLigaIndividualRotativo } from "../../services/ligaService";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { Button } from "../ui";

export interface LigaSustituirJugadorModalProps {
  open: boolean;
  ligaId: string;
  ligaNombre: string;
  saliente: LigaJugadorPoolItem | null;
  rankingRow: RankingItem | null;
  jornadas: LigaJornada[];
  candidatos: LigaJugadorPoolItem[];
  inscritosIds: ReadonlySet<string>;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}

type Step = 1 | 2 | 3 | 4 | 5;

export const LigaSustituirJugadorModal: React.FC<
  LigaSustituirJugadorModalProps
> = ({
  open,
  ligaId,
  ligaNombre,
  saliente,
  rankingRow,
  jornadas,
  candidatos,
  inscritosIds,
  onClose,
  onDone,
}) => {
  const [step, setStep] = useState<Step>(1);
  const [query, setQuery] = useState("");
  const [entranteId, setEntranteId] = useState<string | null>(null);
  const [jornadaId, setJornadaId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<LigaSustitucionMotivoCategoria | "">(
    ""
  );
  const [detalle, setDetalle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegibles = useMemo(
    () =>
      saliente
        ? listJornadasElegiblesSustitucion(jornadas, saliente.id)
        : [],
    [jornadas, saliente]
  );

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setQuery("");
    setEntranteId(null);
    setMotivo("");
    setDetalle("");
    setError(null);
    setJornadaId(pickDefaultJornadaSustitucionId(elegibles));
  }, [open, saliente?.id, elegibles]);

  const entrante = useMemo(
    () => candidatos.find((c) => c.id === entranteId) ?? null,
    [candidatos, entranteId]
  );

  const filteredCandidatos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidatos
      .filter((c) => !inscritosIds.has(c.id))
      .filter((c) => c.id !== saliente?.id)
      .filter((c) => {
        if (!q) return true;
        const riv = (c.riviera_id ?? "").toLowerCase();
        return c.nombre.toLowerCase().includes(q) || riv.includes(q);
      })
      .slice(0, 12);
  }, [candidatos, inscritosIds, query, saliente?.id]);

  const puntosActuales = rankingRow?.puntos ?? 0;
  const jornadaLabel =
    elegibles.find((j) => j.id === jornadaId)?.label ?? "—";

  if (!open || !saliente) return null;

  const canNextFrom2 = Boolean(entranteId);
  const canNextFrom3 = Boolean(jornadaId);
  const canNextFrom4 = motivo !== "";

  const handleConfirm = async () => {
    if (!entranteId || !jornadaId || !motivo) return;
    setSaving(true);
    setError(null);
    try {
      await sustituirJugadorLigaIndividualRotativo({
        ligaId,
        fromJugadorId: saliente.id,
        toJugadorId: entranteId,
        jornadaEfectivaId: jornadaId,
        motivoCategoria: motivo,
        motivoDetalle: detalle,
      });
      await onDone();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo sustituir al jugador"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="liga-sust-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="liga-sust-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="liga-sust-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="liga-sust-modal__head">
          <div>
            <p className="liga-sust-modal__eyebrow">{ligaNombre}</p>
            <h2 id="liga-sust-title" className="liga-sust-modal__title">
              Sustituir jugador
            </h2>
          </div>
          <p className="liga-sust-modal__step">Paso {step} de 5</p>
        </header>

        {step === 1 ? (
          <section className="liga-sust-modal__section">
            <p className="liga-sust-modal__label">Jugador saliente</p>
            <div className="liga-sust-modal__player">
              <JugadorAvatar
                fotoUrl={saliente.foto_url}
                nombre={saliente.nombre}
                size="lg"
              />
              <div>
                <p className="liga-sust-modal__player-name">{saliente.nombre}</p>
                {saliente.riviera_id ? (
                  <p className="liga-sust-modal__player-meta">
                    Riviera ID · {saliente.riviera_id}
                  </p>
                ) : null}
                <p className="liga-sust-modal__player-meta">
                  {puntosActuales} pts en liga ·{" "}
                  {rankingRow?.jornadas_jugadas ?? 0} jornadas · Activo
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="liga-sust-modal__section">
            <label className="liga-sust-modal__label" htmlFor="liga-sust-search">
              Buscar jugador entrante
            </label>
            <input
              id="liga-sust-search"
              className="liga-sust-modal__input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre o Riviera ID"
              autoFocus
            />
            <ul className="liga-sust-modal__candidates">
              {filteredCandidatos.length === 0 ? (
                <li className="liga-sust-modal__empty">
                  No hay candidatos disponibles.
                </li>
              ) : (
                filteredCandidatos.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`liga-sust-modal__candidate${
                        entranteId === c.id ? " is-selected" : ""
                      }`}
                      onClick={() => setEntranteId(c.id)}
                    >
                      <JugadorAvatar
                        fotoUrl={c.foto_url}
                        nombre={c.nombre}
                        size="sm"
                      />
                      <span>
                        <strong>{c.nombre}</strong>
                        <small>
                          {c.riviera_id ? `${c.riviera_id} · ` : ""}
                          {c.categoria ?? "Sin categoría"}
                        </small>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="liga-sust-modal__section">
            <p className="liga-sust-modal__label">¿Desde qué jornada ingresará?</p>
            {elegibles.length === 0 ? (
              <p className="liga-sust-modal__empty">
                No hay jornadas elegibles sin resultados. No se puede sustituir
                ahora.
              </p>
            ) : (
              <div className="liga-sust-modal__jornadas">
                {elegibles.map((j) => (
                  <label key={j.id} className="liga-sust-modal__jornada">
                    <input
                      type="radio"
                      name="liga-sust-jornada"
                      checked={jornadaId === j.id}
                      onChange={() => setJornadaId(j.id)}
                    />
                    <span>{j.label}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="liga-sust-modal__hint">
              No se modifican jornadas anteriores ni partidos con marcador.
            </p>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="liga-sust-modal__section">
            <p className="liga-sust-modal__label">Motivo de sustitución</p>
            <div className="liga-sust-modal__motivos">
              {LIGA_SUSTITUCION_MOTIVO_OPTIONS.map((opt) => (
                <label key={opt.id} className="liga-sust-modal__motivo">
                  <input
                    type="radio"
                    name="liga-sust-motivo"
                    checked={motivo === opt.id}
                    onChange={() => setMotivo(opt.id)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
            <label className="liga-sust-modal__label" htmlFor="liga-sust-detalle">
              Observación administrativa (no pública)
            </label>
            <textarea
              id="liga-sust-detalle"
              className="liga-sust-modal__textarea"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              maxLength={400}
              rows={3}
              placeholder="Detalle interno opcional"
            />
          </section>
        ) : null}

        {step === 5 ? (
          <section className="liga-sust-modal__section">
            <p className="liga-sust-modal__label">Confirmación</p>
            <ul className="liga-sust-modal__summary">
              <li>
                <span>Saliente</span>
                <strong>{saliente.nombre}</strong>
              </li>
              <li>
                <span>Entrante</span>
                <strong>{entrante?.nombre ?? "—"}</strong>
              </li>
              <li>
                <span>Ingreso</span>
                <strong>{jornadaLabel}</strong>
              </li>
              <li>
                <span>Puntos que hereda</span>
                <strong>{puntosActuales}</strong>
              </li>
            </ul>
            <p className="liga-sust-modal__hint">
              Partidos anteriores permanecen con {saliente.nombre}. Partidos
              futuros desde {jornadaLabel} corresponderán al sustituto. El
              ranking de liga conserva la continuidad de la plaza.
            </p>
          </section>
        ) : null}

        {error ? <p className="liga-sust-modal__error">{error}</p> : null}

        <footer className="liga-sust-modal__actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <div className="liga-sust-modal__nav">
            {step > 1 ? (
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => setStep((s) => (s - 1) as Step)}
              >
                Atrás
              </Button>
            ) : null}
            {step < 5 ? (
              <Button
                type="button"
                variant="primary"
                disabled={
                  (step === 2 && !canNextFrom2) ||
                  (step === 3 && !canNextFrom3) ||
                  (step === 4 && !canNextFrom4) ||
                  (step === 3 && elegibles.length === 0)
                }
                onClick={() => setStep((s) => (s + 1) as Step)}
              >
                Continuar
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                loading={saving}
                disabled={saving || elegibles.length === 0}
                onClick={() => void handleConfirm()}
              >
                Confirmar sustitución
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
