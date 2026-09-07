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
} from "../platform/quickMode";
import { Duelo2v2ConfigFields } from "./Duelo2v2ConfigFields";
import { Duelo2v2PageShell } from "./Duelo2v2PageShell";
import { navigateDuelo2v2, duelo2v2GestionarPath } from "./duelo2v2Nav";
import "./duelo2v2-page.css";

const MONTHS_SHORT = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
] as const;

function formatSidebarWhen(date: string, time: string): string {
  if (!date) return "Sin fecha";
  const parts = date.split("-").map((x) => Number(x));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return date;
  const month = MONTHS_SHORT[m - 1] ?? "";
  const day = String(d).padStart(2, "0");
  return time ? `${day} ${month} · ${time}` : `${day} ${month}`;
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

  const [wantConvocatoria, setWantConvocatoria] = useState(false);
  const [nombre, setNombre] = useState("");
  const [mostrarLugar, setMostrarLugar] = useState(true);
  const [lugar, setLugar] = useState(convocatoriaOrigin);
  const [mostrarCosto, setMostrarCosto] = useState(false);
  const [costo, setCosto] = useState("");
  const [mostrarPremio, setMostrarPremio] = useState(false);
  const [premio, setPremio] = useState("");
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
          costo,
          mostrarCosto,
          premio,
          mostrarPremio,
          draftDate,
          draftTimeStart,
          draftTimeEnd,
          durationMinutes,
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

  const blockReason = !user?.id
    ? "Inicia sesión para crear un duelo."
    : !nombre.trim()
      ? "Agrega un nombre para continuar."
      : !cancha.trim()
        ? "Indica la cancha para continuar."
        : !draftDate.trim()
          ? "Agrega la fecha para continuar."
          : !draftTimeStart.trim()
            ? "Agrega la hora para continuar."
            : mostrarLugar && !lugar.trim()
              ? "Agrega el lugar para continuar."
              : null;

  const ctaHint = blockReason ?? "Luego podrás lanzar la convocatoria por WhatsApp";

  const ctaProps = {
    variant: "sidebar" as const,
    label: busy ? "Guardando…" : "Guardar y continuar",
    disabled: !canSubmit || busy,
    loading: busy,
    hint: canSubmit ? undefined : ctaHint,
    testId: "guardar-duelo",
    onClick: () => void handleSubmit(),
  };

  const detailsPanel = (
    <section
      id="duelo-nuevo-detalles-inline"
      className="qm-ws__details-inline qm-ws__details-inline--compose"
      aria-label="Detalles de la reta"
    >
      <div className="reta-config-panel reta-config-panel--inline reta-config-panel--compose">
        <header className="reta-config-panel__toolbar">
          <div className="reta-config-panel__toolbar-copy">
            <h2 className="reta-config-panel__title">Nuevo duelo</h2>
            <p className="reta-config-panel__subtitle">
              Configura lo esencial para empezar.
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
            mostrarCosto,
            costo,
            mostrarPremio,
            premio,
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
            setMostrarCosto(next.mostrarCosto);
            setCosto(next.costo);
            setMostrarPremio(next.mostrarPremio);
            setPremio(next.premio);
            setDraftDate(next.draftDate);
            setDraftTimeStart(next.draftTimeStart);
            setDraftTimeEnd(next.draftTimeEnd);
            setDurationMinutes(next.durationMinutes);
          }}
          disabled={busy}
        />
      </div>
      <div
        id="duelo-nuevo-convocatoria-inline"
        className="reta-config-panel__conv reta-config-panel__conv--compose"
      >
        <div className="reta-config-panel__conv-head">
          <h3 className="reta-config-panel__conv-title">Convocatoria pública</h3>
          <p className="reta-config-panel__conv-desc">
            Permite que jugadores se registren mediante enlace.
          </p>
        </div>
        <QuickModeConvocatoriaGate
          open={wantConvocatoria}
          live={false}
          panelId="duelo-nuevo-convocatoria-panel"
          titleOn="Activa"
          titleOff="Inactiva"
          hintOn="Panel abierto — guarda el duelo para configurar cupo."
          hintOff="Opcional"
          onToggle={() => setWantConvocatoria((v) => !v)}
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

  const sidebarPanel = (
    <div className="qm-ws-panel qm-ws-panel--compose">
      <section className="qm-ws-panel__compose-summary" aria-label="Resumen">
        <p className="qm-ws-panel__compose-kicker">Resumen</p>
        <p className="qm-ws-panel__compose-format">Duelo 2 vs 2</p>
        <p className="qm-ws-panel__compose-when">
          {formatSidebarWhen(draftDate, draftTimeStart)}
        </p>
        <p className="qm-ws-panel__compose-meta">
          {durationMinutes} MIN · CANCHA {cancha.trim() || "—"}
        </p>
        {mostrarLugar && lugar.trim() ? (
          <p className="qm-ws-panel__compose-lugar">{lugar.trim()}</p>
        ) : null}
        <p className="qm-ws-panel__compose-nivel">
          {nivel.trim() || "Sin definir"}
        </p>
      </section>

      <div className="qm-ws-panel__compose-rule" aria-hidden />

      <section className="qm-ws-panel__compose-status" aria-live="polite">
        {canSubmit ? (
          <p className="qm-ws-panel__compose-ready">✓ Todo listo para continuar</p>
        ) : (
          <>
            <p className="qm-ws-panel__compose-blocked">● Faltan datos</p>
            <p className="qm-ws-panel__compose-reason">
              {blockReason?.replace(/\.$/, "") || "Completa lo esencial"}
            </p>
          </>
        )}
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
            className="qm-ws--wide qm-ws--create-compose"
            header={
              <QuickModeEventHeader
                className="qm-event-header--create-min"
                club={modeEyebrow}
                title="Nueva reta"
                modality="Duelo 2 vs 2"
                statusLabel="Pendiente"
                phaseLabel=""
              />
            }
            details={detailsPanel}
            stepper={null}
            workbench={null}
            sidebar={sidebarPanel}
            stickyCta={
              <div className="qm-ws__compose-mobile-bar">
                <span className="qm-ws__compose-mobile-status">
                  {canSubmit
                    ? "✓ Lista"
                    : blockReason?.replace(/\.$/, "") || "Faltan datos"}
                </span>
                <QuickModePrimaryCta {...ctaProps} />
              </div>
            }
          />
        </>
      )}
    </Duelo2v2PageShell>
  );
};
