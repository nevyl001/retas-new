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

  it("Reta: mensaje compacto con horario, lugar y cancha", () => {
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
    expect(text).toContain("RETA ABIERTA");
    expect(text).toContain("📅");
    expect(text).toContain("📍 Hack Pádel");
    expect(text).toContain("🏸 Cancha 3");
    expect(text).toContain("📊 5ta Fuerza");
    expect(text).toContain("✅ Arturo Cortes (0.73)");
    expect(text).toContain("⚪ ??");
    expect(text).toContain("https://app.example/jugar/ra-1");
    expect(text).not.toContain("¿Quieres jugar?");
    expect(text).not.toContain("Solo necesitas tu Riviera ID.");
    expect(text).not.toContain("Jugadores");
    expect(text.match(/⚪ \?\?/g)?.length).toBe(3);
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

  it("Americano: resumen de cupo sin slots vacíos", () => {
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
    expect(text).toContain("AMERICANO ABIERTO");
    expect(text).toContain("📍 Hack");
    expect(text).toContain("👥 6/16 confirmados");
    expect(text).not.toContain("⚪ ??");
  });

  it("Duelo: compacto con lugar, cancha y huecos ??", () => {
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
        confirmed_count: 3,
        spots_left: 1,
        display_rating: false,
        entries: baseEntries,
      },
      publicUrl: "https://app.example/jugar/ra-3",
      clubName: "Hack Pádel",
      canchaLabel: "1",
    });
    expect(text).toContain("DUELO 2 VS 2");
    expect(text).toContain("📍 Hack Pádel");
    expect(text).toContain("🏸 Cancha 1");
    expect(text).toContain("📊 5ta Fuerza");
    expect(text).toContain("⚪ ??");
    // Solo 1 entry confirmed en baseEntries → 3 huecos
    expect(text.match(/⚪ \?\?/g)?.length).toBe(3);
    expect(text.indexOf("📍 Hack Pádel")).toBeLessThan(
      text.indexOf("🏸 Cancha 1")
    );
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
    expect(text).toContain("🏸 Cancha 2");
    expect(text).not.toContain("📍 Riviera Open");
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
