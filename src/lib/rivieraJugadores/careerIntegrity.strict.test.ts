import {
  CareerIntegrityException,
  mapConfidenceToIntegrityCode,
} from "./careerIntegrity";
import {
  parseProfileLinkResolution,
  requireOfficialProfileLinkForParticipacion,
} from "./orphanProfileLink";

jest.mock("../supabaseClient", () => ({
  supabase: { rpc: jest.fn() },
}));

import { supabase } from "../supabaseClient";

describe("career integrity strict profile link", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("parseProfileLinkResolution expone confidence y reason reales", () => {
    const parsed = parseProfileLinkResolution({
      linked: false,
      confidence: "REVIEW",
      reason: "solo evidencia débil (nombre/cross-club); requiere revisión manual",
      action_sugerida: "MANUAL_REVIEW",
      candidate_count: 1,
      cross_club_profile: true,
    });
    expect(parsed.confidence).toBe("REVIEW");
    expect(parsed.reason).toContain("evidencia débil");
    expect(parsed.actionSugerida).toBe("MANUAL_REVIEW");
  });

  it("REVIEW → CareerIntegrityException ambiguous_profile_link", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        linked: false,
        confidence: "REVIEW",
        reason: "múltiples candidatos oficiales con el mismo nombre",
        action_sugerida: "MANUAL_REVIEW",
        candidate_count: 2,
      },
      error: null,
    });

    await expect(
      requireOfficialProfileLinkForParticipacion("orphan-id", "org-id")
    ).rejects.toMatchObject({
      name: "CareerIntegrityException",
      code: "ambiguous_profile_link",
      confidence: "REVIEW",
    });
  });

  it("LOW → CareerIntegrityException insufficient_link_evidence", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        linked: false,
        confidence: "LOW",
        reason: "sin candidato oficial con Riviera ID",
        action_sugerida: "INSUFFICIENT_EVIDENCE",
      },
      error: null,
    });

    await expect(
      requireOfficialProfileLinkForParticipacion("new-id", "org-id")
    ).rejects.toMatchObject({
      code: "insufficient_link_evidence",
      confidence: "LOW",
    });
  });

  it("OK/already_linked no lanza", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        linked: true,
        already_linked: true,
        confidence: "OK",
        reason: "perfil ya enlazado",
        official_player_key: "key-1",
        riviera_id: "RIV-00000009",
      },
      error: null,
    });

    const result = await requireOfficialProfileLinkForParticipacion(
      "linked-id",
      "org-id"
    );
    expect(result.linked).toBe(true);
    expect(result.confidence).toBe("OK");
  });

  it("mapConfidenceToIntegrityCode", () => {
    expect(mapConfidenceToIntegrityCode("REVIEW")).toBe("ambiguous_profile_link");
    expect(mapConfidenceToIntegrityCode("LOW")).toBe("insufficient_link_evidence");
  });

  it("CareerIntegrityException.toStructuredLog", () => {
    const err = new CareerIntegrityException({
      code: "ambiguous_profile_link",
      message: "test",
      confidence: "REVIEW",
      reason: "solo cross-club",
      jugadorId: "j1",
      organizadorId: "o1",
    });
    expect(err.toStructuredLog()).toMatchObject({
      type: "career_integrity_failure",
      confidence: "REVIEW",
      reason: "solo cross-club",
    });
  });
});
