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
import {
  readDueloLugarPrefs,
  writeDueloLugarPrefs,
} from "../../lib/duelo2v2/dueloLugarPrefs";
import { updateDuelo2v2Details } from "../../services/duelo2v2Service";
import { useConvocatoriaOriginName } from "../../club-experience";
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
  const convocatoriaOrigin = useConvocatoriaOriginName();
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState(duelo.nombre);
  const [mostrarLugar, setMostrarLugar] = useState(true);
  const [lugar, setLugar] = useState("");
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
    const prefs = readDueloLugarPrefs(duelo.id);
    setNombre(duelo.nombre);
    setCancha(dueloCanchaDraftFromDuelo(duelo) || CANCHA_DEFAULT_VALUE);
    setDraftDate(schedule.date);
    setDraftTimeStart(schedule.timeStart);
    setDraftTimeEnd(schedule.timeEnd);
    const nextMostrar =
      duelo.mostrar_lugar != null
        ? duelo.mostrar_lugar !== false
        : prefs
          ? prefs.mostrarLugar !== false
          : true;
    setMostrarLugar(nextMostrar);
    setLugar(
      (duelo.lugar?.trim() ||
        prefs?.lugar ||
        convocatoriaOrigin ||
        "").trim()
    );
    setLocalError(null);
  }, [duelo, convocatoriaOrigin]);

  const canSave =
    nombre.trim().length > 0 &&
    (!mostrarLugar || lugar.trim().length > 0) &&
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
      const lugarTrim = lugar.trim();
      writeDueloLugarPrefs(duelo.id, {
        lugar: lugarTrim,
        mostrarLugar,
      });
      const updated = await updateDuelo2v2Details(duelo.id, {
        nombre: nombre.trim(),
        cancha: normalizeCanchaForSave(cancha),
        lugar: lugarTrim || null,
        mostrar_lugar: mostrarLugar,
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
        <form
          className="duelo2v2-form duelo2v2-details-editor__form"
          onSubmit={(e) => void handleSave(e)}
        >
          <div className="duelo2v2-form__name-row">
            <label htmlFor={`duelo-edit-nombre-${duelo.id}`}>
              Nombre del encuentro
            </label>
            <input
              id={`duelo-edit-nombre-${duelo.id}`}
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>

          <div className="duelo2v2-form__lugar-block">
            <label className="duelo2v2-form__toggle">
              <input
                type="checkbox"
                checked={mostrarLugar}
                onChange={(e) => setMostrarLugar(e.target.checked)}
              />
              <span>Incluir lugar en la convocatoria</span>
            </label>
            {mostrarLugar ? (
              <label className="duelo2v2-form__field">
                <span className="duelo2v2-form__field-label">Lugar</span>
                <input
                  type="text"
                  value={lugar}
                  onChange={(e) => setLugar(e.target.value)}
                  placeholder="Ej. Hack Pádel, Padelito…"
                  required
                />
              </label>
            ) : (
              <p className="duelo2v2-form__hint">
                Ideal si tu club siempre juega en la misma sede.
              </p>
            )}
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
