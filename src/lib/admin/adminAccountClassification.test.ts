import {
  accountHasRole,
  buildCoachDirectory,
  parseAdminDirectory,
  resolveAdminAccountRoles,
} from "./adminAccountClassification";

describe("resolveAdminAccountRoles", () => {
  it("un coach sin entidad de club no es club", () => {
    expect(
      resolveAdminAccountRoles({
        hasCoachProfile: true,
        hasStudentLink: false,
        hasClubEntity: false,
      })
    ).toEqual({ club: false, coach: true, student: false });
  });

  it("un alumno vinculado no es club", () => {
    expect(
      resolveAdminAccountRoles({
        hasCoachProfile: false,
        hasStudentLink: true,
        hasClubEntity: false,
      })
    ).toEqual({ club: false, coach: false, student: true });
  });

  it("una fila de users sin entidad de club no es club", () => {
    expect(
      resolveAdminAccountRoles({
        hasCoachProfile: false,
        hasStudentLink: false,
        hasClubEntity: false,
      })
    ).toEqual({ club: false, coach: false, student: false });
  });

  it("un coach con entidad de club conserva los dos roles", () => {
    expect(
      resolveAdminAccountRoles({
        hasCoachProfile: true,
        hasStudentLink: false,
        hasClubEntity: true,
      })
    ).toEqual({ club: true, coach: true, student: false });
  });

  it("las cuentas viejas sin roles siguen el account_kind", () => {
    expect(accountHasRole({ account_kind: "club" }, "club")).toBe(true);
    expect(accountHasRole({ account_kind: "club" }, "coach")).toBe(false);
    expect(
      accountHasRole(
        {
          account_kind: "coach",
          roles: { club: true, coach: true, student: false },
        },
        "club"
      )
    ).toBe(true);
  });
});

describe("buildCoachDirectory", () => {
  it("arma el coach con código, club, alumnos y clases desde las tablas reales", () => {
    const names = new Map<string, string>([["org-1", "Padelito Warehouse"]]);
    const emails = new Map<string, string>([
      ["coach-auth", "gabodcoachpadel@gmail.com"],
    ]);

    const [coach] = buildCoachDirectory({
      coaches: [
        {
          id: "coach-1",
          auth_user_id: "coach-auth",
          coach_code: "RIV-C-00072",
          nombre: "Gabriel Duran",
          foto_url: null,
          created_at: "2026-11-12T00:00:00.000Z",
        },
      ],
      memberships: [
        {
          coach_id: "coach-1",
          organizador_id: "org-1",
          status: "ACTIVE",
        },
      ],
      relationships: [
        { coach_id: "coach-1", jugador_id: "j-1", status: "ACTIVE" },
        { coach_id: "coach-1", jugador_id: "j-1", status: "ACTIVE" },
        { coach_id: "coach-1", jugador_id: "j-2", status: "ENDED" },
      ],
      classes: [
        { coach_id: "coach-1", tipo: "CLASS_DEBIT" },
        { coach_id: "coach-1", tipo: "PACKAGE_CREDIT" },
      ],
      namesByUserId: names,
      emailsByUserId: emails,
    });

    expect(coach).toMatchObject({
      authUserId: "coach-auth",
      coachCode: "RIV-C-00072",
      nombre: "Gabriel Duran",
      email: "gabodcoachpadel@gmail.com",
      studentCount: 1,
      classCount: 1,
      membershipStatus: "activo",
    });
    expect(coach?.clubs).toEqual([
      {
        organizadorId: "org-1",
        name: "Padelito Warehouse",
        status: "ACTIVE",
      },
    ]);
  });
});

describe("parseAdminDirectory", () => {
  it("exige el formato del servidor y separa clubes de coaches", () => {
    const parsed = parseAdminDirectory({
      coaches: [
        {
          auth_user_id: "coach-auth",
          coach_id: "coach-1",
          coach_code: "RIV-C-00072",
          nombre: "Gabriel Duran",
          email: "gabodcoachpadel@gmail.com",
          foto_url: null,
          created_at: "2026-11-12T00:00:00.000Z",
          clubs: [],
          student_count: 0,
          class_count: 0,
          membership_status: "activo",
        },
      ],
      clubs: [
        {
          id: "club-1",
          email: "padelitopadel@gmail.com",
          name: "Padelito Warehouse",
          created_at: "2026-08-25T00:00:00.000Z",
        },
      ],
      students: [
        {
          auth_user_id: "student-1",
          email: "alumno@example.com",
          riviera_id: "RIV-0001",
          is_active: true,
          created_at: "2026-11-01T00:00:00.000Z",
          club_count: 1,
        },
      ],
      unclassified: [
        { id: "generic-1", email: "pending@example.com", name: "Usuario" },
      ],
    });

    expect(parsed?.coaches[0]?.coachCode).toBe("RIV-C-00072");
    expect(parsed?.clubIds).toEqual(["club-1"]);
    expect(parsed?.students[0]?.rivieraId).toBe("RIV-0001");
    expect(parsed?.unclassified).toHaveLength(1);
    expect(parsed?.clubIds).not.toContain("coach-auth");
  });

  it("rechaza una respuesta que no trae la clasificación completa", () => {
    expect(parseAdminDirectory({ coaches: [] })).toBeNull();
    expect(parseAdminDirectory(null)).toBeNull();
  });
});
