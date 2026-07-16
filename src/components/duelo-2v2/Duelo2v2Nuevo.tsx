import React, { useEffect, useMemo, useRef, useState } from "react";
import { useClubModeEyebrow } from "../../club-experience";
import { useUser } from "../../contexts/UserContext";
import {
  clearDuelo2v2CreateDraft,
  pairToDraftIds,
  readDuelo2v2CreateDraft,
  rehydrateDueloPairFromDraft,
  writeDuelo2v2CreateDraft,
} from "../../lib/duelo2v2/duelo2v2CreateDraft";
import {
  CANCHA_DEFAULT_VALUE,
  normalizeCanchaForSave,
} from "../../lib/torneoExpress/canchaDisplay";
import { partidoDateInputValue } from "../../lib/torneoExpress/partidoSchedule";
import { resolveDueloScheduleFromDraft } from "../../lib/duelo2v2/schedule";
import { listRivieraJugadores } from "../../lib/rivieraJugadores/rivieraJugadoresService";
import {
  ensureDuelo2v2OpenDraft,
  startDuelo2v2,
} from "../../services/duelo2v2Service";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import {
  bothPairsReady,
  DueloPairBuilder,
  type DueloPair,
} from "./DueloPairBuilder";
import { Duelo2v2PageShell } from "./Duelo2v2PageShell";
import { navigateDuelo2v2, duelo2v2GestionarPath } from "./duelo2v2Nav";
import { ConvocatoriaWhatsAppPanel } from "../reta-abierta/ConvocatoriaWhatsAppPanel";
import { buildDueloConvocatoriaContext } from "../../lib/retaAbierta/adapters";
import "./duelo2v2-page.css";

