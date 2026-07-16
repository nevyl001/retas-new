import { clearDuelo2v2CreateSession } from "./duelo2v2CreateDraft";
import { resolveDueloScheduleFromDraft } from "./schedule";
import { normalizeCanchaForSave } from "../torneoExpress/canchaDisplay";
import type { CreateDuelo2v2DraftInput } from "./types";
import type { Duelo2v2 } from "./types";

export type SaveNewDueloFormInput = {
  organizadorId: string;
  nombre: string;
  cancha: string;
  draftDate: string;
  draftTimeStart: string;
  draftTimeEnd: string;
};

export type SaveNewDueloDeps = {
  createDuelo2v2OpenDraft: (
    input: CreateDuelo2v2DraftInput
  ) => Promise<Duelo2v2>;
  navigate: (path: string) => void;
  gestionarPath: (id: string) => string;
};

/**
 * Crea siempre una fila nueva en configuración y navega a Gestionar.
 * No reutiliza openDueloId ni convocatoria previa.
 */
export async function saveNewDuelo2v2(
  form: SaveNewDueloFormInput,
  deps: SaveNewDueloDeps
): Promise<Duelo2v2> {
  const nombre = form.nombre.trim();
  if (!nombre) throw new Error("Escribe el nombre del encuentro.");
  if (!form.cancha.trim()) throw new Error("Indica la cancha.");
  if (
    !form.draftDate.trim() ||
    !form.draftTimeStart.trim() ||
    !form.draftTimeEnd.trim()
  ) {
    throw new Error("Completa día y horario.");
  }

  const schedule = resolveDueloScheduleFromDraft(
    form.draftDate,
    form.draftTimeStart,
    form.draftTimeEnd
  );
  if ("error" in schedule) {
    throw new Error(schedule.error);
  }

  const duelo = await deps.createDuelo2v2OpenDraft({
    nombre,
    cancha: normalizeCanchaForSave(form.cancha),
    programado_en: schedule.programado_en,
    programado_hasta: schedule.programado_hasta,
  });

  clearDuelo2v2CreateSession(form.organizadorId);
  deps.navigate(deps.gestionarPath(duelo.id));
  return duelo;
}
