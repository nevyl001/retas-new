import type { Player } from "../../lib/database";
import type { GrupoAssignmentDraft } from "../../lib/torneoExpress/types";

export type ParejaDraft = {
  id: string;
  jugador1: Player;
  jugador2: Player;
};

/** Legacy global key (standalone /torneo-express/nuevo). */
export const TE_DRAFT_TOURNAMENT_KEY = "torneo_express_draft_tournament_id";

/** Nombre del torneo temporal en `tournaments` (solo parejas; no es una reta del home). */
export const TE_EXPRESS_DRAFT_TOURNAMENT_NAME = "(Borrador) Torneo";

export type TeWizardStepId = "datos" | "parejas" | "grupos" | "crear";

export type TeWizardDraftSnapshot = {
  wizardStep: TeWizardStepId;
  nombre: string;
  categoria: string;
  numGrupos: number | "";
  assignments: GrupoAssignmentDraft[];
  draftTournamentId?: string | null;
  savedAt: number;
};

const WIZARD_STEPS: TeWizardStepId[] = [
  "datos",
  "parejas",
  "grupos",
  "crear",
];

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
    if (
      typeof parsed.wizardStep !== "string" ||
      !WIZARD_STEPS.includes(parsed.wizardStep as TeWizardStepId)
    ) {
      return null;
    }
    return {
      wizardStep: parsed.wizardStep as TeWizardStepId,
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
