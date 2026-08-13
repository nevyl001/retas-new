import {
  buildAmericanoShareFileName,
  buildAmericanoSharePlaceLabel,
  computeCoverCrop,
  initialsFromPlayerName,
} from "./renderAmericanoPerformanceShareCanvas";

describe("renderAmericanoPerformanceShareCanvas helpers", () => {
  it("computeCoverCrop cubre destino horizontal y vertical", () => {
    const wide = computeCoverCrop(2000, 1000, 1080, 1920);
    expect(wide.sw).toBeCloseTo(1000 * (1080 / 1920), 5);
    expect(wide.sh).toBe(1000);
    expect(wide.sx).toBeGreaterThan(0);

    const tall = computeCoverCrop(1000, 2000, 1080, 1920);
    expect(tall.sw).toBe(1000);
    expect(tall.sh).toBeCloseTo(1000 / (1080 / 1920), 5);
    expect(tall.sy).toBe(0);
  });

  it("initialsFromPlayerName", () => {
    expect(initialsFromPlayerName("Eduardo L")).toBe("EL");
    expect(initialsFromPlayerName("Isra")).toBe("IS");
    expect(initialsFromPlayerName("  ")).toBe("?");
  });

  it("buildAmericanoSharePlaceLabel distingue finished #1 vs en vivo", () => {
    expect(buildAmericanoSharePlaceLabel({ position: 1, isFinished: true })).toEqual({
      placeLine: "#1",
      badge: "GANADOR",
    });
    expect(buildAmericanoSharePlaceLabel({ position: 2, isFinished: true })).toEqual({
      placeLine: "#2",
      badge: "CLASIFICACIÓN",
    });
    expect(buildAmericanoSharePlaceLabel({ position: 1, isFinished: false })).toEqual({
      placeLine: "#1",
      badge: "CLASIFICACIÓN EN VIVO",
    });
  });

  it("buildAmericanoShareFileName slugifica sin romper unicode básico", () => {
    expect(buildAmericanoShareFileName("Eduardo L.")).toBe(
      "americano-desempeno-eduardo-l.png"
    );
  });
});
