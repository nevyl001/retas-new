import React from "react";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import { parseRivieraGeneroFromPath } from "../../lib/rivieraJugadores/genero";
import { JugadorFicha } from "./JugadorFicha";
import { JugadorPublicFicha } from "./JugadorPublicFicha";
import { JugadoresLista } from "./JugadoresLista";
import { JugadoresPublicRanking } from "./JugadoresPublicRanking";
import { RankingOfficialOutbound } from "./RankingOfficialOutbound";
import { RankingComoFuncionaPage } from "./RankingComoFuncionaPage";
import { parseJugadoresListaGenero } from "./jugadoresGeneroNav";
import { parsePublicRankingGenero } from "./jugadoresPublicNav";

const RESERVED_JUGADOR_SLUGS = new Set([
  "varonil",
  "femenil",
  "m",
  "f",
]);

export type JugadoresRoute =
  | { kind: "lista"; genero: RivieraJugadorGenero }
  | { kind: "ficha"; slug: string }
  | { kind: "publicRanking"; organizadorId?: string; genero: RivieraJugadorGenero }
  | { kind: "publicFicha"; slug?: string; playerId?: string; internalClub?: boolean }
  | { kind: "officialPlayer"; playerId: string }
  | { kind: "rankingComoFunciona" }
  | { kind: "unknown" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseRankingRoute(path: string): JugadoresRoute | null {
  const rankingOrgGenero = path.match(
    /^\/ranking\/o\/([^/]+)\/(varonil|femenil|m|f)$/i
  );
  if (rankingOrgGenero) {
    try {
      return {
        kind: "publicRanking",
        organizadorId: decodeURIComponent(rankingOrgGenero[1]),
        genero: parseRivieraGeneroFromPath(rankingOrgGenero[2]) ?? "M",
      };
    } catch {
      return {
        kind: "publicRanking",
        organizadorId: rankingOrgGenero[1],
        genero: parseRivieraGeneroFromPath(rankingOrgGenero[2]) ?? "M",
      };
    }
  }

  const rankingOrg = path.match(/^\/ranking\/o\/([^/]+)$/i);
  if (rankingOrg) {
    try {
      return {
        kind: "publicRanking",
        organizadorId: decodeURIComponent(rankingOrg[1]),
        genero: "M",
      };
    } catch {
      return {
        kind: "publicRanking",
        organizadorId: rankingOrg[1],
        genero: "M",
      };
    }
  }

  if (path === "/ranking/femenil") {
    return { kind: "publicRanking", genero: "F" };
  }
  if (path === "/ranking" || path === "/ranking/") {
    return { kind: "publicRanking", genero: "M" };
  }

  return null;
}

export function parseJugadoresPath(pathname: string): JugadoresRoute {
  const path = pathname.replace(/\/+$/, "") || "/";

  const rankingRoute = parseRankingRoute(path);
  if (rankingRoute) return rankingRoute;

  const playerById = path.match(/^\/players\/([^/]+)$/i);
  if (playerById) {
    const raw = playerById[1];
    let id = raw;
    try {
      id = decodeURIComponent(raw);
    } catch {
      id = raw;
    }
    if (UUID_RE.test(id)) {
      return { kind: "officialPlayer", playerId: id };
    }
  }

  if (path === "/ranking/como-funciona") return { kind: "rankingComoFunciona" };
  if (path === "/public/ranking-puntos") return { kind: "rankingComoFunciona" };
  if (path === "/public/jugadores") {
    return { kind: "publicRanking", genero: "M" };
  }

  const pub = path.match(/^\/public\/jugadores\/([^/]+)$/i);
  if (pub) {
    let segment = pub[1];
    try {
      segment = decodeURIComponent(segment);
    } catch {
      segment = pub[1];
    }
    if (UUID_RE.test(segment)) {
      return { kind: "publicFicha", playerId: segment, internalClub: true };
    }
    return { kind: "publicFicha", slug: segment };
  }

  const listaGenero = parseJugadoresListaGenero(path);
  if (listaGenero) {
    return { kind: "lista", genero: listaGenero };
  }

  const m = path.match(/^\/jugadores\/([^/]+)$/i);
  if (m) {
    const slugRaw = m[1];
    let slug = slugRaw;
    try {
      slug = decodeURIComponent(slugRaw);
    } catch {
      slug = slugRaw;
    }
    if (!RESERVED_JUGADOR_SLUGS.has(slug.toLowerCase())) {
      return { kind: "ficha", slug };
    }
  }

  return { kind: "unknown" };
}

export function isJugadoresPublicPath(pathname: string): boolean {
  const kind = parseJugadoresPath(pathname).kind;
  return (
    kind === "publicRanking" ||
    kind === "publicFicha" ||
    kind === "officialPlayer" ||
    kind === "rankingComoFunciona"
  );
}

export const JugadoresRouter: React.FC<{ pathname: string }> = ({ pathname }) => {
  const route = parseJugadoresPath(pathname);

  switch (route.kind) {
    case "rankingComoFunciona":
      return <RankingComoFuncionaPage />;
    case "publicRanking":
      if (route.organizadorId) {
        return (
          <JugadoresPublicRanking
            organizadorId={route.organizadorId}
            genero={route.genero ?? parsePublicRankingGenero(pathname)}
          />
        );
      }
      return (
        <RankingOfficialOutbound
          genero={route.genero ?? parsePublicRankingGenero(pathname)}
        />
      );
    case "publicFicha":
      return (
        <JugadorPublicFicha
          slug={route.slug}
          playerId={route.playerId}
          internalClub={route.internalClub}
        />
      );
    case "officialPlayer":
      return <JugadorPublicFicha playerId={route.playerId} />;
    case "lista":
      return <JugadoresLista genero={route.genero} />;
    case "ficha":
      return <JugadorFicha slug={route.slug} />;
    default:
      return (
        <div className="rj-page">
          <div className="rj-page__inner">
            <p className="rj-empty">Ruta no válida.</p>
          </div>
        </div>
      );
  }
};
