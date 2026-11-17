export interface PagosLocation {
  hostname: string;
  pathname: string;
}

export interface PagosBootEnv {
  nodeEnv: string;
}

export function normalizePath(pathname: string): string {
  const raw = String(pathname || "/").split("?")[0].split("#")[0];
  const withSlash = raw.charAt(0) === "/" ? raw : `/${raw}`;
  const trimmed = withSlash.replace(/\/+$/, "");
  return trimmed || "/";
}

export function hostWithoutPort(hostname: string): string {
  return String(hostname || "").split(":")[0].toLowerCase();
}

/**
 * Mismo proyecto de Vercel que AppRiviera. La landing solo arranca cuando
 * el host es pagos.rivieraopen.com. En local, la vista de prueba es /pagos.
 */
export function shouldBootPagosSurface(loc: PagosLocation, env: PagosBootEnv): boolean {
  if (hostWithoutPort(loc.hostname) === "pagos.rivieraopen.com") return true;
  if (env.nodeEnv !== "development") return false;
  const host = hostWithoutPort(loc.hostname);
  if (host !== "localhost" && host !== "127.0.0.1") return false;
  const path = normalizePath(loc.pathname);
  return path === "/pagos" || path.indexOf("/pagos/") === 0;
}

export function pagosHomePath(hostname: string): string {
  return hostWithoutPort(hostname) === "pagos.rivieraopen.com" ? "/" : "/pagos";
}
