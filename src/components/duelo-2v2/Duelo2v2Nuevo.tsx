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
import { QuickModeHero } from "../platform/quickMode";
import { Duelo2v2PageShell } from "./Duelo2v2PageShell";
import { navigateDuelo2v2, duelo2v2GestionarPath } from "./duelo2v2Nav";
import "./duelo2v2-page.css";

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
    };
  }, []);

  const [nombre, setNombre] = useState("");
  const [mostrarLugar, setMostrarLugar] = useState(true);
  const [lugar, setLugar] = useState(convocatoriaOrigin);
  const [cancha, setCancha] = useState(CANCHA_DEFAULT_VALUE);
  const [categoria, setCategoria] = useState("");
  const [draftDate, setDraftDate] = useState(defaultSchedule.date);
  const [draftTimeStart, setDraftTimeStart] = useState(defaultSchedule.timeStart);
  const [draftTimeEnd, setDraftTimeEnd] = useState(defaultSchedule.timeEnd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** ID de un duelo en configuración (solo para tarjeta explícita; no hidrata form). */
  const [pendingDueloId, setPendingDueloId] = useState<string | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const saveLock = useRef(false);
  const pendingProbeStarted = useRef(false);

  const canSubmit =
    nombre.trim().length > 0 &&
    (!mostrarLugar || lugar.trim().length > 0) &&
    cancha.trim().length > 0 &&
    draftDate.trim().length > 0 &&
    draftTimeStart.trim().length > 0 &&
    draftTimeEnd.trim().length > 0 &&
    Boolean(user?.id);

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
    setDraftDate(defaultSchedule.date);
    setDraftTimeStart(defaultSchedule.timeStart);
    setDraftTimeEnd(defaultSchedule.timeEnd);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <Duelo2v2PageShell wide className="qm-prep">
      <ActionBar className="duelo2v2-toolbar riviera-back-toolbar">
        <Button
          type="button"
          variant="back"
          onClick={() => navigateDuelo2v2("/duelo-2v2")}
        >
          ← Volver
        </Button>
      </ActionBar>

      <QuickModeHero
        eyebrow={modeEyebrow}
        title="Nuevo duelo 2 vs 2"
        subtitle="Completa los datos y guarda. Después podrás compartir la convocatoria."
        statusLabel="Preparación"
        stats={[
          { label: "Formato", value: "2 vs 2" },
          { label: "Cancha", value: cancha.trim() || "—" },
          { label: "Día", value: draftDate || "—" },
        ]}
      />

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

          <form className="duelo2v2-form" onSubmit={(e) => void handleSubmit(e)}>
            <div className="duelo2v2-form__name-row">
              <label htmlFor="duelo-nombre">Nombre del encuentro</label>
              <input
                id="duelo-nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Encuentro Riviera Open — Sábado"
                required
              />
            </div>

            <div className="duelo2v2-form__lugar-block">
              <label className="duelo2v2-form__toggle">
                <input
                  type="checkbox"
                  checked={mostrarLugar}
                  onChange={(e) => setMostrarLugar(e.target.checked)}
                />
                <span>Incluir lugar en la convocatoria</span>
              </label>
              {mostrarLugar ? (
                <label className="duelo2v2-form__field">
                  <span className="duelo2v2-form__field-label">Lugar</span>
                  <input
                    type="text"
                    value={lugar}
                    onChange={(e) => setLugar(e.target.value)}
                    placeholder="Ej. Hack Pádel, Padelito…"
                    required
                  />
                </label>
              ) : (
                <p className="duelo2v2-form__hint">
                  Ideal si tu club siempre juega en la misma sede.
                </p>
              )}
            </div>

            <div className="duelo2v2-form__schedule-row">
              <label className="duelo2v2-form__field">
                <span className="duelo2v2-form__field-label">Cancha</span>
                <input
                  type="text"
                  value={cancha}
                  onChange={(e) => setCancha(e.target.value)}
                  placeholder="Ej. 1"
                  required
                />
              </label>
              <label className="duelo2v2-form__field">
                <span className="duelo2v2-form__field-label">Categoría / nivel</span>
                <input
                  type="text"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  placeholder="Ej. 5ta Fuerza"
                  list="duelo-categoria-sugerencias"
                />
                <datalist id="duelo-categoria-sugerencias">
                  <option value="Open" />
                  <option value="1ra Fuerza" />
                  <option value="2da Fuerza" />
                  <option value="3ra Fuerza" />
                  <option value="4ta Fuerza" />
                  <option value="5ta Fuerza" />
                  <option value="6ta Fuerza" />
                </datalist>
              </label>
              <label className="duelo2v2-form__field">
                <span className="duelo2v2-form__field-label">Día</span>
                <input
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  required
                />
              </label>
              <label className="duelo2v2-form__field">
                <span className="duelo2v2-form__field-label">Hora inicio</span>
                <input
                  type="time"
                  value={draftTimeStart}
                  onChange={(e) => setDraftTimeStart(e.target.value)}
                  required
                />
              </label>
              <label className="duelo2v2-form__field">
                <span className="duelo2v2-form__field-label">Hora fin</span>
                <input
                  type="time"
                  value={draftTimeEnd}
                  onChange={(e) => setDraftTimeEnd(e.target.value)}
                  required
                />
              </label>
            </div>

            <p className="duelo2v2-card__meta" data-testid="duelo-nuevo-whatsapp-hint">
              Después de guardar podrás compartir el duelo por WhatsApp.
            </p>

            {error && <p className="duelo2v2-error">{error}</p>}

            <div className="qm-primary-cta">
              <button
                type="submit"
                className="qm-primary-cta__btn"
                disabled={!canSubmit || busy}
                data-testid="guardar-duelo"
              >
                {busy ? "…" : "Guardar duelo"}
              </button>
            </div>
          </form>
        </>
      )}
    </Duelo2v2PageShell>
  );
};
