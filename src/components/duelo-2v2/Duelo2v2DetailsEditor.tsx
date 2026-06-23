import React, { useEffect, useState } from "react";
import {
  CANCHA_DEFAULT_VALUE,
  normalizeCanchaForSave,
} from "../../lib/torneoExpress/canchaDisplay";
import type { Duelo2v2 } from "../../lib/duelo2v2/types";
import {
  dueloCanchaDraftFromDuelo,
  dueloScheduleDraftFromDuelo,
  resolveDueloScheduleFromDraft,
} from "../../lib/duelo2v2/schedule";
import { updateDuelo2v2Details } from "../../services/duelo2v2Service";
import { Button } from "../ui";

interface Duelo2v2DetailsEditorProps {
  duelo: Duelo2v2;
  disabled?: boolean;
  onSaved: (duelo: Duelo2v2) => void;
  onError?: (message: string) => void;
}

export const Duelo2v2DetailsEditor: React.FC<Duelo2v2DetailsEditorProps> = ({
  duelo,
  disabled = false,
  onSaved,
  onError,
}) => {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState(duelo.nombre);
  const [cancha, setCancha] = useState(
    dueloCanchaDraftFromDuelo(duelo) || CANCHA_DEFAULT_VALUE
  );
  const [draftDate, setDraftDate] = useState("");
  const [draftTimeStart, setDraftTimeStart] = useState("");
  const [draftTimeEnd, setDraftTimeEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const schedule = dueloScheduleDraftFromDuelo(duelo);
    setNombre(duelo.nombre);
    setCancha(dueloCanchaDraftFromDuelo(duelo) || CANCHA_DEFAULT_VALUE);
    setDraftDate(schedule.date);
    setDraftTimeStart(schedule.timeStart);
    setDraftTimeEnd(schedule.timeEnd);
    setLocalError(null);
  }, [duelo]);

  const canSave =
    nombre.trim().length > 0 &&
    cancha.trim().length > 0 &&
    draftDate.trim().length > 0 &&
    draftTimeStart.trim().length > 0 &&
    draftTimeEnd.trim().length > 0 &&
    !disabled &&
    !busy;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    const schedule = resolveDueloScheduleFromDraft(
      draftDate,
      draftTimeStart,
      draftTimeEnd
    );
    if ("error" in schedule) {
      setLocalError(schedule.error);
      onError?.(schedule.error);
      return;
    }

    setBusy(true);
    setLocalError(null);
    try {
      const updated = await updateDuelo2v2Details(duelo.id, {
        nombre: nombre.trim(),
        cancha: normalizeCanchaForSave(cancha),
        programado_en: schedule.programado_en,
        programado_hasta: schedule.programado_hasta,
      });
      onSaved(updated);
      setOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudieron guardar los cambios";
      setLocalError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="duelo2v2-details-editor" aria-label="Editar encuentro">
      <div className="duelo2v2-details-editor__header">
        <h2 className="duelo2v2-details-editor__title">Datos del encuentro</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || busy}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cerrar" : "Editar"}
        </Button>
      </div>

      {open ? (
        <form className="duelo2v2-form duelo2v2-details-editor__form" onSubmit={(e) => void handleSave(e)}>
          <div className="duelo2v2-form__name-row">
            <label htmlFor={`duelo-edit-nombre-${duelo.id}`}>Nombre del encuentro</label>
            <input
              id={`duelo-edit-nombre-${duelo.id}`}
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>

          <div className="duelo2v2-form__schedule-row">
            <label className="duelo2v2-form__field">
              <span className="duelo2v2-form__field-label">Cancha</span>
              <input
                type="text"
                value={cancha}
                onChange={(e) => setCancha(e.target.value)}
                required
              />
            </label>
            <label className="duelo2v2-form__field">
              <span className="duelo2v2-form__field-label">Día</span>
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                required
              />
            </label>
            <label className="duelo2v2-form__field">
              <span className="duelo2v2-form__field-label">Hora inicio</span>
              <input
                type="time"
                value={draftTimeStart}
                onChange={(e) => setDraftTimeStart(e.target.value)}
                required
              />
            </label>
            <label className="duelo2v2-form__field">
              <span className="duelo2v2-form__field-label">Hora fin</span>
              <input
                type="time"
                value={draftTimeEnd}
                onChange={(e) => setDraftTimeEnd(e.target.value)}
                required
              />
            </label>
          </div>

          {localError ? <p className="duelo2v2-error">{localError}</p> : null}

          <div className="duelo2v2-details-editor__actions">
            <Button type="submit" variant="primary" size="sm" disabled={!canSave}>
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
};
