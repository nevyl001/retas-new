import {
  buildCoachDirectory,
  coachDirectoryFromRpc,
  isMissingDirectoryRpc,
  resolveAdminAccountKind,
} from "./adminAccountClassification";

describe("resolveAdminAccountKind", () => {
  it("un perfil de coach no se clasifica como club aunque exista en users", () => {
    expect(
      resolveAdminAccountKind({
        hasCoachProfile: true,
        hasStudentLink: false,
      })
    ).toBe("coach");
  });

  it("un alumno vinculado no se clasifica como club", () => {
    expect(
      resolveAdminAccountKind({
        hasCoachProfile: false,
        hasStudentLink: true,
      })
    ).toBe("student");
  });

  it("una cuenta sin perfil de coach ni de alumno sigue siendo club", () => {
    expect(
      resolveAdminAccountKind({
        hasCoachProfile: false,
        hasStudentLink: false,
      })
    ).toBe("club");
  });

  it("si la cuenta es coach y alumno, conserva el perfil de coach", () => {
    expect(
      resolveAdminAccountKind({
        hasCoachProfile: true,
        hasStudentLink: true,
      })
    ).toBe("coach");
  });
});

describe("buildCoachDirectory", () => {
  it("arma el coach con código, club, alumnos y clases desde las tablas reales", () => {
    const names = new Map<string, string>([
      ["org-1", "Padelito Warehouse"],
    ]);
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
    expect(coach.clubs).toEqual([
      {
        organizadorId: "org-1",
        name: "Padelito Warehouse",
        status: "ACTIVE",
      },
    ]);
  });
});

describe("coachDirectoryFromRpc", () => {
  it("lee la clasificación devuelta por el servidor", () => {
    const rows = coachDirectoryFromRpc(
      {
        coaches: [
          {
            auth_user_id: "coach-auth",
            coach_id: "coach-1",
            coach_code: "RIV-C-00072",
            nombre: "Gabriel Duran",
            email: "gabodcoachpadel@gmail.com",
            foto_url: null,
            created_at: "2026-11-12T00:00:00.000Z",
            clubs: [
              {
                organizador_id: "org-1",
                nombre: "Padelito Warehouse",
                status: "ACTIVE",
              },
            ],
            student_count: 2,
            class_count: 4,
            membership_status: "activo",
          },
        ],
      },
      new Map()
    );

    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.coachCode).toBe("RIV-C-00072");
    expect(rows?.[0]?.studentCount).toBe(2);
    expect(rows?.[0]?.clubs[0]?.name).toBe("Padelito Warehouse");
  });

  it("reconoce que la función todavía no está desplegada", () => {
    expect(
      isMissingDirectoryRpc({
        code: "PGRST202",
        message: "Could not find the function public.admin_directorio_clasificacion",
      })
    ).toBe(true);
    expect(
      isMissingDirectoryRpc({
        code: "42501",
        message: "no_autorizado",
      })
    ).toBe(false);
  });
});
