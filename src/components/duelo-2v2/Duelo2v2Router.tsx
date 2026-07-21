import React from "react";
import { Duelo2v2Gestionar } from "./Duelo2v2Gestionar";
import { Duelo2v2Home } from "./Duelo2v2Home";
import { Duelo2v2Nuevo } from "./Duelo2v2Nuevo";
import { Duelo2v2Publica } from "./Duelo2v2Publica";

export type Duelo2v2Route =
  | { kind: "home" }
  | { kind: "nuevo" }
  | { kind: "gestionar"; dueloId: string }
  | { kind: "publica"; dueloId: string }
  | { kind: "unknown" };

export function parseDuelo2v2Path(pathname: string): Duelo2v2Route {
  const path = pathname.replace(/\/+$/, "") || "/";

  const publica = path.match(/^\/public\/duelo-2v2\/([^/]+)$/i);
  if (publica) return { kind: "publica", dueloId: publica[1] };

  if (path === "/duelo-2v2") return { kind: "home" };
  if (path === "/duelo-2v2/nuevo") return { kind: "nuevo" };

  const gestionar = path.match(/^\/duelo-2v2\/([^/]+)\/gestionar$/i);
  if (gestionar) return { kind: "gestionar", dueloId: gestionar[1] };

  return { kind: "unknown" };
}

export function isDuelo2v2PublicPath(pathname: string): boolean {
  return parseDuelo2v2Path(pathname).kind === "publica";
}

export const Duelo2v2Router: React.FC<{ pathname: string }> = ({ pathname }) => {
  const route = parseDuelo2v2Path(pathname);

  switch (route.kind) {
    case "home":
      return <Duelo2v2Home />;
    case "nuevo":
      return <Duelo2v2Nuevo />;
    case "gestionar":
      return <Duelo2v2Gestionar dueloId={route.dueloId} />;
    case "publica":
      return <Duelo2v2Publica dueloId={route.dueloId} />;
    default:
      return (
        <div className="duelo2v2-page ro-surface-dark">
          <div className="duelo2v2-page__inner">
            <p className="duelo2v2-error">Ruta de duelo 2 vs 2 no válida.</p>
          </div>
        </div>
      );
  }
};
