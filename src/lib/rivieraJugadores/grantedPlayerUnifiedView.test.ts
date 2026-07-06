jest.mock("./organizerPlayerAccess", () => ({
  listGrantedLocalJugadorIdsForSource: jest.fn().mockResolvedValue([]),
}));

import {
  applyUnifiedRatingFieldsToJugador,
  dedupeParticipacionesById,
  dedupeRatingHistorial,
  loadUnifiedParticipacionesForJugador,
} from "./grantedPlayerUnifiedView";
import type {
  JugadorParticipacion,
  RatingHistorialEntry,
  RivieraJugadorWithStats,
} from "./types";

describe("grantedPlayerUnifiedView", () => {
  it("dedupeParticipacionesById fusiona origen y clon local", () => {
    const origen: JugadorParticipacion = {
      id: "p-origen",
      jugador_id: "src",
      tipo_evento: "reta",
      evento_id: "e1",
      evento_nombre: "Reta Club Test",
      fecha: "2026-06-28",
      puntos_obtenidos: 100,
      resultado: "victoria",
      pareja_con: null,
      sets_favor: 0,
      sets_contra: 0,
      metadata: {},
      created_at: "2026-06-28T10:00:00Z",
    };
    const local: JugadorParticipacion = {
      id: "p-local",
      jugador_id: "clone",
      tipo_evento: "duelo_2v2",
      evento_id: "e2",
      evento_nombre: "Duelo Hack",
      fecha: "2026-06-30",
      puntos_obtenidos: 50,
      resultado: "victoria",
      pareja_con: null,
      sets_favor: 0,
      sets_contra: 0,
      metadata: {},
      created_at: "2026-06-30T10:00:00Z",
    };

    const merged = dedupeParticipacionesById([origen, local]);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe("p-local");
    expect(merged[1].id).toBe("p-origen");
  });

  it("dedupeRatingHistorial ordena por fecha descendente", () => {
    const local: RatingHistorialEntry = {
      id: "r-local",
      fecha: "2026-06-30T12:00:00Z",
      rating_antes: 3,
      rating_despues: 3.07,
      delta: 0.07,
      modo_juego: "duelo_2v2",
      descripcion: "Duelo Hack",
    };
    const origen: RatingHistorialEntry = {
      id: "r-origen",
      fecha: "2026-06-30T10:00:00Z",
      rating_antes: 3.1,
      rating_despues: 3.14,
      delta: 0.04,
      modo_juego: "duelo_2v2",
      descripcion: "Duelo origen",
    };

    const merged = dedupeRatingHistorial([origen, local]);
    expect(merged[0].rating_despues).toBe(3.07);
    expect(merged[1].rating_despues).toBe(3.14);
  });

  it("applyUnifiedRatingFieldsToJugador conserva el rating canónico si el historial está incompleto", () => {
    const local: RatingHistorialEntry = {
      id: "r-local",
      fecha: "2026-06-30T12:00:00Z",
      rating_antes: 3,
      rating_despues: 3.07,
      delta: 0.07,
      modo_juego: "duelo_2v2",
      descripcion: "Duelo Hack",
    };

    const jugador = applyUnifiedRatingFieldsToJugador(
      {
        id: "clone",
        nombre: "Devyl",
        slug: "devyl",
        foto_url: null,
        email: null,
        telefono: null,
        whatsapp: null,
        nivel: "intermedio",
        categoria: "5ta_fuerza",
        edad: 24,
        mano_dominante: "derecha",
        en_cancha: "drive",
        pais_codigo: "MX",
        instagram_url: null,
        facebook_url: null,
        tiktok_url: null,
        visible_publico: false,
        suma_ranking: true,
        genero: "M",
        fecha_nacimiento: null,
        club: null,
        organizador_id: "hack",
        estado: "activo",
        legacy_player_id: null,
        legacy_liga_jugador_id: null,
        created_at: "",
        updated_at: "",
        rating: 3.07,
        rating_partidos: 1,
        rating_fiabilidad: 0.24,
      },
      [local],
      {
        rating: 3.14,
        rating_partidos: 9,
        rating_fiabilidad: 0.56,
      }
    );

    expect(jugador.rating).toBe(3.14);
    expect(jugador.rating_partidos).toBe(9);
    expect(jugador.rating_fiabilidad).toBe(0.56);
  });

  it("applyUnifiedRatingFieldsToJugador usa el perfil canónico aunque el historial local sea más reciente", () => {
    const historial: RatingHistorialEntry[] = [
      {
        id: "r-local",
        fecha: "2026-06-30T12:00:00Z",
        rating_antes: 3,
        rating_despues: 3.07,
        delta: 0.07,
        modo_juego: "duelo_2v2",
        descripcion: "Duelo Hack",
      },
      {
        id: "r-origen",
        fecha: "2026-06-28T10:00:00Z",
        rating_antes: 3.1,
        rating_despues: 3.14,
        delta: 0.04,
        modo_juego: "reta_rr",
        descripcion: "Reta",
      },
    ];

    const jugador = applyUnifiedRatingFieldsToJugador(
      {
        id: "clone",
        nombre: "Devyl",
        slug: "devyl",
        foto_url: null,
        email: null,
        telefono: null,
        whatsapp: null,
        nivel: "intermedio",
        categoria: "5ta_fuerza",
        edad: 24,
        mano_dominante: "derecha",
        en_cancha: "drive",
        pais_codigo: "MX",
        instagram_url: null,
        facebook_url: null,
        tiktok_url: null,
        visible_publico: false,
        suma_ranking: true,
        genero: "M",
        fecha_nacimiento: null,
        club: null,
        organizador_id: "hack",
        estado: "activo",
        legacy_player_id: null,
        legacy_liga_jugador_id: null,
        created_at: "",
        updated_at: "",
        rating: 3.07,
        rating_partidos: 1,
        rating_fiabilidad: 0.24,
      },
      historial,
      {
        rating: 3.14,
        rating_partidos: 9,
        rating_fiabilidad: 0.56,
      }
    );

    expect(jugador.rating).toBe(3.14);
    expect(jugador.rating_partidos).toBe(9);
  });

  it("scopedToOrganizadorHistorial solo carga participaciones del perfil en ese club", async () => {
    const clubTestParticipacion: JugadorParticipacion = {
      id: "p-club-test",
      jugador_id: "ossy-club-test",
      tipo_evento: "torneo_express",
      evento_id: "e1",
      evento_nombre: "Riviera Open Rush Padelito",
      fecha: "2026-06-12",
      puntos_obtenidos: 50,
      resultado: "participación",
      pareja_con: null,
      sets_favor: 0,
      sets_contra: 0,
      metadata: { organizador_id: "club-test" },
      created_at: "2026-06-12T10:00:00Z",
    };

    const listParticipaciones = jest
      .fn()
      .mockResolvedValueOnce([clubTestParticipacion]);

    const view = await loadUnifiedParticipacionesForJugador(
      {
        id: "ossy-club-test",
        nombre: "Ossy",
        slug: "ossy",
        categoria: "quinta_fuerza",
        estado: "activo",
        organizador_id: "club-test",
      } as unknown as RivieraJugadorWithStats,
      {
        limit: 100,
        organizadorId: "club-test",
        scopedToOrganizadorHistorial: true,
        listParticipaciones,
      }
    );

    expect(listParticipaciones).toHaveBeenCalledTimes(1);
    expect(listParticipaciones).toHaveBeenCalledWith(
      "ossy-club-test",
      100,
      "club-test"
    );
    expect(view.historial).toEqual([clubTestParticipacion]);
  });
});
