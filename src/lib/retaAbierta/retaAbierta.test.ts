import { normalizeRivieraIdLoose } from "./normalizeRivieraId";
import {
  assertPublicDtoPrivacy,
  parsePublicDto,
  parseRetaAbiertaSlugFromPath,
  isRetaAbiertaPublicPath,
  buildRetaAbiertaPublicPath,
} from "./retaAbiertaService";
import {
  buildRetaAbiertaWhatsAppMessage,
  buildRequestRivieraIdWhatsAppMessage,
  formatCanchaLabel,
} from "./whatsappShareMessage";
import { mapJoinErrorMessage } from "./retaAbiertaService";
import type { OpenRegistrationPublicDto } from "./types";
import { resolveOpenRegistrationJoinStatus } from "./joinStatus";
import { resolveAppViewFromPath, pathRequiresUserSession } from "../appRouting";
import {
  CONVOCATORIA_IDENTITY_CONTRACT,
  buildDueloConvocatoriaContext,
  defaultCapacityForMode,
  durationMinutesBetween,
} from "./adapters";
import {
  assertConvocatoriaAllowedMode,
  CONVOCATORIA_COVERED_PRODUCTS,
  convocatoriaModeFromTournamentFormat,
  convocatoriaProductHeadline,
  convocatoriaPublicModeLabel,
  isConvocatoriaAllowedMode,
  isConvocatoriaExcludedMode,
} from "./modeWhitelist";
import { mapConvocatoriaUserError } from "./convocatoriaErrors";

describe("normalizeRivieraIdLoose", () => {
  it("acepta formato exacto", () => {
    expect(normalizeRivieraIdLoose("RIV-00000001")).toBe("RIV-00000001");
  });

  it("normaliza minúsculas, espacios y sin guión", () => {
    expect(normalizeRivieraIdLoose("  riv 00000001 ")).toBe("RIV-00000001");
    expect(normalizeRivieraIdLoose("riv00000001")).toBe("RIV-00000001");
    expect(normalizeRivieraIdLoose("00000001")).toBe("RIV-00000001");
  });

  it("rechaza inválidos y prefijos incompletos", () => {
    expect(normalizeRivieraIdLoose("RIV-123")).toBeNull();
    expect(normalizeRivieraIdLoose("RIV-0000000")).toBeNull();
    expect(normalizeRivieraIdLoose("")).toBeNull();
    expect(normalizeRivieraIdLoose("ABC-00000001")).toBeNull();
  });
});

describe("convocatoria routing helpers", () => {
  it("parsea slug legacy y canónico /jugar", () => {
    expect(parseRetaAbiertaSlugFromPath("/reta-abierta/ra-abc123")).toBe(
      "ra-abc123"
    );
    expect(parseRetaAbiertaSlugFromPath("/jugar/ra-abc123")).toBe("ra-abc123");
    expect(isRetaAbiertaPublicPath("/jugar/ra-abc123")).toBe(true);
    expect(buildRetaAbiertaPublicPath("ra-1")).toBe("/jugar/ra-1");
  });
});

