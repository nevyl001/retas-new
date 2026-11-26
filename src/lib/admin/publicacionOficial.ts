export interface PublicacionOficialEstado {
  rivieraId: string | null;
  esCedido: boolean;
  publicadoGlobal: boolean;
  publicacionPropia: boolean;
  origenOrganizadorId: string | null;
  origenNombre: string | null;
  conflicto: boolean;
  puedePublicar: boolean;
  puedeRetirar: boolean;
  motivoBloqueo: string | null;
}

export interface PublicacionOficialResult {
  ok: boolean;
  code:
    | "publicado"
    | "ya_publicado"
    | "retirado"
    | "sin_cambio"
    | "conflicto"
    | "prohibido"
    | "no_autorizado";
  publicado: boolean;
  perfilPublicadoId: string | null;
  origenNombre: string | null;
  organizadorPublicadoId: string | null;
}

export interface PublicacionMasivaResult {
  ok: boolean;
  publicados: number;
  yaPublicados: number;
  retirados: number;
  conflictos: number;
  bloqueados: number;
  noAutorizados: number;
}

export interface ControlPublicacionOficial {
  checked: boolean;
  disabled: boolean;
  title: string;
  nota: string | null;
  notaTono: "muted" | "conflicto";
}

export function publicacionLocalFallback(
  visible: boolean,
  archivado: boolean
): PublicacionOficialEstado {
  return {
    rivieraId: null,
    esCedido: false,
    publicadoGlobal: visible,
    publicacionPropia: visible,
    origenOrganizadorId: null,
    origenNombre: null,
    conflicto: false,
    puedePublicar: !archivado && !visible,
    puedeRetirar: !archivado && visible,
    motivoBloqueo: archivado ? "El jugador está archivado." : null,
  };
}

export function controlPublicacionOficial(
  estado: PublicacionOficialEstado,
  archivado: boolean
): ControlPublicacionOficial {
  const origen = estado.origenNombre ? ` Origen: ${estado.origenNombre}.` : "";

  if (archivado) {
    return {
      checked: estado.publicadoGlobal,
      disabled: true,
      title: "El jugador está archivado.",
      nota: null,
      notaTono: "muted",
    };
  }

  if (estado.conflicto) {
    return {
      checked: estado.publicadoGlobal,
      disabled: true,
      title:
        "Esta identidad tiene más de una publicación o perfiles enlazados a identidades distintas. No se eliminó ni se fusionó ningún jugador.",
      nota: "Conflicto de identidad",
      notaTono: "conflicto",
    };
  }

  if (estado.esCedido && estado.publicadoGlobal) {
    return {
      checked: true,
      disabled: true,
      title: `Ya publicado en sitio oficial. Esta cuenta tiene acceso a la identidad, no una ficha oficial propia.${origen}`,
      nota: estado.origenNombre
        ? `Ya publicado en sitio oficial · ${estado.origenNombre}`
        : "Ya publicado en sitio oficial",
      notaTono: "muted",
    };
  }

  if (estado.esCedido && !estado.puedePublicar) {
    return {
      checked: false,
      disabled: true,
      title: `La cuenta propietaria publica esta identidad.${origen}`,
      nota: "Cedido",
      notaTono: "muted",
    };
  }

  if (estado.esCedido && estado.puedePublicar) {
    return {
      checked: false,
      disabled: false,
      title: `Publica la identidad global existente, en la cuenta de origen.${origen}`,
      nota: "Cedido",
      notaTono: "muted",
    };
  }

  if (estado.publicadoGlobal && estado.puedeRetirar) {
    return {
      checked: true,
      disabled: false,
      title: "Publicado en el sitio oficial. Puedes retirarlo.",
      nota: null,
      notaTono: "muted",
    };
  }

  if (estado.publicadoGlobal) {
    return {
      checked: true,
      disabled: true,
      title: estado.motivoBloqueo ?? "Ya publicado en sitio oficial.",
      nota: "Ya publicado en sitio oficial",
      notaTono: "muted",
    };
  }

  return {
    checked: false,
    disabled: !estado.puedePublicar,
    title: estado.puedePublicar
      ? "Publicar en el sitio oficial."
      : (estado.motivoBloqueo ?? "No se puede publicar esta identidad."),
    nota: null,
    notaTono: "muted",
  };
}

export function mensajePublicacionIndividual(
  nombre: string,
  result: PublicacionOficialResult
): string {
  if (result.code === "publicado") {
    return `«${nombre}» publicado en el sitio oficial.`;
  }
  if (result.code === "ya_publicado") {
    return `«${nombre}» ya está publicado en el sitio oficial.`;
  }
  if (result.code === "retirado") {
    return `«${nombre}» quitado del sitio oficial.`;
  }
  if (result.code === "conflicto") {
    return `«${nombre}» tiene un conflicto de identidad. No se publicó ni se fusionó.`;
  }
  if (result.code === "prohibido") {
    return `«${nombre}» no puede tener una publicación independiente.`;
  }
  if (result.code === "no_autorizado") {
    return "No tienes permiso para cambiar esta publicación.";
  }
  return `«${nombre}» no cambió su publicación.`;
}

export function mensajePublicacionMasiva(
  result: PublicacionMasivaResult,
  publicar: boolean
): string {
  if (!result.ok) {
    return "No tienes permiso para cambiar estas publicaciones.";
  }
  const partes: string[] = [];
  if (result.publicados > 0) {
    partes.push(`${result.publicados} publicados en la identidad global`);
  }
  if (result.retirados > 0) {
    partes.push(`${result.retirados} retirados del sitio oficial`);
  }
  if (result.yaPublicados > 0) {
    partes.push(
      publicar
        ? `${result.yaPublicados} ya estaban publicados y no se duplicaron`
        : `${result.yaPublicados} siguen publicados en su identidad global`
    );
  }
  if (result.bloqueados > 0) {
    partes.push(`${result.bloqueados} se dejaron sin cambio`);
  }
  if (result.conflictos > 0) {
    partes.push(`${result.conflictos} con conflicto de identidad, sin fusionar`);
  }
  if (result.noAutorizados > 0) {
    partes.push(`${result.noAutorizados} sin permiso`);
  }
  if (partes.length === 0) {
    return publicar
      ? "Nadie nuevo pasó al sitio oficial."
      : "No se retiró ninguna publicación.";
  }
  return partes.join(". ") + ".";
}
