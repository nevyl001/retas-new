/**
 * PASO 4 — clasificación de paths legacy (sin eliminar).
 * A = producción activa | B = fallback | C = tests/scripts | D = dead probable
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "../..");

function filesContaining(needle: string, dir = SRC): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name);
      if (name.isDirectory()) {
        if (name.name === "node_modules" || name.name === "build") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(name.name)) {
        const text = readFileSync(p, "utf8");
        if (text.includes(needle)) out.push(p);
      }
    }
  };
  walk(dir);
  return out;
}

describe("legacy path classification (no deletion)", () => {
  it("listPublicJugadoresRanking: D dead probable (solo definición productiva)", () => {
    const hits = filesContaining("listPublicJugadoresRanking").filter(
      (p) => !p.includes(".test.")
    );
    expect(hits.some((p) => p.endsWith("rivieraJugadoresService.ts"))).toBe(
      true
    );
    expect(hits.length).toBe(1);
  });

  it("riviera_ranking_interno_por_organizador: A producción (seed listInternal)", () => {
    const svc = readFileSync(
      join(__dirname, "rivieraJugadoresService.ts"),
      "utf8"
    );
    expect(svc).toMatch(/riviera_ranking_interno_por_organizador/);
    expect(svc).toMatch(/listInternalClubJugadoresRanking/);
    expect(svc).toMatch(/enrichJugadoresOrganizerScopedStats/);
  });

  it("registrar_participacion_jugador sin ledger: A (adjust / registrarParticipacion)", () => {
    const svc = readFileSync(
      join(__dirname, "rivieraJugadoresService.ts"),
      "utf8"
    );
    expect(svc).toMatch(/rpc\("registrar_participacion_jugador"/);
    expect(svc).toMatch(/export async function registrarParticipacion/);
    expect(svc).toMatch(/ajuste_manual/);
  });

  it("linked-ID engine alterno grantedPlayerUnifiedView: A coexistente", () => {
    const unified = readFileSync(
      join(__dirname, "grantedPlayerUnifiedView.ts"),
      "utf8"
    );
    const identity = readFileSync(
      join(__dirname, "playerIdentityService.ts"),
      "utf8"
    );
    expect(unified).toMatch(/export async function resolveLinkedJugadorIds/);
    expect(identity).toMatch(/resolveLinkedJugadorIdsForIdentity/);
  });
});