describe("WhatsApp share message por modo", () => {
  const baseEntries: OpenRegistrationPublicDto["entries"] = [
    {
      id: "1",
      status: "confirmed",
      riviera_id: "RIV-00000001",
      nombre: "Arturo Cortes",
      foto_url: null,
      rating: 0.73,
      categoria: null,
    },
  ];

  it("Reta: mensaje compacto estilo Riviera", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "Reta viernes",
        mode_type: "reta",
        scheduled_at: "2026-07-16T11:00:00.000Z",
        duration_minutes: 90,
        location_label: "3",
        category_label: "5ta Fuerza",
        rama_label: null,
        capacity: 4,
        confirmed_count: 1,
        spots_left: 3,
        display_rating: true,
        entries: baseEntries,
      },
      publicUrl: "https://app.example/jugar/ra-1",
      clubName: "Hack Pádel",
    });
    expect(text).toContain("ROUND ROBIN");
    expect(text).toContain("📍 Hack Pádel");
    expect(text).toContain("🎾 Cancha 3");
    expect(text).toContain("Nivel 5ta Fuerza");
    expect(text).toContain("✓ Arturo Cortes (0.73)");
    expect(text).toContain("○ Disponible");
    expect(text.match(/○ Disponible/g)?.length).toBe(3);
    expect(text).toContain("https://app.example/jugar/ra-1");
    expect(text).toContain("🎾 Juega en Riviera Open — sube tu ranking y rating.");
    expect(text).not.toContain("Riviera ID · todos los juegos cuentan.");
    expect(text).toContain("🗓️");
    expect(text).not.toContain("⚪");
    expect(text).not.toContain("¿Quieres jugar?");
    expect(text).not.toContain("○ 3 disponibles");
    // Huecos y enlace antes del roster: no quedan detrás de «Leer más».
    expect(text.indexOf("○ Disponible")).toBeLessThan(
      text.indexOf("https://app.example/jugar/ra-1")
    );
    expect(text.indexOf("https://app.example/jugar/ra-1")).toBeLessThan(
      text.indexOf("✓ Arturo Cortes")
    );
  });

  it("Remontada Final: mismo mode_type reta, headline de producto", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "RR domingo",
        mode_type: "reta",
        scheduled_at: null,
        duration_minutes: null,
        location_label: null,
        category_label: null,
        rama_label: null,
        capacity: 8,
        confirmed_count: 0,
        spots_left: 8,
        display_rating: false,
        entries: [],
      },
      publicUrl: "https://app.example/jugar/ra-rf",
      clubName: "Club Test",
      productHeadline: "REMONTADA FINAL",
    });
    expect(text).toContain("REMONTADA FINAL");
  });

  it("Americano: resumen de cupo con roster y huecos disponibles", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "Americano sábado",
        mode_type: "americano",
        scheduled_at: "2026-07-18T10:00:00.000Z",
        duration_minutes: null,
        location_label: "Hack",
        category_label: "Categoría mixta",
        rama_label: null,
        capacity: 16,
        confirmed_count: 6,
        spots_left: 10,
        display_rating: true,
        entries: baseEntries,
      },
      publicUrl: "https://app.example/jugar/ra-2",
      clubName: "Hack Pádel",
    });
    expect(text).toContain("AMERICANO");
    expect(text).toContain("📍 Hack");
    expect(text).toContain("6 de 16 confirmados · 10 lugares disponibles");
    expect(text).toContain("⭕ *10 LUGARES DISPONIBLES*");
    expect(text).toContain("✓ Arturo Cortes (0.73)");
    expect(text).toContain("○ 10 lugares disponibles");
  });

  it("Americano: incluye costo y premio cuando están activos", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "Americano sábado",
        mode_type: "americano",
        scheduled_at: "2026-07-18T10:00:00.000Z",
        duration_minutes: null,
        location_label: "Hack Padel",
        category_label: "5ta Fuerza",
        rama_label: null,
        capacity: 8,
        confirmed_count: 2,
        spots_left: 6,
        display_rating: true,
        entries: baseEntries.slice(0, 2),
      },
      publicUrl: "https://app.example/jugar/ra-am-cp",
      clubName: "Hack Pádel",
      includeCosto: true,
      costo: "350",
      includePremio: true,
      premio: "Kit Overgrips Wilson Pro",
    });
    expect(text).toContain("💵 Costo: 350");
    expect(text).toContain("🏆 Premio: Kit Overgrips Wilson Pro");
    expect(text).toContain("⭕ *6 LUGARES DISPONIBLES*");
  });

  it("Americano: lista huecos uno por uno cuando quedan pocos", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "Americano jueves",
        mode_type: "americano",
        scheduled_at: "2026-07-18T10:00:00.000Z",
        duration_minutes: null,
        location_label: "Hack",
        category_label: "5ta Fuerza",
        rama_label: null,
        capacity: 8,
        confirmed_count: 4,
        spots_left: 4,
        display_rating: true,
        entries: [
          {
            id: "1",
            status: "confirmed",
            riviera_id: "RIV-00000001",
            nombre: "Enrique Soto",
            foto_url: null,
            rating: 3,
            categoria: null,
          },
          {
            id: "2",
            status: "confirmed",
            riviera_id: "RIV-00000002",
            nombre: "Eduardo López",
            foto_url: null,
            rating: 2.79,
            categoria: null,
          },
          {
            id: "3",
            status: "confirmed",
            riviera_id: "RIV-00000003",
            nombre: "Nevyl",
            foto_url: null,
            rating: 3.28,
            categoria: null,
          },
          {
            id: "4",
            status: "confirmed",
            riviera_id: "RIV-00000004",
            nombre: "Axel Arriaga",
            foto_url: null,
            rating: 2.91,
            categoria: null,
          },
        ],
      },
      publicUrl: "https://app.example/jugar/ra-am",
      clubName: "Hack Pádel",
    });
    expect(text).toContain("4 de 8 confirmados · 4 lugares disponibles");
    expect(text).toContain("⭕ *4 LUGARES DISPONIBLES*");
    expect(text.match(/○ Disponible/g)?.length).toBe(4);
    expect(text.indexOf("✓ Nevyl (3.28)")).toBeLessThan(
      text.indexOf("○ Disponible")
    );
  });

  it("incluye la descripción breve de la reta cuando existe", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "Americano jueves",
        mode_type: "americano",
        scheduled_at: "2026-07-18T10:00:00.000Z",
        duration_minutes: null,
        location_label: "Hack",
        category_label: "5ta Fuerza",
        rama_label: null,
        capacity: 8,
        confirmed_count: 0,
        spots_left: 8,
        display_rating: false,
        entries: [],
        description:
          "5 rondas de 20 min, parejas rotativas. Gana quien más puntos sume 🔥",
      },
      publicUrl: "https://app.example/s/ra-desc",
      clubName: "Hack Pádel",
    });
    expect(text).toContain(
      "5 rondas de 20 min, parejas rotativas. Gana quien más puntos sume 🔥"
    );
    expect(text.indexOf("Nivel 5ta Fuerza")).toBeLessThan(
      text.indexOf("5 rondas de 20 min")
    );
    expect(text.indexOf("5 rondas de 20 min")).toBeLessThan(
      text.indexOf("https://app.example/s/ra-desc")
    );
  });

  it("Duelo: compacto Riviera con lugar, cancha y Disponibles", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "Duelo",
        mode_type: "duelo_2v2",
        scheduled_at: "2026-07-16T22:00:00.000Z",
        duration_minutes: 120,
        location_label: "1",
        category_label: "5ta Fuerza",
        rama_label: null,
        capacity: 4,
        confirmed_count: 1,
        spots_left: 3,
        display_rating: false,
        entries: baseEntries,
      },
      publicUrl: "https://app.example/jugar/ra-3",
      clubName: "Hack Pádel",
      canchaLabel: "1",
    });
    expect(text).toContain("DUELO 2 VS 2");
    expect(text).toContain("📍 Hack Pádel");
    expect(text).toContain("🎾 Cancha 1");
    expect(text).toContain("Nivel 5ta Fuerza");
    expect(text).toContain("○ Disponible");
    expect(text.match(/○ Disponible/g)?.length).toBe(3);
    expect(text.indexOf("○ Disponible")).toBeLessThan(
      text.indexOf("https://app.example/jugar/ra-3")
    );
    expect(text.indexOf("📍 Hack Pádel")).toBeLessThan(
      text.indexOf("🎾 Cancha 1")
    );
  });

  it("lista un jugador por línea y huecos visibles arriba del enlace", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "Reta",
        mode_type: "reta",
        scheduled_at: null,
        duration_minutes: 90,
        location_label: "Club",
        category_label: null,
        rama_label: null,
        capacity: 4,
        confirmed_count: 3,
        spots_left: 1,
        display_rating: false,
        entries: [
          {
            id: "e1",
            status: "confirmed",
            riviera_id: "RIV-00000011",
            nombre: "Ana",
            foto_url: null,
            rating: null,
            categoria: null,
          },
          {
            id: "e2",
            status: "confirmed",
            riviera_id: "RIV-00000012",
            nombre: "Beto",
            foto_url: null,
            rating: null,
            categoria: null,
          },
          {
            id: "e3",
            status: "confirmed",
            riviera_id: "RIV-00000013",
            nombre: "Cata",
            foto_url: null,
            rating: null,
            categoria: null,
          },
        ],
      },
      publicUrl: "https://app.example/jugar/ra-pack",
      clubName: "Club",
    });
    expect(text).toContain("○ Disponible");
    expect(text.match(/○ Disponible/g)?.length).toBe(1);
    expect(text).toContain("✓ Ana");
    expect(text).toContain("✓ Beto");
    expect(text).toContain("✓ Cata");
    expect(text).not.toContain("✓ Ana · ✓ Beto");
    expect(text.indexOf("○ Disponible")).toBeLessThan(
      text.indexOf("✓ Ana")
    );
    expect(text.indexOf("✓ Ana")).toBeLessThan(text.indexOf("✓ Beto"));
    expect(text.indexOf("✓ Beto")).toBeLessThan(text.indexOf("✓ Cata"));
  });

  it("muestra Lugar y Cancha explícitos cuando vienen separados", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "Duelo",
        mode_type: "duelo_2v2",
        scheduled_at: "2026-07-16T22:00:00.000Z",
        duration_minutes: 120,
        location_label: "Club Alva Norte",
        category_label: null,
        rama_label: null,
        capacity: 4,
        confirmed_count: 0,
        spots_left: 4,
        display_rating: false,
        entries: [],
      },
      publicUrl: "https://app.example/jugar/ra-4",
      clubName: "Riviera Open",
      canchaLabel: "2",
    });
    expect(text).toContain("📍 Club Alva Norte");
    expect(text).toContain("🎾 Cancha 2");
    expect(text).not.toContain("📍 Riviera Open");
  });

  it("omite lugar cuando includeLugar es false", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "Duelo",
        mode_type: "duelo_2v2",
        scheduled_at: "2026-07-16T22:00:00.000Z",
        duration_minutes: 90,
        location_label: "Hack Pádel",
        category_label: null,
        rama_label: null,
        capacity: 4,
        confirmed_count: 0,
        spots_left: 4,
        display_rating: false,
        entries: [],
      },
      publicUrl: "https://app.example/jugar/ra-5",
      clubName: "Riviera Open",
      canchaLabel: "1",
      includeLugar: false,
    });
    expect(text).not.toContain("📍");
    expect(text).not.toContain("Hack Pádel");
    expect(text).toContain("🎾 Cancha 1");
    expect(text).toContain("○ Disponible");
  });

  it("incluye costo y premio solo cuando los flags están activos", () => {
    const base = {
      dto: {
        name: "Reta domingo",
        mode_type: "reta" as const,
        scheduled_at: "2026-08-10T22:00:00.000Z",
        duration_minutes: 90,
        location_label: "Club Norte",
        category_label: "5ta Fuerza",
        rama_label: null,
        capacity: 8,
        confirmed_count: 0,
        spots_left: 8,
        display_rating: false,
        entries: [],
      },
      publicUrl: "https://app.example/jugar/ra-costo",
      clubName: "Riviera Open",
      includeLugar: true,
      costo: "$200 por jugador",
      premio: "Trofeo + pelotas",
    };

    const omitted = buildRetaAbiertaWhatsAppMessage({
      ...base,
      includeCosto: false,
      includePremio: false,
    });
    expect(omitted).not.toContain("💵");
    expect(omitted).not.toContain("🏆");
    expect(omitted).not.toContain("$200");
    expect(omitted).not.toContain("Trofeo");

    const withCostoOnly = buildRetaAbiertaWhatsAppMessage({
      ...base,
      includeCosto: true,
      includePremio: false,
    });
    expect(withCostoOnly).toContain("💵 Costo: $200 por jugador");
    expect(withCostoOnly).not.toContain("🏆");

    const withBoth = buildRetaAbiertaWhatsAppMessage({
      ...base,
      includeCosto: true,
      includePremio: true,
    });
    expect(withBoth).toContain("💵 Costo: $200 por jugador");
    expect(withBoth).toContain("🏆 Premio: Trofeo + pelotas");
    expect(withBoth).toMatch(/Nivel 5ta Fuerza/);
    expect(withBoth).toMatch(/💵 Costo: \$200 por jugador/);
    expect(withBoth).toMatch(/🏆 Premio: Trofeo \+ pelotas/);
  });

  it("incluye rama en el mensaje cuando está definida", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "Reta mixta",
        mode_type: "reta",
        scheduled_at: "2026-08-10T22:00:00.000Z",
        duration_minutes: 90,
        location_label: "Club Norte",
        category_label: "5ta Fuerza",
        rama_label: "Mixta",
        spots_left: 8,
        display_rating: false,
        entries: [],
        capacity: 8,
        confirmed_count: 0,
      },
      publicUrl: "https://app.example/jugar/ra-rama",
      clubName: "Riviera Open",
      includeLugar: true,
    });
    expect(text).toContain("Mixta");
    expect(text).toContain("Nivel 5ta Fuerza");
  });

  it("no imprime costo/premio si el flag está on pero el texto vacío", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "Reta",
        mode_type: "reta",
        scheduled_at: null,
        duration_minutes: 90,
        location_label: null,
        category_label: null,
        rama_label: null,
        capacity: 8,
        confirmed_count: 0,
        spots_left: 8,
        display_rating: false,
        entries: [],
      },
      publicUrl: "https://app.example/jugar/ra-empty",
      clubName: "Riviera Open",
      includeCosto: true,
      costo: "   ",
      includePremio: true,
      premio: "",
    });
    expect(text).not.toContain("💵");
    expect(text).not.toContain("🏆");
  });

  it("no imprime la etiqueta vacía Club cuando falta el origen", () => {
    const text = buildRetaAbiertaWhatsAppMessage({
      dto: {
        name: "Duelo",
        mode_type: "duelo_2v2",
        scheduled_at: null,
        duration_minutes: null,
        location_label: null,
        category_label: null,
        rama_label: null,
        capacity: 4,
        confirmed_count: 0,
        spots_left: 4,
        display_rating: false,
        entries: [],
      },
      publicUrl: "https://app.example/jugar/ra-x",
      clubName: "",
    });
    expect(text).toContain("DUELO 2 VS 2");
    expect(text).not.toMatch(/^Club$/m);
  });

  it("mensaje solicitar Riviera ID", () => {
    expect(buildRequestRivieraIdWhatsAppMessage("Reta viernes")).toContain(
      "todavía no tengo Riviera ID"
    );
  });

  it("formatCanchaLabel evita el 1 suelto", () => {
    expect(formatCanchaLabel("1")).toBe("Cancha 1");
    expect(formatCanchaLabel("Cancha 3")).toBe("Cancha 3");
    expect(formatCanchaLabel("")).toBeNull();
  });
});

