import {
  mapStudentTrainingSession,
  recordCoachClassSessionWithFollowup,
  updateCoachClassFollowup,
} from "./coachingApi";
import { supabase } from "../supabaseClient";

jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

describe("seguimiento pedagógico", () => {
  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockReset();
  });

  it("no copia notas privadas al expediente del alumno", () => {
    const session = mapStudentTrainingSession({
      id: "s1",
      starts_at: "2026-10-22T18:00:00.000Z",
      improvements: "Mejor control en la volea",
      private_notes: "nota interna del coach",
      notes_summary: "observación que no debe verse",
      areas_to_improve: "Anticipar el globo",
    });

    const serialized = JSON.stringify(session);
    expect(serialized).not.toContain("nota interna");
    expect(serialized).not.toContain("observación que no debe verse");
    expect(session.improvements).toBe("Mejor control en la volea");
    expect(session.areasToImprove).toBe("Anticipar el globo");
    expect(session).not.toHaveProperty("privateNotes");
    expect(session).not.toHaveProperty("notesSummary");
  });

  it("edita el seguimiento con una operación distinta al registro de la clase", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: { ok: true, session_id: "s1" },
      error: null,
    });

    await updateCoachClassFollowup({
      sessionId: "s1",
      workedOn: ["Volea"],
      recommendations: "Diez minutos de desplazamiento",
      motivationalMessage: "Buen trabajo",
      privateNotes: "solo coach",
    });

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "update_coach_class_followup",
      expect.objectContaining({
        p_session_id: "s1",
        p_recommendations: "Diez minutos de desplazamiento",
        p_private_notes: "solo coach",
      })
    );
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      "record_coach_class_session",
      expect.anything()
    );
  });

  it("registro nuevo usa RPC atómica e incluye notas privadas", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        followup_ok: true,
        session_id: "s-new",
        remaining_balance: 5,
        total_classes_given: 1,
      },
      error: null,
    });

    await recordCoachClassSessionWithFollowup({
      relationshipId: "rel-1",
      workedOn: ["Volea"],
      privateNotes: "interno",
      areasToImprove: "Bloqueo",
      idempotencyKey: "session-new-1",
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "record_coach_class_session_with_followup",
      expect.objectContaining({
        p_private_notes: "interno",
        p_areas_to_improve: "Bloqueo",
      })
    );
  });

  it("un error de Postgres (objeto, no Error) se muestra al entrenador", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: {
        message:
          "No se pudo guardar el seguimiento de la clase; se revierte el registro.",
        code: "P0001",
      },
    });

    await expect(
      recordCoachClassSessionWithFollowup({
        relationshipId: "rel-1",
        workedOn: ["Saque"],
        idempotencyKey: "session-pg-error",
      })
    ).rejects.toThrow(/se revierte el registro/);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("error de seguimiento en RPC atómica se muestra sin dejar dos llamadas parciales en cliente", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: false,
        error:
          "No se pudo guardar el seguimiento de la clase; se revierte el registro.",
      },
      error: null,
    });

    await expect(
      recordCoachClassSessionWithFollowup({
        relationshipId: "rel-1",
        workedOn: ["Saque"],
        idempotencyKey: "session-rollback-1",
      })
    ).rejects.toThrow(/seguimiento|revierte/i);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
});
