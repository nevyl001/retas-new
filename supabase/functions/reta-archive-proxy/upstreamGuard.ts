/**
 * Validación de host/protocolo de RIVIERAOPEN_API_BASE (Fase B, defensa en
 * profundidad contra SSRF). Extraído a su propio módulo para poder probarlo
 * de forma aislada sin arrancar el servidor de la función completa.
 */

/** Único host permitido para RIVIERAOPEN_API_BASE. */
export const ALLOWED_UPSTREAM_HOST_SUFFIX = "rivieraopen.com";

export function assertSafeUpstreamBase(base: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(`RIVIERAOPEN_API_BASE no es una URL válida: ${base}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error("RIVIERAOPEN_API_BASE debe usar https:");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host !== ALLOWED_UPSTREAM_HOST_SUFFIX &&
    !host.endsWith(`.${ALLOWED_UPSTREAM_HOST_SUFFIX}`)
  ) {
    throw new Error(
      `RIVIERAOPEN_API_BASE debe apuntar a ${ALLOWED_UPSTREAM_HOST_SUFFIX} o un subdominio suyo, no a ${host}`
    );
  }
  return parsed;
}