describe("public DTO privacy + modos", () => {
  it("parsea costo y premio públicos cuando vienen del RPC", () => {
    const dto = parsePublicDto({
      ok: true,
      slug: "ra-cp",
      mode_type: "americano",
      entity_id: "t1",
      tournament_id: "t1",
      organizador_id: "o1",
      name: "Americano",
      description: null,
      status: "open",
      capacity: 8,
      confirmed_count: 2,
      waitlist_count: 0,
      spots_left: 6,
      waitlist_enabled: true,
      approval_required: false,
      registration_deadline: null,
      scheduled_at: null,
      duration_minutes: 120,
      category_label: "5ta Fuerza",
      rama_label: null,
      location_label: "Hack Padel",
      costo: "350",
      premio: "Kit Overgrips Wilson Pro",
      display_rating: true,
      display_photo: true,
      entries: [],
      is_finished: false,
      is_started: false,
    });
    expect(dto?.costo).toBe("350");
    expect(dto?.premio).toBe("Kit Overgrips Wilson Pro");
  });

  it("parsea DTO mínimo y no reporta leaks", () => {
    const dto = parsePublicDto({
      ok: true,
      slug: "ra-1",
      mode_type: "americano",
      entity_id: "t1",
      tournament_id: "t1",
      organizador_id: "o1",
      name: "Americano",
      description: null,
      status: "open",
      capacity: 16,
      confirmed_count: 0,
      waitlist_count: 0,
      spots_left: 16,
      waitlist_enabled: true,
      approval_required: false,
      registration_deadline: null,
      scheduled_at: null,
      duration_minutes: 90,
      category_label: null,
      rama_label: null,
      location_label: null,
      display_rating: true,
      display_photo: true,
      entries: [],
      is_finished: false,
      is_started: false,
    });
    expect(dto?.mode_type).toBe("americano");
    expect(assertPublicDtoPrivacy(dto!)).toEqual([]);
  });

  it("parsea tournament_format y championship para eyebrow Round Robin", () => {
    const dto = parsePublicDto({
      ok: true,
      slug: "ra-rr",
      mode_type: "reta",
      entity_id: "t-rr",
      tournament_id: "t-rr",
      organizador_id: "o1",
      name: "Reta Test",
      description: null,
      status: "open",
      capacity: 8,
      confirmed_count: 0,
      waitlist_count: 0,
      spots_left: 8,
      waitlist_enabled: true,
      approval_required: false,
      registration_deadline: null,
      scheduled_at: null,
      duration_minutes: 120,
      category_label: null,
      rama_label: null,
      location_label: null,
      tournament_format: "round_robin",
      championship_enabled: false,
      display_rating: true,
      display_photo: true,
      entries: [],
      is_finished: false,
      is_started: false,
    });
    expect(dto?.tournament_format).toBe("round_robin");
    expect(dto?.championship_enabled).toBe(false);
    expect(
      convocatoriaPublicModeLabel({
        mode: dto!.mode_type,
        tournamentFormat: dto!.tournament_format,
        championshipEnabled: dto!.championship_enabled,
      })
    ).toBe("ROUND ROBIN");
  });
});

