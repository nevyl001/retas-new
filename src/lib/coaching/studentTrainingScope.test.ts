import { readFileSync } from "fs";
import { join } from "path";
import {
  groupTrainingSessionsByRelationship,
  selectOperativeCoachClubId,
  sessionsForStudentClub,
} from "./studentTrainingScope";
import type { StudentTrainingSession } from "./types";

function session(
  partial: Partial<StudentTrainingSession> & Pick<StudentTrainingSession, "id" | "clubNombre">
): StudentTrainingSession {
  return {
    startsAt: "2026-10-19T17:00:00Z",
    durationMinutes: 60,
    workedOn: [],
    improvements: null,
    areasToImprove: null,
    recommendations: null,
    nextGoals: null,
    motivationalMessage: null,
    followupUpdatedAt: null,
    coachNombre: "Coach",
    nextScheduledAt: null,
    ...partial,
  };
}

describe("selección de club operativo", () => {
  it("elige la primera membresía activa aunque no sea la primera de la lista", () => {
    expect(
      selectOperativeCoachClubId([
        {
          membershipId: "m-inactiva",
          organizadorId: "club-inactivo",
          status: "INACTIVE",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          membershipId: "m-activa",
          organizadorId: "club-activo",
          clubNombre: "Hack Pádel",
          status: "ACTIVE",
          createdAt: "2026-02-01T00:00:00Z",
        },
      ])
    ).toBe("club-activo");
  });

  it("no selecciona ninguna membresía si ninguna está activa", () => {
    expect(
      selectOperativeCoachClubId([
        {
          membershipId: "m-pendiente",
          organizadorId: "club-pendiente",
          status: "PENDING",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          membershipId: "m-inactiva",
          organizadorId: "club-inactivo",
          status: "INACTIVE",
          createdAt: "2026-02-01T00:00:00Z",
        },
      ])
    ).toBeNull();
  });
});

describe("evolución del alumno por club", () => {
  const hack = session({
    id: "ses-hack",
    relationshipId: "rel-hack",
    organizadorId: "org-hack",
    clubNombre: "Club Riviera",
    workedOn: ["Bandeja"],
    improvements: "Avance en Hack",
  });
  const valvi = session({
    id: "ses-valvi",
    relationshipId: "rel-valvi",
    organizadorId: "org-valvi",
    clubNombre: "Club Riviera",
    workedOn: ["Volea"],
    improvements: "Avance en Valvidub",
  });

  it("separa sesiones por relationship_id aunque el nombre comercial sea el mismo", () => {
    const grouped = groupTrainingSessionsByRelationship([hack, valvi], [
      { relationshipId: "rel-hack", organizadorId: "org-hack" },
      { relationshipId: "rel-valvi", organizadorId: "org-valvi" },
    ]);

    expect(grouped.get("rel-hack")?.map((item) => item.id)).toEqual(["ses-hack"]);
    expect(grouped.get("rel-valvi")?.map((item) => item.id)).toEqual(["ses-valvi"]);
  });

  it("no asigna una sesión sin relationship_id ni por nombre de club", () => {
    const unnamed = session({
      id: "ses-sin-id",
      clubNombre: "Hack Pádel",
      improvements: "No debe mezclarse",
    });

    const grouped = groupTrainingSessionsByRelationship([unnamed, hack], [
      { relationshipId: "rel-hack", organizadorId: "org-hack" },
      { relationshipId: "rel-valvi", organizadorId: "org-valvi" },
    ]);

    expect(grouped.get("rel-hack")?.map((item) => item.id)).toEqual(["ses-hack"]);
    expect(grouped.get("rel-valvi")).toEqual([]);
    const placed = Array.from(grouped.values())
      .reduce<string[]>((ids, list) => ids.concat(list.map((item) => item.id)), []);
    expect(placed).not.toContain("ses-sin-id");
  });

  it("rechaza una sesión cuyo organizador no coincide con la relación", () => {
    const crossed = session({
      id: "ses-cruzada",
      relationshipId: "rel-hack",
      organizadorId: "org-ajeno",
      clubNombre: "Hack Pádel",
    });

    expect(
      sessionsForStudentClub([crossed], {
        relationshipId: "rel-hack",
        organizadorId: "org-hack",
      })
    ).toEqual([]);
  });

  it("conserva el historial de una relación terminada cuando el id coincide", () => {
    const historical = session({
      id: "ses-historica",
      relationshipId: "rel-ended",
      organizadorId: "org-hack",
      clubNombre: "Nombre que ya no se usa",
      improvements: "Clase de 2024",
    });

    expect(
      sessionsForStudentClub([historical], {
        relationshipId: "rel-ended",
        organizadorId: "org-hack",
      }).map((item) => item.id)
    ).toEqual(["ses-historica"]);
  });
});

describe("historial del entrenador en el estilo actual", () => {
  it("se apila en vertical y no desborda en móvil", () => {
    const css = readFileSync(
      join(__dirname, "../../components/coaching/coaching.css"),
      "utf8"
    );
    const block = css.slice(css.indexOf(".coach-follow-history {"));
    expect(block.startsWith(".coach-follow-history {")).toBe(true);
    expect(block).toContain("flex-direction: column");
    expect(block).toContain("overflow-x: hidden");
    expect(block).toContain("overflow-wrap: anywhere");
    expect(block).toContain("@media (max-width: 640px)");
    expect(css).toContain("minmax(min(100%, 17.5rem), 1fr)");
    expect(css).toContain("minmax(min(100%, 16rem), 1fr)");
    expect(css).toContain(".coach-class-form__actions");
    expect(css).toContain("flex-wrap: wrap");
  });
});

describe("consulta del timeline", () => {
  it("expone relationship_id y organizador_id y no selecciona notas privadas", () => {
    const sql = readFileSync(
      join(
        __dirname,
        "../../../supabase/migrations/0125_coaching_student_timeline_relationship_id.sql"
      ),
      "utf8"
    );
    const selectList = sql.slice(sql.indexOf("SELECT"), sql.indexOf("FROM public.coach_sessions"));
    expect(selectList).toContain("s.relationship_id");
    expect(selectList).toContain("s.organizador_id");
    expect(selectList).not.toMatch(/private_notes|notes_summary/);
    expect(sql).toContain("al.auth_user_id = v_caller");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.get_student_training_timeline()");
  });
});
