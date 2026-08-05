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
import { readDueloLugarPrefs, resolveDueloLugarForShare } from "../../lib/duelo2v2/dueloLugarPrefs";
import { dueloConvocatoriaNivel } from "../../lib/duelo2v2/convocatoriaNivel";
import {
  readDueloConvocatoriaPanelOpen,
  writeDueloConvocatoriaPanelOpen,
} from "../../lib/duelo2v2/dueloConvocatoriaPanelPrefs";
import { formatDueloHorarioRange } from "../../lib/duelo2v2/schedule";
import {
  fetchOpenGameRegistrationConfig,
  listOpenGameRegistrationEntries,
} from "../../lib/retaAbierta/retaAbiertaService";
import {
  finalizarDuelo2v2,
  getDuelo2v2ById,
  parejaLabel,
  startDuelo2v2,
  updateDuelo2v2Score,
} from "../../services/duelo2v2Service";
import { formatPartidoFecha } from "../../lib/torneoExpress/partidoSchedule";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import {
  QuickModeConvocatoriaGate,
  QuickModeEventHeader,
  QuickModePrepWorkspace,
  QuickModePrimaryCta,
  QuickModeStepper,
  type QuickModeStep,
  type QuickModeStepStatus,
} from "../platform/quickMode";
import { Duelo2v2CelebrateSection } from "./Duelo2v2CelebrateSection";
import {
  ConvocatoriaWhatsAppPanel,
  type ConvocatoriaLiveSnapshot,
} from "../reta-abierta/ConvocatoriaWhatsAppPanel";
import { buildDueloConvocatoriaContext } from "../../lib/retaAbierta/adapters";
import { Duelo2v2DetailsEditor } from "./Duelo2v2DetailsEditor";
import { Duelo2v2PageShell } from "./Duelo2v2PageShell";
import { Duelo2v2PublicShare } from "./Duelo2v2PublicShare";
import { Duelo2v2ScoreEditor } from "./Duelo2v2ScoreEditor";
import {
  bothPairsReady,
  DueloPairBuilder,
  type DueloPair,
} from "./DueloPairBuilder";
import { navigateDuelo2v2, publicDuelo2v2Url } from "./duelo2v2Nav";
import "../../styles/riviera-public-celebrate.css";
import "./duelo2v2-page.css";

type GestionarStepId = "parejas" | "control";

function stepStatus(
  id: GestionarStepId,
  active: GestionarStepId,
  complete: boolean
): QuickModeStepStatus {
  if (active === id) return "active";
  if (complete) return "complete";
  return "pending";
}