describe("concurrencia lógica (último cupo)", () => {
  it("10 solicitudes con 1 lugar: 1 confirmed y resto waitlist o full", () => {
    let confirmed = 3;
    const capacity = 4;
    const waitlistEnabled = true;
    const outcomes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = resolveOpenRegistrationJoinStatus({
        approvalRequired: false,
        confirmedCount: confirmed,
        capacity,
        waitlistEnabled,
      });
      if ("status" in r && r.status === "confirmed") {
        confirmed += 1;
        outcomes.push("confirmed");
      } else if ("status" in r) {
        outcomes.push(r.status);
      } else {
        outcomes.push(r.error);
      }
    }
    expect(outcomes.filter((o) => o === "confirmed")).toHaveLength(1);
    expect(confirmed).toBe(4);
    expect(outcomes.every((o) => o === "confirmed" || o === "waitlist")).toBe(
      true
    );
  });

  it("sin waitlist: solo 1 confirmed y resto full", () => {
    let confirmed = 3;
    const outcomes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = resolveOpenRegistrationJoinStatus({
        approvalRequired: false,
        confirmedCount: confirmed,
        capacity: 4,
        waitlistEnabled: false,
      });
      if ("status" in r && r.status === "confirmed") {
        confirmed += 1;
        outcomes.push("confirmed");
      } else if ("error" in r) {
        outcomes.push(r.error);
      } else {
        outcomes.push(r.status);
      }
    }
    expect(outcomes.filter((o) => o === "confirmed")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "full")).toHaveLength(9);
  });
});

