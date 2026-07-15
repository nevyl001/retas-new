import {
  resolveAmericanoNextAction,
  resolveAmericanoStatusLabel,
} from "./americanoNextAction";
import {
  resolveDueloNextAction,
  resolveDueloStatusLabel,
} from "./dueloNextAction";
import {
  resolveRetaNextAction,
  resolveRetaStatusLabel,
} from "./retaNextAction";
import {
  ligaEquipoRankingItemToMobileRow,
  ligaRankingItemToMobileRow,
  simpleRankingToMobileRow,
  teStandingRowToMobileRow,
} from "./standingsRowAdapters";
import { isActiveEventManagementScreen } from "../mobileAppNavigation";

describe("modePresentation", () => {
  describe("resolveRetaNextAction", () => {
    it("sugiere agregar jugadores cuando faltan", () => {
      expect(
        resolveRetaNextAction({
          is_started: false,
          is_finished: false,
          pairsCount: 0,
          playersCount: 1,
        })
      ).toEqual({ label: "Agregar jugadores", tabId: "jugadores" });
    });

    it("sugiere registrar resultados cuando el torneo está en curso", () => {
      expect(
        resolveRetaNextAction({
          is_started: true,
          is_finished: false,
          pairsCount: 4,
          playersCount: 8,
        })
      ).toEqual({ label: "Registrar resultados", tabId: "partidos" });
    });

    it("marca estado finalizado", () => {
      expect(
        resolveRetaStatusLabel({ is_started: true, is_finished: true })
      ).toEqual({ label: "Finalizada", variant: "gold" });
    });
  });

  describe("standingsRowAdapters", () => {
    it("adapta filas de liga sin alterar el orden recibido", () => {
      const rows = [
        {
          jugador_id: "j1",
          posicion: 1,
          nombre: "Ana",
          puntos: 12,
          jornadas_jugadas: 3,
        },
        {
          jugador_id: "j2",
          posicion: 2,
          nombre: "Luis",
          puntos: 9,
          jornadas_jugadas: 3,
        },
      ];

      const mobile = rows.map((row) => ligaRankingItemToMobileRow(row));
      expect(mobile.map((r) => r.position)).toEqual([1, 2]);
      expect(mobile[0].label).toBe("Ana");
      expect(mobile[0].puntosTorneo).toBe(12);
    });

    it("adapta filas simples y de torneo express", () => {
      const simple = simpleRankingToMobileRow({
        key: "e1",
        position: 1,
        label: "Pareja A",
        points: 6,
        pg: 2,
        pp: 1,
        pointsFav: 30,
        pointsCon: 24,
      });
      expect(simple.puntosTorneo).toBe(6);
      expect(simple.pg).toBe(2);

      const te = teStandingRowToMobileRow(
        {
          grupoId: "g1",
          parejaId: "p1",
          parejaLabel: "Pareja B",
          grupoNombre: "Grupo 1",
          grupoOrden: 1,
          pj: 2,
          pg: 2,
          pp: 0,
          ptsFav: 12,
          ptsCon: 4,
          dif: 8,
          puntos: 6,
        },
        0
      );
      expect(te.position).toBe(1);
      expect(te.label).toBe("Pareja B");
    });

    it("adapta filas de ranking por equipo de liga (Fase 2B) sin reordenar", () => {
      const rows = [
        {
          posicion: 1,
          equipo_id: "eq-1",
          nombre: "Líderes A",
          puntos: 12,
          partidos_jugados: 4,
          partidos_ganados: 3,
          partidos_perdidos: 1,
          games_favor: 30,
          games_contra: 20,
          diferencia_games: 10,
        },
        {
          posicion: 2,
          equipo_id: "eq-2",
          nombre: "Segundos B",
          puntos: 9,
          partidos_jugados: 4,
          partidos_ganados: 2,
          partidos_perdidos: 2,
          games_favor: 25,
          games_contra: 22,
          diferencia_games: 3,
        },
      ];

      const mobile = rows.map((row) => ligaEquipoRankingItemToMobileRow(row));
      expect(mobile.map((r) => r.position)).toEqual([1, 2]);
      expect(mobile.map((r) => r.label)).toEqual(["Líderes A", "Segundos B"]);
      expect(mobile[0]).toEqual({
        key: "eq-1",
        position: 1,
        label: "Líderes A",
        matchesPlayed: 4,
        pg: 3,
        pp: 1,
        points: 30,
        pointsReceived: 20,
        puntosTorneo: 12,
      });
    });
  });

  describe("torneo express y duelo", () => {
    it("sugiere finalizar fase cuando todos los grupos están completos", () => {
      const { resolveTeNextAction } = require("./teNextAction");
      expect(
        resolveTeNextAction({
          faseTorneo: "grupos",
          estado: "en_curso",
          puedeFinalizarTorneo: false,
          hasPendingGrupoPartidos: false,
          allGruposCompletos: true,
        })
      ).toEqual({ label: "Finalizar fase", tabId: "configuracion" });
    });

    it("sugiere finalizar duelo cuando hay ganador", () => {
      expect(
        resolveDueloNextAction({ finalizado: false, hasGanador: true })
      ).toEqual({ label: "Finalizar duelo", tabId: "partidos" });
      expect(resolveDueloStatusLabel({ finalizado: true }).label).toBe(
        "Finalizado"
      );
    });
  });

  describe("americano", () => {
    it("sugiere registrar resultados en ronda activa", () => {
      expect(
        resolveAmericanoNextAction({
          phase: "playing",
          playersCount: 8,
          hasCurrentRound: true,
        })
      ).toEqual({ label: "Registrar resultados", tabId: "ronda" });
    });

    it("marca fase de registro", () => {
      expect(resolveAmericanoStatusLabel({ phase: "registration" })).toEqual({
        label: "Registro",
        variant: "pending",
      });
    });
  });

  describe("mobile app navigation en gestión activa", () => {
    it("oculta bottom nav en pantallas de gestión de eventos", () => {
      expect(isActiveEventManagementScreen("/reta/abc-123")).toBe(true);
      expect(isActiveEventManagementScreen("/americano-dinamico")).toBe(true);
      expect(
        isActiveEventManagementScreen("/torneo-express/te-1/gestionar")
      ).toBe(true);
      expect(isActiveEventManagementScreen("/liga/liga-1/jornada/2")).toBe(
        true
      );
      expect(isActiveEventManagementScreen("/duelo-2v2/d1/gestionar")).toBe(
        true
      );
      expect(isActiveEventManagementScreen("/")).toBe(false);
      expect(isActiveEventManagementScreen("/public/reta/abc")).toBe(false);
    });
  });
});
