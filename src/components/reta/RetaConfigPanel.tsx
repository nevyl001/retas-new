import React, { useEffect, useMemo, useState } from "react";
import type { Tournament, Match } from "../../lib/database";
import { loadChampionshipConfig } from "../../lib/roundRobinChampionship";
import {
  deriveRetaEditPhase,
} from "../../lib/reta/retaConfigEditRules";
import {
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
};

export const RetaConfigPanel: React.FC<Props> = ({
  tournament,
  matches,
  pairsCount,
  onSaved,
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

  const champ = loadChampionshipConfig(tournament.id);
  const [values, setValues] = useState<RetaConfigFormValues>(() =>
    tournamentToFormValues(tournament, {
      championshipEnabled: Boolean(champ?.championshipEnabled),
      championshipRounds: champ?.championshipRounds ?? 2,
    })
  );
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState(
    tournament.updated_at || null
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(values));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = loadChampionshipConfig(tournament.id);
    const next = tournamentToFormValues(tournament, {
      championshipEnabled: Boolean(c?.championshipEnabled),
      championshipRounds: c?.championshipRounds ?? 2,
    });
    setValues(next);
    setBaseline(JSON.stringify(next));
    setLoadedUpdatedAt(tournament.updated_at || null);
    setStatus(null);
    setError(null);
  }, [tournament.id, tournament.updated_at]);

  const dirty = JSON.stringify(values) !== baseline;

  const handleCancel = () => {
    const c = loadChampionshipConfig(tournament.id);
    const next = tournamentToFormValues(tournament, {
      championshipEnabled: Boolean(c?.championshipEnabled),
      championshipRounds: c?.championshipRounds ?? 2,
    });
    setValues(next);
    setBaseline(JSON.stringify(next));
    setError(null);
    setStatus(null);
  };

  const handleSave = async (courtsDecreaseConfirmed = false) => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const result = await saveRetaConfig({
        tournament,
        matches,
        phase,
        values,
        loadedUpdatedAt,
        courtsDecreaseConfirmed,
      });
      if (!result.ok) {
        if (result.needsCourtsConfirm) {
          const ok = window.confirm(result.needsCourtsConfirm.message);
          if (ok) {
            setSaving(false);
            await handleSave(true);
            return;
          }
          setError("Cambio de canchas cancelado.");
          return;
        }
        setError(result.error);
        if (result.conflict) {
          setStatus("Recarga la configuración (otra sesión la modificó).");
        }
        return;
      }
      setBaseline(JSON.stringify(values));
      setLoadedUpdatedAt(result.tournament.updated_at || loadedUpdatedAt);
      setStatus(result.message);
      onSaved(result.tournament);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="reta-config-panel">
      <p className="elegant-form-hint" role="note">
        Edita nombre, canchas, horario y Remontada. La convocatoria pública
        (cupo, rating, fotos) sigue en el panel Convocatoria Riviera.
      </p>
      <RetaConfigFields
        mode="edit"
        phase={phase}
        values={values}
        onChange={setValues}
        disabled={saving}
        showChampionship={
          tournament.format !== "teams"
        }
      />
      {error ? (
        <p className="elegant-form-hint" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="elegant-form-hint" role="status">
          {status}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <Button
          type="button"
          variant="ghost"
          size="md"
          disabled={saving || !dirty}
          onClick={handleCancel}
          style={{ minHeight: 44 }}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={saving || !dirty}
          loading={saving}
          onClick={() => void handleSave(false)}
          style={{ minHeight: 44 }}
        >
          Guardar cambios
        </Button>
      </div>
    </div>
  );
};

export default RetaConfigPanel;
