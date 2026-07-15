/**
 * Tests de composición (Fase 2A, docs/GAME-MODES-UI-ARCHITECTURE.md Sección 10).
 * No prueban píxeles ni usan snapshots grandes: verifican que el orden de
 * tabs y el mapeo de estado→variante de badge (usados por ModeEventHeader /
 * ModeSectionTabs) sigan siendo exactamente los mismos que antes de adoptar
 * los componentes compartidos.
 */
import {
  buildLigaGestionarTabs,
  estadoLigaLabel,
  estadoLigaStatusVariant,
} from "./LigaGestionar";
import { jornadaEstadoStatusVariant } from "./LigaJornada";

describe("buildLigaGestionarTabs — mismo orden y textos que antes", () => {
  it("individual_rotativo: Jugadores → Jornadas, en ese orden exacto", () => {
    const tabs = buildLigaGestionarTabs(false);
    expect(tabs).toEqual([
      { id: "jugadores", label: "Jugadores" },
      { id: "jornadas", label: "Jornadas" },
    ]);
  });

  it("parejas_fijas: Parejas → Jornadas, en ese orden exacto", () => {
    const tabs = buildLigaGestionarTabs(true);
    expect(tabs).toEqual([
      { id: "parejas", label: "Parejas" },
      { id: "jornadas", label: "Jornadas" },
    ]);
  });

  it("siempre exactamente 2 tabs (no se agregan tabs nuevas)", () => {
    expect(buildLigaGestionarTabs(false)).toHaveLength(2);
    expect(buildLigaGestionarTabs(true)).toHaveLength(2);
  });

  it("Jornadas siempre es la última tab, sin importar la modalidad", () => {
    expect(buildLigaGestionarTabs(false).at(-1)).toEqual({
      id: "jornadas",
      label: "Jornadas",
    });
    expect(buildLigaGestionarTabs(true).at(-1)).toEqual({
      id: "jornadas",
      label: "Jornadas",
    });
  });
});

describe("estadoLigaLabel / estadoLigaStatusVariant — mismo texto e info que antes", () => {
  it("mapea las 3 etiquetas exactas ya usadas en LigaHome/LigaGestionar", () => {
    expect(estadoLigaLabel("upcoming")).toBe("Próxima");
    expect(estadoLigaLabel("in_progress")).toBe("En curso");
    expect(estadoLigaLabel("completed")).toBe("Finalizada");
  });

  it("mapea variantes de StatusBadge sin inventar estados nuevos", () => {
    expect(estadoLigaStatusVariant("upcoming")).toBe("pending");
    expect(estadoLigaStatusVariant("in_progress")).toBe("live");
    expect(estadoLigaStatusVariant("completed")).toBe("gold");
  });
});

describe("jornadaEstadoStatusVariant — mismo mapeo que estadoLigaStatusVariant", () => {
  it("usa las mismas 3 variantes que la liga (consistencia visual)", () => {
    expect(jornadaEstadoStatusVariant("upcoming")).toBe("pending");
    expect(jornadaEstadoStatusVariant("in_progress")).toBe("live");
    expect(jornadaEstadoStatusVariant("completed")).toBe("gold");
  });
});
