import React, { useEffect, useMemo, useRef, useState } from "react";
import { useClubModeEyebrow, useConvocatoriaOriginName } from "../../club-experience";
import { useUser } from "../../contexts/UserContext";
import {
  clearDuelo2v2CreateSession,
  markDuelo2v2PendingDraft,
} from "../../lib/duelo2v2/duelo2v2CreateDraft";
import { writeDueloLugarPrefs } from "../../lib/duelo2v2/dueloLugarPrefs";
import {
  CANCHA_DEFAULT_VALUE,
} from "../../lib/torneoExpress/canchaDisplay";
import { partidoDateInputValue } from "../../lib/torneoExpress/partidoSchedule";
import { saveNewDuelo2v2 } from "../../lib/duelo2v2/saveNewDuelo";
import {
  createDuelo2v2OpenDraft,
  getDuelos2v2,
} from "../../services/duelo2v2Service";
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
import { Duelo2v2ConfigFields } from "./Duelo2v2ConfigFields";
import { Duelo2v2PageShell } from "./Duelo2v2PageShell";
import { navigateDuelo2v2, duelo2v2GestionarPath } from "./duelo2v2Nav";
import "./duelo2v2-page.css";

type NuevoStepId = "listo";

function stepStatus(
  id: NuevoStepId,
  active: NuevoStepId,
  complete: boolean
): QuickModeStepStatus {
  if (active === id) return "active";
  if (complete) return "complete";
  return "pending";
}

/**
 * Pantalla de alta: siempre empieza limpia.
 * Nunca recupera openDueloId / convocatoria / inscritos en silencio.
 * Un borrador previo solo aparece como tarjeta con acción explícita.
 */
