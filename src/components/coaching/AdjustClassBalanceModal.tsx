import React, { useState, useEffect, useRef } from "react";
import { Modal } from "../ui/Modal";
import { TablerIcon } from "../ui/TablerIcon";
import {
  adjustCoachStudentClasses,
  generateCoachingIdempotencyKey,
} from "../../lib/coaching/coachingApi";

export interface AdjustClassBalanceModalProps {
  open: boolean;
  onClose: () => void;
  organizadorId: string;
  coachId: string;
  coachNombre: string;
  studentId: string;
  studentNombre: string;
  rivieraId?: string;
  currentBalance: number;
  referenceLedgerId?: string | null;
  onSuccess: (newBalance: number, delta: number, previousBalance?: number) => void;
}

const PRESET_REASONS = [
  "Corrección por error de captura al abonar clases",
  "Corrección de abono duplicado",
  "Devolución o baja de paquete acordada con el alumno",
  "Bonificación autorizada por la administración del club",
  "Cancelación de paquete por falta de pago",
  "Otro motivo específico",
];

export const AdjustClassBalanceModal: React.FC<AdjustClassBalanceModalProps> = ({
  open,
  onClose,
  organizadorId,
  coachId,
  coachNombre,
  studentId,
  studentNombre,
  rivieraId,
  currentBalance,
  referenceLedgerId,
  onSuccess,
}) => {
  const [mode, setMode] = useState<"target" | "delta">("target");
  const [targetBalanceInput, setTargetBalanceInput] = useState<string>("");
  const [deltaInput, setDeltaInput] = useState<string>("");
  const [selectedPreset, setSelectedPreset] = useState<string>(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverCurrentBalance, setServerCurrentBalance] = useState<number>(currentBalance);

  const wasOpenRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  const lastParamSignatureRef = useRef<string>("");

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setError(null);
      setMode("target");
      setServerCurrentBalance(currentBalance);
      setTargetBalanceInput(String(Math.max(0, currentBalance)));
      setDeltaInput("0");
      setSelectedPreset(PRESET_REASONS[0]);
      setCustomReason("");
      idempotencyKeyRef.current = generateCoachingIdempotencyKey("adjust");
      lastParamSignatureRef.current = "";
    }
    wasOpenRef.current = open;
  }, [open, currentBalance]);

  // Cálculo de delta y saldo final según el modo
  const effectiveCurrent = serverCurrentBalance;
  let computedDelta = 0;
  let computedNewBalance = effectiveCurrent;

  if (mode === "target") {
    const parsedTarget = parseInt(targetBalanceInput, 10);
    if (!isNaN(parsedTarget)) {
      computedNewBalance = parsedTarget;
      computedDelta = parsedTarget - effectiveCurrent;
    }
  } else {
    const parsedDelta = parseInt(deltaInput, 10);
    if (!isNaN(parsedDelta)) {
      computedDelta = parsedDelta;
      computedNewBalance = effectiveCurrent + parsedDelta;
    }
  }

  // Si los parámetros del ajuste cambian, regenerar la clave de idempotencia
  // para que una corrección con valores distintos no choque, pero mantener la
  // misma clave durante reintentos por pérdida de conexión.
  const currentSignature = `${mode}:${computedDelta}:${selectedPreset}:${customReason.trim()}`;
  if (open && lastParamSignatureRef.current !== currentSignature) {
    lastParamSignatureRef.current = currentSignature;
    idempotencyKeyRef.current = generateCoachingIdempotencyKey("adjust");
  }

  const isNegativeResult = computedNewBalance < 0;
  const isZeroDelta = computedDelta === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNegativeResult) {
      setError("El saldo resultante no puede ser negativo (mínimo 0 clases).");
      return;
    }
    if (isZeroDelta) {
      setError("El nuevo saldo es idéntico al actual. Ingresa una cantidad diferente.");
      return;
    }

    const finalReason =
      selectedPreset === "Otro motivo específico"
        ? customReason.trim()
        : customReason.trim()
        ? `${selectedPreset} — ${customReason.trim()}`
        : selectedPreset;

    if (!finalReason) {
      setError("Debes especificar el motivo del ajuste para la bitácora administrativa.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await adjustCoachStudentClasses(
        organizadorId,
        coachId,
        studentId,
        computedDelta,
        finalReason,
        referenceLedgerId || null,
        idempotencyKeyRef.current,
        effectiveCurrent
      );

      const resolvedBalance = res.newBalance ?? computedNewBalance;
      const prevBalance = res.previousBalance ?? effectiveCurrent;
      onSuccess(resolvedBalance, computedDelta, prevBalance);
      onClose();
    } catch (err: any) {
      console.error("[coaching] error submitting balance adjustment:", err);
      // Si el servidor detectó que el saldo cambió concurrentemente
      if (err?.currentBalance != null && typeof err.currentBalance === "number") {
        setServerCurrentBalance(err.currentBalance);
        setError(
          `El saldo del alumno cambió concurrentemente en el club (ahora es ${err.currentBalance} clases). Hemos actualizado la vista previa. Por favor verifica y confirma nuevamente.`
        );
      } else {
        setError(err?.message || "No se pudo realizar el ajuste de saldo.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Ajustar Saldo de Clases">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* Contexto del alumno y coach */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "10px",
            padding: "0.85rem 1rem",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
          }}
        >
          <div>
            <span style={{ fontSize: "0.72rem", color: "var(--ro-text-muted, #94a3b8)", textTransform: "uppercase", fontWeight: 600 }}>
              Alumno
            </span>
            <div style={{ fontWeight: 600, color: "var(--ro-text-main, #f8fafc)", fontSize: "0.95rem" }}>
              {studentNombre}
            </div>
            {rivieraId && (
              <span style={{ fontSize: "0.75rem", color: "var(--ro-primary, #10b981)", fontFamily: "monospace" }}>
                {rivieraId}
              </span>
            )}
          </div>
          <div>
            <span style={{ fontSize: "0.72rem", color: "var(--ro-text-muted, #94a3b8)", textTransform: "uppercase", fontWeight: 600 }}>
              Entrenador
            </span>
            <div style={{ fontWeight: 600, color: "var(--ro-text-main, #f8fafc)", fontSize: "0.95rem" }}>
              {coachNombre}
            </div>
          </div>
        </div>

        {/* Resumen del Saldo Actual */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            background: "rgba(16, 185, 129, 0.08)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            borderRadius: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <TablerIcon name="wallet" size={18} style={{ color: "var(--ro-primary, #10b981)" }} />
            <span style={{ fontSize: "0.88rem", color: "var(--ro-text-main, #f8fafc)" }}>
              Saldo disponible actual:
            </span>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--ro-primary, #10b981)" }}>
            {effectiveCurrent} {effectiveCurrent === 1 ? "clase" : "clases"}
          </span>
        </div>

        {/* Selector de modo */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => setMode("target")}
            style={{
              flex: 1,
              padding: "0.6rem 0.75rem",
              borderRadius: "8px",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              border: mode === "target" ? "1px solid var(--ro-primary, #10b981)" : "1px solid rgba(255,255,255,0.1)",
              background: mode === "target" ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.02)",
              color: mode === "target" ? "var(--ro-primary, #10b981)" : "var(--ro-text-muted, #94a3b8)",
              transition: "all 0.15s ease",
            }}
          >
            Fijar Saldo Correcto
          </button>
          <button
            type="button"
            onClick={() => setMode("delta")}
            style={{
              flex: 1,
              padding: "0.6rem 0.75rem",
              borderRadius: "8px",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              border: mode === "delta" ? "1px solid var(--ro-primary, #10b981)" : "1px solid rgba(255,255,255,0.1)",
              background: mode === "delta" ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.02)",
              color: mode === "delta" ? "var(--ro-primary, #10b981)" : "var(--ro-text-muted, #94a3b8)",
              transition: "all 0.15s ease",
            }}
          >
            Sumar / Restar Clases
          </button>
        </div>

        {/* Inputs numéricos según modo */}
        {mode === "target" ? (
          <div className="coaching-form-group" style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label className="coaching-label" htmlFor="target-balance-input" style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--ro-text-main, #f8fafc)" }}>
              ¿Cuál debe ser el saldo real correcto? *
            </label>
            <input
              id="target-balance-input"
              type="number"
              min="0"
              step="1"
              className="coaching-input"
              value={targetBalanceInput}
              onChange={(e) => setTargetBalanceInput(e.target.value)}
              placeholder="ej. 10"
              disabled={saving}
              required
              autoFocus
            />
            <span style={{ fontSize: "0.78rem", color: "var(--ro-text-muted, #94a3b8)" }}>
              Ingresa la cantidad exacta que el alumno debería tener actualmente.
            </span>
          </div>
        ) : (
          <div className="coaching-form-group" style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label className="coaching-label" htmlFor="delta-balance-input" style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--ro-text-main, #f8fafc)" }}>
              Ajuste de clases (+ sumar, - restar) *
            </label>
            <input
              id="delta-balance-input"
              type="number"
              step="1"
              className="coaching-input"
              value={deltaInput}
              onChange={(e) => setDeltaInput(e.target.value)}
              placeholder="ej. -9 o +5"
              disabled={saving}
              required
              autoFocus
            />
            <span style={{ fontSize: "0.78rem", color: "var(--ro-text-muted, #94a3b8)" }}>
              Usa un número positivo para añadir clases o negativo para descontar por error.
            </span>
          </div>
        )}

        {/* Vista previa en vivo del ajuste */}
        <div
          style={{
            padding: "0.85rem 1rem",
            background: isNegativeResult
              ? "rgba(239, 68, 68, 0.1)"
              : isZeroDelta
              ? "rgba(255, 255, 255, 0.04)"
              : "rgba(59, 130, 246, 0.1)",
            border: `1px solid ${
              isNegativeResult
                ? "rgba(239, 68, 68, 0.3)"
                : isZeroDelta
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(59, 130, 246, 0.3)"
            }`,
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--ro-text-muted, #94a3b8)", textTransform: "uppercase", fontWeight: 600 }}>
              Previsualización
            </div>
            <div style={{ fontSize: "0.92rem", color: "var(--ro-text-main, #f8fafc)", marginTop: "0.2rem" }}>
              {effectiveCurrent} {computedDelta >= 0 ? `+ ${computedDelta}` : `- ${Math.abs(computedDelta)}`} ={" "}
              <strong style={{ color: "var(--ro-text-main, #fff)" }}>{computedNewBalance} clases</strong>
            </div>
          </div>
          <div
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "6px",
              fontSize: "0.88rem",
              fontWeight: 700,
              background: isNegativeResult
                ? "rgba(239, 68, 68, 0.2)"
                : computedDelta > 0
                ? "rgba(16, 185, 129, 0.2)"
                : computedDelta < 0
                ? "rgba(245, 158, 11, 0.2)"
                : "rgba(255, 255, 255, 0.1)",
              color: isNegativeResult
                ? "#fca5a5"
                : computedDelta > 0
                ? "#34d399"
                : computedDelta < 0
                ? "#fbbf24"
                : "#94a3b8",
            }}
          >
            {computedDelta > 0 ? `+${computedDelta}` : `${computedDelta}`}
          </div>
        </div>

        {/* Motivo Obligatorio */}
        <div className="coaching-form-group" style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <label className="coaching-label" htmlFor="adjust-reason-preset" style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--ro-text-main, #f8fafc)" }}>
            Motivo de corrección (Auditable) *
          </label>
          <select
            id="adjust-reason-preset"
            className="coaching-input"
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            disabled={saving}
          >
            {PRESET_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </div>

        {/* Detalle adicional con textarea */}
        <div className="coaching-form-group" style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <label className="coaching-label" htmlFor="adjust-reason-custom" style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--ro-text-main, #f8fafc)" }}>
            Detalle adicional / Referencia (Opcional)
          </label>
          <textarea
            id="adjust-reason-custom"
            rows={2}
            className="coaching-input"
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
            placeholder="ej. Se registraron 19 clases en lugar de 10 por error al abonar paquete"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            disabled={saving}
          />
        </div>

        {referenceLedgerId && (
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--ro-text-muted, #94a3b8)" }}>
            * Este ajuste inmutable quedará vinculado al movimiento original en la bitácora contable.
          </p>
        )}

        {error && (
          <div
            style={{
              padding: "0.85rem",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "8px",
              color: "#fca5a5",
              fontSize: "0.85rem",
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}

        {/* Botones */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button
            type="button"
            className="coaching-btn-ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="coaching-btn-primary"
            disabled={saving || isNegativeResult || isZeroDelta}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              opacity: saving || isNegativeResult || isZeroDelta ? 0.6 : 1,
            }}
          >
            {saving ? (
              <>
                <TablerIcon name="loader" size={16} className="spin" /> Guardando ajuste...
              </>
            ) : (
              <>
                <TablerIcon name="check" size={16} /> Confirmar Ajuste ({computedDelta >= 0 ? `+${computedDelta}` : computedDelta})
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
