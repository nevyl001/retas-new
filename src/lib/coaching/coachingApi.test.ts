import {
  inviteClubCoach,
  loadCoachingClubSnapshot,
  fetchCurrentCoachProfile,
  updateCoachMembershipStatus,
  searchCoachForInvitation,
  linkExistingCoach,
  linkPlayerByRivieraId,
  updateLinkStatus,
  acceptCoachClubInvitation,
  assignCoachClasses,
  recordCoachClassSession,
  fetchClubClassLedger,
  fetchCoachAssignedStudents,
} from "./coachingApi";
import type { CreateCoachInput } from "./types";
import { supabase } from "../supabaseClient";

jest.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
    functions: {
      invoke: jest.fn(),
    },
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

describe("coachingApi - Entrega B", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("inviteClubCoach", () => {
    it("throws an error when no user session exists", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: null },
      });

      await expect(
        inviteClubCoach("org-123", {
          nombre: "Coach Test",
          email: "coach@test.com",
          genero: "M",
          categoria: "2da_fuerza",
          fuerzas: ["2da_fuerza"],
          especialidades: ["Técnica"],
        })
      ).rejects.toThrow("Sesión de organizador requerida");
    });

    it("propagates real server errors without falling back to demo or inventing fake codes", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: { access_token: "mock-token" } },
      });

      (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
        data: { ok: false, error: "No tienes permisos de organizador de club para registrar o invitar coaches." },
        error: { message: "Edge Function returned 403" },
      });

      await expect(
        inviteClubCoach("org-123", {
          nombre: "Coach Test",
          email: "coach@test.com",
          genero: "M",
          categoria: "2da_fuerza",
          fuerzas: ["2da_fuerza"],
          especialidades: ["Técnica"],
        })
      ).rejects.toThrow("No tienes permisos de organizador de club");
    });

    it("returns authentic coachCode and membership status on successful invitation", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: { access_token: "mock-token" } },
      });

      (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
        data: {
          ok: true,
          coachCode: "RIV-C-00055",
          isNewUser: true,
          membershipStatus: "PENDING",
          message: "Invitación oficial enviada",
        },
        error: null,
      });

      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === "coach_club_memberships") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [
                  {
                    status: "INACTIVE",
                    coach: {
                      id: "coach-uuid-55",
                      coach_code: "RIV-C-00055",
                      nombre: "Coach Nuevo",
                      foto_url: null,
                      bio: null,
                      especialidades: ["Técnica"],
                      fuerzas: ["2da_fuerza"],
                    },
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === "coach_player_relationships") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                in: jest.fn().mockReturnValue({
                  neq: jest.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return { select: jest.fn() };
      });

      const result = await inviteClubCoach("org-123", {
        nombre: "Coach Nuevo",
        email: "coach.nuevo@test.com",
        genero: "M",
        categoria: "2da_fuerza",
        fuerzas: ["2da_fuerza"],
        especialidades: ["Técnica"],
      });

      expect(result.coachCode).toBe("RIV-C-00055");
      expect(result.isNewUser).toBe(true);
      expect(result.membershipStatus).toBe("PENDING");
      expect(result.snapshot.coaches.length).toBe(1);
      expect(result.snapshot.coaches[0].coachCode).toBe("RIV-C-00055");
      expect(result.snapshot.coaches[0].membershipStatus).toBe("INACTIVE");
    });
  });

  describe("loadCoachingClubSnapshot", () => {
    it("loads all memberships without filtering out INACTIVE or PENDING coaches", async () => {
      const mockMembershipsEq = jest.fn().mockResolvedValue({
        data: [
          {
            status: "ACTIVE",
            coach: {
              id: "c1",
              coach_code: "RIV-C-00001",
              nombre: "Coach Activo",
              especialidades: [],
              fuerzas: [],
            },
          },
          {
            status: "INACTIVE",
            coach: {
              id: "c2",
              coach_code: "RIV-C-00002",
              nombre: "Coach Inactivo",
              especialidades: [],
              fuerzas: [],
            },
          },
        ],
        error: null,
      });

      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === "coach_club_memberships") {
          return {
            select: jest.fn().mockReturnValue({ eq: mockMembershipsEq }),
          };
        }
        if (table === "coach_player_relationships") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                in: jest.fn().mockReturnValue({
                  neq: jest.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return { select: jest.fn() };
      });

      const snapshot = await loadCoachingClubSnapshot("org-123");

      expect(mockMembershipsEq).toHaveBeenCalledWith("organizador_id", "org-123");
      expect(mockMembershipsEq).toHaveBeenCalledTimes(1);

      expect(snapshot.coaches.length).toBe(2);
      expect(snapshot.coaches[0].membershipStatus).toBe("ACTIVE");
      expect(snapshot.coaches[1].membershipStatus).toBe("INACTIVE");
    });

    it("throws a real error when Supabase query fails, without falling back to demo", async () => {
      (supabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: { code: "42501", message: "permission denied for table coach_club_memberships" },
          }),
        }),
      });

      await expect(loadCoachingClubSnapshot("org-123")).rejects.toThrow(
        "No se pudieron cargar los coaches del club: permission denied for table coach_club_memberships"
      );
    });
  });

  describe("fetchCurrentCoachProfile", () => {
    it("returns null when no session is present", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: null },
      });

      const profile = await fetchCurrentCoachProfile();
      expect(profile).toBeNull();
    });

    it("returns null when user is not a registered coach", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: { user: { id: "player-uid" } } },
      });

      (supabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      const profile = await fetchCurrentCoachProfile();
      expect(profile).toBeNull();
    });

    it("returns authentic coach profile and club memberships for registered coaches", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: { user: { id: "coach-uid" } } },
      });

      // 1st query: riviera_coaches
      const coachSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              id: "c-100",
              auth_user_id: "coach-uid",
              coach_code: "RIV-C-00100",
              nombre: "Coach Authenticated",
              foto_url: null,
              bio: "Pro",
              filosofia: null,
              especialidades: ["Táctica"],
              fuerzas: ["1ra_fuerza"],
            },
            error: null,
          }),
        }),
      });

      // 2nd query: coach_club_memberships
      const memSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              id: "m-1",
              organizador_id: "org-1",
              status: "ACTIVE",
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
        }),
      });

      (supabase.from as jest.Mock)
        .mockReturnValueOnce({ select: coachSelect })
        .mockReturnValueOnce({ select: memSelect });

      const profile = await fetchCurrentCoachProfile();
      expect(profile).not.toBeNull();
      expect(profile?.coachCode).toBe("RIV-C-00100");
      expect(profile?.nombre).toBe("Coach Authenticated");
      expect(profile?.memberships.length).toBe(1);
      expect(profile?.memberships[0].status).toBe("ACTIVE");
    });
  });

  describe("updateCoachMembershipStatus", () => {
    beforeEach(() => {
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === "coach_club_memberships") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          };
        }
        return { select: jest.fn() };
      });
    });

    it("deactivates coach membership via deactivate_coach_from_club RPC", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, status: "INACTIVE" },
        error: null,
      });

      const snapshot = await updateCoachMembershipStatus(
        "org-123",
        "coach-1",
        "INACTIVE"
      );

      expect(supabase.rpc).toHaveBeenCalledWith("deactivate_coach_from_club", {
        p_coach_id: "coach-1",
        p_organizador_id: "org-123",
      });
      expect(snapshot).toBeDefined();
      expect(snapshot.source).toBe("live");
    });

    it("requests coach re-incorporation via link_existing_coach_to_club RPC", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, status: "PENDING" },
        error: null,
      });

      const snapshot = await updateCoachMembershipStatus(
        "org-123",
        "coach-1",
        "ACTIVE"
      );

      expect(supabase.rpc).toHaveBeenCalledWith("link_existing_coach_to_club", {
        p_coach_id: "coach-1",
      });
      expect(snapshot).toBeDefined();
      expect(snapshot.source).toBe("live");
    });

    it("throws a real error when deactivate RPC returns an error, without fallback to demo", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: "database rpc failure" },
      });

      await expect(
        updateCoachMembershipStatus("org-123", "coach-1", "INACTIVE")
      ).rejects.toThrow("No se pudo desactivar al coach del club: database rpc failure");
    });

    it("throws a real error when link_existing_coach_to_club RPC returns an error, without fallback to demo", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: "database rpc failure" },
      });

      await expect(
        updateCoachMembershipStatus("org-123", "coach-1", "ACTIVE")
      ).rejects.toThrow("No se pudo solicitar la reincorporación del coach: database rpc failure");
    });
  });

  describe("searchCoachForInvitation", () => {
    it("returns null on empty query", async () => {
      const result = await searchCoachForInvitation("   ");
      expect(result).toBeNull();
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("calls lookup_coach_for_invitation and returns coach data", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            coach_id: "c-found",
            coach_code: "RIV-C-00042",
            nombre: "Coach Encontrado",
            foto_url: null,
            bio: "Bio",
            especialidades: ["Técnica"],
            fuerzas: ["3ra_fuerza"],
            already_member: false,
            membership_status: null,
          },
        ],
        error: null,
      });

      const result = await searchCoachForInvitation("RIV-C-00042");
      expect(result).not.toBeNull();
      expect(result?.coachCode).toBe("RIV-C-00042");
      expect(result?.nombre).toBe("Coach Encontrado");
      expect(result?.alreadyMember).toBe(false);
    });
  });

  describe("Edge Function Security & Authorization Rules", () => {
    const baseCoachInput: CreateCoachInput = {
      nombre: "Coach Test",
      email: "coach@test.com",
      genero: "M",
      categoria: "2da_fuerza",
      fuerzas: ["2da_fuerza"],
      especialidades: ["Técnica"],
    };

    it("rejects with 401 when unauthenticated", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: null },
      });

      await expect(
        inviteClubCoach("org-1", { ...baseCoachInput })
      ).rejects.toThrow("Sesión de organizador requerida");
    });

    it("rejects with 403 when club has coaching_enabled = false", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: { access_token: "token-org" } },
      });

      (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
        data: {
          ok: false,
          error: "No tienes permisos de organizador de club con Riviera Coaching habilitado.",
        },
        error: { message: "Edge Function returned 403" },
      });

      await expect(
        inviteClubCoach("org-disabled", { ...baseCoachInput })
      ).rejects.toThrow("No tienes permisos de organizador de club con Riviera Coaching habilitado");
    });

    it("rejects with 403 when organizer has no row in organizador_game_modes", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: { access_token: "token-org" } },
      });

      (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
        data: {
          ok: false,
          error: "No tienes permisos de organizador de club con Riviera Coaching habilitado.",
        },
        error: { message: "Edge Function returned 403" },
      });

      await expect(
        inviteClubCoach("non-existent-org", { ...baseCoachInput })
      ).rejects.toThrow("No tienes permisos de organizador de club");
    });

    it("rejects with 403 when a normal player or non-organizer invokes the function", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: { access_token: "token-player" } },
      });

      (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
        data: {
          ok: false,
          error: "No tienes permisos de organizador de club con Riviera Coaching habilitado.",
        },
        error: { message: "Edge Function returned 403" },
      });

      await expect(
        inviteClubCoach("org-player", { ...baseCoachInput })
      ).rejects.toThrow("No tienes permisos de organizador de club");
    });

    it("rejects with 403 when a coach attempts to invite another coach", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: { access_token: "token-coach" } },
      });

      (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
        data: {
          ok: false,
          error: "No tienes permisos de organizador de club con Riviera Coaching habilitado.",
        },
        error: { message: "Edge Function returned 403" },
      });

      await expect(
        inviteClubCoach("org-coach", {
          ...baseCoachInput,
          nombre: "Coach Colega",
          email: "colega@test.com",
        })
      ).rejects.toThrow("No tienes permisos de organizador de club");
    });

    it("succeeds with 200 when Master Admin invokes the function", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: { access_token: "token-master-admin" } },
      });

      (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
        data: {
          ok: true,
          coachCode: "RIV-C-00099",
          isNewUser: true,
          membershipStatus: "PENDING",
          message: "Invitación oficial enviada exitosamente",
        },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const res = await inviteClubCoach("club-target-uuid", {
        ...baseCoachInput,
        nombre: "Coach Invitado por Admin Maestro",
        email: "coach.master@test.com",
      });

      expect(res.coachCode).toBe("RIV-C-00099");
      expect(res.isNewUser).toBe(true);
      expect(res.membershipStatus).toBe("PENDING");
    });

    it("handles invitation retry by reusing existing coach without duplicate accounts", async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: { access_token: "token-org" } },
      });

      (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
        data: {
          ok: true,
          coachCode: "RIV-C-00042",
          isNewUser: false,
          alreadyMember: true,
          membershipStatus: "ACTIVE",
          message: "Coach incorporado exitosamente a tu club con código oficial RIV-C-00042.",
        },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const res = await inviteClubCoach("org-1", {
        ...baseCoachInput,
        nombre: "Coach Existente",
        email: "coach.existente@test.com",
      });

      expect(res.coachCode).toBe("RIV-C-00042");
      expect(res.isNewUser).toBe(false);
      expect(res.alreadyMember).toBe(true);
      expect(res.membershipStatus).toBe("ACTIVE");
    });
  });

  describe("linkExistingCoach (RPC without bypass)", () => {
    it("calls link_existing_coach_to_club RPC and reloads snapshot on success", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, membership_id: "mem-10", status: "ACTIVE" },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const snapshot = await linkExistingCoach("org-1", "coach-uuid-1");
      expect(supabase.rpc).toHaveBeenCalledWith("link_existing_coach_to_club", {
        p_coach_id: "coach-uuid-1",
      });
      expect(snapshot.source).toBe("live");
    });

    it("fails closed when RPC returns error, without silent fallback or direct bypass", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: "El club no tiene habilitado el módulo de coaching" },
      });

      await expect(linkExistingCoach("org-1", "coach-uuid-1")).rejects.toThrow(
        "No se pudo vincular el coach al club: El club no tiene habilitado el módulo de coaching"
      );
    });

    it("fails closed when RPC returns { ok: false, error: ... }", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: { ok: false, error: "Coach no encontrado" },
        error: null,
      });

      await expect(linkExistingCoach("org-1", "coach-uuid-bad")).rejects.toThrow(
        "Coach no encontrado"
      );
    });
  });

  describe("linkPlayerByRivieraId (RPC without bypass)", () => {
    it("rejects invalid Riviera ID format immediately before calling RPC", async () => {
      await expect(
        linkPlayerByRivieraId("org-1", "coach-1", "INVALID-ID")
      ).rejects.toThrow("Formato inválido. Usa el Riviera ID exacto, por ejemplo RIV-00000001.");
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("calls link_player_to_coach_by_riviera_id RPC and reloads snapshot on success", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          ok: true,
          relationship_id: "rel-1",
          jugador_id: "j-1",
          riviera_id: "RIV-00000042",
          status: "ACTIVE",
        },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const snapshot = await linkPlayerByRivieraId("org-1", "coach-1", "RIV-00000042");
      expect(supabase.rpc).toHaveBeenCalledWith("link_player_to_coach_by_riviera_id", {
        p_coach_id: "coach-1",
        p_riviera_id: "RIV-00000042",
        p_organizador_id: "org-1",
      });
      expect(snapshot.source).toBe("live");
    });

    it("fails closed when RPC returns error, without silent fallback", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: "El coach no tiene membresía activa en este club" },
      });

      await expect(
        linkPlayerByRivieraId("org-1", "coach-1", "RIV-00000042")
      ).rejects.toThrow(
        "No se pudo vincular el alumno al coach: El coach no tiene membresía activa en este club"
      );
    });

    it("fails closed when RPC returns { ok: false, error: ... }", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: { ok: false, error: "No se encontró un jugador registrado con ese Riviera ID" },
        error: null,
      });

      await expect(
        linkPlayerByRivieraId("org-1", "coach-1", "RIV-00000099")
      ).rejects.toThrow("No se encontró un jugador registrado con ese Riviera ID");
    });
  });

  describe("updateLinkStatus", () => {
    it("updates status in coach_player_relationships and reloads snapshot", async () => {
      const mockEq2 = jest.fn().mockResolvedValue({ error: null });
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq1 });

      (supabase.from as jest.Mock).mockReturnValue({
        update: mockUpdate,
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const snapshot = await updateLinkStatus("org-1", "rel-1", "ENDED");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "ENDED",
        })
      );
      expect(mockEq1).toHaveBeenCalledWith("id", "rel-1");
      expect(mockEq2).toHaveBeenCalledWith("organizador_id", "org-1");
      expect(snapshot.source).toBe("live");
    });

    it("throws controlled error when update fails", async () => {
      const mockEq2 = jest.fn().mockResolvedValue({
        error: { message: "RLS check violated" },
      });
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq1 });

      (supabase.from as jest.Mock).mockReturnValue({ update: mockUpdate });

      await expect(updateLinkStatus("org-1", "rel-1", "ACTIVE")).rejects.toThrow(
        "No se pudo actualizar el estado de la relación: RLS check violated"
      );
    });
  });

  describe("acceptCoachClubInvitation", () => {
    it("calls accept_coach_club_invitation RPC and returns success", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, status: "ACTIVE" },
        error: null,
      });

      const res = await acceptCoachClubInvitation("mem-pending-1");
      expect(supabase.rpc).toHaveBeenCalledWith("accept_coach_club_invitation", {
        p_membership_id: "mem-pending-1",
      });
      expect(res.success).toBe(true);
    });

    it("falls back to direct update if RPC is not yet present and succeeds", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: "function public.accept_coach_club_invitation does not exist" },
      });

      const mockEq = jest.fn().mockResolvedValue({ error: null });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });

      (supabase.from as jest.Mock).mockReturnValue({ update: mockUpdate });

      const res = await acceptCoachClubInvitation("mem-pending-1");
      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACTIVE" })
      );
      expect(mockEq).toHaveBeenCalledWith("id", "mem-pending-1");
    });

    it("returns controlled error when both RPC and update fail", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: "RPC not found" },
      });

      const mockEq = jest.fn().mockResolvedValue({
        error: { message: "Row level security denied update" },
      });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });

      (supabase.from as jest.Mock).mockReturnValue({ update: mockUpdate });

      const res = await acceptCoachClubInvitation("mem-pending-1");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Row level security denied update");
    });
  });

  describe("Entrega C - Control de Clases, Sesiones e Idempotencia", () => {
    it("assignCoachClasses calls assign_coach_classes RPC with idempotency key and returns snapshot", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: { ok: true, new_balance: 10, assigned_classes: 10 },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const snap = await assignCoachClasses("org-padelito", "rel-123", 10, "Paquete 10");
      expect(supabase.rpc).toHaveBeenCalledWith("assign_coach_classes", {
        p_relationship_id: "rel-123",
        p_class_count: 10,
        p_notas: "Paquete 10",
        p_idempotency_key: expect.stringMatching(/^assign-/),
      });
      expect(snap.source).toBe("live");
    });

    it("recordCoachClassSession calls record_coach_class_session RPC and returns session and balance", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          ok: true,
          session_id: "sess-abc-123",
          remaining_balance: 9,
          total_classes_given: 1,
        },
        error: null,
      });

      const res = await recordCoachClassSession("rel-123", "Clase técnica", "sess-custom");
      expect(supabase.rpc).toHaveBeenCalledWith("record_coach_class_session", {
        p_relationship_id: "rel-123",
        p_notas: "Clase técnica",
        p_idempotency_key: expect.stringMatching(/^session-/),
        p_session_id: "sess-custom",
      });
      expect(res.remainingBalance).toBe(9);
      expect(res.totalClassesGiven).toBe(1);
      expect(res.sessionId).toBe("sess-abc-123");
    });

    it("recordCoachClassSession fails controlled when RPC returns error", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: { ok: false, error: "El alumno no tiene clases disponibles" },
        error: null,
      });

      await expect(recordCoachClassSession("rel-123")).rejects.toThrow(
        "El alumno no tiene clases disponibles"
      );
    });
  });
});