export const Duelo2v2Nuevo: React.FC = () => {
  const modeEyebrow = useClubModeEyebrow();
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
  const [cancha, setCancha] = useState(CANCHA_DEFAULT_VALUE);
  const [draftDate, setDraftDate] = useState(defaultSchedule.date);
  const [draftTimeStart, setDraftTimeStart] = useState(defaultSchedule.timeStart);
  const [draftTimeEnd, setDraftTimeEnd] = useState(defaultSchedule.timeEnd);
  const [pairA, setPairA] = useState<DueloPair | null>(null);
  const [pairB, setPairB] = useState<DueloPair | null>(null);
  const [openDueloId, setOpenDueloId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const draftRestoreStarted = useRef(false);

  const canSubmit =
    nombre.trim().length > 0 &&
    cancha.trim().length > 0 &&
    draftDate.trim().length > 0 &&
    draftTimeStart.trim().length > 0 &&
    draftTimeEnd.trim().length > 0 &&
    bothPairsReady(pairA, pairB) &&
    Boolean(user?.id);

  useEffect(() => {
    const organizadorId = user?.id?.trim();
    if (!organizadorId) {
      setDraftReady(false);
      draftRestoreStarted.current = false;
      return;
    }

    if (draftRestoreStarted.current) return;
    draftRestoreStarted.current = true;

    let cancelled = false;

    const restoreDraft = async () => {
      const stored = readDuelo2v2CreateDraft(organizadorId);
      if (!stored) {
        if (!cancelled) setDraftReady(true);
        return;
      }

      setNombre(stored.nombre);
      setCancha(stored.cancha);
      setDraftDate(stored.draftDate);
      setDraftTimeStart(stored.draftTimeStart);
      setDraftTimeEnd(stored.draftTimeEnd);
      if (stored.openDueloId) setOpenDueloId(stored.openDueloId);

      if (!stored.pairA && !stored.pairB) {
        if (!cancelled) setDraftReady(true);
        return;
      }

      try {
        const jugadores = await listRivieraJugadores(organizadorId, {
          skipCareerEnrich: true,
        });
        if (cancelled) return;
        setPairA(rehydrateDueloPairFromDraft(jugadores, stored.pairA));
        setPairB(rehydrateDueloPairFromDraft(jugadores, stored.pairB));
      } catch (e) {
        console.warn("[duelo-2v2] no se pudo rehidratar borrador de parejas:", e);
      } finally {
        if (!cancelled) setDraftReady(true);
      }
    };

    void restoreDraft();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const organizadorId = user?.id?.trim();
    if (!organizadorId || !draftReady) return;

    writeDuelo2v2CreateDraft(organizadorId, {
      nombre,
      cancha,
      draftDate,
      draftTimeStart,
      draftTimeEnd,
      pairA: pairToDraftIds(pairA),
      pairB: pairToDraftIds(pairB),
      openDueloId,
    });
  }, [
    user?.id,
    draftReady,
    nombre,
    cancha,
    draftDate,
    draftTimeStart,
    draftTimeEnd,
    pairA,
    pairB,
    openDueloId,
  ]);

  const validateLaunchMinimum = (): string | null => {
    if (!nombre.trim()) return "Escribe el nombre del encuentro.";
    if (!cancha.trim()) return "Indica la cancha.";
    if (!draftDate.trim() || !draftTimeStart.trim() || !draftTimeEnd.trim()) {
      return "Completa día y horario.";
    }
    const schedule = resolveDueloScheduleFromDraft(
      draftDate,
      draftTimeStart,
      draftTimeEnd
    );
    if ("error" in schedule) return schedule.error;
    return null;
  };

  const ensureDraftEntity = async () => {
    const schedule = resolveDueloScheduleFromDraft(
      draftDate,
      draftTimeStart,
      draftTimeEnd
    );
    if ("error" in schedule) {
      throw new Error(schedule.error);
    }
    const duelo = await ensureDuelo2v2OpenDraft({
      existingId: openDueloId,
      input: {
        nombre: nombre.trim() || "Duelo 2 vs 2",
        cancha: normalizeCanchaForSave(cancha),
        programado_en: schedule.programado_en,
        programado_hasta: schedule.programado_hasta,
      },
    });
    setOpenDueloId(duelo.id);
    return {
      entityId: duelo.id,
      title: duelo.nombre,
      locationLabel: duelo.cancha ?? cancha,
      scheduledAtIso: duelo.programado_en,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !pairA || !pairB || !user?.id) return;

    setBusy(true);
    setError(null);
    try {
      const schedule = resolveDueloScheduleFromDraft(
        draftDate,
        draftTimeStart,
        draftTimeEnd
      );
      if ("error" in schedule) {
        setError(schedule.error);
        setBusy(false);
        return;
      }

      const duelo = await startDuelo2v2({
        existingDraftId: openDueloId,
        input: {
          nombre: nombre.trim(),
          cancha: normalizeCanchaForSave(cancha),
          programado_en: schedule.programado_en,
          programado_hasta: schedule.programado_hasta,
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
      clearDuelo2v2CreateDraft(user.id);
      navigateDuelo2v2(duelo2v2GestionarPath(duelo.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el duelo");
    } finally {
      setBusy(false);
    }
  };

  const convocatoriaContext = buildDueloConvocatoriaContext({
    dueloId: openDueloId ?? "",
    name: nombre.trim() || "Duelo 2 vs 2",
    locationLabel: cancha,
  });

  return (
    <Duelo2v2PageShell wide>
      <ActionBar className="duelo2v2-toolbar riviera-back-toolbar">
        <Button
          type="button"
          variant="back"
          onClick={() => navigateDuelo2v2("/duelo-2v2")}
        >
          ← Volver
        </Button>
      </ActionBar>

      <ModeHeader
        className="duelo2v2-header rv-mode-header rv-mode-header--entry"
        eyebrow={modeEyebrow}
        title="Nuevo duelo 2 vs 2"
        subtitle="Lanza por WhatsApp para completar los 4 jugadores, o agrégalos manualmente."
      />

      {!user?.id ? (
        <p className="duelo2v2-error">Debes iniciar sesión para crear un duelo.</p>
      ) : (
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

          <ConvocatoriaWhatsAppPanel
            context={convocatoriaContext}
            ensureDraftEntity={ensureDraftEntity}
            onEntityReady={setOpenDueloId}
            canLaunch={validateLaunchMinimum}
            compact
          />

          <DueloPairBuilder
            organizadorId={user.id}
            pairA={pairA}
            pairB={pairB}
            onPairAChange={setPairA}
            onPairBChange={setPairB}
            submitSlot={
              <>
                {error && <p className="duelo2v2-error">{error}</p>}
                <Button type="submit" variant="primary" disabled={!canSubmit || busy}>
                  {busy ? "Iniciando…" : "Iniciar juego"}
                </Button>
              </>
            }
          />
        </form>
      )}
    </Duelo2v2PageShell>
  );
};
