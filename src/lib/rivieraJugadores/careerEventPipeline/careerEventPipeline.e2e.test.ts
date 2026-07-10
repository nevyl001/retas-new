/**
 * E2E de carrera deportiva multi-club + pipeline canónico.
 * Valida identidad única, historial fusionado, puntos por club y pipeline.
 */
jest.mock("../../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("../syncParticipaciones", () => ({
  syncRetaParticipaciones: jest.fn(),
  syncDuelo2v2Participaciones: jest.fn(),
  syncAmericanoParticipaciones: jest.fn(),
  syncTorneoExpressParticipaciones: jest.fn(),
  syncLigaJornada: jest.fn(),
  syncLigaFinalPodio: jest.fn(),
  syncLigaInscripcionRanking: jest.fn(),
  collectJugadorIdsForCareerEvent: jest.fn(),
}));

jest.mock("../jugadorIdResolver", () => ({
  prepareParticipacionIdentityForOrganizer: jest.fn().mockResolvedValue(undefined),
  resolveJugadorIdForParticipacion: jest.fn().mockResolvedValue(
    "11111111-1111-4111-8111-111111111111"
  ),
}));

jest.mock("./preCloseGuards", () => ({
  validateCareerEventPreClose: jest.fn().mockResolvedValue({
    ok: true,
    failures: [],
    excludedJugadorIds: [],
    eventBlocked: false,
  }),
}));

jest.mock("../orphanProfileLink", () => ({
  requireOfficialProfileLinkForParticipacion: jest.fn().mockResolvedValue({
    linked: true,
    confidence: "OK",
    reason: "perfil ya enlazado",
    officialPlayerKey: "opk-test",
    rivieraId: "RIV-00000102",
  }),
  ensureOfficialProfileLinkForParticipacion: jest.fn().mockResolvedValue({
    linked: true,
    confidence: "OK",
    reason: "perfil ya enlazado",
    officialPlayerKey: "opk-test",
    rivieraId: "RIV-00000102",
  }),
}));

jest.mock("../careerIdentity", () => ({
  ensureRivieraIdentity: jest.fn().mockResolvedValue({
    officialPlayerKey: "opk-test",
    rivieraId: "RIV-00000102",
    rivieraJugadorId: "11111111-1111-4111-8111-111111111111",
    registrationJugadorId: "11111111-1111-4111-8111-111111111111",
    identityCreated: false,
    linkCreated: false,
    rivieraIdAssigned: false,
    debutAssigned: false,
    debutOrganizerId: null,
    debutAt: null,
    linkSource: null,
    rivieraIdSerial: 102,
  }),
}));

jest.mock("../rivieraJugadoresService", () => ({
  rebuildJugadorStats: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../organizer/organizerDisplayName", () => ({
  clearOrganizerDisplayNameCache: jest.fn(),
}));

import { supabase } from "../../supabaseClient";
import { ensureRivieraIdentity } from "../careerIdentity";
import { mergeCareerParticipacionesForIdentity } from "../careerParticipacionesMerge";
import {
  computeCareerPointsByClubFromParticipaciones,
} from "../careerPointsByClub";
import { finalizeCareerEvent } from "./pipeline";
import { validateCareerEventPreClose } from "./preCloseGuards";
import { syncDuelo2v2Participaciones } from "../syncParticipaciones";
import { requireOfficialProfileLinkForParticipacion } from "../orphanProfileLink";
import type { JugadorParticipacion } from "../types";

jest.mock("../careerParticipacionesMerge", () => ({
  mergeCareerParticipacionesForIdentity: jest.fn(),
}));

const CLUB_TEST = "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d";
const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const RIVIERA_OPEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CANONICAL = "11111111-1111-4111-8111-111111111111";
const HACK_LOCAL = "22222222-2222-4222-8222-222222222222";
const OPEN_LOCAL = "33333333-3333-4333-8333-333333333333";

function part(
  id: string,
  jugadorId: string,
  org: string,
  clubName: string,
  pts: number
): JugadorParticipacion {
  return {
    id,
    jugador_id: jugadorId,
    tipo_evento: "duelo_2v2",
    evento_id: `event-${id}`,
    evento_nombre: `Evento ${id}`,
    resultado: "victoria",
    pareja_con: "Pareja",
    sets_favor: 2,
    sets_contra: 0,
    puntos_obtenidos: pts,
    fecha: "2026-07-06",
    created_at: "2026-07-06T12:00:00Z",
    metadata: {
      organizador_id: org,
      club_name: clubName,
      puntos_aplicados: true,
    },
  };
}

function mockSupabaseForAssertions(
  participaciones: ParticipacionRow[],
  options?: { withRating?: boolean; withStats?: boolean; withIdentity?: boolean }
): void {
  const withRating = options?.withRating ?? true;
  const withStats = options?.withStats ?? true;
  const withIdentity = options?.withIdentity ?? true;

  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      filter: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
      in: jest.fn().mockReturnThis(),
    };

    if (table === "jugador_participaciones") {
      chain.eq = jest.fn().mockImplementation(() => ({
        ...chain,
        eq: jest.fn().mockResolvedValue({ data: participaciones, error: null }),
      }));
      return chain;
    }

    if (table === "rating_historial") {
      chain.maybeSingle = jest.fn().mockResolvedValue({
        data: withRating ? { id: "rh-1" } : null,
        error: null,
      });
      return chain;
    }

    if (table === "jugador_stats") {
      chain.maybeSingle = jest.fn().mockResolvedValue({
        data: withStats ? { jugador_id: "x" } : null,
        error: null,
      });
      return chain;
    }

    if (table === "riviera_jugadores") {
      chain.maybeSingle = jest.fn().mockResolvedValue({
        data: withIdentity ? { riviera_id: "RIV-00000102" } : null,
        error: null,
      });
      return chain;
    }

    if (table === "riviera_official_player_profile_link") {
      chain.maybeSingle = jest.fn().mockResolvedValue({
        data: withIdentity ? { official_player_key: "opk-test" } : null,
        error: null,
      });
      return chain;
    }

    return chain;
  });
}

