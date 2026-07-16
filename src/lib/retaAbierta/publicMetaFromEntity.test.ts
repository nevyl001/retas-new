import {
  resolveLugarYCancha,
  looksLikeCanchaOnly,
} from "./whatsappShareMessage";
import { durationMinutesBetween } from "./adapters";

describe("resolveLugarYCancha (public meta)", () => {
  it("con lugar real + cancha no cae al tenant", () => {
    const { lugar, cancha } = resolveLugarYCancha({
      locationLabel: "Hack Padel",
      canchaLabel: "1",
      clubName: "Riviera Open",
    });
    expect(lugar).toBe("Hack Padel");
    expect(cancha).toBe("Cancha 1");
  });

  it("location_label legacy solo-cancha usa tenant como fallback de sede", () => {
    expect(looksLikeCanchaOnly("1")).toBe(true);
    const { lugar, cancha } = resolveLugarYCancha({
      locationLabel: "1",
      clubName: "Riviera Open",
    });
    expect(lugar).toBe("Riviera Open");
    expect(cancha).toBe("Cancha 1");
  });

  it("sin sede en entidad + cancha: resolveLugarYCancha usa club como fallback", () => {
    const { lugar, cancha } = resolveLugarYCancha({
      locationLabel: null,
      canchaLabel: "1",
      clubName: "Riviera Open",
    });
    expect(cancha).toBe("Cancha 1");
    expect(lugar).toBe("Riviera Open");
  });
});

describe("durationMinutesBetween", () => {
  it("deriva 120 min de rango 5–7 p.m.", () => {
    expect(
      durationMinutesBetween(
        "2026-07-16T23:00:00.000Z",
        "2026-07-17T01:00:00.000Z",
        90
      )
    ).toBe(120);
  });
});
