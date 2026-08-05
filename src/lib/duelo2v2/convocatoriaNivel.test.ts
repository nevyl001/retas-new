import { dueloConvocatoriaNivel } from "./convocatoriaNivel";
import { buildDueloConvocatoriaContext } from "../retaAbierta/adapters";
import { buildRetaAbiertaWhatsAppMessage } from "../retaAbierta/whatsappShareMessage";
import type { Duelo2v2 } from "./types";

/**
 * Caso real del incidente 2026-08-05: el duelo "Puntos Ranking" tenía
 * Nivel = "5ta Fuerza" (columna `descripcion`) y Descripción = "Riviera Open"
 * (columna `categoria`), y la convocatoria enviaba "Nivel Riviera Open".
 */
const DUELO = {
  id: "d1",
  nombre: "Puntos Ranking",
  descripcion: "5ta Fuerza",
  categoria: "Riviera Open",
} as Duelo2v2;

describe("dueloConvocatoriaNivel", () => {
  it("toma el nivel de `descripcion`, no de `categoria`", () => {
    expect(dueloConvocatoriaNivel(DUELO)).toBe("5ta Fuerza");
  });

  it("recorta espacios y devuelve undefined si está vacío", () => {
    expect(dueloConvocatoriaNivel({ descripcion: "  Open  " })).toBe("Open");
    expect(dueloConvocatoriaNivel({ descripcion: "   " })).toBeUndefined();
    expect(dueloConvocatoriaNivel({ descripcion: null })).toBeUndefined();
  });
});

describe("convocatoria de Duelo 2v2 — línea de Nivel", () => {
  function messageFor(categoryLabel: string | undefined): string {
    const ctx = buildDueloConvocatoriaContext({
      dueloId: DUELO.id,
      name: DUELO.nombre,
      locationLabel: "Fit Padel Oceania",
      canchaLabel: "2",
      scheduledAt: "2026-08-05T19:00:00.000Z",
      scheduledUntil: "2026-08-05T21:00:00.000Z",
      clubName: "Riviera Open",
      categoryLabel,
    });

    return buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: DUELO.nombre,
        scheduled_at: ctx.defaultScheduledAt,
        scheduled_until: "2026-08-05T21:00:00.000Z",
        duration_minutes: ctx.defaultDurationMinutes,
        location_label: "Fit Padel Oceania",
        cancha_label: "2",
        category_label: ctx.defaultCategory ?? null,
        rama_label: null,
        capacity: 4,
        confirmed_count: 0,
        entries: [],
        display_rating: false,
        mode_type: "duelo_2v2",
        spots_left: 4,
      } as never,
      publicUrl: "https://appriviera.rivieraopen.com/jugar/ra-db16a547cb",
      clubName: "Riviera Open",
    });
  }

  it("imprime el nivel real y nunca la descripción libre", () => {
    const text = messageFor(dueloConvocatoriaNivel(DUELO));

    expect(text).toContain("Nivel 5ta Fuerza");
    expect(text).not.toContain("Nivel Riviera Open");
  });

  it("omite la línea de nivel si el duelo no tiene nivel", () => {
    const text = messageFor(dueloConvocatoriaNivel({ descripcion: null }));

    expect(text).not.toMatch(/^Nivel /m);
  });
});
