import React from "react";
import { JugadorFicha } from "./JugadorFicha";
import { JugadorPublicFicha } from "./JugadorPublicFicha";
import { JugadoresLista } from "./JugadoresLista";
import { JugadoresPublicRanking } from "./JugadoresPublicRanking";

export type JugadoresRoute =
  | { kind: "lista" }
  | { kind: "ficha"; slug: string }
  | { kind: "publicRanking" }
  | { kind: "publicFicha"; slug: string }
  | { kind: "unknown" };

export function parseJugadoresPath(pathname: string): JugadoresRoute {
  const path = pathname.replace(/\/+$/, "") || "/";

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
  return kind === "publicRanking" || kind === "publicFicha";
}

export const JugadoresRouter: React.FC<{ pathname: string }> = ({ pathname }) => {
  const route = parseJugadoresPath(pathname);

  switch (route.kind) {
    case "publicRanking":
      return <JugadoresPublicRanking />;
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
