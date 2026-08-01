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
  subtitle = "Nombre, horario y canchas.",
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
  const saveGen = useRef(0);
  const valuesRef = useRef(values);
  const baselineRef = useRef(baseline);
  const dirtyRef = useRef(false);
  const skipNextHydrateRef = useRef(0);
  const tournamentRef = useRef(tournament);

  valuesRef.current = values;
  baselineRef.current = baseline;
  tournamentRef.current = tournament;
  const dirty = formSnapshot(values) !== baseline;
  dirtyRef.current = dirty;

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

  const handleCancel = async () => {
    const c = await resolveCanonicalChampionshipConfig(tournament.id);
    const next = tournamentToFormValues(tournament, {
      championshipEnabled: c.championshipEnabled,
      championshipRounds: c.championshipRounds,
    });
    setValues(next);
    setBaseline(formSnapshot(next));
    setError(null);
    setStatus(null);
    onCancel?.();
  };

  const handleSave = async (
    courtsDecreaseConfirmed = false,
    valuesOverride?: RetaConfigFormValues
  ) => {
    const latest = valuesOverride ?? valuesRef.current;
    const isDirty = formSnapshot(latest) !== baselineRef.current;
    if (saving || !isDirty) return;

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
      setStatus(result.message);
      // Absorbe onTournamentPatched + loadTournamentData sin rehidratar.
      skipNextHydrateRef.current = 2;
      onSaved(result.tournament);
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

  return (
    <div className="reta-config-panel reta-config-panel--inline">
      <header className="reta-config-panel__toolbar">
        <div className="reta-config-panel__toolbar-copy">
          <h2 className="reta-config-panel__title">Detalles de la reta</h2>
          <p className="reta-config-panel__subtitle">{subtitle}</p>
        </div>
        <div className="reta-config-panel__actions">
          {onCancel != null || dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving || !dirty}
              onClick={() => void handleCancel()}
            >
              Descartar
            </Button>
          ) : null}
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={saving || !dirty || !champReady}
            loading={saving}
            onMouseDown={(e) => {
              // Safari/iOS: sin esto el primer tap no dispara click (solo blur).
              e.preventDefault();
            }}
            onClick={commitAndSave}
          >
            Guardar
          </Button>
        </div>
      </header>

      <RetaConfigFields
        mode="edit"
        phase={phase}
        values={values}
        onChange={setValues}
        disabled={saving || !champReady}
        showChampionship={
          showChampionship ?? tournament.format !== "teams"
        }
        layout="essentials"
      />

      {error ? (
        <p className="reta-config-panel__feedback reta-config-panel__feedback--error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="reta-config-panel__feedback" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
};

export default RetaConfigPanel;
