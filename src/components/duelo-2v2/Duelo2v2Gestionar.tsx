import React, { useCallback, useEffect, useState } from "react";
import type { Duelo2v2, Duelo2v2SetDetalle } from "../../lib/duelo2v2/types";
import {
  finalizarDuelo2v2,
  getDuelo2v2ById,
  parejaLabel,
  updateDuelo2v2Score,
} from "../../services/duelo2v2Service";
import { Button } from "../ui";
import { Duelo2v2CelebrateSection } from "./Duelo2v2CelebrateSection";
import { Duelo2v2DetailsEditor } from "./Duelo2v2DetailsEditor";
import { Duelo2v2PageShell } from "./Duelo2v2PageShell";
import { Duelo2v2ScoreEditor } from "./Duelo2v2ScoreEditor";
import { Duelo2v2MatchMeta } from "./Duelo2v2MatchMeta";
import { navigateDuelo2v2, publicDuelo2v2Url } from "./duelo2v2Nav";
import "../../styles/riviera-public-celebrate.css";
import "./duelo2v2-page.css";

interface Duelo2v2GestionarProps {
  dueloId: string;
}

export const Duelo2v2Gestionar: React.FC<Duelo2v2GestionarProps> = ({
  dueloId,
}) => {
  const [duelo, setDuelo] = useState<Duelo2v2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getDuelo2v2ById(dueloId);
      if (!d) throw new Error("Duelo no encontrado");
      setDuelo(d);
      setEditorKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [dueloId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveScore = async (detalle: Duelo2v2SetDetalle[]) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateDuelo2v2Score(dueloId, { detalle_sets: detalle });
      setDuelo(updated);
      setMessage("Marcador guardado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  };

  const handleFinalizar = async () => {
    if (
      !window.confirm(
        "¿Finalizar el duelo? Se registrarán los puntos en el ranking Riviera Open y aparecerá en el historial de los jugadores."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await finalizarDuelo2v2(dueloId);
      setDuelo(updated);
      setMessage("Duelo finalizado. Rating y puntos aplicados al ranking.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo finalizar");
    } finally {
      setBusy(false);
    }
  };

  const copyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicDuelo2v2Url(dueloId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar el enlace");
    }
  };

  if (loading) {
    return (
      <Duelo2v2PageShell wide>
        <p>Cargando…</p>
      </Duelo2v2PageShell>
    );
  }

  if (!duelo) {
    return (
      <Duelo2v2PageShell wide>
        <p className="duelo2v2-error">{error ?? "Duelo no encontrado"}</p>
      </Duelo2v2PageShell>
    );
  }

  const teamAName = parejaLabel(
    duelo.pareja_a_j1_nombre,
    duelo.pareja_a_j2_nombre
  );
  const teamBName = parejaLabel(
    duelo.pareja_b_j1_nombre,
    duelo.pareja_b_j2_nombre
  );
  const finalizado = duelo.estado === "finalizado";

  return (
    <Duelo2v2PageShell wide className="duelo2v2-gestionar">
      <div className="duelo2v2-toolbar riviera-back-toolbar">
        <Button
          type="button"
          variant="back"
          onClick={() => navigateDuelo2v2("/duelo-2v2")}
        >
          ← Mis duelos
        </Button>
      </div>

      <header className="duelo2v2-header">
        <h1>{duelo.nombre}</h1>
        {duelo.descripcion && <p>{duelo.descripcion}</p>}
        <Duelo2v2MatchMeta duelo={duelo} />
      </header>

      <Duelo2v2DetailsEditor
        duelo={duelo}
        disabled={busy}
        onSaved={(updated) => {
          setDuelo(updated);
          setMessage("Datos del encuentro actualizados.");
          setError(null);
        }}
        onError={setError}
      />

      {finalizado && duelo.ganador && (
        <Duelo2v2CelebrateSection
          teamAName={teamAName}
          teamBName={teamBName}
          teamA={[
            { name: duelo.pareja_a_j1_nombre },
            { name: duelo.pareja_a_j2_nombre },
          ]}
          teamB={[
            { name: duelo.pareja_b_j1_nombre },
            { name: duelo.pareja_b_j2_nombre },
          ]}
          ganador={duelo.ganador}
          setsA={duelo.sets_pareja_a}
          setsB={duelo.sets_pareja_b}
          detalle={duelo.detalle_sets}
          torneoNombre={duelo.nombre}
          finalizado
        />
      )}

      {!finalizado && (
        <Duelo2v2ScoreEditor
          key={editorKey}
          teamAName={teamAName}
          teamBName={teamBName}
          initialDetalle={duelo.detalle_sets}
          disabled={busy}
          onSave={handleSaveScore}
        />
      )}

      {error && <p className="duelo2v2-error">{error}</p>}
      {message && <p className="duelo2v2-message">{message}</p>}

      <div className="duelo2v2-actions">
        <Button type="button" variant="secondary" size="sm" onClick={() => void copyPublicLink()}>
          {copied ? "Enlace copiado" : "Copiar vista pública"}
        </Button>
        {!finalizado && (
          <Button
            type="button"
            variant="primary"
            disabled={busy || !duelo.ganador}
            onClick={() => void handleFinalizar()}
          >
            Finalizar y sumar al ranking
          </Button>
        )}
      </div>
    </Duelo2v2PageShell>
  );
};
