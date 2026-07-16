import {
  getDueloFinalizarConfirmMessage,
  useBranding,
  useClubModeEyebrow,
} from "../../club-experience";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Duelo2v2, Duelo2v2SetDetalle } from "../../lib/duelo2v2/types";
import { useMobileViewport } from "../../hooks/useMobileViewport";
import {
  resolveDueloNextAction,
  resolveDueloStatusLabel,
  resolveDueloSummary,
  type DueloMobileTabId,
} from "../../lib/modePresentation/dueloNextAction";
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
import {
  ModeEventHeader,
  ModeSectionPanel,
  ModeSectionTabs,
  MobileStickyActionFooter,
} from "../platform";
import { ModeHeader } from "../platform/ModeHeader";
import { PublicShareSection } from "../platform/PublicShareSection";
import { Duelo2v2CelebrateSection } from "./Duelo2v2CelebrateSection";
import { ConvocatoriaWhatsAppPanel } from "../reta-abierta/ConvocatoriaWhatsAppPanel";
import { buildDueloConvocatoriaContext } from "../../lib/retaAbierta/adapters";
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
  const isMobile = useMobileViewport(767);
  const [mobileTab, setMobileTab] = useState<DueloMobileTabId>("resumen");

  const dueloTabs = useMemo(
    () => [
      { id: "resumen", label: "Resumen" },
      { id: "equipos", label: "Equipos" },
      { id: "partidos", label: "Partidos" },
      { id: "resultado", label: "Resultado" },
    ],
    []
  );

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
      const { duelo: updated, careerSyncOk, careerSyncMessage } =
        await finalizarDuelo2v2(dueloId);
      setDuelo(updated);
      if (!careerSyncOk) {
        setError(
          careerSyncMessage ??
            "El duelo se finalizó, pero no se registró en el historial de jugadores."
        );
        return;
      }
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
  const dueloStatus = resolveDueloStatusLabel({ finalizado });
  const dueloNextAction = resolveDueloNextAction({
    finalizado,
    hasGanador: Boolean(duelo.ganador),
  });
  const dueloSummary = resolveDueloSummary({
    teamAName,
    teamBName,
    setsA: duelo.sets_pareja_a,
    setsB: duelo.sets_pareja_b,
    finalizado,
  });
  const stickyActionLabel =
    isMobile && !finalizado && duelo.ganador ? "Finalizar duelo" : null;

  const equiposPanel = (
    <div className="duelo2v2-equipos-panel">
      <div className="duelo2v2-equipo-card">
        <h3 className="duelo2v2-equipo-card__title">Equipo A</h3>
        <p className="duelo2v2-equipo-card__name">{teamAName}</p>
        <ul className="duelo2v2-equipo-card__players">
          <li>{duelo.pareja_a_j1_nombre}</li>
          <li>{duelo.pareja_a_j2_nombre}</li>
        </ul>
      </div>
      <div className="duelo2v2-equipo-card">
        <h3 className="duelo2v2-equipo-card__title">Equipo B</h3>
        <p className="duelo2v2-equipo-card__name">{teamBName}</p>
        <ul className="duelo2v2-equipo-card__players">
          <li>{duelo.pareja_b_j1_nombre}</li>
          <li>{duelo.pareja_b_j2_nombre}</li>
        </ul>
      </div>
    </div>
  );

  const resultadoPanel =
    finalizado && duelo.ganador ? (
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
    ) : (
      <p className="duelo2v2-message">
        El resultado aparecerá cuando finalices el duelo.
      </p>
    );

  if (isMobile) {
    return (
      <Duelo2v2PageShell
        wide
        className={`duelo2v2-gestionar${
          stickyActionLabel ? " has-mobile-sticky-action" : ""
        }`}
      >
        <ActionBar className="duelo2v2-toolbar riviera-back-toolbar">
          <Button
            type="button"
            variant="back"
            onClick={() => navigateDuelo2v2("/duelo-2v2")}
          >
            ← Mis duelos
          </Button>
        </ActionBar>

        <div className="mode-mobile-shell mode-mobile-shell--tabbed duelo2v2-mobile-shell">
          <ModeEventHeader
            eyebrow={modeEyebrow}
            title={duelo.nombre}
            modality="Duelo 2 vs 2"
            statusLabel={dueloStatus.label}
            statusVariant={dueloStatus.variant}
            summary={dueloSummary}
            nextActionLabel={dueloNextAction?.label}
            onNextAction={
              dueloNextAction
                ? () => setMobileTab(dueloNextAction.tabId)
                : undefined
            }
          />
          <ModeSectionTabs
            tabs={dueloTabs}
            activeId={mobileTab}
            onChange={(id) => setMobileTab(id as DueloMobileTabId)}
            ariaLabel="Secciones del duelo"
          />

          <ModeSectionPanel id="resumen" activeId={mobileTab}>
            <Duelo2v2MatchMeta duelo={duelo} />
            <ConvocatoriaWhatsAppPanel
              context={buildDueloConvocatoriaContext({
                dueloId: duelo.id,
                name: duelo.nombre,
                locationLabel: duelo.cancha ?? undefined,
                scheduledAt: duelo.programado_en,
                clubName: modeEyebrow,
              })}
            />
            <PublicShareSection
              publicUrl={publicDuelo2v2Url(dueloId)}
              title="Enlace público"
              infoLines={[
                "Comparte el enlace para ver el marcador del duelo (solo lectura).",
              ]}
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
          </ModeSectionPanel>

          <ModeSectionPanel id="equipos" activeId={mobileTab}>
            {equiposPanel}
          </ModeSectionPanel>

          <ModeSectionPanel id="partidos" activeId={mobileTab}>
            {!finalizado ? (
              <Duelo2v2ScoreEditor
                key={editorKey}
                teamAName={teamAName}
                teamBName={teamBName}
                initialDetalle={duelo.detalle_sets}
                disabled={busy}
                onSave={handleSaveScore}
              />
            ) : (
              <p className="duelo2v2-message">Duelo finalizado.</p>
            )}
          </ModeSectionPanel>

          <ModeSectionPanel id="resultado" activeId={mobileTab}>
            {resultadoPanel}
          </ModeSectionPanel>

          {error && <p className="duelo2v2-error">{error}</p>}
          {message && <p className="duelo2v2-message">{message}</p>}

          {stickyActionLabel ? (
            <MobileStickyActionFooter>
              <Button
                type="button"
                variant="primary"
                disabled={busy || !duelo.ganador}
                onClick={() => void handleFinalizar()}
              >
                {stickyActionLabel}
              </Button>
            </MobileStickyActionFooter>
          ) : null}
        </div>
      </Duelo2v2PageShell>
    );
  }

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

      <ConvocatoriaWhatsAppPanel
        context={buildDueloConvocatoriaContext({
          dueloId: duelo.id,
          name: duelo.nombre,
          locationLabel: duelo.cancha ?? undefined,
          scheduledAt: duelo.programado_en,
          clubName: modeEyebrow,
        })}
      />

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
