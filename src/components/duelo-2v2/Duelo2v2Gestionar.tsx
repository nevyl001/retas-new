import {
  getDueloFinalizarConfirmMessage,
  useBranding,
  useClubModeEyebrow,
  useConvocatoriaOriginName,
} from "../../club-experience";
import React, { useCallback, useEffect, useState } from "react";
import type { Duelo2v2, Duelo2v2SetDetalle } from "../../lib/duelo2v2/types";
import { resolveDueloStatusLabel } from "../../lib/modePresentation/dueloNextAction";
import { fetchDuelo2v2RatingBySlot } from "../../lib/duelo2v2/duelo2v2RatingDisplay";
import { ensureDuelo2v2RatingApplied } from "../../lib/duelo2v2/duelo2v2RatingApply";
import type { RatingMovimientoPartido } from "../../lib/rivieraJugadores/types";
import {
  clearDuelo2v2CreateSession,
  markDuelo2v2PendingDraft,
  peekDuelo2v2CreateDraft,
} from "../../lib/duelo2v2/duelo2v2CreateDraft";
import { resolveDueloLugarForShare } from "../../lib/duelo2v2/dueloLugarPrefs";
import {
  finalizarDuelo2v2,
  getDuelo2v2ById,
  parejaLabel,
  updateDuelo2v2Score,
} from "../../services/duelo2v2Service";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { PublicShareSection } from "../platform/PublicShareSection";
import {
  QuickModeEventHeader,
  QuickModePrepWorkspace,
  QuickModePrimaryCta,
  QuickModeStepper,
  type QuickModeStep,
  type QuickModeStepStatus,
} from "../platform/quickMode";
import { Duelo2v2CelebrateSection } from "./Duelo2v2CelebrateSection";
import { ConvocatoriaWhatsAppPanel } from "../reta-abierta/ConvocatoriaWhatsAppPanel";
import { buildDueloConvocatoriaContext } from "../../lib/retaAbierta/adapters";
import { Duelo2v2DetailsEditor } from "./Duelo2v2DetailsEditor";
import { Duelo2v2PageShell } from "./Duelo2v2PageShell";
import { Duelo2v2ScoreEditor } from "./Duelo2v2ScoreEditor";
import { navigateDuelo2v2, publicDuelo2v2Url } from "./duelo2v2Nav";
import "../../styles/riviera-public-celebrate.css";
import "./duelo2v2-page.css";

type GestionarStepId = "convocatoria" | "parejas" | "detalles" | "control";

function stepStatus(
  id: GestionarStepId,
  active: GestionarStepId,
  complete: boolean
): QuickModeStepStatus {
  if (active === id) return "active";
  if (complete) return "complete";
  return "pending";
}

interface Duelo2v2GestionarProps {
  dueloId: string;
}

