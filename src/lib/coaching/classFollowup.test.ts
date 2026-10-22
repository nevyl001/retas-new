import { mapStudentTrainingSession, updateCoachClassFollowup } from "./coachingApi";
import { supabase } from "../supabaseClient";

jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

describe("seguimiento pedagógico", () => {
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
});