describe("identidad global contract", () => {
  it("documenta resolución sin puntos al inscribirse", () => {
    expect(CONVOCATORIA_IDENTITY_CONTRACT.noSportsOnJoin).toBe(true);
    expect(CONVOCATORIA_IDENTITY_CONTRACT.resolveRpc).toContain(
      "_resolve_identity_by_riviera_id"
    );
    expect(defaultCapacityForMode("duelo_2v2")).toBe(4);
    expect(defaultCapacityForMode("americano")).toBe(16);
  });
});

describe("whitelist servicio global", () => {
  it("cubre productos incluidos vía mode_type", () => {
    expect(isConvocatoriaAllowedMode("reta")).toBe(true);
    expect(isConvocatoriaAllowedMode("americano")).toBe(true);
    expect(isConvocatoriaAllowedMode("duelo_2v2")).toBe(true);
    expect(CONVOCATORIA_COVERED_PRODUCTS).toEqual(
      expect.arrayContaining([
        "reta-equipos",
        "round-robin",
        "remontada-final",
        "americano",
        "duelo-2v2",
      ])
    );
  });

  it("excluye liga / torneo / torneo express", () => {
    expect(isConvocatoriaExcludedMode("liga")).toBe(true);
    expect(isConvocatoriaExcludedMode("torneo")).toBe(true);
    expect(isConvocatoriaExcludedMode("torneo_express")).toBe(true);
    expect(() => assertConvocatoriaAllowedMode("liga")).toThrow(
      /no admite convocatoria/
    );
  });

  it("Remontada Final y Round Robin comparten mode_type reta", () => {
    expect(
      convocatoriaModeFromTournamentFormat("round_robin", false)
    ).toBe("reta");
    expect(
      convocatoriaProductHeadline({
        mode: "reta",
        tournamentFormat: "round_robin",
        championshipEnabled: true,
      })
    ).toBe("REMONTADA FINAL");
    expect(
      convocatoriaProductHeadline({
        mode: "reta",
        tournamentFormat: "round_robin",
        championshipEnabled: false,
      })
    ).toBe("ROUND ROBIN");
    expect(
      convocatoriaProductHeadline({
        mode: "reta",
        tournamentFormat: "teams",
        championshipEnabled: false,
      })
    ).toBe("RETA POR EQUIPOS");
    expect(
      convocatoriaProductHeadline({ mode: "reta" })
    ).toBe("ROUND ROBIN");
    expect(
      convocatoriaProductHeadline({ mode: "duelo_2v2" })
    ).toBe("DUELO 2 VS 2");
  });
});