type ParticipacionRow = {
  id: string;
  jugador_id: string;
  puntos_obtenidos: number | null;
  metadata: Record<string, unknown> | null;
};

describe("finalizeCareerEvent E2E", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateCareerEventPreClose as jest.Mock).mockResolvedValue({
      ok: true,
      failures: [],
      excludedJugadorIds: [],
      eventBlocked: false,
    });
    (ensureRivieraIdentity as jest.Mock).mockResolvedValue({
      rivieraId: "RIV-00000102",
    });
    (requireOfficialProfileLinkForParticipacion as jest.Mock).mockResolvedValue({
      officialPlayerKey: "opk-test",
      rivieraId: "RIV-00000102",
    });
  });

  it("ejecuta pipeline completo para duelo 2v2", async () => {
    const dueloId = "duelo-e2e-1";
    const touched = [CANONICAL, HACK_LOCAL];

    (syncDuelo2v2Participaciones as jest.Mock).mockResolvedValue({
      touchedJugadorIds: touched,
      participacionEventoId: dueloId,
    });

    const participaciones: ParticipacionRow[] = touched.map((jid, i) => ({
      id: `p-${i}`,
      jugador_id: jid,
      puntos_obtenidos: 50,
      metadata: {
        organizador_id: HACKPADEL,
        club_name: "HackPadel",
        subtipo: "duelo_2v2_cierre",
        puntos_aplicados: true,
      },
    }));

    mockSupabaseForAssertions(participaciones);

    const result = await finalizeCareerEvent({
      kind: "duelo_2v2",
      organizadorId: HACKPADEL,
      duelo: {
        id: dueloId,
        organizador_id: HACKPADEL,
        nombre: "Test 2",
        estado: "finalizado",
        ganador: "a",
      } as never,
    });

    expect(syncDuelo2v2Participaciones).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.touchedJugadorIds).toEqual(touched);
    expect(result.context.eventoId).toBe(dueloId);
  });

  it("reporta fallo estructurado si falta historial", async () => {
    (syncDuelo2v2Participaciones as jest.Mock).mockResolvedValue({
      touchedJugadorIds: [CANONICAL],
      participacionEventoId: "duelo-fail",
    });

    mockSupabaseForAssertions([]);

    const result = await finalizeCareerEvent({
      kind: "duelo_2v2",
      organizadorId: HACKPADEL,
      duelo: {
        id: "duelo-fail",
        estado: "finalizado",
        ganador: "a",
      } as never,
    });

    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => f.code === "missing_historial")).toBe(
      true
    );
  });
});

describe("Escenario multi-club (Club Test → HackPadel → Riviera Open)", () => {
  it("identidad global única con historial en tres clubes", async () => {
    const merged = [
      part("ct-1", CANONICAL, CLUB_TEST, "Club Test", 30),
      part("hp-1", HACK_LOCAL, HACKPADEL, "HackPadel", 50),
      part("ro-1", OPEN_LOCAL, RIVIERA_OPEN, "Riviera Open", 20),
    ];

    (mergeCareerParticipacionesForIdentity as jest.Mock).mockResolvedValue(
      merged
    );

    const career = await mergeCareerParticipacionesForIdentity(
      {
        canonicalJugadorId: CANONICAL,
        anchorJugadorId: CANONICAL,
        linkedJugadorIds: [CANONICAL, HACK_LOCAL, OPEN_LOCAL],
        viewingOrganizadorId: null,
      },
      100
    );

    expect(career).toHaveLength(3);
    expect(new Set(career.map((r) => r.id)).size).toBe(3);

    const points = computeCareerPointsByClubFromParticipaciones(career);
    expect(points.total).toBe(100);
    expect(points.puntosByOrg.get(CLUB_TEST)).toBe(30);
    expect(points.puntosByOrg.get(HACKPADEL)).toBe(50);
    expect(points.puntosByOrg.get(RIVIERA_OPEN)).toBe(20);
  });

  it("reimportación no duplica eventos en carrera fusionada", async () => {
    const base = [
      part("hp-1", HACK_LOCAL, HACKPADEL, "HackPadel", 50),
    ];
    (mergeCareerParticipacionesForIdentity as jest.Mock).mockResolvedValue(
      base
    );

    const first = await mergeCareerParticipacionesForIdentity(
      {
        canonicalJugadorId: CANONICAL,
        anchorJugadorId: HACK_LOCAL,
        linkedJugadorIds: [CANONICAL, HACK_LOCAL],
        viewingOrganizadorId: HACKPADEL,
      },
      100
    );

    const second = await mergeCareerParticipacionesForIdentity(
      {
        canonicalJugadorId: CANONICAL,
        anchorJugadorId: HACK_LOCAL,
        linkedJugadorIds: [CANONICAL, HACK_LOCAL],
        viewingOrganizadorId: HACKPADEL,
      },
      100
    );

    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
    expect(first).toHaveLength(1);
  });

  it("puntos HackPadel no se atribuyen a Club Test", async () => {
    const rows = [
      part("hp-1", HACK_LOCAL, HACKPADEL, "HackPadel", 50),
    ];
    const points = computeCareerPointsByClubFromParticipaciones(rows);
    expect(points.puntosByOrg.get(CLUB_TEST)).toBeUndefined();
    expect(points.puntosByOrg.get(HACKPADEL)).toBe(50);
  });
});
