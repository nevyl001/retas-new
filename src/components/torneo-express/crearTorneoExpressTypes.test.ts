import {
  clearTeWizardDraft,
  loadTeWizardDraft,
  saveTeWizardDraft,
  teDraftTournamentStorageKey,
  teWizardDraftStorageKey,
} from "./crearTorneoExpressTypes";

describe("te wizard draft persistence", () => {
  const eventoId = "evt-test-1";

  beforeEach(() => {
    sessionStorage.clear();
  });

  it("guarda y restaura paso + datos por evento", () => {
    saveTeWizardDraft(eventoId, {
      wizardStep: "parejas",
      nombre: "Ranking Riviera Open",
      categoria: "4ta-5ta",
      numGrupos: 2,
      assignments: [
        { nombre: "Grupo 1", orden: 0, parejaIds: ["p1"] },
        { nombre: "Grupo 2", orden: 1, parejaIds: [] },
      ],
      draftTournamentId: "draft-abc",
    });

    const loaded = loadTeWizardDraft(eventoId);
    expect(loaded?.wizardStep).toBe("parejas");
    expect(loaded?.nombre).toBe("Ranking Riviera Open");
    expect(loaded?.categoria).toBe("4ta-5ta");
    expect(loaded?.draftTournamentId).toBe("draft-abc");
    expect(loaded?.assignments).toHaveLength(2);
  });

  it("aísla borradores por evento", () => {
    saveTeWizardDraft(eventoId, {
      wizardStep: "parejas",
      nombre: "A",
      categoria: "",
      numGrupos: 2,
      assignments: [],
      draftTournamentId: "d1",
    });
    saveTeWizardDraft("otro-evento", {
      wizardStep: "datos",
      nombre: "B",
      categoria: "",
      numGrupos: 3,
      assignments: [],
      draftTournamentId: "d2",
    });

    expect(loadTeWizardDraft(eventoId)?.nombre).toBe("A");
    expect(loadTeWizardDraft("otro-evento")?.nombre).toBe("B");
    expect(teWizardDraftStorageKey(eventoId)).not.toBe(
      teWizardDraftStorageKey("otro-evento")
    );
    expect(teDraftTournamentStorageKey(eventoId)).not.toBe(
      teDraftTournamentStorageKey(null)
    );
  });

  it("clearTeWizardDraft limpia el snapshot", () => {
    saveTeWizardDraft(eventoId, {
      wizardStep: "grupos",
      nombre: "X",
      categoria: "",
      numGrupos: 2,
      assignments: [],
      draftTournamentId: null,
    });
    clearTeWizardDraft(eventoId);
    expect(loadTeWizardDraft(eventoId)).toBeNull();
  });
});
