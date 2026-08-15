import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  calcularBracketInicial,
  calcularResumenClasificados,
  grupoBadgeLabel,
  mejoresTercerosNecesarios,
  previsualizarResolverBracket,
  resumenConfirmacion,
  sugerirFaseAutomatica,
  swapBracketSlots,
  validarAntesDeConfirmar,
  validarChoques,
  validarFaseElegible,
} from "../../lib/torneoExpress/bracket";
import type {
  BracketFase,
  BracketResolverResult,
  BracketSlotEntry,
} from "../../lib/torneoExpress/bracketTypes";
import { BRACKET_FASE_SLOTS } from "../../lib/torneoExpress/bracketTypes";
import type { TorneoExpressBundle } from "../../lib/torneoExpress/types";
import {
  BracketSchemaMissingError,
  confirmarFaseEliminatoria,
  fetchTorneoExpressBundle,
  formatSupabaseError,
} from "../../services/torneoExpressService";
import { Button } from "../ui";
import "./torneo-express-bracket.css";

const FASE_OPCIONES: {
  id: BracketFase;
  shortLabel: string;
}[] = [
  { id: "octavos", shortLabel: "Octavos" },
  { id: "cuartos", shortLabel: "Cuartos" },
  { id: "semifinal", shortLabel: "Semifinal" },
];

function faseEyebrow(fase: BracketFase): string {
  if (fase === "semifinal") return "Semifinal";
  if (fase === "cuartos") return "Cuartos de final";
  return "Octavos de final";
}

interface TorneoExpressBracketModalProps {
  torneoId: string;
  torneoNombre: string;
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}

export const TorneoExpressBracketModal: React.FC<
  TorneoExpressBracketModalProps
