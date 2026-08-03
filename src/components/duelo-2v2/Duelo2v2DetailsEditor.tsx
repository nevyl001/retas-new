import React, { useEffect, useMemo, useState } from "react";
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
import {
  Duelo2v2ConfigFields,
  type Duelo2v2ConfigFieldValues,
} from "./Duelo2v2ConfigFields";

interface Duelo2v2DetailsEditorProps {
  duelo: Duelo2v2;
  disabled?: boolean;
  /** Siempre visible en el slot details (mismo formato que Reta / Americano). */
  inline?: boolean;
  /**
   * En juego: cerrado por defecto; se abre con dropdown para corregir
   * nombre/horario/sede sin ocupar la pantalla.
   */
  collapsible?: boolean;
  onSaved: (duelo: Duelo2v2) => void;
  onError?: (message: string) => void;
}

function valuesFromDuelo(
  duelo: Duelo2v2,
  convocatoriaOrigin: string
): Duelo2v2ConfigFieldValues {
  const schedule = dueloScheduleDraftFromDuelo(duelo);
  const prefs = readDueloLugarPrefs(duelo.id);
  const nextMostrar =
    duelo.mostrar_lugar != null
      ? duelo.mostrar_lugar !== false
      : prefs
        ? prefs.mostrarLugar !== false
        : true;
  return {
    nombre: duelo.nombre,
    categoria: (duelo.categoria?.trim() || prefs?.categoria || "").trim(),
    nivel: duelo.descripcion?.trim() || "",
    cancha: dueloCanchaDraftFromDuelo(duelo) || CANCHA_DEFAULT_VALUE,
    draftDate: schedule.date,
    draftTimeStart: schedule.timeStart,
    draftTimeEnd: schedule.timeEnd,
    durationMinutes: schedule.durationMinutes,
    mostrarLugar: nextMostrar,
    lugar: (
      duelo.lugar?.trim() ||
      prefs?.lugar ||
      convocatoriaOrigin ||
      ""
    ).trim(),
  };
}