export const Duelo2v2Nuevo: React.FC = () => {
  const modeEyebrow = useClubModeEyebrow();
  const convocatoriaOrigin = useConvocatoriaOriginName();
  const { user } = useUser();
  const defaultSchedule = useMemo(() => {
    const now = new Date();
    return {
      date: partidoDateInputValue(now.toISOString()),
      timeStart: "15:00",
      timeEnd: "17:00",
      durationMinutes: 120,
    };
  }, []);

  const [step] = useState<NuevoStepId>("listo");
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [wantConvocatoria, setWantConvocatoria] = useState(false);
  const [nombre, setNombre] = useState("");
  const [mostrarLugar, setMostrarLugar] = useState(true);
  const [lugar, setLugar] = useState(convocatoriaOrigin);
  const [cancha, setCancha] = useState(CANCHA_DEFAULT_VALUE);
  const [categoria, setCategoria] = useState("");
  const [nivel, setNivel] = useState("");
  const [draftDate, setDraftDate] = useState(defaultSchedule.date);
  const [draftTimeStart, setDraftTimeStart] = useState(defaultSchedule.timeStart);
  const [draftTimeEnd, setDraftTimeEnd] = useState(defaultSchedule.timeEnd);
  const [durationMinutes, setDurationMinutes] = useState(
    defaultSchedule.durationMinutes
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** ID de un duelo en configuración (solo para tarjeta explícita; no hidrata form). */
  const [pendingDueloId, setPendingDueloId] = useState<string | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const saveLock = useRef(false);
  const pendingProbeStarted = useRef(false);

  const encuentroOk =
    nombre.trim().length > 0 && cancha.trim().length > 0;
  const horarioOk =
    (!mostrarLugar || lugar.trim().length > 0) &&
    draftDate.trim().length > 0 &&
    draftTimeStart.trim().length > 0 &&
    draftTimeEnd.trim().length > 0;
  const canSubmit =
    encuentroOk && horarioOk && Boolean(user?.id);

  /**
   * Al montar Nuevo:
   * 1) limpia sessionStorage de creación (nada de openDueloId silencioso);
   * 2) opcionalmente ofrece Continuar si hay un duelo en `configuracion` en BD.
   * Nunca hidrata el formulario ni monta convocatoria.
   */
  useEffect(() => {
    const organizadorId = user?.id?.trim();
    if (!organizadorId) {
      setPendingDueloId(null);
      setPendingLabel(null);
      pendingProbeStarted.current = false;
      return;
    }

    if (pendingProbeStarted.current) return;
    pendingProbeStarted.current = true;

    clearDuelo2v2CreateSession(organizadorId);

    let cancelled = false;

    const probe = async () => {
      try {
        const list = await getDuelos2v2();
        if (cancelled) return;
        const pending = list.find((d) => d.estado === "configuracion");
        if (pending) {
          setPendingDueloId(pending.id);
          setPendingLabel(pending.nombre);
        } else {
          setPendingDueloId(null);
          setPendingLabel(null);
        }
      } catch {
        if (!cancelled) {
          setPendingDueloId(null);
          setPendingLabel(null);
        }
      }
    };

    void probe();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleContinueDraft = () => {
    const id = pendingDueloId?.trim();
    if (!id) return;
    navigateDuelo2v2(duelo2v2GestionarPath(id));
  };

  const handleDiscardDraft = () => {
    const organizadorId = user?.id?.trim();
    if (organizadorId) clearDuelo2v2CreateSession(organizadorId);
    // Solo oculta la tarjeta: no borra la fila en BD (el duelo sigue en la lista).
    setPendingDueloId(null);
    setPendingLabel(null);
    setNombre("");
    setMostrarLugar(true);
    setLugar(convocatoriaOrigin);
    setCancha(CANCHA_DEFAULT_VALUE);
    setCategoria("");
    setNivel("");
    setDraftDate(defaultSchedule.date);
    setDraftTimeStart(defaultSchedule.timeStart);
    setDraftTimeEnd(defaultSchedule.timeEnd);
    setDurationMinutes(defaultSchedule.durationMinutes);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !user?.id || saveLock.current) return;

    saveLock.current = true;
    setBusy(true);
    setError(null);
    try {
      await saveNewDuelo2v2(
        {
          organizadorId: user.id,
          nombre,
          cancha,
          categoria,
          nivel,
          lugar: mostrarLugar ? lugar : "",
          mostrarLugar,
          draftDate,
          draftTimeStart,
          draftTimeEnd,
        },
        {
          createDuelo2v2OpenDraft,
          navigate: navigateDuelo2v2,
          gestionarPath: duelo2v2GestionarPath,
          afterCreate: (duelo) => {
            markDuelo2v2PendingDraft(user.id, {
              openDueloId: duelo.id,
              nombre: duelo.nombre,
              cancha: duelo.cancha ?? cancha,
              categoria: categoria.trim(),
              draftDate,
              draftTimeStart,
              draftTimeEnd,
            });
            writeDueloLugarPrefs(duelo.id, {
              lugar: lugar.trim(),
              mostrarLugar,
              categoria: categoria.trim(),
            });
          },
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el duelo");
      saveLock.current = false;
    } finally {
      setBusy(false);
    }
  };

  const steps: QuickModeStep[] = useMemo(
    () => [
      {
        id: "listo",
        label: "Listo",
        status: stepStatus("listo", step, canSubmit),
        count: canSubmit ? "OK" : "Pendiente",
      },
    ],
    [step, canSubmit]
  );

  const ctaHint = !user?.id
    ? "Inicia sesión para crear un duelo"
    : !encuentroOk
      ? "Completa nombre y cancha"
      : !horarioOk
        ? "Completa lugar y horario"
        : "Luego podrás lanzar la convocatoria por WhatsApp";

  const ctaProps = {
    variant: "sidebar" as const,
    label: busy
      ? "Guardando…"
      : canSubmit
        ? "Guardar y lanzar convocatoria"
        : "Guardar duelo",
    disabled: !canSubmit || busy,
    loading: busy,
    hint: ctaHint,
    testId: "guardar-duelo",
    onClick: () => void handleSubmit(),
  };

  const scrollToDetails = () => {
    document
      .getElementById("duelo-nuevo-detalles-inline")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const detailsPanel = (
    <section
      id="duelo-nuevo-detalles-inline"
      className="qm-ws__details-inline"
      aria-label="Detalles de la reta"
    >
      <div className="reta-config-panel reta-config-panel--inline">
        <header className="reta-config-panel__toolbar">
          <div className="reta-config-panel__toolbar-copy">
            <h2 className="reta-config-panel__title">Detalles de la reta</h2>
            <p className="reta-config-panel__subtitle">
              Nombre, horario, sede y cancha.
            </p>
          </div>
        </header>
        <Duelo2v2ConfigFields
          idPrefix="duelo"
          values={{
            nombre,
            cancha,
            categoria,
            nivel,
            mostrarLugar,
            lugar,
            draftDate,
            draftTimeStart,
            draftTimeEnd,
            durationMinutes,
          }}
          onChange={(next) => {
            setNombre(next.nombre);
            setCancha(next.cancha);
            setCategoria(next.categoria);
            setNivel(next.nivel);
            setMostrarLugar(next.mostrarLugar);
            setLugar(next.lugar);
            setDraftDate(next.draftDate);
            setDraftTimeStart(next.draftTimeStart);
            setDraftTimeEnd(next.draftTimeEnd);
            setDurationMinutes(next.durationMinutes);
          }}
          disabled={busy}
        />
      </div>
      <div id="duelo-nuevo-convocatoria-inline">
        <QuickModeConvocatoriaGate
          open={wantConvocatoria}
          live={false}
          panelId="duelo-nuevo-convocatoria-panel"
          onToggle={() => setWantConvocatoria((v) => !v)}
          hintOn="Guarda el duelo para configurar cupo y WhatsApp"
          hintOff="Opcional · Inscripciones con enlace público"
        >
          <div className="qm-ws__conv-prelaunch-note" role="note">
            <p>
              Primero guarda el duelo. Después podrás lanzar la convocatoria
              con «Lanzar y copiar» para WhatsApp (cupo fijo de 4).
            </p>
          </div>
        </QuickModeConvocatoriaGate>
      </div>
    </section>
  );

  const workbenchBody = (
    <ul className="qm-ws__ready-check">
      <li className={encuentroOk ? "is-ok" : "is-miss"}>
        <span className="qm-ws__ready-mark" aria-hidden>
          {encuentroOk ? "OK" : "!"}
        </span>
        <span className="qm-ws__ready-copy">
          {encuentroOk
            ? `${nombre.trim()} · cancha ${cancha.trim()}`
            : "Falta nombre o cancha"}
        </span>
        {!encuentroOk ? (
          <button
            type="button"
            className="qm-ws__text-btn"
            onClick={scrollToDetails}
          >
            Completar
          </button>
        ) : null}
      </li>
      <li className={horarioOk ? "is-ok" : "is-miss"}>
        <span className="qm-ws__ready-mark" aria-hidden>
          {horarioOk ? "OK" : "!"}
        </span>
        <span className="qm-ws__ready-copy">
          {horarioOk
            ? `${draftDate} · ${draftTimeStart}–${draftTimeEnd}`
            : "Falta lugar u horario"}
        </span>
        {!horarioOk ? (
          <button
            type="button"
            className="qm-ws__text-btn"
            onClick={scrollToDetails}
          >
            Completar
          </button>
        ) : null}
      </li>
      <li className="is-soft">
        <span className="qm-ws__ready-mark" aria-hidden>
          ·
        </span>
        <span className="qm-ws__ready-copy">
          Al guardar abres Gestionar: ahí eliges las 2 parejas (4 jugadores) y
          lanzas la convocatoria.
        </span>
      </li>
    </ul>
  );

  const sidebarPanel = (
    <div className="qm-ws-panel">
      <section className="qm-ws-panel__block">
        <h3 className="qm-ws-panel__label">Progreso</h3>
        <ul className="qm-ws-panel__progress">
          <li className={encuentroOk ? "is-ok" : ""}>Nombre y cancha</li>
          <li className={horarioOk ? "is-ok" : ""}>Lugar y horario</li>
          <li className={canSubmit ? "is-ok" : ""}>Listo para guardar</li>
        </ul>
      </section>
      <section className="qm-ws-panel__block">
        <h3 className="qm-ws-panel__label">Siguiente</h3>
        <p className="qm-ws-panel__conv-line">
          Al guardar eliges parejas y lanzas la convocatoria por WhatsApp.
        </p>
      </section>
      <section className="qm-ws-panel__block qm-ws-panel__cta-desktop">
        <QuickModePrimaryCta {...ctaProps} />
      </section>
    </div>
  );

  return (
    <Duelo2v2PageShell wide className="duelo2v2-nuevo">
      <ActionBar className="duelo2v2-toolbar riviera-back-toolbar">
        <Button
          type="button"
          variant="back"
          onClick={() => navigateDuelo2v2("/duelo-2v2")}
        >
          ← Volver al inicio
        </Button>
      </ActionBar>

      {!user?.id ? (
        <p className="duelo2v2-error">Debes iniciar sesión para crear un duelo.</p>
      ) : (
        <>
          {pendingDueloId ? (
            <section
              className="duelo2v2-card rv-card"
              data-testid="duelo-pending-draft-card"
              style={{ marginBottom: "1.25rem" }}
            >
              <div className="duelo2v2-card__title">Encontramos un duelo pendiente</div>
              <p className="duelo2v2-card__meta">
                {pendingLabel
                  ? `«${pendingLabel}» sigue en configuración.`
                  : "Hay un duelo en configuración."}{" "}
                Puedes continuarlo o descartarlo y crear uno nuevo.
              </p>
              <div className="duelo2v2-card__actions">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  data-testid="continuar-borrador"
                  onClick={handleContinueDraft}
                >
                  Continuar borrador
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="descartar-borrador"
                  onClick={handleDiscardDraft}
                >
                  Descartar y crear uno nuevo
                </Button>
              </div>
            </section>
          ) : null}

          {error ? <p className="duelo2v2-error">{error}</p> : null}

          <QuickModePrepWorkspace
            className={`qm-ws--wide${mobileSummaryOpen ? " is-summary-open" : ""}`}
            header={
              <QuickModeEventHeader
                club={modeEyebrow}
                title="Nuevo duelo 2 vs 2"
                modality="Duelo 2 vs 2"
                statusLabel="Pendiente"
                centerMetrics={[
                  { label: "Formato", value: "2 vs 2" },
                  { label: "Cancha", value: cancha.trim() || "—" },
                  { label: "Día", value: draftDate || "—" },
                  {
                    label: "Horario",
                    value:
                      draftTimeStart && draftTimeEnd
                        ? `${draftTimeStart}–${draftTimeEnd}`
                        : "—",
                  },
                ]}
                rightMeta={[
                  {
                    label: "Lugar",
                    value: mostrarLugar ? lugar.trim() || "—" : "Oculto",
                  },
                  {
                    label: "Categoría",
                    value: categoria.trim() || "—",
                  },
                  {
                    label: "Nivel",
                    value: nivel.trim() || "—",
                  },
                ]}
              />
            }
            details={detailsPanel}
            stepper={
              <QuickModeStepper
                steps={steps}
                activeId={step}
                onChange={() => undefined}
              />
            }
            workbench={
              <>
                <div className="qm-ws__workbench-head">
                  <h2 className="qm-ws__workbench-title">Listo para guardar</h2>
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
            sidebar={sidebarPanel}
            stickyCta={<QuickModePrimaryCta {...ctaProps} />}
          />
        </>
      )}
    </Duelo2v2PageShell>
  );
};