export const Duelo2v2Gestionar: React.FC<Duelo2v2GestionarProps> = ({
  dueloId,
}) => {
  const modeEyebrow = useClubModeEyebrow();
  const convocatoriaOrigin = useConvocatoriaOriginName();
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
  const [step, setStep] = useState<GestionarStepId>("control");
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [convTouched, setConvTouched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getDuelo2v2ById(dueloId);
      if (!d) throw new Error("Duelo no encontrado");
      setDuelo(d);
      setEditorKey((k) => k + 1);

      // Solo marca pendiente si sigue en configuración; limpia si ya no aplica.
      if (d.estado === "configuracion") {
        markDuelo2v2PendingDraft(d.organizador_id, {
          openDueloId: d.id,
          nombre: d.nombre,
          cancha: d.cancha ?? "",
        });
      } else {
        const pending = peekDuelo2v2CreateDraft(d.organizador_id);
        if (pending?.openDueloId === d.id) {
          clearDuelo2v2CreateSession(d.organizador_id);
        }
      }

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

  const loadedDueloId = duelo?.id ?? null;
  const loadedEstado = duelo?.estado ?? null;

  useEffect(() => {
    if (!loadedDueloId || !loadedEstado || loadedEstado === "finalizado") return;
    if (loadedEstado === "configuracion") {
      setStep("convocatoria");
      setConvTouched(false);
    } else {
      setStep("control");
    }
  }, [loadedDueloId, loadedEstado]);

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
      const {
        duelo: updated,
        careerSyncOk,
        careerSyncMessage,
        criticalFailures,
      } = await finalizarDuelo2v2(dueloId);
      setDuelo(updated);
      if (!careerSyncOk) {
        setError(
          careerSyncMessage ||
            criticalFailures.join("; ") ||
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
  const lugarResolved = resolveDueloLugarForShare(duelo, convocatoriaOrigin);
  const lugarConvocatoria = lugarResolved.lugar || convocatoriaOrigin;
  const includeLugar = lugarResolved.includeLugar;

  const dueloStatus = resolveDueloStatusLabel({ finalizado });

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

      {finalizado ? (
        <>
          <QuickModeEventHeader
            club={modeEyebrow}
            title={duelo.nombre}
            modality="Duelo 2 vs 2"
            statusLabel={dueloStatus.label}
            centerMetrics={[
              { label: "Equipo A", value: teamAName },
              { label: "Equipo B", value: teamBName },
              {
                label: "Marcador",
                value: `${duelo.sets_pareja_a ?? 0}–${duelo.sets_pareja_b ?? 0}`,
              },
            ]}
            rightMeta={[
              { label: "Cancha", value: duelo.cancha?.trim() || "—" },
              {
                label: "Lugar",
                value: includeLugar ? lugarConvocatoria : "Oculto",
              },
            ]}
          />
          <div className="qm-competition">
            {resultadoPanel}
            {equiposPanel}
          </div>
        </>
      ) : (
        (() => {
          const pairsOk =
            Boolean(duelo.pareja_a_j1_nombre?.trim()) &&
            Boolean(duelo.pareja_a_j2_nombre?.trim()) &&
            Boolean(duelo.pareja_b_j1_nombre?.trim()) &&
            Boolean(duelo.pareja_b_j2_nombre?.trim());
          const detallesOk = Boolean(duelo.nombre?.trim());
          const canFinalizar = Boolean(duelo.ganador) && !busy;

          const goConvocatoria = () => {
            setConvTouched(true);
            setStep("convocatoria");
          };

          const steps: QuickModeStep[] = [
            {
              id: "convocatoria",
              label: "Convocatoria",
              status: stepStatus("convocatoria", step, convTouched),
              count: convTouched ? "Revisada" : "Pendiente",
            },
            {
              id: "parejas",
              label: "Parejas",
              status: stepStatus("parejas", step, pairsOk),
              count: pairsOk ? "Listas" : "Pendiente",
            },
            {
              id: "detalles",
              label: "Detalles",
              status: stepStatus("detalles", step, detallesOk),
              count: detallesOk ? "OK" : "Pendiente",
            },
            {
              id: "control",
              label: "Control",
              status: stepStatus("control", step, Boolean(duelo.ganador)),
              count: duelo.ganador ? "Listo" : "En curso",
            },
          ];

          const workbenchTitle =
            step === "convocatoria"
              ? "Convocatoria"
              : step === "parejas"
                ? "Parejas"
                : step === "detalles"
                  ? "Detalles"
                  : "Control de competencia";

          const convocatoriaBody = (
            <>
              <ConvocatoriaWhatsAppPanel
                shareOnly
                context={buildDueloConvocatoriaContext({
                  dueloId: duelo.id,
                  name: duelo.nombre,
                  locationLabel: lugarConvocatoria,
                  includeLugar,
                  canchaLabel: duelo.cancha ?? undefined,
                  scheduledAt: duelo.programado_en,
                  scheduledUntil: duelo.programado_hasta,
                  clubName: convocatoriaOrigin,
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
            </>
          );

          const workbenchBody =
            step === "convocatoria" ? (
              <div className="qm-ws__convocatoria">{convocatoriaBody}</div>
            ) : step === "parejas" ? (
              equiposPanel
            ) : step === "detalles" ? (
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
            ) : (
              <>
                <Duelo2v2ScoreEditor
                  key={editorKey}
                  teamAName={teamAName}
                  teamBName={teamBName}
                  initialDetalle={duelo.detalle_sets}
                  disabled={busy}
                  onSave={handleSaveScore}
                />
                <p className="duelo2v2-card__meta" style={{ marginTop: "0.75rem" }}>
                  Guarda el marcador y finaliza cuando haya ganador.
                </p>
              </>
            );

          const ctaProps =
            canFinalizar
              ? {
                  variant: "sidebar" as const,
                  label: busy ? "Finalizando…" : "Finalizar duelo",
                  disabled: false,
                  loading: busy,
                  hint: "Suma el resultado al ranking",
                  onClick: () => void handleFinalizar(),
                }
              : step === "control"
                ? {
                    variant: "sidebar" as const,
                    label: "Finalizar duelo",
                    disabled: true,
                    loading: false,
                    hint: "Registra el marcador hasta que haya ganador",
                    onClick: () => undefined,
                  }
                : step === "convocatoria"
                  ? {
                      variant: "sidebar" as const,
                      label: "Lanzar convocatoria",
                      disabled: false,
                      loading: false,
                      hint: "Crea el enlace y copia el mensaje de WhatsApp",
                      onClick: () => {
                        const btn = document.querySelector(
                          '[data-testid="lanzar-por-whatsapp"]'
                        ) as HTMLButtonElement | null;
                        btn?.click();
                      },
                    }
                  : {
                      variant: "sidebar" as const,
                      label: "Lanzar convocatoria",
                      disabled: false,
                      loading: false,
                      hint: "Abre el paso Convocatoria para copiar el link",
                      onClick: goConvocatoria,
                    };

          return (
            <QuickModePrepWorkspace
              className={mobileSummaryOpen ? "is-summary-open" : ""}
              header={
                <QuickModeEventHeader
                  club={modeEyebrow}
                  title={duelo.nombre}
                  modality="Duelo 2 vs 2"
                  statusLabel={dueloStatus.label}
                  centerMetrics={[
                    { label: "Equipo A", value: teamAName },
                    { label: "Equipo B", value: teamBName },
                    {
                      label: "Marcador",
                      value: `${duelo.sets_pareja_a ?? 0}–${duelo.sets_pareja_b ?? 0}`,
                    },
                    { label: "Cancha", value: duelo.cancha?.trim() || "—" },
                  ]}
                  rightMeta={[
                    {
                      label: "Lugar",
                      value: includeLugar ? lugarConvocatoria : "Oculto",
                    },
                    {
                      label: "Estado",
                      value:
                        duelo.estado === "configuracion"
                          ? "Preparación"
                          : "En juego",
                    },
                  ]}
                  onEditDetails={() => setStep("detalles")}
                />
              }
              stepper={
                <QuickModeStepper
                  steps={steps}
                  activeId={step}
                  onChange={(id) => {
                    const next = id as GestionarStepId;
                    if (next === "convocatoria") setConvTouched(true);
                    setStep(next);
                  }}
                />
              }
              workbench={
                <>
                  <div className="qm-ws__workbench-head">
                    <h2 className="qm-ws__workbench-title">{workbenchTitle}</h2>
                    <button
                      type="button"
                      className="qm-ws__text-btn qm-ws__summary-toggle"
                      onClick={() => setMobileSummaryOpen((v) => !v)}
                      aria-expanded={mobileSummaryOpen}
                    >
                      {mobileSummaryOpen ? "Ocultar resumen" : "Resumen"}
                    </button>
                  </div>
                  <div className="qm-ws__workbench-body">{workbenchBody}</div>
                </>
              }
              sidebar={
                <div className="qm-ws-panel">
                  <section className="qm-ws-panel__block">
                    <h3 className="qm-ws-panel__label">Progreso</h3>
                    <ul className="qm-ws-panel__progress">
                      <li className={convTouched ? "is-ok" : ""}>Convocatoria</li>
                      <li className={pairsOk ? "is-ok" : ""}>Parejas A / B</li>
                      <li className={detallesOk ? "is-ok" : ""}>Detalles</li>
                      <li className={duelo.ganador ? "is-ok" : ""}>
                        Listo para finalizar
                      </li>
                    </ul>
                  </section>
                  <section className="qm-ws-panel__block">
                    <h3 className="qm-ws-panel__label">Convocatoria</h3>
                    <p className="qm-ws-panel__conv-line">
                      {convTouched
                        ? "Revisa o vuelve a lanzar el enlace"
                        : "Lanza el link por WhatsApp desde este paso"}
                    </p>
                    <button
                      type="button"
                      className="qm-ws__text-btn"
                      onClick={goConvocatoria}
                    >
                      Abrir convocatoria
                    </button>
                  </section>
                  <section className="qm-ws-panel__block qm-ws-panel__cta-desktop">
                    <QuickModePrimaryCta {...ctaProps} />
                  </section>
                </div>
              }
              stickyCta={<QuickModePrimaryCta {...ctaProps} />}
            />
          );
        })()
      )}

      {error && <p className="duelo2v2-error">{error}</p>}
      {message && <p className="duelo2v2-message">{message}</p>}
    </Duelo2v2PageShell>
  );
};
