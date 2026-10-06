import {
  courtSlotTimesForDay,
  expandUniformPlayDays,
  normalizePlayDays,
  resizeDayCourts,
  validatePlayDays,
} from "./scheduleDayWindows";

describe("scheduleDayWindows", () => {
  it("expande rango uniforme a un día por fecha", () => {
    const days = expandUniformPlayDays({
      playDate: "2026-10-03",
      endDate: "2026-10-05",
      startTime: "09:00",
      endTime: "14:00",
    });
    expect(days).toEqual([
      { date: "2026-10-03", startTime: "09:00", endTime: "14:00" },
      { date: "2026-10-04", startTime: "09:00", endTime: "14:00" },
      { date: "2026-10-05", startTime: "09:00", endTime: "14:00" },
    ]);
  });

  it("deduplica por fecha y ordena", () => {
    expect(
      normalizePlayDays([
        { date: "2026-10-05", startTime: "16:00", endTime: "20:00" },
        { date: "2026-10-03", startTime: "09:00", endTime: "12:00" },
        { date: "2026-10-05", startTime: "18:00", endTime: "21:00" },
      ])
    ).toEqual([
      { date: "2026-10-03", startTime: "09:00", endTime: "12:00" },
      { date: "2026-10-05", startTime: "18:00", endTime: "21:00" },
    ]);
  });

  it("al sumar una cancha no repite el nombre que ya existe", () => {
    expect(resizeDayCourts(["Cancha 2"], 2)).toEqual(["Cancha 2", "Cancha 1"]);
    expect(resizeDayCourts(["Cancha 2", "Cancha 3"], 3)).toEqual([
      "Cancha 2",
      "Cancha 3",
      "Cancha 1",
    ]);
  });

  it("valida cierre posterior a apertura", () => {
    expect(
      validatePlayDays(
        [{ date: "2026-10-03", startTime: "18:00", endTime: "10:00" }],
        45
      )
    ).toMatch(/cierre/i);
  });

  it("conserva las canchas de cada día", () => {
    expect(
      normalizePlayDays([
        {
          date: "2026-10-08",
          startTime: "17:00",
          endTime: "21:00",
          courts: ["Cancha 2", "Cancha 3"],
        },
        {
          date: "2026-10-09",
          startTime: "17:00",
          endTime: "19:00",
          courts: ["Cancha 3"],
        },
      ])
    ).toEqual([
      {
        date: "2026-10-08",
        startTime: "17:00",
        endTime: "21:00",
        courts: ["Cancha 2", "Cancha 3"],
      },
      {
        date: "2026-10-09",
        startTime: "17:00",
        endTime: "19:00",
        courts: ["Cancha 3"],
      },
    ]);
  });

  it("conserva el horario propio de cada cancha", () => {
    expect(
      normalizePlayDays([
        {
          date: "2026-10-07",
          startTime: "17:00",
          endTime: "23:00",
          courts: ["1", "2"],
          courtHours: [
            { name: "1", startTime: "17:00", endTime: "20:00" },
            { name: "2", startTime: "20:00", endTime: "23:00" },
          ],
        },
      ])
    ).toEqual([
      {
        date: "2026-10-07",
        startTime: "17:00",
        endTime: "23:00",
        courts: ["1", "2"],
        courtHours: [
          { name: "1", startTime: "17:00", endTime: "20:00" },
          { name: "2", startTime: "20:00", endTime: "23:00" },
        ],
      },
    ]);
  });

  it("abre cada cancha solo dentro de su horario", () => {
    expect(
      courtSlotTimesForDay(
        {
          date: "2026-10-07",
          startTime: "17:00",
          endTime: "23:00",
          courts: ["1", "2"],
          courtHours: [
            { name: "1", startTime: "17:00", endTime: "20:00" },
            { name: "2", startTime: "20:00", endTime: "23:00" },
          ],
        },
        60
      )
    ).toEqual([
      { time: "17:00", courts: ["1"] },
      { time: "18:00", courts: ["1"] },
      { time: "19:00", courts: ["1"] },
      { time: "20:00", courts: ["2"] },
      { time: "21:00", courts: ["2"] },
      { time: "22:00", courts: ["2"] },
    ]);
  });

  it("rechaza canchas repetidas dentro del mismo día", () => {
    expect(
      validatePlayDays(
        [
          {
            date: "2026-10-08",
            startTime: "17:00",
            endTime: "21:00",
            courts: ["Cancha 2", "cancha 2"],
          },
        ],
        60
      )
    ).toMatch(/únicos/i);
  });
});
