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

  const nameReady = nombre.trim().length > 0;
  const canchaReady = cancha.trim().length > 0;
  const whenReady =
    draftDate.trim().length > 0 &&
    draftTimeStart.trim().length > 0 &&
    draftTimeEnd.trim().length > 0 &&
    durationMinutes > 0;
  const lugarReady = !mostrarLugar || lugar.trim().length > 0;
  const sportConfigured = nivel.trim().length > 0;

  const encuentroOk = nameReady && canchaReady;
  const horarioOk = lugarReady && whenReady;
  const canSubmit = encuentroOk && horarioOk && Boolean(user?.id);

  const readyCount = [
    nameReady,
    whenReady,
    canchaReady,
    lugarReady,
  ].filter(Boolean).length;

  const step1Done = nameReady && whenReady && canchaReady;
  const step2Done = step1Done && sportConfigured;
  const step3Done = step1Done && lugarReady;
  const step4Done = canSubmit;

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

  const ctaProps = {
    variant: "sidebar" as const,
    label: busy ? "Guardando…" : "Guardar y continuar",
    disabled: !canSubmit || busy,
    loading: busy,
    onClick: () => void handleSubmit(),
  };

  const detailsPanel = (
    <section
      id="duelo-nuevo-detalles-inline"
      className="qm-ws__details-inline qm-ws__details-inline--compose"
      aria-label="Detalles del duelo"
    >
      <div className="reta-config-panel reta-config-panel--inline reta-config-panel--compose">
        <header className="reta-config-panel__toolbar reta-config-panel__toolbar--guided">
          <div className="reta-config-panel__toolbar-top">
            <div className="reta-config-panel__toolbar-copy">
              <span className="reta-config-panel__eyebrow">
                Asistente de creación · Duelo 2 vs 2
              </span>
              <h2 className="reta-config-panel__title">
                Configura tu duelo paso a paso
              </h2>
              <p className="reta-config-panel__subtitle">
                Configura lo esencial para empezar y deja lista su publicación.
              </p>
            </div>
            <span
              className={`reta-config-panel__progress-pill${
                canSubmit ? " is-complete" : ""
              }`}
              aria-live="polite"
            >
              {canSubmit
                ? "✓ Esenciales listos"
                : `${readyCount} de 4 esenciales`}
            </span>
          </div>

          <ol
            className="qm-compose-steps"
            aria-label="Pasos para crear tu duelo"
          >
            <li
              className={`qm-compose-steps__item${
                step1Done ? " is-done" : " is-current"
              }`}
            >
              <span className="qm-compose-steps__num">
                {step1Done ? "✓" : "1"}
              </span>
              <span className="qm-compose-steps__label">
                Información básica
              </span>
            </li>
            <li
              className={`qm-compose-steps__item${
                step2Done ? " is-done" : step1Done ? " is-current" : ""
              }`}
            >
              <span className="qm-compose-steps__num">
                {step2Done ? "✓" : "2"}
              </span>
              <span className="qm-compose-steps__label">
                Configuración deportiva
              </span>
            </li>
            <li
              className={`qm-compose-steps__item${
                step3Done ? " is-done" : ""
              }`}
            >
              <span className="qm-compose-steps__num">
                {step3Done ? "✓" : "3"}
              </span>
              <span className="qm-compose-steps__label">
                Detalles y convocatoria
              </span>
            </li>
            <li
              className={`qm-compose-steps__item${
                step4Done ? " is-done" : ""
              }`}
            >
              <span className="qm-compose-steps__num">
                {step4Done ? "✓" : "4"}
              </span>
              <span className="qm-compose-steps__label">Revisión final</span>
            </li>
          </ol>
        </header>

        <Duelo2v2ConfigFields
          idPrefix="duelo"
          guided
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

        <div
          id="duelo-nuevo-convocatoria-inline"
          className="reta-config-panel__conv reta-config-panel__conv--compose"
        >
          <div className="reta-config-panel__conv-head">
            <div className="reta-config-panel__conv-copy">
              <h4 className="reta-config-panel__conv-title">
                Convocatoria pública
              </h4>
              <p className="reta-config-panel__conv-desc">
                Actívala si quieres que los jugadores puedan registrarse mediante
                enlace.
              </p>
            </div>
          </div>
          <QuickModeConvocatoriaGate
            open={wantConvocatoria}
            live={false}
            panelId="duelo-nuevo-convocatoria-panel"
            titleOn="Activa"
            titleOff="Inactiva"
            hintOn="Al guardar podrás lanzar la convocatoria con cupo fijo de 4 jugadores."
            hintOff="Opcional · Puedes activarla ahora o después"
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
      </div>
    </section>
  );

  const sidebarPanel = (
    <div className="qm-ws-panel qm-ws-panel--compose">
      <section className="qm-ws-panel__compose-summary" aria-label="Resumen">
        <div className="qm-ws-panel__compose-head">
          <div>
            <span className="qm-ws-panel__compose-step">
              Paso 4 · Revisión final
            </span>
            <p className="qm-ws-panel__compose-kicker">Resumen</p>
          </div>
          <span
            className={`qm-ws-panel__compose-badge${
              canSubmit ? " is-ready" : ""
            }`}
          >
            {canSubmit ? "Listo" : `${readyCount}/4`}
          </span>
        </div>

        <div
          className="qm-ws-panel__compose-progress"
          role="progressbar"
          aria-valuenow={readyCount}
          aria-valuemin={0}
          aria-valuemax={4}
          aria-label="Progreso de datos esenciales"
        >
          <div
            className="qm-ws-panel__compose-progress-fill"
            style={{ width: `${(readyCount / 4) * 100}%` }}
          />
        </div>

        <ul className="qm-ws-panel__compose-checklist">
          <li
            className={`qm-ws-panel__compose-check${
              nameReady ? " is-done" : " is-missing"
            }`}
          >
            <span className="qm-ws-panel__compose-check-icon" aria-hidden>
              {nameReady ? "✓" : "○"}
            </span>
            <div className="qm-ws-panel__compose-check-body">
              <span className="qm-ws-panel__compose-check-label">
                Nombre del duelo
              </span>
              <span className="qm-ws-panel__compose-check-val">
                {nameReady
                  ? nombre.trim()
                  : "Pendiente — escribe un nombre"}
              </span>
            </div>
          </li>

          <li
            className={`qm-ws-panel__compose-check${
              whenReady ? " is-done" : " is-missing"
            }`}
          >
            <span className="qm-ws-panel__compose-check-icon" aria-hidden>
              {whenReady ? "✓" : "○"}
            </span>
            <div className="qm-ws-panel__compose-check-body">
              <span className="qm-ws-panel__compose-check-label">
                Fecha y horario
              </span>
              <span className="qm-ws-panel__compose-check-val">
                {whenReady
                  ? `${formatSidebarWhen(draftDate, draftTimeStart)} · ${durationMinutes} min${
                      draftTimeEnd.trim() ? ` (fin ${draftTimeEnd.trim()})` : ""
                    }`
                  : "Pendiente — define día y hora"}
              </span>
            </div>
          </li>

          <li
            className={`qm-ws-panel__compose-check${
              canchaReady ? " is-done" : " is-missing"
            }`}
          >
            <span className="qm-ws-panel__compose-check-icon" aria-hidden>
              {canchaReady ? "✓" : "○"}
            </span>
            <div className="qm-ws-panel__compose-check-body">
              <span className="qm-ws-panel__compose-check-label">
                Cancha y modalidad
              </span>
              <span className="qm-ws-panel__compose-check-val">
                {canchaReady
                  ? `Cancha ${cancha.trim()} · Duelo 2 vs 2`
                  : "Pendiente — indica la cancha"}
              </span>
            </div>
          </li>

          <li
            className={`qm-ws-panel__compose-check${
              lugarReady ? " is-done" : " is-missing"
            }`}
          >
            <span className="qm-ws-panel__compose-check-icon" aria-hidden>
              {lugarReady ? "✓" : "○"}
            </span>
            <div className="qm-ws-panel__compose-check-body">
              <span className="qm-ws-panel__compose-check-label">
                Sede del encuentro
              </span>
              <span className="qm-ws-panel__compose-check-val">
                {mostrarLugar
                  ? lugarReady
                    ? lugar.trim()
                    : "Pendiente — indica el club o sede"
                  : "Oculto en la ficha pública"}
              </span>
            </div>
          </li>
        </ul>

        <div className="qm-ws-panel__compose-tags">
          <span className="qm-ws-panel__compose-tag">
            {nivel.trim() || "Categoría abierta"} · 4 jugadores
          </span>
          <span className="qm-ws-panel__compose-tag">
            {wantConvocatoria ? "Convocatoria por enlace" : "Registro manual"}
          </span>
        </div>
      </section>

      <div className="qm-ws-panel__compose-rule" aria-hidden />

      <section className="qm-ws-panel__compose-status" aria-live="polite">
        {canSubmit ? (
          <>
            <p className="qm-ws-panel__compose-ready">
              ✓ Todo listo para continuar
            </p>
            <p className="qm-ws-panel__compose-cta-hint">
              Al guardar pasarás a armar las parejas o lanzar la convocatoria por
              WhatsApp.
            </p>
          </>
        ) : (
          <>
            <p className="qm-ws-panel__compose-blocked">
              ● Faltan datos esenciales
            </p>
            <p className="qm-ws-panel__compose-reason">
              {blockReason?.replace(/\.$/, "") ||
                "Completa los campos marcados para continuar"}
            </p>
          </>
        )}
      </section>

      <section className="qm-ws-panel__block qm-ws-panel__cta-desktop">
        <QuickModePrimaryCta {...ctaProps} testId="guardar-duelo" />
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
                title="Nuevo Duelo 2v2"
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
                <QuickModePrimaryCta {...ctaProps} />
              </div>
            }
          />
        </>
      )}
    </Duelo2v2PageShell>
  );
};
