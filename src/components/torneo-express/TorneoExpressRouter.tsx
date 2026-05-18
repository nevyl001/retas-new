import React from "react";
import { GestionGrupos } from "./GestionGrupos";
import { TorneoExpressInicio } from "./TorneoExpressInicio";
import { VistaPublicaGeneral } from "./VistaPublicaGeneral";
import { VistaPublicaGrupo } from "./VistaPublicaGrupo";
import "./torneo-express.css";
import "./riviera-torneo-express.css";

export type TorneoExpressRoute =
  | { kind: "home" }
  | { kind: "nuevo" }
  | { kind: "gestionar"; torneoId: string }
  | { kind: "grupo"; torneoId: string; grupoId: string }
  | { kind: "general"; torneoId: string }
  | { kind: "unknown" };

export function parseTorneoExpressPath(pathname: string): TorneoExpressRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/torneo-express") return { kind: "home" };
  if (path === "/torneo-express/nuevo") return { kind: "nuevo" };
  const gestionar = path.match(/^\/torneo-express\/([^/]+)\/gestionar$/);
  if (gestionar) return { kind: "gestionar", torneoId: gestionar[1] };
  const grupo = path.match(/^\/torneo-express\/([^/]+)\/grupo\/([^/]+)$/);
  if (grupo) return { kind: "grupo", torneoId: grupo[1], grupoId: grupo[2] };
  const general = path.match(/^\/torneo-express\/([^/]+)\/general$/);
  if (general) return { kind: "general", torneoId: general[1] };
  return { kind: "unknown" };
}

export function isTorneoExpressPublicPath(pathname: string): boolean {
  const route = parseTorneoExpressPath(pathname);
  return route.kind === "grupo" || route.kind === "general";
}

export const TorneoExpressRouter: React.FC<{ pathname: string }> = ({
  pathname,
}) => {
  const route = parseTorneoExpressPath(pathname);

  switch (route.kind) {
    case "home":
    case "nuevo":
      return <TorneoExpressInicio />;
    case "gestionar":
      return <GestionGrupos torneoId={route.torneoId} />;
    case "grupo":
      return (
        <VistaPublicaGrupo torneoId={route.torneoId} grupoId={route.grupoId} />
      );
    case "general":
      return <VistaPublicaGeneral torneoId={route.torneoId} />;
    default:
      return (
        <div className="torneo-express-page">
          <p className="te-error">Ruta de torneo express no válida.</p>
        </div>
      );
  }
};