function scrollToDueloConvocatoria() {
  document
    .getElementById("duelo-convocatoria-inline")
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function convStatusLabel(status: string | undefined): string {
  switch (status) {
    case "open":
      return "Abierta";
    case "paused":
      return "Pausada";
    case "closed":
      return "Cerrada";
    case "cancelled":
      return "Cancelada";
    case "draft":
      return "Borrador";
    default:
      return "Convocatoria";
  }
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
  const [step, setStep] = useState<GestionarStepId>("parejas");
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [convTouched, setConvTouched] = useState(false);
  const [wantConvocatoria, setWantConvocatoria] = useState(() =>
    readDueloConvocatoriaPanelOpen(dueloId)
  );
  const [convIsLive, setConvIsLive] = useState(false);
  const [convLine, setConvLine] = useState("Sin abrir · —");
  const [pairA, setPairA] = useState<DueloPair | null>(null);
  const [pairB, setPairB] = useState<DueloPair | null>(null);

  const setConvPanelOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setWantConvocatoria((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        writeDueloConvocatoriaPanelOpen(dueloId, value);
        return value;
      });
    },
    [dueloId]
  );

  useEffect(() => {
    setConvPanelOpen(readDueloConvocatoriaPanelOpen(dueloId));
  }, [dueloId, setConvPanelOpen]);

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
          categoria: d.categoria?.trim() || "",
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

  /** Solo sincroniza estado live / cupo; no fuerza abrir/cerrar el panel. */
  const refreshConvSummary = useCallback(async () => {
    try {
      const cfg = await fetchOpenGameRegistrationConfig("duelo_2v2", dueloId);
      if (!cfg) {
        setConvIsLive(false);
        setConvLine("Sin abrir · —");
        return;
      }
      const entries = await listOpenGameRegistrationEntries("duelo_2v2", dueloId);
      const confirmed = entries.filter((e) => e.status === "confirmed").length;
      const capacity = cfg.capacity ?? 4;
      const live =
        Boolean(cfg.public_slug) ||
        (Boolean(cfg.enabled) && cfg.status !== "draft");
      setConvIsLive(live);
      if (live || confirmed > 0) setConvTouched(true);
      setConvLine(
        `${convStatusLabel(cfg.status)} · ${confirmed} de ${capacity} confirmados`
      );
    } catch {
      setConvLine("Gestionar convocatoria");
    }
  }, [dueloId]);

  useEffect(() => {
    if (!loadedDueloId || loadedEstado !== "configuracion") return;
    void refreshConvSummary();
  }, [loadedDueloId, loadedEstado, refreshConvSummary]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!loadedDueloId || loadedEstado !== "configuracion") return;
      void refreshConvSummary();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadedDueloId, loadedEstado, refreshConvSummary]);

  useEffect(() => {
    if (!loadedDueloId || !loadedEstado || loadedEstado === "finalizado") return;
    if (loadedEstado === "configuracion") {
      setStep("parejas");
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

  const handleStartJuego = async () => {
    if (!duelo || !pairA || !pairB || !bothPairsReady(pairA, pairB)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await startDuelo2v2({
        existingDraftId: duelo.id,
        input: {
          nombre: duelo.nombre,
          descripcion: duelo.descripcion?.trim() || undefined,
          cancha: duelo.cancha ?? undefined,
          programado_en: duelo.programado_en,
          programado_hasta: duelo.programado_hasta,
          pareja_a_j1_id: pairA.j1.id,
          pareja_a_j2_id: pairA.j2.id,
          pareja_a_j1_nombre: pairA.j1.nombre,
          pareja_a_j2_nombre: pairA.j2.nombre,
          pareja_b_j1_id: pairB.j1.id,
          pareja_b_j2_id: pairB.j2.id,
          pareja_b_j1_nombre: pairB.j1.nombre,
          pareja_b_j2_nombre: pairB.j2.nombre,
        },
      });
      setDuelo(updated);
      setPairA(null);
      setPairB(null);
      setStep("control");
      setMessage("Duelo iniciado. Registra el marcador.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar el duelo");
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

  const handleReiniciarMarcador = async () => {
    if (
      !window.confirm(
        "¿Reiniciar el marcador a 0–0? Los sets registrados se borrarán."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateDuelo2v2Score(dueloId, { detalle_sets: [] });
      setDuelo(updated);
      setEditorKey((k) => k + 1);
      setStep("control");
      setMessage("Marcador reiniciado.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo reiniciar el marcador"
      );
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

  const dueloStatus = resolveDueloStatusLabel({
    finalizado,
    estado: duelo.estado,
  });
  const phaseLabel =
    finalizado
      ? "Finalizado"
      : duelo.estado === "en_juego"
        ? "En juego"
        : "Preparación";

  const diaLabel = duelo.programado_en?.trim()
    ? formatPartidoFecha(duelo.programado_en)
    : "—";
  const horarioLabel =
    formatDueloHorarioRange(duelo.programado_en, duelo.programado_hasta) ||
    "—";

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

      {error ? (
        <p className="duelo2v2-error duelo2v2-error--banner" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="duelo2v2-message duelo2v2-message--banner" role="status">
          {message}
        </p>
      ) : null}

      {finalizado ? (
        <>
          <QuickModeEventHeader
            club={modeEyebrow}
            title={duelo.nombre}
            modality="Duelo 2 vs 2"
            statusLabel={dueloStatus.label}
            phaseLabel={phaseLabel}
            centerMetrics={[
              { label: "Equipo A", value: teamAName },
              { label: "Equipo B", value: teamBName },
              {
                label: "Marcador",
                value: `${duelo.sets_pareja_a ?? 0}–${duelo.sets_pareja_b ?? 0}`,
              },
              { label: "Día", value: diaLabel },
              { label: "Horario", value: horarioLabel },
              { label: "Cancha", value: duelo.cancha?.trim() || "—" },
            ]}
            rightMeta={[
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
          const draftPairsReady = bothPairsReady(pairA, pairB);
          const enConfig = duelo.estado === "configuracion";
          const enJuego = duelo.estado === "en_juego";
          const canStartJuego =
            enConfig &&
            !pairsOk &&
            draftPairsReady &&
            !busy;
          const detallesOk = Boolean(duelo.nombre?.trim());
          const canFinalizar = enJuego && Boolean(duelo.ganador) && !busy;
          const publicUrl = publicDuelo2v2Url(dueloId);

          const goConvocatoria = () => {
            if (!enConfig) return;
            setConvPanelOpen(true);
            setConvTouched(true);
            setMobileSummaryOpen(false);
            window.requestAnimationFrame(() => scrollToDueloConvocatoria());
          };

          const onConvLiveChange = (snap: ConvocatoriaLiveSnapshot) => {
            if (snap.isLive || snap.confirmed > 0) setConvTouched(true);
            if (snap.isLive) {
              setConvIsLive(true);
              setConvLine(
                `Abierta · ${snap.confirmed} de ${snap.capacity} confirmados`
              );
            } else {
              setConvIsLive(false);
              setConvLine(
                snap.publicSlug
                  ? `Borrador · ${snap.confirmed} de ${snap.capacity}`
                  : "Sin abrir · —"
              );
            }
          };

          const steps: QuickModeStep[] = [
            {
              id: "parejas",
              label: "Parejas",
              status: stepStatus("parejas", step, pairsOk),
              count: pairsOk ? "Listas" : "Pendiente",
            },
            {
              id: "control",
              label: "Marcador",
              status: stepStatus("control", step, Boolean(duelo.ganador)),
              count: duelo.ganador ? "OK" : enJuego ? "En curso" : "Pendiente",
            },
          ];

          const workbenchTitle =
            step === "parejas" ? "Parejas" : "Control de competencia";

          const workbenchBody =
            step === "parejas" ? (
              pairsOk ? (
                <>
                  {equiposPanel}
                  {enJuego ? (
                    <div className="duelo2v2-live-actions">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => setStep("control")}
                      >
                        Ir al marcador
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void handleReiniciarMarcador()}
                      >
                        Reiniciar marcador
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <DueloPairBuilder
                  organizadorId={duelo.organizador_id}
                  pairA={pairA}
                  pairB={pairB}
                  onPairAChange={setPairA}
                  onPairBChange={setPairB}
                />
              )
            ) : (
              <>
                <Duelo2v2ScoreEditor
                  key={editorKey}
                  teamAName={teamAName}
                  teamBName={teamBName}
                  initialDetalle={duelo.detalle_sets}
                  disabled={busy || !enJuego}
                  onSave={handleSaveScore}
                />
                {enJuego ? (
                  <div className="duelo2v2-live-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleReiniciarMarcador()}
                    >
                      Reiniciar marcador
                    </Button>
                  </div>
                ) : null}
                <p className="duelo2v2-card__meta" style={{ marginTop: "0.75rem" }}>
                  {enJuego
                    ? "Guarda el marcador y finaliza cuando haya ganador."
                    : "Inicia el duelo para registrar el marcador."}
                </p>
              </>
            );

          const ctaProps = canFinalizar
            ? {
                variant: "sidebar" as const,
                label: busy ? "Finalizando…" : "Finalizar duelo",
                disabled: false,
                loading: busy,
                hint: "Suma el resultado al ranking",
                onClick: () => void handleFinalizar(),
              }
            : enJuego
              ? step === "control"
                ? {
                    variant: "sidebar" as const,
                    label: "Finalizar duelo",
                    disabled: true,
                    loading: false,
                    hint: "Registra el marcador hasta que haya ganador",
                    onClick: () => undefined,
                  }
                : {
                    variant: "sidebar" as const,
                    label: "Ir al marcador",
                    disabled: false,
                    loading: false,
                    hint: "Registra sets o reinicia el marcador",
                    onClick: () => setStep("control"),
                  }
              : canStartJuego
                ? {
                    variant: "sidebar" as const,
                    label: "Iniciar juego",
                    loadingLabel: "Preparando marcador…",
                    disabled: false,
                    loading: busy,
                    hint: "Confirma las 2 parejas e inicia el marcador",
                    onClick: () => void handleStartJuego(),
                  }
                : {
                    variant: "sidebar" as const,
                    label: "Iniciar juego",
                    disabled: true,
                    loading: false,
                    hint: "Selecciona 4 jugadores (2 parejas)",
                    onClick: () => undefined,
                  };

          return (
            <QuickModePrepWorkspace
              className={`qm-ws--wide${mobileSummaryOpen ? " is-summary-open" : ""}`}
              header={
                <QuickModeEventHeader
                  club={modeEyebrow}
                  title={duelo.nombre}
                  modality="Duelo 2 vs 2"
                  statusLabel={dueloStatus.label}
                  phaseLabel={phaseLabel}
                  centerMetrics={[
                    { label: "Equipo A", value: teamAName },
                    { label: "Equipo B", value: teamBName },
                    {
                      label: "Marcador",
                      value: `${duelo.sets_pareja_a ?? 0}–${duelo.sets_pareja_b ?? 0}`,
                    },
                    { label: "Día", value: diaLabel },
                    { label: "Horario", value: horarioLabel },
                    { label: "Cancha", value: duelo.cancha?.trim() || "—" },
                  ]}
                  rightMeta={[
                    {
                      label: "Lugar",
                      value: includeLugar ? lugarConvocatoria : "Oculto",
                    },
                    {
                      label: "Descripción",
                      value: duelo.categoria?.trim() ||
                        readDueloLugarPrefs(duelo.id)?.categoria?.trim() ||
                        "—",
                    },
                    {
                      label: "Nivel",
                      value: duelo.descripcion?.trim() || "—",
                    },
                    {
                      label: "Estado",
                      value: phaseLabel,
                    },
                  ]}
                />
              }
              details={
                <>
                  <section
                    id="duelo-detalles-inline"
                    className="qm-ws__details-inline"
                    aria-label="Detalles de la reta"
                  >
                    <Duelo2v2DetailsEditor
                      inline
                      collapsible={enJuego}
                      duelo={duelo}
                      disabled={busy}
                      onSaved={(updated) => {
                        setDuelo(updated);
                        setMessage("Datos del encuentro actualizados.");
                        setError(null);
                      }}
                      onError={setError}
                    />
                    {enConfig ? (
                      <div id="duelo-convocatoria-inline">
                        <QuickModeConvocatoriaGate
                          open={wantConvocatoria}
                          live={convIsLive}
                          panelId="duelo-convocatoria-panel"
                          onToggle={() => {
                            setConvPanelOpen((v) => {
                              const next = !v;
                              if (next || convIsLive) setConvTouched(true);
                              return next;
                            });
                          }}
                        >
                          {wantConvocatoria ? (
                            <ConvocatoriaWhatsAppPanel
                              embedded
                              shareOnly
                              onLiveChange={onConvLiveChange}
                              context={buildDueloConvocatoriaContext({
                                dueloId: duelo.id,
                                name: duelo.nombre,
                                locationLabel: lugarConvocatoria,
                                includeLugar,
                                canchaLabel: duelo.cancha ?? undefined,
                                scheduledAt: duelo.programado_en,
                                scheduledUntil: duelo.programado_hasta,
                                clubName: convocatoriaOrigin,
                                categoryLabel: dueloConvocatoriaNivel(duelo),
                              })}
                            />
                          ) : null}
                        </QuickModeConvocatoriaGate>
                      </div>
                    ) : null}
                  </section>
                  {enJuego ? <Duelo2v2PublicShare publicUrl={publicUrl} /> : null}
                </>
              }
              stepper={
                <QuickModeStepper
                  steps={steps}
                  activeId={step}
                  onChange={(id) => setStep(id as GestionarStepId)}
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
                      <li className={detallesOk ? "is-ok" : ""}>Detalles</li>
                      <li className={convTouched ? "is-ok" : ""}>Convocatoria</li>
                      <li className={pairsOk ? "is-ok" : ""}>Parejas A / B</li>
                      <li className={duelo.ganador ? "is-ok" : ""}>
                        Listo para finalizar
                      </li>
                    </ul>
                  </section>
                  <section className="qm-ws-panel__block">
                    <h3 className="qm-ws-panel__label">
                      {enJuego ? "En juego" : "Convocatoria"}
                    </h3>
                    {enJuego ? (
                      <>
                        <p className="qm-ws-panel__conv-line">
                          Marcador en vivo
                        </p>
                        <button
                          type="button"
                          className="qm-ws__text-btn"
                          onClick={() => setStep("control")}
                        >
                          Ir al marcador
                        </button>
                        <button
                          type="button"
                          className="qm-ws__text-btn"
                          disabled={busy}
                          onClick={() => void handleReiniciarMarcador()}
                        >
                          Reiniciar marcador
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="qm-ws-panel__conv-line">{convLine}</p>
                        <button
                          type="button"
                          className="qm-ws__text-btn"
                          onClick={goConvocatoria}
                        >
                          Ir a convocatoria
                        </button>
                      </>
                    )}
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
    </Duelo2v2PageShell>
  );
};
