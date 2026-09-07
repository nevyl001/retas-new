import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Tournament, Match } from "../../lib/database";
import {
  deriveRetaEditPhase,
} from "../../lib/reta/retaConfigEditRules";
import {
  resolveCanonicalChampionshipConfig,
  sameUpdatedAt,
  saveRetaConfig,
  tournamentToFormValues,
  type RetaConfigFormValues,
} from "../../lib/reta/updateRetaConfig";
import { retaRamaPublicLabel } from "../../lib/reta/retaRama";
import { RetaConfigFields } from "./RetaConfigFields";
import { Button } from "../ui";

type Props = {
  tournament: Tournament;
  matches: Match[];
  pairsCount: number;
  onSaved: (tournament: Tournament) => void;
  /** Cierra el panel embebido (p. ej. prep sin modal). */
  onCancel?: () => void;
  /** Remontada Final — ocultar en Americano. */
  showChampionship?: boolean;
  subtitle?: string;
  /**
   * Slot de convocatoria (prep): solo visible en modo edición.
   * No altera la lógica del gate; solo el layout.
   */
  publicSlot?: React.ReactNode;
  /** Arranca expandido (p. ej. flujos que no usan resumen colapsado). */
  defaultEditing?: boolean;
};

function formSnapshot(values: RetaConfigFormValues): string {
  return JSON.stringify(values);
}

