/**
 * @jest-environment node
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  canRequestRedemption,
  assertClubAdminAccess,
  filterValidLocalCandidates,
  type SecurityActor,
  type PlayerClubContext,
  type LocalCampaignContext,
} from "./security";

const SQL_MIGRATION = readFileSync(
  join(__dirname, "../../../supabase/migrations/0058_riviera_rewards_phase1.sql"),
  "utf8"
);

describe("Riviera Rewards — Auditoría de Seguridad y Multiclub (0058)", () => {
  const CLUB_ORIGEN_ID = "11111111-1111-4111-a111-111111111111"; // Ej: Padelito Warehouse
  const CLUB_RECEPTOR_ID = "22222222-2222-4222-a222-222222222222"; // Ej: Hack Padel
  const CLUB_AJENO_ID = "33333333-3333-4333-a333-333333333333";

  const JUGADOR_NATIVO_ORIGEN = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const JUGADOR_CEDIDO_RECEPTOR = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

  describe("1. Contrato de Base de Datos y Aislamiento RLS en 0058", () => {
    it("REVOKE ALL a PUBLIC y anon en todas las tablas sensibles de Rewards", () => {
      const revokedTables = [
        "public.rewards_campaigns",
        "public.rewards_rewards",
        "public.rewards_participation_reviews",
        "public.rewards_accrual_queue",
        "public.rewards_lots",
        "public.rewards_ledger",
        "public.rewards_redemptions",
        "public.rewards_lot_holds",
        "public.rewards_benefit_uses",
        "public.rewards_obligations",
        "public.rewards_player_links",
      ];
      for (const table of revokedTables) {
        expect(SQL_MIGRATION).toContain(table);
      }
      expect(SQL_MIGRATION).toMatch(/REVOKE ALL ON TABLE[\s\S]*?FROM PUBLIC, anon/);
    });

    it("Todas las políticas SELECT authenticated exigen organizador_id = auth.uid() OR is_master_admin()", () => {
      expect(SQL_MIGRATION).toMatch(
        /CREATE POLICY rewards_campaigns_select[\s\S]*?USING \(organizador_id = auth\.uid\(\) OR public\.is_master_admin\(\)\)/
      );
      expect(SQL_MIGRATION).toMatch(
        /CREATE POLICY rewards_reviews_select[\s\S]*?USING \(organizador_id = auth\.uid\(\) OR public\.is_master_admin\(\)\)/
      );
      expect(SQL_MIGRATION).toMatch(
        /CREATE POLICY rewards_lots_select[\s\S]*?USING \(organizador_id = auth\.uid\(\) OR public\.is_master_admin\(\)\)/
      );
      expect(SQL_MIGRATION).toMatch(
        /CREATE POLICY rewards_ledger_select[\s\S]*?USING \(organizador_id = auth\.uid\(\) OR public\.is_master_admin\(\)\)/
      );
      expect(SQL_MIGRATION).toMatch(
        /CREATE POLICY rewards_redemptions_select[\s\S]*?USING \(organizador_id = auth\.uid\(\) OR public\.is_master_admin\(\)\)/
      );
    });

    it("rewards_assert_club_admin bloquea tajantemente llamadas de clubes no autorizados", () => {
      expect(SQL_MIGRATION).toMatch(
        /IF p_organizador_id IS DISTINCT FROM auth\.uid\(\) THEN[\s\S]*?RAISE EXCEPTION 'Sin permiso sobre este club';/
      );
    });

    it("rewards_request_redemption verifica saldo disponible antes de insertar la solicitud", () => {
      expect(SQL_MIGRATION).toMatch(
        /IF v_available < v_reward\.costo_puntos THEN[\s\S]*?RAISE EXCEPTION 'Saldo insuficiente para solicitar este premio';/
      );
    });

    it("Aislamiento estricto: ninguna función escribe en rating o ranking deportivo", () => {
      expect(SQL_MIGRATION).not.toMatch(/UPDATE public\.jugador_participaciones/);
      expect(SQL_MIGRATION).not.toMatch(/INSERT INTO public\.rating_historial/);
      expect(SQL_MIGRATION).not.toMatch(/UPDATE public\.riviera_jugadores SET rating/);
      expect(SQL_MIGRATION).not.toMatch(/UPDATE public\.riviera_jugadores SET puntos_totales/);
    });
  });

  describe("2. Modelo de Autorización Multiclub y Jugadores Cedidos", () => {
    it("Caso 1: Jugador propio del club con administrador de origen -> Acceso total a sus campañas locales", () => {
      const actor: SecurityActor = { userId: CLUB_ORIGEN_ID, isMasterAdmin: false };
      const playerCtx: PlayerClubContext = {
        jugadorId: JUGADOR_NATIVO_ORIGEN,
        homeOrganizadorId: CLUB_ORIGEN_ID,
        viewingOrganizadorId: CLUB_ORIGEN_ID,
        isConcedido: false,
        hasLocalActivity: true,
      };

      const access = assertClubAdminAccess(actor, playerCtx.viewingOrganizadorId);
      expect(access.allowed).toBe(true);
    });

    it("Caso 2: Jugador cedido SIN participaciones locales en club receptor -> Saldo local en 0 y solo lectura", () => {
      const actor: SecurityActor = { userId: CLUB_RECEPTOR_ID, isMasterAdmin: false };
      const playerCtx: PlayerClubContext = {
        jugadorId: JUGADOR_CEDIDO_RECEPTOR,
        homeOrganizadorId: CLUB_ORIGEN_ID,
        viewingOrganizadorId: CLUB_RECEPTOR_ID,
        isConcedido: true,
        hasLocalActivity: false,
      };

      const access = assertClubAdminAccess(actor, playerCtx.viewingOrganizadorId);
      expect(access.allowed).toBe(true);

      const campaignCtx: LocalCampaignContext = {
        campaignOrganizadorId: CLUB_RECEPTOR_ID,
        puntosDisponibles: 0,
        costoPremio: 100,
        ventanaCanjeAbierta: true,
      };
      const req = canRequestRedemption(actor, playerCtx, campaignCtx);
      expect(req.allowed).toBe(false);
      expect(req.reason).toBe("insufficient_balance");
    });

    it("Caso 3: Jugador cedido CON participaciones válidas en club receptor -> Acumula y puede canjear en club receptor", () => {
      const actor: SecurityActor = { userId: CLUB_RECEPTOR_ID, isMasterAdmin: false };
      const playerCtx: PlayerClubContext = {
        jugadorId: JUGADOR_CEDIDO_RECEPTOR,
        homeOrganizadorId: CLUB_ORIGEN_ID,
        viewingOrganizadorId: CLUB_RECEPTOR_ID,
        isConcedido: true,
        hasLocalActivity: true,
      };

      const campaignCtx: LocalCampaignContext = {
        campaignOrganizadorId: CLUB_RECEPTOR_ID,
        puntosDisponibles: 150,
        costoPremio: 100,
        ventanaCanjeAbierta: true,
      };
      const req = canRequestRedemption(actor, playerCtx, campaignCtx);
      expect(req.allowed).toBe(true);
    });

    it("Caso 4: Administrador del club de origen NO puede gestionar ni canjear los puntos del club receptor", () => {
      const actor: SecurityActor = { userId: CLUB_ORIGEN_ID, isMasterAdmin: false };
      const playerCtx: PlayerClubContext = {
        jugadorId: JUGADOR_CEDIDO_RECEPTOR,
        homeOrganizadorId: CLUB_ORIGEN_ID,
        viewingOrganizadorId: CLUB_RECEPTOR_ID,
        isConcedido: true,
        hasLocalActivity: true,
      };

      const access = assertClubAdminAccess(actor, playerCtx.viewingOrganizadorId);
      expect(access.allowed).toBe(false);
      expect(access.reason).toBe("foreign_club_access_denied");
    });

    it("Caso 5: Administrador del club receptor NO puede gestionar campañas del club de origen", () => {
      const actor: SecurityActor = { userId: CLUB_RECEPTOR_ID, isMasterAdmin: false };
      const access = assertClubAdminAccess(actor, CLUB_ORIGEN_ID);
      expect(access.allowed).toBe(false);
      expect(access.reason).toBe("foreign_club_access_denied");
    });

    it("Caso 6: Administrador Maestro tiene autorización global para auditar cualquier club", () => {
      const masterActor: SecurityActor = { userId: "master-uid", isMasterAdmin: true };
      expect(assertClubAdminAccess(masterActor, CLUB_ORIGEN_ID).allowed).toBe(true);
      expect(assertClubAdminAccess(masterActor, CLUB_RECEPTOR_ID).allowed).toBe(true);
      expect(assertClubAdminAccess(masterActor, CLUB_AJENO_ID).allowed).toBe(true);
    });

    it("Caso 7: Intento de acceso cruzado entre clubes ajenos es rechazado tajantemente", () => {
      const attacker: SecurityActor = { userId: CLUB_AJENO_ID, isMasterAdmin: false };
      expect(assertClubAdminAccess(attacker, CLUB_ORIGEN_ID).allowed).toBe(false);
      expect(assertClubAdminAccess(attacker, CLUB_RECEPTOR_ID).allowed).toBe(false);
    });

    it("Caso 8: Modificación no autorizada de premios o saldo bloqueada si la ventana de canje cerró", () => {
      const actor: SecurityActor = { userId: CLUB_RECEPTOR_ID, isMasterAdmin: false };
      const playerCtx: PlayerClubContext = {
        jugadorId: JUGADOR_CEDIDO_RECEPTOR,
        homeOrganizadorId: CLUB_ORIGEN_ID,
        viewingOrganizadorId: CLUB_RECEPTOR_ID,
        isConcedido: true,
        hasLocalActivity: true,
      };
      const closedCampaignCtx: LocalCampaignContext = {
        campaignOrganizadorId: CLUB_RECEPTOR_ID,
        puntosDisponibles: 500,
        costoPremio: 100,
        ventanaCanjeAbierta: false,
      };
      const req = canRequestRedemption(actor, playerCtx, closedCampaignCtx);
      expect(req.allowed).toBe(false);
      expect(req.reason).toBe("redemption_window_closed");
    });

    it("Caso 9: Protección de operaciones sensibles: filtra únicamente participaciones del organizador activo", () => {
      const candidates = [
        { id: "c1", organizadorId: CLUB_RECEPTOR_ID, jugadorId: JUGADOR_CEDIDO_RECEPTOR },
        { id: "c2", organizadorId: CLUB_ORIGEN_ID, jugadorId: JUGADOR_CEDIDO_RECEPTOR },
        { id: "c3", organizadorId: CLUB_AJENO_ID, jugadorId: JUGADOR_CEDIDO_RECEPTOR },
      ];
      const validForReceptor = filterValidLocalCandidates(candidates, CLUB_RECEPTOR_ID);
      expect(validForReceptor.map((c) => c.id)).toEqual(["c1"]);
    });
  });
});
