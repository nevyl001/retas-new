import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Tournament, Match } from "../../lib/database";
import {
  deriveRetaEditPhase,
} from "../../lib/reta/retaConfigEditRules";
import {
  resolveCanonicalChampionshipConfig,
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

  const [values, setValues] = useState<RetaConfigFormValues>(() =>
    tournamentToFormValues(tournament, {
      championshipEnabled: false,
      championshipRounds: 2,
    })
  );
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState(
    tournament.updated_at || null
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(values));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [champReady, setChampReady] = useState(false);
  const saveGen = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setChampReady(false);
    (async () => {
      const c = await resolveCanonicalChampionshipConfig(tournament.id);
      if (cancelled) return;
      const next = tournamentToFormValues(tournament, {
        championshipEnabled: c.championshipEnabled,
        championshipRounds: c.championshipRounds,
      });
      setValues(next);
      setBaseline(JSON.stringify(next));
      setLoadedUpdatedAt(tournament.updated_at || null);
      setStatus(null);
      setError(null);
      setChampReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [tournament]);

  const dirty = JSON.stringify(values) !== baseline;

  const handleCancel = async () => {
    const c = await resolveCanonicalChampionshipConfig(tournament.id);
    const next = tournamentToFormValues(tournament, {
      championshipEnabled: c.championshipEnabled,
      championshipRounds: c.championshipRounds,
    });
    setValues(next);
    setBaseline(JSON.stringify(next));
    setError(null);
    setStatus(null);
  };

  const handleSave = async (courtsDecreaseConfirmed = false) => {
    if (saving || !dirty) return;
    const gen = ++saveGen.current;
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
      if (gen !== saveGen.current) return;
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
        if (result.sessionExpired) {
          setStatus("Cierra sesión e inicia de nuevo; luego vuelve a guardar.");
        } else if (result.conflict) {
          setStatus("Recarga la configuración (otra sesión la modificó).");
        }
        return;
      }
      setBaseline(JSON.stringify(values));
      setLoadedUpdatedAt(result.tournament.updated_at || loadedUpdatedAt);
      setStatus(result.message);
      onSaved(result.tournament);
    } catch (e) {
      if (gen !== saveGen.current) return;
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      if (gen === saveGen.current) setSaving(false);
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
        disabled={saving || !champReady}
        showChampionship={tournament.format !== "teams"}
        layout="essentials"
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
          onClick={() => void handleCancel()}
          style={{ minHeight: 44 }}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={saving || !dirty || !champReady}
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
