import {
  isJugadorPublicadoSitioOficial,
  rankingLabelForPublicFicha,
  resolvePublicFichaRankingTarget,
  shouldUseClubLocalPuntosOnPublicFicha,
} from "./publicFichaRanking";
import {
  rankingPosicionEnListaByIds,
  sortJugadoresForOfficialSiteRanking,
} from "./rankingPosition";
import type { RivieraJugadorWithStats } from "./types";

function j(
  puntos: number,
  id: string,
  opts?: Partial<RivieraJugadorWithStats>
): RivieraJugadorWithStats {
  return {
    id,
    nombre: id,
    slug: id,
    foto_url: null,
    email: null,
    telefono: null,
    whatsapp: null,
    nivel: "intermedio",
    categoria: "6ta_fuerza",
    edad: null,
    mano_dominante: null,
    en_cancha: null,
    pais_codigo: null,
    instagram_url: null,
    facebook_url: null,
    tiktok_url: null,
    visible_publico: true,
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
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0.2,
    stats: {
      jugador_id: id,
      total_partidos: 1,
      victorias: 0,
      derrotas: 0,
      empates: 0,
      participaciones_solo: 0,
      pct_victorias: 0,
      total_retas: 0,
      total_torneos_express: 0,
      total_ligas: 0,
      total_americanos: 0,
      sets_favor_total: 0,
      sets_contra_total: 0,
      racha_actual: "",
      ultima_actividad: null,
      puntos_totales: puntos,
      updated_at: "",
    },
    officialPuntosGlobal: puntos,
    ...opts,
  };
}

describe("publicFichaRanking", () => {
  it("ficha con org en URL usa ranking del club", () => {
    const aime = j(25, "aime", { visible_publico: true });
    expect(
      resolvePublicFichaRankingTarget(aime, {
        orgId: "hack",
        preferClubRanking: true,
      })
    ).toBe("club");
    expect(rankingLabelForPublicFicha(aime, true)).toBe("Ranking");
    expect(shouldUseClubLocalPuntosOnPublicFicha(aime, true)).toBe(true);
  });

  it("ficha oficial sin org usa ranking global", () => {
    const aime = j(25, "aime", { visible_publico: true });
    expect(resolvePublicFichaRankingTarget(aime, { orgId: null })).toBe(
      "global"
    );
    expect(rankingLabelForPublicFicha(aime)).toBe("Ranking Riviera Open");
    expect(shouldUseClubLocalPuntosOnPublicFicha(aime, false)).toBe(false);
  });

  it("jugador publicado con org pero sin preferClub usa ranking global", () => {
    const aime = j(25, "aime", { visible_publico: true });
    expect(resolvePublicFichaRankingTarget(aime, { orgId: "hack" })).toBe(
      "global"
    );
  });

  it("jugador solo interno del club usa ranking del club", () => {
    const local = j(100, "local", { visible_publico: false });
    expect(
      resolvePublicFichaRankingTarget(local, {
        orgId: "hack",
        preferClubRanking: true,
      })
    ).toBe("club");
    expect(shouldUseClubLocalPuntosOnPublicFicha(local, true)).toBe(true);
  });

  it("archivado o sin suma_ranking no cuenta como sitio oficial", () => {
    expect(
      isJugadorPublicadoSitioOficial(
        j(25, "x", { visible_publico: true, estado: "archivado" })
      )
    ).toBe(false);
    expect(
      isJugadorPublicadoSitioOficial(
        j(25, "x", { visible_publico: true, suma_ranking: false })
      )
    ).toBe(false);
  });
});

describe("ranking global 6ta fuerza (caso Aime)", () => {
  it("Aime #11 entre 11 jugadores publicados, no #1 del subconjunto Hack", () => {
    const global = sortJugadoresForOfficialSiteRanking([
      j(200, "santiago"),
      j(70, "diego"),
      j(50, "gabriel"),
      j(50, "roberto"),
      j(50, "juan"),
      j(50, "sergio"),
      j(50, "oswaldo"),
      j(50, "yusuke"),
      j(50, "jaime"),
      j(50, "rodrigo"),
      j(25, "aime"),
    ]);

    expect(rankingPosicionEnListaByIds(global, ["aime"])).toBe(11);
    expect(rankingPosicionEnListaByIds(global, ["santiago"])).toBe(1);

    const soloHackPublicados = sortJugadoresForOfficialSiteRanking([j(25, "aime")]);
    expect(rankingPosicionEnListaByIds(soloHackPublicados, ["aime"])).toBe(1);
  });
});
