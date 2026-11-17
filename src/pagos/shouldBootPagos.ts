import { shouldBootPagosSurface, type PagosBootEnv, type PagosLocation } from "./utils/routes";

/**
 * Mismo proyecto Vercel (riviera-padel). El host pagos.rivieraopen.com
 * muestra esta landing. appriviera.rivieraopen.com sigue montando App.
 */
export function shouldBootPagos(loc: PagosLocation, env?: Partial<PagosBootEnv>): boolean {
  const resolved: PagosBootEnv = {
    nodeEnv: env && env.nodeEnv ? env.nodeEnv : process.env.NODE_ENV || "production",
  };
  return shouldBootPagosSurface(loc, resolved);
}
