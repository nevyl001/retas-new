import React from "react";
import { LigaDetallePublica } from "./LigaDetallePublica";
import { LigaJornadaPublica } from "./LigaJornadaPublica";
import { LigaGestionar } from "./LigaGestionar";
import { LigaHome } from "./LigaHome";
import { LigaJornadaView } from "./LigaJornada";
import { LigaNueva } from "./LigaNueva";

export type LigaRoute =
  | { kind: "home" }
  | { kind: "nueva" }
  | { kind: "gestionar"; ligaId: string }
  | { kind: "jornada"; ligaId: string; numero: number }
  | { kind: "publica"; ligaId: string }
  | { kind: "publicaJornada"; ligaId: string; numero: number }
  | { kind: "unknown" };

export function parseLigaPath(pathname: string): LigaRoute {
  const path = pathname.replace(/\/+$/, "") || "/";

  const publicaJornada = path.match(
    /^\/public\/liga\/([^/]+)\/jornada\/(\d+)$/i
  );
  if (publicaJornada) {
    return {
      kind: "publicaJornada",
      ligaId: publicaJornada[1],
      numero: Number(publicaJornada[2]),
    };
  }

  const publica = path.match(/^\/public\/liga\/([^/]+)$/i);
  if (publica) return { kind: "publica", ligaId: publica[1] };

  if (path === "/liga") return { kind: "home" };
  if (path === "/liga/nueva") return { kind: "nueva" };

  const gestionar = path.match(/^\/liga\/([^/]+)\/gestionar$/i);
  if (gestionar) return { kind: "gestionar", ligaId: gestionar[1] };

  const jornada = path.match(/^\/liga\/([^/]+)\/jornada\/(\d+)$/i);
  if (jornada) {
    return {
      kind: "jornada",
      ligaId: jornada[1],
      numero: Number(jornada[2]),
    };
  }

  return { kind: "unknown" };
}

export function isLigaPublicPath(pathname: string): boolean {
  const kind = parseLigaPath(pathname).kind;
  return kind === "publica" || kind === "publicaJornada";
}

export const LigaRouter: React.FC<{ pathname: string }> = ({ pathname }) => {
  const route = parseLigaPath(pathname);

  switch (route.kind) {
    case "home":
      return <LigaHome />;
    case "nueva":
      return <LigaNueva />;
    case "gestionar":
      return <LigaGestionar ligaId={route.ligaId} />;
    case "jornada":
      return <LigaJornadaView ligaId={route.ligaId} numero={route.numero} />;
    case "publica":
      return <LigaDetallePublica ligaId={route.ligaId} />;
    case "publicaJornada":
      return (
        <LigaJornadaPublica ligaId={route.ligaId} numero={route.numero} />
      );
    default:
      return (
        <div className="liga-page">
          <p className="liga-error">Ruta de liga no válida.</p>
        </div>
      );
  }
};
