import React from "react";
import { GestionGrupos } from "./GestionGrupos";
import { TorneoExpressInicio } from "./TorneoExpressInicio";
import { CrearTorneoExpressPage } from "./CrearTorneoExpressPage";
import { EventosLista } from "./EventosLista";
import { EventoDetalle } from "./EventoDetalle";
import { EventoNuevaCategoria } from "./EventoNuevaCategoria";
import { TorneosExpressLista } from "./TorneosExpressLista";
import { VistaPublicaEvento } from "./public/VistaPublicaEvento";
import { TePageShell } from "./TePageShell";
import { VistaPublicaEliminatoria } from "./VistaPublicaEliminatoria";
import { VistaPublicaGeneral } from "./VistaPublicaGeneral";
import { VistaPublicaGrupo } from "./VistaPublicaGrupo";
import { VistaPublicaGrupos } from "./VistaPublicaGrupos";

export type TorneoExpressRoute =
  | { kind: "home" }
  | { kind: "nuevo" }
  | { kind: "eventos" }
  | { kind: "lista-express" }
  | { kind: "evento"; eventoId: string }
  | { kind: "evento-nueva-categoria"; eventoId: string }
  | { kind: "evento-publico"; slug: string }
  | { kind: "gestionar"; torneoId: string }
  | { kind: "grupo"; torneoId: string; grupoId: string }
  | { kind: "general"; torneoId: string }
  | { kind: "grupos"; torneoId: string }
  | { kind: "eliminatoria"; torneoId: string }
  | { kind: "unknown" };

export function parseTorneoExpressPath(pathname: string): TorneoExpressRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/torneo-express") return { kind: "home" };
  if (path === "/torneo-express/nuevo") return { kind: "nuevo" };
  if (path === "/torneo-express/eventos") return { kind: "eventos" };
  if (path === "/torneo-express/lista") return { kind: "lista-express" };

  // Público: /eventos/{slug} (arquitectura multi-categoría)
  const eventoPublico = path.match(/^\/eventos\/([^/]+)$/);
  if (eventoPublico) {
    return { kind: "evento-publico", slug: decodeURIComponent(eventoPublico[1]) };
  }

  const nuevaCat = path.match(
    /^\/torneo-express\/evento\/([^/]+)\/nueva-categoria$/
  );
  if (nuevaCat) {
    return { kind: "evento-nueva-categoria", eventoId: nuevaCat[1] };
  }
  const evento = path.match(/^\/torneo-express\/evento\/([^/]+)$/);
  if (evento) return { kind: "evento", eventoId: evento[1] };
  const gestionar = path.match(/^\/torneo-express\/([^/]+)\/gestionar$/);
  if (gestionar) return { kind: "gestionar", torneoId: gestionar[1] };
  const grupo = path.match(/^\/torneo-express\/([^/]+)\/grupo\/([^/]+)$/);
  if (grupo) return { kind: "grupo", torneoId: grupo[1], grupoId: grupo[2] };
  const general = path.match(/^\/torneo-express\/([^/]+)\/general$/);
  if (general) return { kind: "general", torneoId: general[1] };
  const grupos = path.match(/^\/torneo-express\/([^/]+)\/grupos$/);
  if (grupos) return { kind: "grupos", torneoId: grupos[1] };
  const eliminatoria = path.match(/^\/torneo-express\/([^/]+)\/eliminatoria$/);
  if (eliminatoria) return { kind: "eliminatoria", torneoId: eliminatoria[1] };
  return { kind: "unknown" };
}

export function isTorneoExpressPublicPath(pathname: string): boolean {
  const route = parseTorneoExpressPath(pathname);
  return (
    route.kind === "evento-publico" ||
    route.kind === "grupo" ||
    route.kind === "general" ||
    route.kind === "grupos" ||
    route.kind === "eliminatoria"
  );
}

export const TorneoExpressRouter: React.FC<{ pathname: string }> = ({
  pathname,
}) => {
  const route = parseTorneoExpressPath(pathname);

  switch (route.kind) {
    case "home":
      return <TorneoExpressInicio />;
    case "nuevo":
      return <CrearTorneoExpressPage />;
    case "eventos":
      return <EventosLista />;
    case "lista-express":
      return <TorneosExpressLista />;
    case "evento":
      return <EventoDetalle eventoId={route.eventoId} />;
    case "evento-nueva-categoria":
      return <EventoNuevaCategoria eventoId={route.eventoId} />;
    case "evento-publico":
      return <VistaPublicaEvento slug={route.slug} />;
    case "gestionar":
      return <GestionGrupos torneoId={route.torneoId} />;
    case "grupo":
      return (
        <VistaPublicaGrupo torneoId={route.torneoId} grupoId={route.grupoId} />
      );
    case "general":
      return <VistaPublicaGeneral torneoId={route.torneoId} />;
    case "grupos":
      return <VistaPublicaGrupos torneoId={route.torneoId} />;
    case "eliminatoria":
      return <VistaPublicaEliminatoria torneoId={route.torneoId} />;
    default:
      return (
        <TePageShell>
          <p className="te-error">Ruta de torneo no válida.</p>
        </TePageShell>
      );
  }
};
