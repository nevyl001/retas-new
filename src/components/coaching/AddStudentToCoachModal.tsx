import React, { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { TablerIcon } from "../ui/TablerIcon";
import {
  lookupStudentByRivieraId,
  assignStudentToClubCoach,
  generateCoachingIdempotencyKey,
} from "../../lib/coaching/coachingApi";
import type {
  CoachingCoach,
  StudentLookupResult,
} from "../../lib/coaching/types";
import { JUGADOR_CATEGORIA_LABELS } from "../../lib/rivieraJugadores/constants";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";
import { normalizeRivieraIdInput } from "../../lib/rivieraJugadores/playerMembership";

interface AddStudentToCoachModalProps {
  open: boolean;
  onClose: () => void;
  organizadorId: string;
  coaches: CoachingCoach[];
  defaultCoachId?: string | null;
  onSuccess: (studentName: string, coachName: string, classes: number) => void;
}

export const AddStudentToCoachModal: React.FC<AddStudentToCoachModalProps> = ({
  open,
  onClose,
  organizadorId,
  coaches,
  defaultCoachId,
  onSuccess,
}) => {
  const activeCoaches = coaches.filter(
    (c) => c.membershipStatus === "ACTIVE"
  );

  const [rivieraIdInput, setRivieraIdInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [verifiedStudent, setVerifiedStudent] =
    useState<StudentLookupResult | null>(null);

  const [selectedCoachId, setSelectedCoachId] = useState<string>("");
  const [initialClasses, setInitialClasses] = useState<number>(10);
  const [reference, setReference] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sincronizar coach por defecto al abrir
  useEffect(() => {
    if (open) {
      if (
        defaultCoachId &&
        activeCoaches.some((c) => c.id === defaultCoachId)
      ) {
        setSelectedCoachId(defaultCoachId);
      } else if (activeCoaches.length > 0) {
        setSelectedCoachId(activeCoaches[0].id);
      }
      setRivieraIdInput("");
      setVerifiedStudent(null);
      setSearchError(null);
      setSaveError(null);
      setInitialClasses(10);
      setReference("");
    }
  }, [open, defaultCoachId, activeCoaches]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const norm = normalizeRivieraIdInput(rivieraIdInput);
    if (!norm) {
      setSearchError(
        "Ingresa un Riviera ID válido con formato RIV-######## (ej. RIV-00000278)."
      );
      setVerifiedStudent(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    try {
      const student = await lookupStudentByRivieraId(norm);
      setVerifiedStudent(student);
    } catch (err) {
      setVerifiedStudent(null);
      setSearchError(
        err instanceof Error
          ? err.message
          : "No se encontró ningún jugador registrado con ese Riviera ID."
      );
    } finally {
      setSearching(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifiedStudent) {
      setSaveError("Primero debes buscar y verificar al alumno por su Riviera ID.");
      return;
    }
    if (!selectedCoachId) {
      setSaveError("Selecciona el entrenador al que asignarás el alumno.");
      return;
    }
    if (initialClasses < 0) {
      setSaveError("La cantidad de clases no puede ser negativa.");
      return;
    }

    const targetCoach = activeCoaches.find((c) => c.id === selectedCoachId);
    if (!targetCoach) {
      setSaveError("El entrenador seleccionado no está activo en este club.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const idempotencyKey = generateCoachingIdempotencyKey("assign-student");
      const res = await assignStudentToClubCoach(
        organizadorId,
        selectedCoachId,
        verifiedStudent.rivieraId,
        initialClasses,
        reference.trim() || undefined,
        idempotencyKey
      );

      onSuccess(
        verifiedStudent.nombre,
        targetCoach.nombre,
        res.initialClasses
      );
      onClose();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Error al asignar el alumno al entrenador."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agregar Alumno a Entrenador"
      size="md"
    >
      <div className="coaching-modal-form" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <p className="coaching-modal-desc" style={{ margin: 0, fontSize: "0.88rem", color: "var(--ro-text-secondary, #e0e0e0)" }}>
          Busca al jugador mediante su <strong>Riviera ID oficial</strong> para verificar su identidad deportiva y asignarlo al entrenador con su paquete de clases.
        </p>

        {/* 1. Búsqueda por Riviera ID */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="student-riviera-id">
            Riviera ID del Alumno *
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              id="student-riviera-id"
              type="text"
              className="coaching-input"
              placeholder="ej. RIV-00000278"
              value={rivieraIdInput}
              onChange={(e) => {
                setRivieraIdInput(e.target.value.toUpperCase());
                if (verifiedStudent) setVerifiedStudent(null);
                if (searchError) setSearchError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSearch();
                }
              }}
              style={{ fontFamily: "monospace", letterSpacing: "0.05em", flex: 1 }}
              disabled={searching || saving}
            />
            <button
              type="button"
              className="coaching-btn coaching-btn--secondary"
              onClick={() => void handleSearch()}
              disabled={searching || saving || !rivieraIdInput.trim()}
              style={{ whiteSpace: "nowrap", padding: "0.5rem 1rem" }}
            >
              {searching ? (
                <>
                  <TablerIcon name="loader" size={16} className="coaching-spin" />
                  Buscando…
                </>
              ) : (
                <>
                  <TablerIcon name="search" size={16} />
                  Verificar
                </>
              )}
            </button>
          </div>
          {searchError && (
            <p style={{ color: "#f87171", fontSize: "0.82rem", margin: "0.4rem 0 0" }}>
              {searchError}
            </p>
          )}
        </div>

        {/* 2. Tarjeta de Alumno Verificado */}
        {verifiedStudent && (
          <div
            style={{
              background: "rgba(34, 197, 94, 0.08)",
              border: "1px solid rgba(34, 197, 94, 0.25)",
              borderRadius: "10px",
              padding: "0.85rem 1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.85rem",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: "rgba(255, 255, 255, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.2rem",
                fontWeight: 700,
                color: "#fff",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {verifiedStudent.fotoUrl ? (
                <img
                  src={verifiedStudent.fotoUrl}
                  alt={verifiedStudent.nombre}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                verifiedStudent.nombre.slice(0, 1).toUpperCase()
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <strong style={{ color: "#fff", fontSize: "0.95rem" }}>
                  {verifiedStudent.nombre}
                </strong>
                <span className="coaching-badge coaching-badge--primary" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                  {verifiedStudent.rivieraId}
                </span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--ro-text-muted, #94a3b8)", marginTop: "0.15rem" }}>
                <span>
                  {verifiedStudent.categoria
                    ? JUGADOR_CATEGORIA_LABELS[verifiedStudent.categoria as RivieraJugadorCategoria] || verifiedStudent.categoria
                    : "Sin categoría"}
                </span>
                {verifiedStudent.clubNombre ? <span> • Club: {verifiedStudent.clubNombre}</span> : null}
              </div>
            </div>

            <span style={{ color: "#4ade80", display: "inline-flex" }} title="Identidad confirmada">
              <TablerIcon name="circle-check" size={22} />
            </span>
          </div>
        )}

        {/* 3. Selección del Entrenador */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="target-coach-select">
            Entrenador a Asignar *
          </label>
          {activeCoaches.length === 0 ? (
            <p style={{ color: "#f87171", fontSize: "0.85rem", margin: 0 }}>
              No tienes entrenadores activos en el club. Activa o incorpora un entrenador primero.
            </p>
          ) : (
            <select
              id="target-coach-select"
              className="coaching-input"
              value={selectedCoachId}
              onChange={(e) => setSelectedCoachId(e.target.value)}
              disabled={saving}
            >
              {activeCoaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.coachCode})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 4. Clases Iniciales Contratadas */}
        <div className="coaching-form-group">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <label className="coaching-label" htmlFor="initial-classes-input" style={{ margin: 0 }}>
              Clases Contratadas (Saldo Inicial) *
            </label>
            <span style={{ fontSize: "0.78rem", color: "var(--ro-text-muted, #94a3b8)" }}>
              {initialClasses} {initialClasses === 1 ? "clase" : "clases"}
            </span>
          </div>
          <input
            id="initial-classes-input"
            type="number"
            min={0}
            max={500}
            className="coaching-input"
            value={initialClasses}
            onChange={(e) => setInitialClasses(Math.max(0, parseInt(e.target.value, 10) || 0))}
            disabled={saving}
          />
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
            {[5, 10, 15, 20].map((num) => (
              <button
                key={num}
                type="button"
                className="coaching-chip"
                onClick={() => setInitialClasses(num)}
                style={{
                  cursor: "pointer",
                  padding: "0.2rem 0.6rem",
                  fontSize: "0.78rem",
                  background: initialClasses === num ? "var(--ro-brand, #38bdf8)" : "rgba(255,255,255,0.06)",
                  color: initialClasses === num ? "#000" : "#fff",
                  fontWeight: initialClasses === num ? 700 : 500,
                  border: "none",
                  borderRadius: "4px",
                }}
              >
                {num} clases
              </button>
            ))}
          </div>
        </div>

        {/* 5. Referencia o Nota Administrativa */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="assign-reference-input">
            Referencia o Nota Interna (Opcional)
          </label>
          <input
            id="assign-reference-input"
            type="text"
            className="coaching-input"
            placeholder="ej. Paquete contratado en recepción / Folio #1234"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={saving}
          />
        </div>

        {saveError && (
          <div
            style={{
              padding: "0.75rem",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "8px",
              color: "#fca5a5",
              fontSize: "0.85rem",
            }}
          >
            {saveError}
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button
            type="button"
            className="coaching-btn coaching-btn--secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="coaching-btn coaching-btn--primary"
            onClick={handleAssign}
            disabled={saving || !verifiedStudent || !selectedCoachId || activeCoaches.length === 0}
          >
            {saving ? (
              <>
                <TablerIcon name="loader" size={16} className="coaching-spin" />
                Asignando…
              </>
            ) : (
              <>
                <TablerIcon name="user-plus" size={16} />
                Asignar al Entrenador
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