describe("errores UX sin SQL", () => {
  it("oculta gen_random_bytes y mensajes Postgres", () => {
    expect(
      mapConvocatoriaUserError(
        "function gen_random_bytes(integer) does not exist",
        "launch"
      )
    ).toBe("No pudimos crear la convocatoria. Intenta nuevamente.");
    expect(
      mapConvocatoriaUserError("PGRST202: Could not find the function", "launch")
    ).toBe("No pudimos crear la convocatoria. Intenta nuevamente.");
  });
});

describe("durationMinutesBetween / duelo convocatoria", () => {
  it("calcula 120 minutos entre 5pm y 7pm", () => {
    expect(
      durationMinutesBetween(
        "2026-07-16T17:00:00.000-06:00",
        "2026-07-16T19:00:00.000-06:00"
      )
    ).toBe(120);
  });

  it("buildDueloConvocatoriaContext usa programado_hasta para duración", () => {
    const ctx = buildDueloConvocatoriaContext({
      dueloId: "d1",
      name: "test2",
      scheduledAt: "2026-07-16T23:00:00.000Z",
      scheduledUntil: "2026-07-17T01:00:00.000Z",
    });
    expect(ctx.defaultDurationMinutes).toBe(120);
  });
});

describe("app routing convocatoria", () => {
  it("resuelve /jugar y /reta-abierta sin sesión", () => {
    expect(resolveAppViewFromPath("/jugar/ra-abc")).toBe("reta-abierta");
    expect(resolveAppViewFromPath("/reta-abierta/ra-abc")).toBe("reta-abierta");
    expect(pathRequiresUserSession("/jugar/ra-abc")).toBe(false);
  });

  it("liga y torneo-express no son vista convocatoria", () => {
    expect(resolveAppViewFromPath("/liga")).toBe("liga");
    expect(resolveAppViewFromPath("/torneo-express")).toBe("torneo-express");
  });
});

