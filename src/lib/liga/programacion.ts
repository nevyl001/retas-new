/** Fecha/hora/cancha editables en jornada y partidos. */

export function dateInputValue(fecha: string | null | undefined): string {
  if (!fecha) return "";
  return fecha.slice(0, 10);
}

export function timeInputValue(hora: string | null | undefined): string {
  if (!hora) return "";
  const trimmed = hora.trim();
  if (/^\d{2}:\d{2}/.test(trimmed)) return trimmed.slice(0, 5);
  return trimmed;
}

export function formatPartidoHorarioLabel(
  fechaJornada: string | null | undefined,
  horaInicio: string | null | undefined
): string | null {
  const hora = timeInputValue(horaInicio);
  const fecha = dateInputValue(fechaJornada);
  if (fecha && hora) {
    return `${formatFechaLegible(fecha)} · ${hora}`;
  }
  if (fecha) return formatFechaLegible(fecha);
  if (hora) return hora;
  return null;
}

export function formatFechaLegible(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function normalizeHoraInicio(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    throw new Error("Horario inválido. Usa formato HH:MM (ej. 09:30).");
  }
  const [h, min] = trimmed.split(":").map(Number);
  if (h < 0 || h > 23 || min < 0 || min > 59) {
    throw new Error("Horario inválido.");
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

export function validateCancha(
  cancha: number,
  canchasDisponibles: number
): void {
  if (!Number.isInteger(cancha) || cancha < 1) {
    throw new Error("La cancha debe ser un número entero mayor a 0.");
  }
  if (cancha > canchasDisponibles) {
    throw new Error(
      `Cancha ${cancha} no disponible (máx. ${canchasDisponibles}).`
    );
  }
}

export function formatPartidoCanchaHorarioLabel(
  cancha: number | null | undefined,
  horaInicio: string | null | undefined,
  fechaJornada?: string | null
): string {
  const parts: string[] = [];
  const horario = formatPartidoHorarioLabel(fechaJornada, horaInicio);
  if (cancha != null) parts.push(`Cancha ${cancha}`);
  if (horario) parts.push(horario);
  return parts.join(" · ");
}
