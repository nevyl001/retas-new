/**
 * Guardrails de arquitectura congelada — carrera global multiclub.
 * Impide regresiones: motor local org-scoped, split admin/público, merge filtrado.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "../../..");

function readSrc(relPath: string): string {
  return readFileSync(resolve(root, relPath), "utf8");
}

function expectIncludes(file: string, token: string, label: string) {
  const src = readSrc(file);
  if (!src.includes(token)) {
    throw new Error(`[arquitectura congelada] ${label}: falta "${token}" en ${file}`);
  }
}

function expectExcludes(file: string, token: string, label: string) {
  const src = readSrc(file);
  if (src.includes(token)) {
    throw new Error(`[arquitectura congelada] ${label}: prohibido "${token}" en ${file}`);
  }
}

describe("arquitectura congelada — carrera global multiclub", () => {
  it("admin y público delegan al mismo motor de identidad", () => {
    const service = readSrc("src/lib/rivieraJugadores/playerIdentityService.ts");
    expect(service).toContain("getAdminPlayerProfileData");
    expect(service).toContain("getPublicPlayerProfileData");
    expect(service).toContain("mergeLocalJugadorWithGlobalCareer");
    expect(service).toMatch(
      /getAdminPlayerProfileData[\s\S]*getPublicPlayerProfileData/
    );
    expect(service).toContain("historialOtrosClubes: []");
  });

  it("JugadorFicha no usa motor org-scoped legacy", () => {
    expectExcludes(
      "src/components/jugadores/JugadorFicha.tsx",
      "loadOrganizerScopedPlayerView",
      "admin ficha"
    );
    expectIncludes(
      "src/components/jugadores/JugadorFicha.tsx",
      "getAdminPlayerProfileData",
      "admin ficha"
    );
  });

  it("JugadorPublicFicha usa motor global", () => {
    expectIncludes(
      "src/components/jugadores/JugadorPublicFicha.tsx",
      "getPublicPlayerProfileData",
      "pública ficha"
    );
  });

  it("merge de carrera nunca filtra por viewingOrganizadorId", () => {
    const mergePath = "src/lib/rivieraJugadores/careerParticipacionesMerge.ts";
    const merge = readSrc(mergePath);
    expectExcludes(mergePath, "listParticipacionesPublic", "merge");
    expectIncludes(mergePath, "listParticipacionesForJugadorIds", "merge");
    expect(merge).not.toMatch(/viewOrg|viewingOrganizadorId.*listParticipaciones/);
  });

  it("identidad siempre augmenta perfiles vinculados", () => {
    expectIncludes(
      "src/lib/rivieraJugadores/playerIdentityService.ts",
      "discoverCareerLinkedProfiles",
      "identity discovery"
    );
    expect(existsSync(resolve(root, "src/lib/rivieraJugadores/careerLinkedProfileDiscovery.ts"))).toBe(
      true
    );
  });

  it("ranking interno enriquece con motor global antes del render", () => {
    expectIncludes(
      "src/lib/rivieraJugadores/organizerScopedStats.ts",
      "resolvePlayerIdentity",
      "ranking enrich identity"
    );
    expectIncludes(
      "src/lib/rivieraJugadores/organizerScopedStats.ts",
      "resolvePlayerCareer",
      "ranking enrich career"
    );
    expectIncludes(
      "src/components/jugadores/RankingPtsDisplay.tsx",
      "isRankingPointsBreakdownPending",
      "ranking pts guard"
    );
  });

  it("artefactos de auditoría y SQL existen", () => {
    const required = [
      "supabase/audit-global-career-architecture.sql",
      "supabase/riviera-career-global-identity-fix.sql",
      "supabase/preview-backfill-profile-link-global-career.sql",
      "scripts/lib/globalCareerAudit.mjs",
      "scripts/audit-global-career-parity.mjs",
    ];
    for (const rel of required) {
      expect(existsSync(resolve(root, rel))).toBe(true);
    }
  });

  it("package.json expone comando de auditoría", () => {
    const pkg = JSON.parse(readSrc("package.json"));
    expect(pkg.scripts["audit:global-career-parity"]).toBeDefined();
  });
});
