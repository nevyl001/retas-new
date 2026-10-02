import {
  DEFAULT_PARTIDO_EN_VIVO_DURATION_MINUTES,
  findPartidoEnVivoId,
  isPartidoEnVivoWindow,
} from "./partidoEnVivo";

describe("isPartidoEnVivoWindow", () => {
  const start = "2026-10-03T15:00:00.000Z"; // 9:00 México

  it("antes del horario → no en vivo", () => {
    expect(
      isPartidoEnVivoWindow({
        estado: "pendiente",
        programado_en: start,
        now: new Date("2026-10-03T14:59:00.000Z"),
      })
    ).toBe(false);
  });

  it("justo al inicio → en vivo", () => {
    expect(
      isPartidoEnVivoWindow({
        estado: "pendiente",
        programado_en: start,
        now: new Date("2026-10-03T15:00:00.000Z"),
      })
    ).toBe(true);
  });

  it("fuera de la ventana (horas después) → no en vivo", () => {
    // 4:20 p.m. México ≈ 22:20 UTC el mismo día; start 15:00 UTC + 90 min = 16:30 UTC
    expect(
      isPartidoEnVivoWindow({
        estado: "pendiente",
        programado_en: start,
        now: new Date("2026-10-03T22:20:00.000Z"),
        durationMinutes: DEFAULT_PARTIDO_EN_VIVO_DURATION_MINUTES,
      })
    ).toBe(false);
  });

  it("partido jugado nunca en vivo", () => {
    expect(
      isPartidoEnVivoWindow({
        estado: "jugado",
        programado_en: start,
        now: new Date("2026-10-03T15:10:00.000Z"),
      })
    ).toBe(false);
  });

  it("sin programado_en → no en vivo", () => {
    expect(
      isPartidoEnVivoWindow({
        estado: "pendiente",
        programado_en: null,
        now: new Date("2026-10-03T15:10:00.000Z"),
      })
    ).toBe(false);
  });
});

describe("findPartidoEnVivoId", () => {
  it("elige el primero pendiente dentro de ventana", () => {
    const now = new Date("2026-10-03T15:10:00.000Z");
    const id = findPartidoEnVivoId(
      [
        {
          id: "a",
          estado: "pendiente",
          programado_en: "2026-10-03T13:00:00.000Z", // +130 min → fuera de 90'
        },
        {
          id: "b",
          estado: "pendiente",
          programado_en: "2026-10-03T15:00:00.000Z",
        },
        {
          id: "c",
          estado: "pendiente",
          programado_en: "2026-10-03T16:00:00.000Z",
        },
      ],
      { now }
    );
    expect(id).toBe("b");
  });

  it("sin nadie en ventana → null (todo pendiente)", () => {
    expect(
      findPartidoEnVivoId(
        [
          {
            id: "a",
            estado: "pendiente",
            programado_en: "2026-10-04T15:00:00.000Z",
          },
        ],
        { now: new Date("2026-10-02T22:20:00.000Z") }
      )
    ).toBeNull();
  });
});
