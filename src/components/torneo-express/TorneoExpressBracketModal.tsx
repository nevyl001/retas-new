import React, { useCallback, useEffect, useMemo, useState } from "react";
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

const FASE_OPCIONES: { id: BracketFase; label: string }[] = [
  { id: "octavos", label: "Octavos de final" },
  { id: "cuartos", label: "Cuartos de final" },
  { id: "semifinal", label: "Semifinal directa" },
];

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
  const [slots, setSlots] = useState<BracketSlotEntry[]>([]);
  const [autoSlots, setAutoSlots] = useState<BracketSlotEntry[]>([]);
  const [resolverResult, setResolverResult] = useState<BracketResolverResult | null>(
    null
  );
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
    void loadBundle();
  }, [open, loadBundle]);

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
    setSlots(autoSlots.map((s) => (s.type === "team" ? { ...s, qualifier: { ...s.qualifier } } : { type: "bye" })));
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
      await confirmarFaseEliminatoria(torneoId, fase, slots);
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

  if (!open) return null;

  const totalSlots = slots.length > 0 ? slots.length : BRACKET_FASE_SLOTS[fase];

  return (
    <div
      className="te-bracket-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="te-bracket-title"
    >
      <div className="te-bracket-modal">
        <header className="te-bracket-modal__head">
          <div>
            <h2 id="te-bracket-title" className="te-bracket-modal__title">
              Siguiente fase — {torneoNombre}
            </h2>
            <p className="te-bracket-modal__subtitle">
              Fase de grupos finalizada. Elige el formato eliminatorio y confirma
              el cuadro.
            </p>
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

        {loading && <p className="te-bracket-modal__loading">Cargando datos…</p>}

        {error && (
          <p className="te-bracket-modal__error" role="alert">
            {error}
          </p>
        )}

        {!loading && bundle && step === "fase" && (
          <div className="te-bracket-step te-bracket-step--fase">
            <h3 className="te-bracket-step__heading">
              ¿A qué fase avanza este torneo?
            </h3>

            <div className="te-bracket-fase-options" role="radiogroup">
              {FASE_OPCIONES.map((opt) => (
                <label key={opt.id} className="te-bracket-fase-option">
                  <input
                    type="radio"
                    name="te-bracket-fase"
                    value={opt.id}
                    checked={fase === opt.id}
                    onChange={() => setFase(opt.id)}
                  />
                  <span>{opt.label}</span>
                  <span className="te-bracket-fase-option__slots">
                    {BRACKET_FASE_SLOTS[opt.id]} plazas
                  </span>
                  {fasePreviews[opt.id] && (
                    <span className="te-bracket-fase-option__desc">
                      {fasePreviews[opt.id]}
                    </span>
                  )}
                </label>
              ))}
            </div>

            {!faseValidacion.ok && (
              <p className="te-bracket-modal__warn">{faseValidacion.error}</p>
            )}

            {faseValidacion.ok && resumenClasificados && (
              <div className="te-bracket-resumen">
                <p>
                  <strong>{resumenClasificados.fijos.length}</strong> clasificados
                  fijos (1° y 2° por grupo)
                  {maxTerceros > 0 ? (
                    <>
                      {" "}
                      · hasta <strong>{maxTerceros}</strong> mejores terceros
                    </>
                  ) : null}
                </p>
                {maxTerceros > 0 && (
                  <label className="te-bracket-terceros-field">
                    <span>Mejores terceros a incluir</span>
                    <input
                      type="number"
                      min={0}
                      max={maxTerceros}
                      value={cantidadTerceros}
                      onChange={(e) =>
                        setCantidadTerceros(
                          Math.max(
                            0,
                            Math.min(maxTerceros, Number(e.target.value) || 0)
                          )
                        )
                      }
                    />
                  </label>
                )}
              </div>
            )}

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
          </div>
        )}

        {!loading && bundle && step === "bracket" && (
          <div className="te-bracket-step te-bracket-step--bracket">
            <p className="te-bracket-resumen-line">
              {resumenConfirmacion(slots, fase, resolverResult ?? undefined)}
            </p>

            {advertencias.length > 0 && (
              <div className="te-bracket-warnings" role="status">
                <p className="te-bracket-warnings__title">
                  Advertencias (mismo grupo en 1ª ronda)
                </p>
                <ul>
                  {advertencias.map((a) => (
                    <li key={`${a.cruceIndex}-${a.slotA}`}>{a.mensaje}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="te-bracket-grid">
              {Array.from({ length: totalSlots / 2 }, (_, cruceIdx) => {
                const i = cruceIdx * 2;
                const a = slots[i];
                const b = slots[i + 1];
                const clash = advertencias.some((w) => w.cruceIndex === cruceIdx);

                return (
                  <div
                    key={`cruce-${cruceIdx}`}
                    className={`te-bracket-cruce${clash ? " te-bracket-cruce--clash" : ""}`}
                  >
                    <span className="te-bracket-cruce__label">
                      Cruce {cruceIdx + 1}
                      {clash ? " · ⚠ Mismo grupo" : ""}
                    </span>
                    <div className="te-bracket-cruce__pair">
                      <BracketSlotCard
                        slot={a}
                        index={i}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                      />
                      <span className="te-bracket-cruce__vs">vs</span>
                      <BracketSlotCard
                        slot={b}
                        index={i + 1}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="te-bracket-modal__actions te-bracket-modal__actions--bracket">
              <Button type="button" variant="ghost" onClick={() => setStep("fase")}>
                ← Cambiar fase
              </Button>
              <Button type="button" variant="secondary" onClick={handleRestablecer}>
                Restablecer automático
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={confirming}
                loading={confirming}
                onClick={() => void handleConfirmar()}
              >
                Confirmar bracket y comenzar fase
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function BracketSlotCard({
  slot,
  index,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  slot: BracketSlotEntry | undefined;
  index: number;
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
        <span>BYE — pasa directo</span>
      </div>
    );
  }

  const q = slot.qualifier;
  const badgeClass = q.isMejorTercero
    ? "te-bracket-slot__badge te-bracket-slot__badge--tercero"
    : "te-bracket-slot__badge";

  return (
    <div
      className="te-bracket-slot te-bracket-slot--team"
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(index)}
    >
      <span className={badgeClass}>{grupoBadgeLabel(q)}</span>
      <span className="te-bracket-slot__seed">#{q.seed}</span>
      <span className="te-bracket-slot__name">{q.parejaLabel}</span>
    </div>
  );
}
