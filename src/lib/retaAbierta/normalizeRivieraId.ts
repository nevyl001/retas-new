/**
 * Normalización laxa para inscripción pública (espacios, minúsculas, RIV sin guión).
 * Distinta de normalizeRivieraIdInput (membresía admin: exacta RIV-########).
 */

const RIVIERA_ID_EXACT = /^RIV-[0-9]{8}$/;

export function normalizeRivieraIdLoose(input: string): string | null {
  let v = (input ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!v) return null;
  if (/^RIV[0-9]{8}$/.test(v)) {
    v = `RIV-${v.slice(3)}`;
  } else if (/^[0-9]{8}$/.test(v)) {
    v = `RIV-${v}`;
  }
  if (!RIVIERA_ID_EXACT.test(v)) return null;
  return v;
}