export const Duelo2v2DetailsEditor: React.FC<Duelo2v2DetailsEditorProps> = ({
  duelo,
  disabled = false,
  inline = false,
  collapsible = false,
  onSaved,
  onError,
}) => {
  const convocatoriaOrigin = useConvocatoriaOriginName();
  const [open, setOpen] = useState(() => inline && !collapsible);
  const [values, setValues] = useState<Duelo2v2ConfigFieldValues>(() =>
    valuesFromDuelo(duelo, convocatoriaOrigin)
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(values));
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const next = valuesFromDuelo(duelo, convocatoriaOrigin);
    setValues(next);
    setBaseline(JSON.stringify(next));
    setLocalError(null);
  }, [duelo, convocatoriaOrigin]);

  useEffect(() => {
    if (collapsible) setOpen(false);
    else if (inline) setOpen(true);
  }, [collapsible, inline, duelo.id]);

  const dirty = useMemo(
    () => JSON.stringify(values) !== baseline,
    [values, baseline]
  );

  const canSave =
    dirty &&
    values.nombre.trim().length > 0 &&
    (!values.mostrarLugar || values.lugar.trim().length > 0) &&
    values.cancha.trim().length > 0 &&
    values.draftDate.trim().length > 0 &&
    values.draftTimeStart.trim().length > 0 &&
    values.draftTimeEnd.trim().length > 0 &&
    !disabled &&
    !busy;

  const handleDiscard = () => {
    setValues(JSON.parse(baseline) as Duelo2v2ConfigFieldValues);
    setLocalError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    const schedule = resolveDueloScheduleFromDraft(
      values.draftDate,
      values.draftTimeStart,
      values.draftTimeEnd,
      values.durationMinutes
    );
    if ("error" in schedule) {
      setLocalError(schedule.error);
      onError?.(schedule.error);
      return;
    }

    setBusy(true);
    setLocalError(null);
    try {
      const lugarTrim = values.lugar.trim();
      writeDueloLugarPrefs(duelo.id, {
        lugar: lugarTrim,
        mostrarLugar: values.mostrarLugar,
        categoria: values.categoria.trim(),
      });
      const updated = await updateDuelo2v2Details(duelo.id, {
        nombre: values.nombre.trim(),
        descripcion: values.nivel.trim() || null,
        categoria: values.categoria.trim() || null,
        cancha: normalizeCanchaForSave(values.cancha),
        lugar: lugarTrim || null,
        mostrar_lugar: values.mostrarLugar,
        programado_en: schedule.programado_en,
        programado_hasta: schedule.programado_hasta,
      });
      onSaved(updated);
      if (!inline) setOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudieron guardar los cambios";
      setLocalError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  const formId = `duelo-edit-form-${duelo.id}`;
  const panelId = `${formId}-panel`;
  const useDropdown = inline && collapsible;

  return (
    <section
      className={`duelo2v2-details-editor${inline ? " duelo2v2-details-editor--inline reta-config-panel reta-config-panel--inline" : ""}${useDropdown ? " duelo2v2-details-editor--collapsible" : ""}${useDropdown && open ? " is-open" : ""}`}
      aria-label="Editar encuentro"
    >
      {useDropdown ? (
        <button
          type="button"
          className="duelo2v2-details-editor__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="duelo2v2-details-editor__toggle-chevron" aria-hidden />
          <span className="duelo2v2-details-editor__toggle-copy">
            <span className="duelo2v2-details-editor__toggle-title">
              Detalles de la reta
            </span>
            <span className="duelo2v2-details-editor__toggle-subtitle">
              {open
                ? "Nombre, horario, sede y cancha"
                : "Editar si te equivocaste en algo"}
            </span>
          </span>
          <span className="duelo2v2-details-editor__toggle-action">
            {open ? "Cerrar" : "Editar"}
          </span>
        </button>
      ) : inline ? (
        <header className="reta-config-panel__toolbar">
          <div className="reta-config-panel__toolbar-copy">
            <h2 className="reta-config-panel__title">Detalles de la reta</h2>
            <p className="reta-config-panel__subtitle">
              Nombre, horario, sede y cancha.
            </p>
          </div>
          <div className="reta-config-panel__actions">
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || disabled}
                onClick={handleDiscard}
              >
                Descartar
              </Button>
            ) : null}
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!canSave}
              loading={busy}
              onClick={() => {
                const form = document.getElementById(
                  formId
                ) as HTMLFormElement | null;
                form?.requestSubmit();
              }}
            >
              Guardar
            </Button>
          </div>
        </header>
      ) : (
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
      )}

      {open ? (
        <div id={useDropdown ? panelId : undefined}>
          {useDropdown ? (
            <header className="reta-config-panel__toolbar duelo2v2-details-editor__toolbar--nested">
              <div className="reta-config-panel__toolbar-copy">
                <p className="reta-config-panel__subtitle">
                  Corrige y guarda los cambios.
                </p>
              </div>
              <div className="reta-config-panel__actions">
                {dirty ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy || disabled}
                    onClick={handleDiscard}
                  >
                    Descartar
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!canSave}
                  loading={busy}
                  onClick={() => {
                    const form = document.getElementById(
                      formId
                    ) as HTMLFormElement | null;
                    form?.requestSubmit();
                  }}
                >
                  Guardar
                </Button>
              </div>
            </header>
          ) : null}
          <form
            id={formId}
            className="duelo2v2-details-editor__form"
            onSubmit={(e) => void handleSave(e)}
          >
            <Duelo2v2ConfigFields
              idPrefix={`duelo-edit-${duelo.id}`}
              values={values}
              onChange={setValues}
              disabled={disabled || busy}
            />

            {localError ? (
              <p className="reta-config-panel__feedback reta-config-panel__feedback--error">
                {localError}
              </p>
            ) : null}

            {inline ? null : (
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
            )}
          </form>
        </div>
      ) : null}
    </section>
  );
};