export const RetaConfigPanel: React.FC<Props> = ({
  tournament,
  matches,
  pairsCount,
  onSaved,
  onCancel,
  showChampionship,
  subtitle = "Edita la configuración principal del evento.",
  publicSlot,
  defaultEditing = false,
}) => {
  const phase = useMemo(
    () =>
      deriveRetaEditPhase({
        is_started: tournament.is_started,
        is_finished: tournament.is_finished,
        pairsCount,
        matchesCount: matches.length,
      }),
    [
      tournament.is_started,
      tournament.is_finished,
      pairsCount,
      matches.length,
    ]
  );

  const [values, setValues] = useState<RetaConfigFormValues>(() =>
    tournamentToFormValues(tournament, {
      championshipEnabled: false,
      championshipRounds: 2,
    })
  );
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState(
    tournament.updated_at || null
  );
  const [baseline, setBaseline] = useState(() => formSnapshot(values));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [champReady, setChampReady] = useState(false);
  const [editing, setEditing] = useState(defaultEditing);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"name", string>>
  >({});
  const saveGen = useRef(0);
  const valuesRef = useRef(values);
  const baselineRef = useRef(baseline);
  const dirtyRef = useRef(false);
  const skipNextHydrateRef = useRef(0);
  const tournamentRef = useRef(tournament);
  const savedFlashTimer = useRef<number | null>(null);

  valuesRef.current = values;
  baselineRef.current = baseline;
  tournamentRef.current = tournament;
  const dirty = formSnapshot(values) !== baseline;
  dirtyRef.current = dirty;

  useEffect(() => {
    return () => {
      if (savedFlashTimer.current != null) {
        window.clearTimeout(savedFlashTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!fieldErrors.name) return;
    if (values.name.trim()) {
      setFieldErrors((errs) => {
        if (!errs.name) return errs;
        const { name: _removed, ...rest } = errs;
        return rest;
      });
    }
  }, [values.name, fieldErrors.name]);

  useEffect(() => {
    let cancelled = false;
    const tournamentId = tournament.id;
    const stamp = tournament.updated_at || null;

    // Tras guardar: el padre parchea + recarga; no pisar el form ni reabrir dirty.
    if (skipNextHydrateRef.current > 0) {
      skipNextHydrateRef.current -= 1;
      setLoadedUpdatedAt(stamp);
      setChampReady(true);
      return;
    }

    // No pisar edits en curso si solo cambió la referencia del objeto.
    if (
      dirtyRef.current &&
      sameUpdatedAt(stamp, loadedUpdatedAt)
    ) {
      setChampReady(true);
      return;
    }

    setChampReady(false);
    (async () => {
      const c = await resolveCanonicalChampionshipConfig(tournamentId);
      if (cancelled) return;
      if (dirtyRef.current) {
        setChampReady(true);
        return;
      }
      const next = tournamentToFormValues(tournamentRef.current, {
        championshipEnabled: c.championshipEnabled,
        championshipRounds: c.championshipRounds,
      });
      setValues(next);
      setBaseline(formSnapshot(next));
      setLoadedUpdatedAt(stamp);
      setStatus(null);
      setError(null);
      setChampReady(true);
    })();

    return () => {
      cancelled = true;
    };
    // Hydrate por id + stamp — no por identidad del objeto tournament.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadedUpdatedAt leído a propósito en el gate
  }, [tournament.id, tournament.updated_at]);

  const resetFromTournament = async () => {
    const c = await resolveCanonicalChampionshipConfig(tournament.id);
    const next = tournamentToFormValues(tournament, {
      championshipEnabled: c.championshipEnabled,
      championshipRounds: c.championshipRounds,
    });
    setValues(next);
    setBaseline(formSnapshot(next));
    setError(null);
    setStatus(null);
    setFieldErrors({});
  };

  const closeEditor = () => {
    setEditing(false);
    setDiscardOpen(false);
    onCancel?.();
  };

  const handleCancel = async () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    await resetFromTournament();
    closeEditor();
  };

  const handleDiscardConfirm = async () => {
    await resetFromTournament();
    closeEditor();
  };

  const validateInline = (latest: RetaConfigFormValues): boolean => {
    const next: Partial<Record<"name", string>> = {};
    if (!latest.name.trim()) {
      next.name = "Nombre requerido.";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async (
    courtsDecreaseConfirmed = false,
    valuesOverride?: RetaConfigFormValues
  ) => {
    const latest = valuesOverride ?? valuesRef.current;
    const isDirty = formSnapshot(latest) !== baselineRef.current;
    if (saving || !isDirty) return;
    if (!validateInline(latest)) return;

    const gen = ++saveGen.current;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const result = await saveRetaConfig({
        tournament: tournamentRef.current,
        matches,
        phase,
        values: latest,
        loadedUpdatedAt,
        courtsDecreaseConfirmed,
      });
      if (gen !== saveGen.current) return;
      if (!result.ok) {
        if (result.needsCourtsConfirm) {
          const ok = window.confirm(result.needsCourtsConfirm.message);
          if (ok) {
            setSaving(false);
            await handleSave(true, latest);
            return;
          }
          setError("Cambio de canchas cancelado.");
          return;
        }
        setError(result.error);
        if (result.sessionExpired) {
          setStatus("Cierra sesión e inicia de nuevo; luego vuelve a guardar.");
        } else if (result.conflict) {
          setStatus("Recarga la configuración (otra sesión la modificó).");
        }
        return;
      }
      const savedSnap = formSnapshot(latest);
      setValues(latest);
      setBaseline(savedSnap);
      baselineRef.current = savedSnap;
      valuesRef.current = latest;
      dirtyRef.current = false;
      setLoadedUpdatedAt(result.tournament.updated_at || loadedUpdatedAt);
      setFieldErrors({});
      setStatus("✓ Cambios guardados");
      // Absorbe onTournamentPatched + loadTournamentData sin rehidratar.
      skipNextHydrateRef.current = 2;
      onSaved(result.tournament);
      if (savedFlashTimer.current != null) {
        window.clearTimeout(savedFlashTimer.current);
      }
      savedFlashTimer.current = window.setTimeout(() => {
        setStatus(null);
        setEditing(false);
        setDiscardOpen(false);
        savedFlashTimer.current = null;
      }, 1600);
    } catch (e) {
      if (gen !== saveGen.current) return;
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      if (gen === saveGen.current) setSaving(false);
    }
  };

  /** iOS: el 1.er tap solo cierra el teclado; commit + save en el mismo gesto. */
  const commitAndSave = () => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.closest(".reta-config-panel") &&
      typeof active.blur === "function"
    ) {
      active.blur();
    }
    // Deja que React aplique onChange del blur antes de leer valuesRef.
    window.setTimeout(() => {
      void handleSave(false, valuesRef.current);
    }, 0);
  };

  const ramaLabel = retaRamaPublicLabel(values.rama);
  /** Solo datos que el header del prep no muestra (evitar duplicar nombre/fecha/lugar). */
  const stripExtras = [values.nivel.trim(), ramaLabel].filter(Boolean);

  if (!editing) {
    return (
      <div className="reta-config-panel reta-config-panel--inline reta-config-panel--collapsed">
        <div
          className="reta-config-panel__summary reta-config-panel__summary--strip"
          aria-label="Detalles de la reta"
        >
          <div className="reta-config-panel__summary-copy">
            <p className="reta-config-panel__summary-kicker">Detalles</p>
            {stripExtras.length > 0 ? (
              <p className="reta-config-panel__summary-extras">
                {stripExtras.join(" · ")}
              </p>
            ) : (
              <p className="reta-config-panel__summary-extras reta-config-panel__summary-extras--muted">
                Configuración guardada
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="reta-config-panel__edit-btn"
            onClick={() => {
              if (savedFlashTimer.current != null) {
                window.clearTimeout(savedFlashTimer.current);
                savedFlashTimer.current = null;
              }
              setDiscardOpen(false);
              setError(null);
              setStatus(null);
              setEditing(true);
            }}
          >
            Editar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="reta-config-panel reta-config-panel--inline reta-config-panel--editing">
      <header className="reta-config-panel__toolbar">
        <div className="reta-config-panel__toolbar-copy">
          <h2 className="reta-config-panel__title">Detalles de la reta</h2>
          <p className="reta-config-panel__subtitle">{subtitle}</p>
        </div>
        {!dirty ? (
          <span className="reta-config-panel__saved-pill" aria-live="polite">
            {status === "✓ Cambios guardados" ? status : "Guardado"}
          </span>
        ) : null}
      </header>

      <RetaConfigFields
        mode="edit"
        phase={phase}
        values={values}
        onChange={(next) => {
          setValues((prev) => {
            const resolved = typeof next === "function" ? next(prev) : next;
            return resolved;
          });
        }}
        disabled={saving || !champReady}
        showChampionship={
          showChampionship ?? tournament.format !== "teams"
        }
        layout="essentials"
        fieldErrors={fieldErrors}
      />

      {publicSlot ? (
        <div className="reta-config-panel__public-slot">{publicSlot}</div>
      ) : null}

      {error ? (
        <p className="reta-config-panel__feedback reta-config-panel__feedback--error" role="alert">
          {error}
        </p>
      ) : null}
      {status && dirty === false ? (
        <p className="reta-config-panel__feedback" role="status">
          {status}
        </p>
      ) : null}

      {discardOpen ? (
        <div
          className="reta-config-panel__discard"
          role="alertdialog"
          aria-labelledby="reta-config-discard-title"
          aria-describedby="reta-config-discard-desc"
        >
          <p id="reta-config-discard-title" className="reta-config-panel__discard-title">
            Tienes cambios sin guardar.
          </p>
          <p id="reta-config-discard-desc" className="reta-config-panel__discard-desc">
            Si descartas, se perderán los cambios de este editor.
          </p>
          <div className="reta-config-panel__discard-actions">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDiscardOpen(false)}
            >
              Seguir editando
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleDiscardConfirm()}
            >
              Descartar cambios
            </Button>
          </div>
        </div>
      ) : null}

      {dirty ? (
        <div className="reta-config-panel__sticky-bar" role="status">
          <span className="reta-config-panel__sticky-dot" aria-hidden>
            ●
          </span>
          <span className="reta-config-panel__sticky-label">Cambios sin guardar</span>
          <div className="reta-config-panel__sticky-actions">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => void handleCancel()}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={saving || !champReady}
              loading={saving}
              onMouseDown={(e) => {
                // Safari/iOS: sin esto el primer tap no dispara click (solo blur).
                e.preventDefault();
              }}
              onClick={commitAndSave}
            >
              Guardar cambios
            </Button>
          </div>
        </div>
      ) : (
        <div className="reta-config-panel__close-row">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => void handleCancel()}
          >
            Cerrar
          </Button>
        </div>
      )}
    </div>
  );
};

export default RetaConfigPanel;