> = ({ torneoId, torneoNombre, open, onClose, onConfirmed }) => {
  const [bundle, setBundle] = useState<TorneoExpressBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"fase" | "bracket">("fase");
  const [fase, setFase] = useState<BracketFase>("cuartos");
  const [cantidadTerceros, setCantidadTerceros] = useState(0);
  const [thirdPlaceMatchEnabled, setThirdPlaceMatchEnabled] = useState(true);
  const [slots, setSlots] = useState<BracketSlotEntry[]>([]);
  const [autoSlots, setAutoSlots] = useState<BracketSlotEntry[]>([]);
  const [resolverResult, setResolverResult] =
    useState<BracketResolverResult | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const loadBundle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTorneoExpressBundle(torneoId);
      if (!data) {
        setError("No se encontró el torneo");
        return;
      }
      setBundle(data);
      const sugerida = sugerirFaseAutomatica(data.grupos.length);
      setFase(sugerida);
      const maxTer = mejoresTercerosNecesarios(data.grupos.length, sugerida);
      setCantidadTerceros(maxTer);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setLoading(false);
    }
  }, [torneoId]);

  useEffect(() => {
    if (!open) return;
    setStep("fase");
    setSlots([]);
    setAutoSlots([]);
    setResolverResult(null);
    setThirdPlaceMatchEnabled(true);
    void loadBundle();
  }, [open, loadBundle]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const faseValidacion = useMemo(() => {
    if (!bundle) return { ok: true as const };
    return validarFaseElegible(bundle.grupos.length, fase);
  }, [bundle, fase]);

  const maxTerceros = useMemo(() => {
    if (!bundle) return 0;
    return mejoresTercerosNecesarios(bundle.grupos.length, fase);
  }, [bundle, fase]);

  const resumenClasificados = useMemo(() => {
    if (!bundle || !faseValidacion.ok) return null;
    try {
      return calcularResumenClasificados(bundle, fase);
    } catch {
      return null;
    }
  }, [bundle, fase, faseValidacion]);

  const faseSugerida = useMemo(() => {
    if (!bundle) return null;
    return sugerirFaseAutomatica(bundle.grupos.length);
  }, [bundle]);

  const fasePreviews = useMemo(() => {
    if (!bundle) return {} as Partial<Record<BracketFase, string>>;
    const numGrupos = bundle.grupos.length;
    const fijos = numGrupos * 2;
    const out: Partial<Record<BracketFase, string>> = {};
    for (const opt of FASE_OPCIONES) {
      const maxTer = mejoresTercerosNecesarios(numGrupos, opt.id);
      const terceros = Math.min(cantidadTerceros, maxTer);
      const total = fijos + terceros;
      const preview = previsualizarResolverBracket(numGrupos, opt.id, total);
      out[opt.id] = preview.descripcion;
    }
    return out;
  }, [bundle, cantidadTerceros]);

  const advertencias = useMemo(() => validarChoques(slots), [slots]);

  const rebuildBracket = useCallback(() => {
    if (!bundle || !faseValidacion.ok) return;
    try {
      const built = calcularBracketInicial(bundle, fase, { cantidadTerceros });
      setSlots(built.slots);
      setAutoSlots(built.slots);
      setResolverResult(built.resolver ?? null);
      setStep("bracket");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al armar el bracket");
    }
  }, [bundle, fase, cantidadTerceros, faseValidacion]);

  useEffect(() => {
    if (!bundle || step !== "fase" || !faseValidacion.ok) return;
    setCantidadTerceros((prev) => Math.min(prev, maxTerceros));
  }, [fase, maxTerceros, bundle, step, faseValidacion]);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (destino: number) => {
    if (dragIndex == null) return;
    setSlots((prev) => swapBracketSlots(prev, dragIndex, destino));
    setDragIndex(null);
  };

  const handleRestablecer = () => {
    setSlots(
      autoSlots.map((s) =>
        s.type === "team"
          ? { ...s, qualifier: { ...s.qualifier } }
          : { type: "bye" }
      )
    );
  };

  const handleConfirmar = async () => {
    const valid = validarAntesDeConfirmar(slots);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await confirmarFaseEliminatoria(
        torneoId,
        fase,
        slots,
        thirdPlaceMatchEnabled
      );
      onConfirmed();
      onClose();
    } catch (e) {
      if (e instanceof BracketSchemaMissingError) {
        setError(e.message);
      } else {
        setError(formatSupabaseError(e));
      }
    } finally {
      setConfirming(false);
    }
  };

  const adjustTerceros = (delta: number) => {
    setCantidadTerceros((prev) =>
      Math.max(0, Math.min(maxTerceros, prev + delta))
    );
  };

  if (!open) return null;

  const totalSlots = slots.length > 0 ? slots.length : BRACKET_FASE_SLOTS[fase];
  const fijosCount = resumenClasificados?.fijos.length ?? 0;
  const tercerosIncluidos = Math.min(cantidadTerceros, maxTerceros);
  const totalAvanzan = fijosCount + tercerosIncluidos;
  const teamCount =
    slots.length > 0
      ? slots.filter((s) => s.type === "team").length
      : totalAvanzan;
  const matchCount = Math.floor(totalSlots / 2);

  return createPortal(
    <div
      className="te-bracket-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="te-bracket-title"
    >
      <div className="te-bracket-modal">
        <header className="te-bracket-modal__head">
          <div className="te-bracket-modal__head-copy">
            {step === "fase" ? (
              <>
                <p className="te-bracket-modal__eyebrow">
                  Fase de grupos completada
                </p>
                <h2 id="te-bracket-title" className="te-bracket-modal__title">
                  Configura la fase eliminatoria
                </h2>
                <p className="te-bracket-modal__meta">
                  {torneoNombre}
                  {totalAvanzan > 0
                    ? ` · ${totalAvanzan} parejas disponibles`
                    : null}
                </p>
                <p className="te-bracket-modal__subtitle">
                  Selecciona desde qué ronda comenzará el cuadro.
                </p>
              </>
            ) : (
              <>
                <p className="te-bracket-modal__eyebrow">{faseEyebrow(fase)}</p>
                <h2 id="te-bracket-title" className="te-bracket-modal__title">
                  Revisa los cruces
                </h2>
                <p className="te-bracket-modal__meta">
                  {teamCount} clasificados · {matchCount} partidos
                </p>
                <p className="te-bracket-modal__subtitle">
                  Puedes ajustar los cruces antes de comenzar la fase.
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            className="te-bracket-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        {loading && (
          <p className="te-bracket-modal__loading">Cargando datos…</p>
        )}

        {error && (
          <p className="te-bracket-modal__error" role="alert">
            {error}
          </p>
        )}

        {!loading && bundle && step === "fase" && (
          <>
            <div className="te-bracket-modal__body">
              <div className="te-bracket-step te-bracket-step--fase">
                <div
                  className="te-bracket-fase-options"
                  role="radiogroup"
                  aria-label="Fase eliminatoria"
                >
                  {FASE_OPCIONES.map((opt) => {
                    const selected = fase === opt.id;
                    const recommended = faseSugerida === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={`te-bracket-fase-option${
                          selected ? " te-bracket-fase-option--selected" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="te-bracket-fase"
                          value={opt.id}
                          checked={selected}
                          onChange={() => setFase(opt.id)}
                        />
                        <span
                          className="te-bracket-fase-option__radio"
                          aria-hidden
                        >
                          <span className="te-bracket-fase-option__radio-dot" />
                        </span>
                        <span className="te-bracket-fase-option__body">
                          <span className="te-bracket-fase-option__top">
                            <span className="te-bracket-fase-option__name">
                              {opt.shortLabel}
                            </span>
                            {recommended ? (
                              <span className="te-bracket-fase-option__badge">
                                Recomendado
                              </span>
                            ) : null}
                          </span>
                          <span className="te-bracket-fase-option__slots">
                            {BRACKET_FASE_SLOTS[opt.id]} plazas
                          </span>
                          {fasePreviews[opt.id] ? (
                            <span className="te-bracket-fase-option__desc">
                              {fasePreviews[opt.id]}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {!faseValidacion.ok && (
                  <p className="te-bracket-modal__warn">
                    {faseValidacion.error}
                  </p>
                )}

                {faseValidacion.ok && resumenClasificados && (
                  <div className="te-bracket-resumen">
                    <div className="te-bracket-resumen__advance">
                      <p className="te-bracket-resumen__advance-title">
                        {totalAvanzan} parejas avanzan
                      </p>
                      <p className="te-bracket-resumen__advance-breakdown">
                        <span className="te-bracket-resumen__chip">
                          {fijosCount} automáticos
                        </span>
                        {maxTerceros > 0 ? (
                          <>
                            <span
                              className="te-bracket-resumen__plus"
                              aria-hidden
                            >
                              +
                            </span>
                            <span className="te-bracket-resumen__chip te-bracket-resumen__chip--tercero">
                              {tercerosIncluidos} mejores terceros
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>

                    {maxTerceros > 0 && (
                      <div className="te-bracket-terceros-field">
                        <span
                          id="te-bracket-terceros-label"
                          className="te-bracket-terceros-field__label"
                        >
                          Mejores terceros
                        </span>
                        <div
                          className="te-bracket-stepper"
                          role="group"
                          aria-labelledby="te-bracket-terceros-label"
                        >
                          <button
                            type="button"
                            className="te-bracket-stepper__btn"
                            onClick={() => adjustTerceros(-1)}
                            disabled={cantidadTerceros <= 0}
                            aria-label="Disminuir mejores terceros"
                          >
                            −
                          </button>
                          <span
                            className="te-bracket-stepper__value"
                            aria-live="polite"
                          >
                            {cantidadTerceros}
                          </span>
                          <button
                            type="button"
                            className="te-bracket-stepper__btn"
                            onClick={() => adjustTerceros(1)}
                            disabled={cantidadTerceros >= maxTerceros}
                            aria-label="Aumentar mejores terceros"
                          >
                            +
                          </button>
                        </div>
                        <span className="te-bracket-terceros-field__hint">
                          Máximo {maxTerceros}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {faseValidacion.ok && (
                  <div className="te-bracket-third-place">
                    <span
                      id="te-bracket-third-place-label"
                      className="te-bracket-third-place__label"
                    >
                      Partido por 3.er lugar
                    </span>
                    <div
                      className="te-bracket-third-place__segmented"
                      role="radiogroup"
                      aria-labelledby="te-bracket-third-place-label"
                    >
                      <label
                        className={`te-bracket-third-place__option${
                          thirdPlaceMatchEnabled
                            ? " te-bracket-third-place__option--selected"
                            : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="te-bracket-third-place"
                          checked={thirdPlaceMatchEnabled}
                          onChange={() => setThirdPlaceMatchEnabled(true)}
                        />
                        Sí, jugarlo
                      </label>
                      <label
                        className={`te-bracket-third-place__option${
                          !thirdPlaceMatchEnabled
                            ? " te-bracket-third-place__option--selected"
                            : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="te-bracket-third-place"
                          checked={!thirdPlaceMatchEnabled}
                          onChange={() => setThirdPlaceMatchEnabled(false)}
                        />
                        No jugarlo
                      </label>
                    </div>
                    <p className="te-bracket-third-place__hint">
                      {thirdPlaceMatchEnabled
                        ? "Los perdedores de semifinal disputarán el 3.er lugar."
                        : "Los perdedores de semifinal terminarán como semifinalistas. No se generará otro partido."}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="te-bracket-modal__actions">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!faseValidacion.ok}
                onClick={rebuildBracket}
              >
                Continuar al cuadro →
              </Button>
            </div>
          </>
        )}

        {!loading && bundle && step === "bracket" && (
          <>
            <div className="te-bracket-modal__body">
              <div className="te-bracket-step te-bracket-step--bracket">
                <p className="te-bracket-resumen-line">
                  {resumenConfirmacion(
                    slots,
                    fase,
                    resolverResult ?? undefined
                  )}
                </p>

                {advertencias.length > 0 && (
                  <div className="te-bracket-warnings" role="status">
                    <p className="te-bracket-warnings__title">
                      Advertencias (mismo grupo en 1ª ronda)
                    </p>
                    <ul>
                      {advertencias.map((a) => (
                        <li key={`${a.cruceIndex}-${a.slotA}`}>
                          {a.mensaje}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="te-bracket-grid">
                  {Array.from({ length: totalSlots / 2 }, (_, cruceIdx) => {
                    const i = cruceIdx * 2;
                    const a = slots[i];
                    const b = slots[i + 1];
                    const clash = advertencias.some(
                      (w) => w.cruceIndex === cruceIdx
                    );
                    const matchLabel = String(cruceIdx + 1).padStart(2, "0");

                    return (
                      <div
                        key={`cruce-${cruceIdx}`}
                        className={`te-bracket-cruce${
                          clash ? " te-bracket-cruce--clash" : ""
                        }`}
                      >
                        <span className="te-bracket-cruce__label">
                          Partido {matchLabel}
                          {clash ? " · Mismo grupo" : ""}
                        </span>
                        <div className="te-bracket-cruce__pair">
                          <BracketSlotCard
                            slot={a}
                            index={i}
                            dragging={dragIndex === i}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                          />
                          <span className="te-bracket-cruce__vs">VS</span>
                          <BracketSlotCard
                            slot={b}
                            index={i + 1}
                            dragging={dragIndex === i + 1}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="te-bracket-modal__actions te-bracket-modal__actions--bracket">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("fase")}
              >
                ← Cambiar configuración
              </Button>
              <div className="te-bracket-modal__actions-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleRestablecer}
                >
                  Restablecer cruces
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={confirming}
                  loading={confirming}
                  onClick={() => void handleConfirmar()}
                >
                  Confirmar y comenzar eliminatoria →
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

function BracketSlotCard({
  slot,
  index,
  dragging,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  slot: BracketSlotEntry | undefined;
  index: number;
  dragging?: boolean;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (i: number) => void;
}) {
  if (!slot || slot.type === "bye") {
    return (
      <div
        className="te-bracket-slot te-bracket-slot--bye"
        onDragOver={onDragOver}
        onDrop={() => onDrop(index)}
      >
        <span className="te-bracket-slot__bye-label">BYE · pasa</span>
      </div>
    );
  }

  const q = slot.qualifier;
  const badgeClass = q.isMejorTercero
    ? "te-bracket-slot__badge te-bracket-slot__badge--tercero"
    : "te-bracket-slot__badge";

  return (
    <div
      className={`te-bracket-slot te-bracket-slot--team${
        dragging ? " te-bracket-slot--dragging" : ""
      }`}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(index)}
    >
      <div className="te-bracket-slot__meta">
        <span className={badgeClass}>{grupoBadgeLabel(q)}</span>
        <span className="te-bracket-slot__seed">#{q.seed}</span>
      </div>
      <span className="te-bracket-slot__name" title={q.parejaLabel}>
        {q.parejaLabel}
      </span>
    </div>
  );
}