describe("convocatoria admin surface — sin SELECT directo", () => {
  it("retaAbiertaService no consulta .from(tournament_open_registration*)", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "retaAbiertaService.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/\.from\(\s*["']tournament_open_registration["']/);
    expect(src).not.toMatch(
      /\.from\(\s*["']tournament_open_registration_entries["']/
    );
    expect(src).toMatch(/get_open_game_registration/);
    expect(src).toMatch(/remove_open_game_registration_entry/);
    expect(src).toMatch(/list_open_game_registration_entries/);
    expect(src).toMatch(/close_open_game_registration/);
  });
});

describe("rate-limit Riviera ID (hotfix seguridad)", () => {
  it("mapJoinErrorMessage muestra mensaje amigable para rate_limited", () => {
    expect(mapJoinErrorMessage("rate_limited")).toBe(
      "Demasiados intentos. Espera unos minutos e intenta de nuevo."
    );
  });

  it("códigos de error ya cubiertos siguen sin cambiar (no regresión)", () => {
    expect(mapJoinErrorMessage("riviera_id_not_found")).toBe(
      "No encontramos este Riviera ID."
    );
    expect(mapJoinErrorMessage("already_registered")).toBe(
      "Ya estás inscrito en esta reta."
    );
    expect(mapJoinErrorMessage("full")).toBe(
      "La reta está completa y no hay lista de espera."
    );
  });

  it("el hotfix SQL agrega el throttle a preview y join sin tocar su firma pública", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        "../../../supabase/hotfix-riviera-id-lookup-throttle.sql"
      ),
      "utf8"
    );

    // Firma pública sin cambios: mismos nombres y parámetros de siempre.
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.preview_riviera_id_for_open_registration\(\s*p_slug text,\s*p_riviera_id text\s*\)/
    );
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.join_tournament_open_registration\(\s*p_slug text,\s*p_riviera_id text,\s*p_preferred_side text DEFAULT NULL\s*\)/
    );

    // Lógica de duelo 2v2 / preferred_side se conserva íntegra.
    expect(sql).toMatch(/v_side := upper\(nullif\(trim\(p_preferred_side\)/);
    expect(sql).toMatch(/_open_reg_sync_duelo_slots/);
    expect(sql).toMatch(/_open_reg_sync_americano_roster/);

    // El throttle está presente en ambas funciones y responde con el mismo
    // contrato {ok:false, error:string} que ya usan el resto de los casos.
    const previewBody = sql.split(
      "CREATE OR REPLACE FUNCTION public.join_tournament_open_registration"
    )[0];
    expect(previewBody).toMatch(
      /_riviera_id_lookup_rate_limited\('preview', 30, interval '10 minutes'\)/
    );
    expect(sql).toMatch(
      /_riviera_id_lookup_rate_limited\('join', 20, interval '10 minutes'\)/
    );
    expect(sql.match(/'ok', false, 'error', 'rate_limited'/g)?.length).toBe(2);

    // preview_riviera_id_for_open_registration ya NO es STABLE: ahora llama
    // (indirectamente) a un INSERT vía _riviera_id_lookup_rate_limited, así
    // que declararla STABLE violaría ese contrato. Debe quedar VOLATILE
    // (explícito o por omisión) y sin STABLE en su LANGUAGE clause.
    const previewSignatureBlock = previewBody.slice(
      previewBody.indexOf(
        "CREATE OR REPLACE FUNCTION public.preview_riviera_id_for_open_registration"
      )
    );
    const previewLanguageLine = previewSignatureBlock
      .split("AS $$")[0]
      .split("\n")
      .filter((l) => l.includes("LANGUAGE"))[0];
    expect(previewLanguageLine).toMatch(/VOLATILE/);
    expect(previewLanguageLine).not.toMatch(/STABLE/);

    // x-forwarded-for documentado como mitigación de abuso, no identidad.
    expect(sql).toMatch(/mitigación de ABUSO, no una identidad/);

    // No se agregó OTP ni ningún parámetro nuevo de verificación: las firmas
    // públicas siguen teniendo exactamente los parámetros de siempre (ya
    // verificado arriba), sin p_otp/p_codigo/p_verification_code.
    expect(sql).not.toMatch(/p_otp|p_codigo_verificacion|p_verification_code/i);
  });
});
