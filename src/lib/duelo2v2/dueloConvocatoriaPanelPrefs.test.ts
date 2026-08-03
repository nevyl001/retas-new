import {
  readDueloConvocatoriaPanelOpen,
  writeDueloConvocatoriaPanelOpen,
} from "./dueloConvocatoriaPanelPrefs";

describe("dueloConvocatoriaPanelPrefs", () => {
  const id = "duelo-prefs-test-1";

  beforeEach(() => {
    localStorage.removeItem(`duelo-2v2-conv-panel-open:${id}`);
  });

  it("defaults to closed", () => {
    expect(readDueloConvocatoriaPanelOpen(id)).toBe(false);
  });

  it("persists open and closed", () => {
    writeDueloConvocatoriaPanelOpen(id, true);
    expect(readDueloConvocatoriaPanelOpen(id)).toBe(true);
    writeDueloConvocatoriaPanelOpen(id, false);
    expect(readDueloConvocatoriaPanelOpen(id)).toBe(false);
  });
});
