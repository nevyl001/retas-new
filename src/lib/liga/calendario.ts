import { occupantForUnplayedJornada, type SustitucionPlaza } from "./historicalIdentity";
import { isEquiposModalidad } from "./ligaModalidad";
import type { LigaDetalle } from "./types";
import {
  PLAYOFFS_MIN_TEAMS,
  PLAYOFFS_MIN_TEAMS_MSG,
} from "./parejasFijasPlayoffsFixture";

/** Sustitución oficial usada solo para leer si el calendario sigue cuadrando. */
export type SustitucionCalendario = SustitucionPlaza & {
  plazaInscripcionId?: string | null;
};

export function validateInscripcionesParaCalendario(count: number): void {
  if (count < 4) {
    throw new Error(
      "Se necesitan al menos 4 jugadores inscritos (cantidad par)."
    );
  }
  if (count % 2 !== 0) {
    throw new Error(
      `La cantidad de inscritos debe ser par (actualmente hay ${count}).`
    );
  }
}

export function validateEquiposParaCalendario(count: number): void {
  if (count < 3) {
    throw new Error("Se necesitan al menos 3 parejas inscritas.");
  }
}

export function validateEquiposParaPlayoffsCalendario(count: number): void {
  if (count < PLAYOFFS_MIN_TEAMS) {
    throw new Error(PLAYOFFS_MIN_TEAMS_MSG);
  }
}

/** Equipos del calendario ≠ equipos inscritos actuales. */
export function calendarioEquiposDesactualizado(detalle: LigaDetalle): boolean {
  if (!isEquiposModalidad(detalle.modalidad)) return false;
  if (detalle.estado === "upcoming" || detalle.jornadas.length === 0) {
    return false;
  }
  const inscritos = new Set(detalle.equipos.map((e) => e.id));
  const enCalendario = new Set<string>();
  for (const j of detalle.jornadas) {
    for (const p of j.parejas ?? []) {
      if (p.equipo_id) enCalendario.add(p.equipo_id);
    }
  }
  if (inscritos.size !== enCalendario.size) return true;
  for (const id of Array.from(inscritos)) {
    if (!enCalendario.has(id)) return true;
  }
  return false;
}

function chainForPlaza(
  inscripcionId: string,
  currentJugadorId: string,
  sustituciones: readonly SustitucionCalendario[]
): SustitucionPlaza[] {
  const explicit = sustituciones.filter(
    (s) => s.plazaInscripcionId === inscripcionId
  );
  const source =
    explicit.length > 0
      ? explicit
      : walkUnlabeledChain(
          currentJugadorId,
          sustituciones.filter((s) => !s.plazaInscripcionId)
        );
  return source
    .slice()
    .sort((a, b) => a.ingresoJornadaNumero - b.ingresoJornadaNumero)
    .map((s) => ({
      fromJugadorId: s.fromJugadorId,
      toJugadorId: s.toJugadorId,
      ingresoJornadaNumero: s.ingresoJornadaNumero,
    }));
}

function walkUnlabeledChain(
  currentJugadorId: string,
  sustituciones: readonly SustitucionCalendario[]
): SustitucionCalendario[] {
  const chain: SustitucionCalendario[] = [];
  const used = new Set<SustitucionCalendario>();
  let cursor = currentJugadorId;
  while (true) {
    let step: SustitucionCalendario | undefined;
    for (const candidate of sustituciones) {
      if (candidate.toJugadorId !== cursor || used.has(candidate)) continue;
      if (
        !step ||
        candidate.ingresoJornadaNumero > step.ingresoJornadaNumero
      ) {
        step = candidate;
      }
    }
    if (!step) break;
    used.add(step);
    chain.push(step);
    cursor = step.fromJugadorId;
  }
  return chain.reverse();
}

function occupantAtJornada(
  currentJugadorId: string,
  chain: readonly SustitucionPlaza[],
  jornadaNumero: number
): string {
  if (chain.length === 0) return currentJugadorId;
  return occupantForUnplayedJornada(
    chain[0]!.fromJugadorId,
    jornadaNumero,
    chain
  );
}

/**
 * Cada jornada debe traer al ocupante de la plaza en esa fecha.
 * Una sustitución oficial cambia al ocupante desde su jornada de ingreso;
 * no vuelve inconsistente el calendario ni exige regenerarlo.
 * Una jornada futura con otro jugador, o un reemplazo sin sustitución, sí.
 */
export function calendarioDesactualizado(
  detalle: LigaDetalle,
  sustituciones: readonly SustitucionCalendario[] = []
): boolean {
  if (isEquiposModalidad(detalle.modalidad)) {
    return calendarioEquiposDesactualizado(detalle);
  }
  if (detalle.estado === "upcoming" || detalle.jornadas.length === 0) {
    return false;
  }

  const plazas = detalle.inscripciones.map((inscripcion) => ({
    currentJugadorId: inscripcion.jugador_id,
    chain: chainForPlaza(inscripcion.id, inscripcion.jugador_id, sustituciones),
  }));

  for (const jornada of detalle.jornadas) {
    const actual = new Set<string>();
    for (const pareja of jornada.parejas ?? []) {
      if (pareja.jugador1_id) actual.add(pareja.jugador1_id);
      if (pareja.jugador2_id) actual.add(pareja.jugador2_id);
    }
    const expected = new Set(
      plazas.map((plaza) =>
        occupantAtJornada(plaza.currentJugadorId, plaza.chain, jornada.numero)
      )
    );
    if (actual.size !== expected.size) return true;
    for (const id of Array.from(expected)) {
      if (!actual.has(id)) return true;
    }
  }
  return false;
}

export function tieneJornadasEnCurso(detalle: LigaDetalle): boolean {
  return detalle.jornadas.some(
    (j) => j.estado === "in_progress" || j.estado === "completed"
  );
}
