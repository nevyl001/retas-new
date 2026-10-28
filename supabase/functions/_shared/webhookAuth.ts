/** Comparación en tiempo constante. Un secreto vacío nunca autoriza. */
export function secretsEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function webhookAuthorized(provided: string | null, expected: string): boolean {
  return secretsEqual((provided ?? "").trim(), expected);
}
