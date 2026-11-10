/**
 * Única lectura de fecha y horario de una jornada para correos.
 * La fecha vive en liga_jornadas.fecha. La hora vive en liga_partidos.hora_inicio
 * de la ronda 1. Las ligas no tienen columna de zona horaria: el calendario
 * de liga se interpreta en America/Mexico_City.
 */

import { jornadaEnCursoParaCorreo, rutaPublicaJornada } from "./comunicacionTemplates";
import { programarRecordatorio } from "./automatizacion";
import { dateInputValue, timeInputValue } from "../programacion";
import { resolveLigaProgramadoStartMs } from "../jornadaTemporal";

export const ZONA_HORARIA_LIGA = "America/Mexico_City";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export interface PartidoFuenteJornada {
  ronda?: number | null;
  hora_inicio?: string | null;
  estado?: string | null;
}

export interface JornadaFuente {
  id?: string | null;
  numero: number;
  estado: string;
  fecha?: string | null;
  partidos?: ReadonlyArray<PartidoFuenteJornada> | null;
}

export interface DatosOficialesJornada {
  jornadaId: string | null;
  numero: number;
  estado: string;
  fechaIso: string | null;
  fechaLegible: string | null;
  horaInicio: string | null;
  horarioLegible: string | null;
  horasDistintasRondaUno: string[];
  zonaHoraria: typeof ZONA_HORARIA_LIGA;
  sede: string;
  urlPublica: string | null;
  inicioMs: number | null;
  faltantes: string[];
}

export function fechaLegibleOficial(fecha: string | null | undefined): string | null {
  const iso = dateInputValue(fecha);
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  const instante = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dia = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    timeZone: "UTC",
  }).format(instante);
  const mes = MESES[month - 1];
  if (!mes) return null;
  return `${dia} ${day} de ${mes} de ${year}`;
}

export function presentarInstanteLiga(
  iso: string | null | undefined,
  zona: string = ZONA_HORARIA_LIGA
): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(new Date(ms));
}

export function horasRondaUno(
  partidos: ReadonlyArray<PartidoFuenteJornada> | null | undefined
): string[] {
  const vistas = new Set<string>();
  for (const partido of partidos ?? []) {
    if ((partido.ronda ?? 1) !== 1) continue;
    const hora = timeInputValue(partido.hora_inicio);
    if (hora) vistas.add(hora);
  }
  return Array.from(vistas).sort();
}

export function datosOficialesJornada(input: {
  ligaId: string;
  clubNombre: string;
  jornada: JornadaFuente;
}): DatosOficialesJornada {
  const fechaIso = dateInputValue(input.jornada.fecha) || null;
  const horas = horasRondaUno(input.jornada.partidos);
  const horaUnica = horas.length === 1 ? horas[0] : null;
  const faltantes: string[] = [];
  if (!fechaIso) faltantes.push("La jornada no tiene fecha oficial.");
  if (horas.length === 0) {
    faltantes.push("La ronda 1 no tiene hora de inicio.");
  } else if (horas.length > 1) {
    faltantes.push("La ronda 1 tiene horarios distintos. No se elige uno.");
  }
  const inicioMs =
    fechaIso && horaUnica
      ? resolveLigaProgramadoStartMs(fechaIso, horaUnica, ZONA_HORARIA_LIGA)
      : null;
  return {
    jornadaId: input.jornada.id ?? null,
    numero: input.jornada.numero,
    estado: input.jornada.estado,
    fechaIso,
    fechaLegible: fechaLegibleOficial(fechaIso),
    horaInicio: horaUnica,
    horarioLegible: horaUnica ? `${horaUnica} hrs` : null,
    horasDistintasRondaUno: horas,
    zonaHoraria: ZONA_HORARIA_LIGA,
    sede: input.clubNombre.trim() || "el club",
    urlPublica: rutaPublicaJornada(input.ligaId, input.jornada.numero),
    inicioMs,
    faltantes,
  };
}

export function jornadaParaAviso(
  jornadas: ReadonlyArray<JornadaFuente>
): JornadaFuente | null {
  const elegida = jornadaEnCursoParaCorreo(jornadas);
  if (!elegida) return null;
  return jornadas.find((jornada) => jornada.numero === elegida.numero) ?? null;
}

export function jornadaParaResultados(
  jornadas: ReadonlyArray<JornadaFuente>
): JornadaFuente | null {
  return jornadas
    .filter(
      (jornada) =>
        jornada.estado === "completed" &&
        Number.isInteger(jornada.numero) &&
        jornada.numero >= 1
    )
    .sort((a, b) => b.numero - a.numero)[0] ?? null;
}

export function etiquetaJornada(datos: DatosOficialesJornada): string {
  const fecha = datos.fechaLegible ?? "sin fecha";
  return `Jornada ${datos.numero} — ${fecha}`;
}

export function recordatorioOficial(input: {
  datos: DatosOficialesJornada;
  horas: unknown;
  ahora: Date;
  activa: boolean;
}): { ok: true; cuandoIso: string; cuandoLegible: string } | { ok: false; motivo: string } {
  if (input.datos.horasDistintasRondaUno.length > 1) {
    return { ok: false, motivo: "horarios_distintos" };
  }
  if (!input.datos.fechaIso || !input.datos.horaInicio) {
    return { ok: false, motivo: "jornada_sin_horario" };
  }
  const calculo = programarRecordatorio({
    horario: {
      fecha: input.datos.fechaIso,
      horaInicio: input.datos.horaInicio,
      estado: input.datos.estado,
    },
    horas: input.horas,
    ahora: input.ahora,
    automatizacionActiva: input.activa,
  });
  if (!calculo.ok) return calculo;
  return {
    ok: true,
    cuandoIso: calculo.cuando.toISOString(),
    cuandoLegible: presentarInstanteLiga(calculo.cuando.toISOString()) ?? "",
  };
}
