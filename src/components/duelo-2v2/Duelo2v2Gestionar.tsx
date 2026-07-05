import {
  getDueloFinalizarConfirmMessage,
  useBranding,
  useClubModeEyebrow,
} from "../../club-experience";
import React, { useCallback, useEffect, useState } from "react";
import type { Duelo2v2, Duelo2v2SetDetalle } from "../../lib/duelo2v2/types";
import { fetchDuelo2v2RatingBySlot } from "../../lib/duelo2v2/duelo2v2RatingDisplay";
import { ensureDuelo2v2RatingApplied } from "../../lib/duelo2v2/duelo2v2RatingApply";
import type { RatingMovimientoPartido } from "../../lib/rivieraJugadores/types";
import {
  finalizarDuelo2v2,
  getDuelo2v2ById,
  parejaLabel,
  updateDuelo2v2Score,
} from "../../services/duelo2v2Service";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { PublicShareSection } from "../platform/PublicShareSection";
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
  const modeEyebrow = useClubModeEyebrow();
  const { nombre: organizerName } = useBranding();
  const [duelo, setDuelo] = useState<Duelo2v2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [ratingByJugadorId, setRatingByJugadorId] = useState<
    Record<string, RatingMovimientoPartido>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getDuelo2v2ById(dueloId);
      if (!d) throw new Error("Duelo no encontrado");
      setDuelo(d);
      setEditorKey((k) => k + 1);
      if (d.estado === "finalizado" && d.ganador) {
        await ensureDuelo2v2RatingApplied(d.organizador_id, d);
        setRatingByJugadorId(
          await fetchDuelo2v2RatingBySlot(d.organizador_id, d.id, [
            d.pareja_a_j1_id,
            d.pareja_a_j2_id,
            d.pareja_b_j1_id,
            d.pareja_b_j2_id,
          ])
        );
      } else {
        setRatingByJugadorId({});
      }
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
      !window.confirm(getDueloFinalizarConfirmMessage(organizerName))
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await finalizarDuelo2v2(dueloId);
      setDuelo(updated);
      await ensureDuelo2v2RatingApplied(updated.organizador_id, updated);
      const ratingMap = await fetchDuelo2v2RatingBySlot(
        updated.organizador_id,
        updated.id,
        [
          updated.pareja_a_j1_id,
          updated.pareja_a_j2_id,
          updated.pareja_b_j1_id,
          updated.pareja_b_j2_id,
        ]
      );
      setRatingByJugadorId(ratingMap);
      setMessage(
        Object.keys(ratingMap).length > 0
          ? "Duelo finalizado. Rating y puntos aplicados al ranking."
          : "Duelo finalizado. Puntos aplicados; el nivel no se registró (revisa consola o permisos de rating)."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo finalizar");
    } finally {
      setBusy(false);
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
      <ActionBar className="duelo2v2-toolbar riviera-back-toolbar">
        <Button
          type="button"
          variant="back"
          onClick={() => navigateDuelo2v2("/duelo-2v2")}
        >
          ← Mis duelos
        </Button>
      </ActionBar>

      <ModeHeader
        className="duelo2v2-header rv-mode-header"
        eyebrow={modeEyebrow}
        title={duelo.nombre}
        subtitle={duelo.descripcion ?? undefined}
      >
        <Duelo2v2MatchMeta duelo={duelo} />
      </ModeHeader>

      <PublicShareSection
        publicUrl={publicDuelo2v2Url(dueloId)}
        title="Enlace público"
        infoLines={["Comparte el enlace para ver el marcador del duelo (solo lectura)."]}
        copyButtonLabel="Copiar vista pública"
      />

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
            { name: duelo.pareja_a_j1_nombre, jugadorId: duelo.pareja_a_j1_id },
            { name: duelo.pareja_a_j2_nombre, jugadorId: duelo.pareja_a_j2_id },
          ]}
          teamB={[
            { name: duelo.pareja_b_j1_nombre, jugadorId: duelo.pareja_b_j1_id },
            { name: duelo.pareja_b_j2_nombre, jugadorId: duelo.pareja_b_j2_id },
          ]}
          ganador={duelo.ganador}
          setsA={duelo.sets_pareja_a}
          setsB={duelo.sets_pareja_b}
          detalle={duelo.detalle_sets}
          torneoNombre={duelo.nombre}
          finalizado
          ratingByJugadorId={ratingByJugadorId}
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

      {!finalizado ? (
        <ActionBar className="duelo2v2-actions">
          <Button
            type="button"
            variant="primary"
            disabled={busy || !duelo.ganador}
            onClick={() => void handleFinalizar()}
          >
            Finalizar y sumar al ranking
          </Button>
        </ActionBar>
      ) : null}
    </Duelo2v2PageShell>
  );
};
