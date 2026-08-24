import type { Player } from "../../lib/database";
import type { GrupoAssignmentDraft } from "../../lib/torneoExpress/types";
import { defaultCourtNames } from "../../lib/torneoExpress/assignRoundRobinSchedule";
import { todayMexicoDateInput } from "../../lib/torneoExpress/teScheduleTime";

export type ParejaDraft = {
  id: string;
  jugador1: Player;
  jugador2: Player;
};

/** Legacy global key (standalone /torneo-express/nuevo). */
export const TE_DRAFT_TOURNAMENT_KEY = "torneo_express_draft_tournament_id";

/** Nombre del torneo temporal en `tournaments` (solo parejas; no es una reta del home). */
export const TE_EXPRESS_DRAFT_TOURNAMENT_NAME = "(Borrador) Torneo";

export type TeWizardStepId =
  | "datos"
  | "parejas"
  | "grupos"
  | "programacion"
  | "confirmar";

/** Paso legacy del wizard de 4 pasos (schedule + confirm en uno). */
export type TeWizardStepIdLegacy = TeWizardStepId | "crear";

export type TeWizardScheduleDraft = {
  playDate: string;
  startTime: string;
  durationMinutes: number;
  courtCount: number;
  courtNames: string[];
};

export const TE_DEFAULT_SCHEDULE: TeWizardScheduleDraft = {
  playDate: todayMexicoDateInput(),
  startTime: "09:00",
  durationMinutes: 45,
  courtCount: 2,
  courtNames: defaultCourtNames(2),
};

export type TeWizardDraftSnapshot = {
  wizardStep: TeWizardStepId;
  nombre: string;
  categoria: string;
  numGrupos: number | "";
  assignments: GrupoAssignmentDraft[];
  draftTournamentId?: string | null;
  schedule?: TeWizardScheduleDraft;
  savedAt: number;
};

const WIZARD_STEPS: TeWizardStepId[] = [
  "datos",
  "parejas",
  "grupos",
  "programacion",
  "confirmar",
];

function normalizeWizardStep(raw: string | undefined): TeWizardStepId | null {
  if (!raw) return null;
  if (raw === "crear") return "programacion";
  return WIZARD_STEPS.includes(raw as TeWizardStepId)
    ? (raw as TeWizardStepId)
    : null;
}

export function normalizeTeWizardScheduleDraft(
  raw: Partial<TeWizardScheduleDraft> | undefined
): TeWizardScheduleDraft {
  const courtCountRaw = raw?.courtCount;
  const courtCount =
    typeof courtCountRaw === "number" && Number.isFinite(courtCountRaw)
      ? Math.max(1, Math.min(8, Math.floor(courtCountRaw)))
      : TE_DEFAULT_SCHEDULE.courtCount;

  const durationRaw = raw?.durationMinutes;
  const durationMinutes =
    typeof durationRaw === "number" && Number.isFinite(durationRaw) && durationRaw > 0
      ? Math.floor(durationRaw)
      : TE_DEFAULT_SCHEDULE.durationMinutes;

  const existingNames = Array.isArray(raw?.courtNames)
    ? raw!.courtNames.map((n) => (typeof n === "string" ? n : ""))
    : [];

  const courtNames = defaultCourtNames(courtCount).map((fallback, i) => {
    const stored = existingNames[i]?.trim();
    return stored || fallback;
  });

  return {
    playDate:
      typeof raw?.playDate === "string" && raw.playDate.trim()
        ? raw.playDate.trim()
        : TE_DEFAULT_SCHEDULE.playDate,
    startTime:
      typeof raw?.startTime === "string" && raw.startTime.trim()
        ? raw.startTime.trim()
        : TE_DEFAULT_SCHEDULE.startTime,
    durationMinutes,
    courtCount,
    courtNames,
  };
}

export function teDraftTournamentStorageKey(eventoId?: string | null): string {
  const id = eventoId?.trim();
  return id
    ? `torneo_express_draft_tournament_id:evento:${id}`
    : TE_DRAFT_TOURNAMENT_KEY;
}

export function teWizardDraftStorageKey(eventoId?: string | null): string {
  const id = eventoId?.trim();
  return id
    ? `torneo_express_wizard_draft:evento:${id}`
    : "torneo_express_wizard_draft:standalone";
}

export function loadTeWizardDraft(
  eventoId?: string | null
): TeWizardDraftSnapshot | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(teWizardDraftStorageKey(eventoId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TeWizardDraftSnapshot>;
    const wizardStep = normalizeWizardStep(parsed.wizardStep);
    if (!wizardStep) {
      return null;
    }
    return {
      wizardStep,
      nombre: typeof parsed.nombre === "string" ? parsed.nombre : "",
      categoria: typeof parsed.categoria === "string" ? parsed.categoria : "",
      numGrupos:
        parsed.numGrupos === "" || typeof parsed.numGrupos === "number"
          ? parsed.numGrupos
          : 2,
      assignments: Array.isArray(parsed.assignments)
        ? (parsed.assignments as GrupoAssignmentDraft[])
        : [],
      draftTournamentId:
        typeof parsed.draftTournamentId === "string"
          ? parsed.draftTournamentId
          : null,
      schedule: normalizeTeWizardScheduleDraft(parsed.schedule),
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveTeWizardDraft(
  eventoId: string | null | undefined,
  draft: Omit<TeWizardDraftSnapshot, "savedAt">
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payload: TeWizardDraftSnapshot = {
      ...draft,
      schedule: normalizeTeWizardScheduleDraft(draft.schedule),
      savedAt: Date.now(),
    };
    sessionStorage.setItem(
      teWizardDraftStorageKey(eventoId),
      JSON.stringify(payload)
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearTeWizardDraft(eventoId?: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(teWizardDraftStorageKey(eventoId));
  } catch {
    /* ignore */
  }
}

export function resolveActiveCourtNames(schedule: TeWizardScheduleDraft): string[] {
  return schedule.courtNames.slice(0, schedule.courtCount).map((n) => n.trim());
}
