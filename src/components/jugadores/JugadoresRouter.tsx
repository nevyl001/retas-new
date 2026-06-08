import React from "react";
import { JugadorFicha } from "./JugadorFicha";
import { JugadorPublicFicha } from "./JugadorPublicFicha";
import { JugadoresLista } from "./JugadoresLista";
import { JugadoresPublicRanking } from "./JugadoresPublicRanking";
import { RankingComoFuncionaPage } from "./RankingComoFuncionaPage";

export type JugadoresRoute =
  | { kind: "lista" }
  | { kind: "ficha"; slug: string }
  | { kind: "publicRanking"; organizadorId?: string }
  | { kind: "publicFicha"; slug: string }
  | { kind: "rankingComoFunciona" }
  | { kind: "unknown" };

export function parseJugadoresPath(pathname: string): JugadoresRoute {
  const path = pathname.replace(/\/+$/, "") || "/";

  const rankingOrg = path.match(/^\/ranking\/o\/([^/]+)$/i);
  if (rankingOrg) {
    try {
      return {
        kind: "publicRanking",
        organizadorId: decodeURIComponent(rankingOrg[1]),
      };
    } catch {
      return { kind: "publicRanking", organizadorId: rankingOrg[1] };
    }
  }
  if (path === "/ranking" || path === "/ranking/") {
    return { kind: "publicRanking" };
  }
  if (path === "/ranking/como-funciona") return { kind: "rankingComoFunciona" };
  if (path === "/public/ranking-puntos") return { kind: "rankingComoFunciona" };
  if (path === "/public/jugadores") return { kind: "publicRanking" };
  const pub = path.match(/^\/public\/jugadores\/([^/]+)$/i);
  if (pub) {
    try {
      return { kind: "publicFicha", slug: decodeURIComponent(pub[1]) };
    } catch {
      return { kind: "publicFicha", slug: pub[1] };
    }
  }

  if (path === "/jugadores") return { kind: "lista" };
  const m = path.match(/^\/jugadores\/([^/]+)$/i);
  if (m) {
    try {
      return { kind: "ficha", slug: decodeURIComponent(m[1]) };
    } catch {
      return { kind: "ficha", slug: m[1] };
    }
  }
  return { kind: "unknown" };
}

export function isJugadoresPublicPath(pathname: string): boolean {
  const kind = parseJugadoresPath(pathname).kind;
  return (
    kind === "publicRanking" ||
    kind === "publicFicha" ||
    kind === "rankingComoFunciona"
  );
}

export const JugadoresRouter: React.FC<{ pathname: string }> = ({ pathname }) => {
  const route = parseJugadoresPath(pathname);

  switch (route.kind) {
    case "rankingComoFunciona":
      return <RankingComoFuncionaPage />;
    case "publicRanking":
      return (
        <JugadoresPublicRanking organizadorId={route.organizadorId} />
      );
    case "publicFicha":
      return <JugadorPublicFicha slug={route.slug} />;
    case "lista":
      return <JugadoresLista />;
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
