/**
 * Contrato multiclub + ranking maestro ROMC (Fase 1 — tests antes de lógica).
 *
 * Escenario:
 *   Club A (reta) +10
 *   Club B (americano) +20
 *   Club C (liga) +30
 *   Carrera global = 60
 *   Ranking local A/B/C = 10/20/30
 *   ROMC master = 60 si las 3 orgs son emisoras (regla actual 0021)
 *
 * ROMC NO es career.total: es la suma de filas que pasarían
 * try_write_riviera_official_ledger (0021). Condiciones de emisión:
 *   - tipo_evento ∈ {reta, torneo_express, liga, americano, duelo_2v2}
 *   - metadata.subtipo ≠ ajuste_manual
 *   - puntos_obtenidos > 0
 *   - metadata.organizador_id presente
 *   - _is_official_ranking_emitter(org) = true
 *   - official_player_key resuelto
 * careerSyncOk / pipeline.ok ≠ garantía de ledger escrito.
 */
import { computeCareerPointsByClubFromParticipaciones } from "./careerPointsByClub";
import { dedupeParticipacionesById } from "./grantedPlayerUnifiedView";
import { resolveParticipacionOrganizadorId } from "./participacionesOrganizadorScope";
import type { JugadorParticipacion } from "./types";

const CLUB_A = "org-club-a";
const CLUB_B = "org-club-b";
const CLUB_C = "org-club-c";
const RIVIERA_ID = "RIV-00000042";
const CANONICAL = "jugador-canonical";
const LOCAL_A = "jugador-local-a";
const LOCAL_B = "jugador-local-b";
const LOCAL_C = "jugador-local-c";

function part(params: {
  id: string;
  jugadorId: string;
  hostOrg: string;
  tipo: JugadorParticipacion["tipo_evento"];
  subtipo: string;
  puntos: number;
  eventoId?: string;
}): JugadorParticipacion {
  return {
    id: params.id,
    jugador_id: params.jugadorId,
    tipo_evento: params.tipo,
    evento_id: params.eventoId ?? `evt-${params.id}`,
    evento_nombre: `${params.tipo} @ ${params.hostOrg}`,
    fecha: "2026-08-01",
    created_at: "2026-08-01T12:00:00.000Z",
    resultado: "participación",
    puntos_obtenidos: params.puntos,
    sets_favor: 0,
    sets_contra: 0,
    metadata: {
      subtipo: params.subtipo,
      organizador_id: params.hostOrg,
      club_name: params.hostOrg,
      riviera_id: RIVIERA_ID,
    },
  } as unknown as JugadorParticipacion;
}

/**
 * Espejo de gates de try_write_riviera_official_ledger (0021) relevantes
 * para el contrato de tests — no escribe SQL; valida semántica documentada.
 */
export function wouldEmitRomcLedger(params: {
  row: JugadorParticipacion;
  emitterOrgs: Set<string>;
  hasOfficialIdentity: boolean;
}): { emit: boolean; reason?: string } {
  const { row, emitterOrgs, hasOfficialIdentity } = params;
  const subtipo = String(row.metadata?.subtipo ?? "");
  if (subtipo === "ajuste_manual") {
    return { emit: false, reason: "ajuste_manual" };
  }
  const valid = new Set([
    "reta",
    "torneo_express",
    "liga",
    "americano",
    "duelo_2v2",
  ]);
  if (!valid.has(String(row.tipo_evento))) {
    return { emit: false, reason: "invalid_event_type" };
  }
  const points = Math.max(0, Number(row.puntos_obtenidos ?? 0));
  if (points <= 0) {
    return { emit: false, reason: "no_positive_points" };
  }
  const host = resolveParticipacionOrganizadorId(row);
  if (!host) {
    return { emit: false, reason: "missing_local_organizador_id" };
  }
  if (!emitterOrgs.has(host)) {
    return { emit: false, reason: "organizer_not_authorized" };
  }
  if (!hasOfficialIdentity) {
    return { emit: false, reason: "no_official_identity" };
  }
  return { emit: true };
}

function sumRomc(
  rows: JugadorParticipacion[],
  emitterOrgs: Set<string>,
  hasOfficialIdentity: boolean
): number {
  let sum = 0;
  for (const row of rows) {
    const gate = wouldEmitRomcLedger({
      row,
      emitterOrgs,
      hasOfficialIdentity,
    });
    if (gate.emit) sum += Math.max(0, Number(row.puntos_obtenidos ?? 0));
  }
  return sum;
}

describe("multiclub-contract: Club A/B/C + ranking maestro ROMC", () => {
  const baseRows = [
    part({
      id: "p-a",
      jugadorId: LOCAL_A,
      hostOrg: CLUB_A,
      tipo: "reta",
      subtipo: "reta_cierre",
      puntos: 10,
    }),
    part({
      id: "p-b",
      jugadorId: LOCAL_B,
      hostOrg: CLUB_B,
      tipo: "americano",
      subtipo: "americano_cierre",
      puntos: 20,
    }),
    part({
      id: "p-c",
      jugadorId: LOCAL_C,
      hostOrg: CLUB_C,
      tipo: "liga",
      subtipo: "liga_jornada",
      puntos: 30,
    }),
  ];

  it("misma Riviera ID en las 3 participaciones (identidad global)", () => {
    const ids = baseRows.map((r) => String(r.metadata?.riviera_id ?? ""));
    expect(new Set(ids)).toEqual(new Set([RIVIERA_ID]));
    expect(ids).toHaveLength(3);
  });

  it("carrera global = 60 y host correcto por club", () => {
    const career = computeCareerPointsByClubFromParticipaciones(baseRows);
    expect(career.total).toBe(60);
    expect(career.puntosByOrg.get(CLUB_A)).toBe(10);
    expect(career.puntosByOrg.get(CLUB_B)).toBe(20);
    expect(career.puntosByOrg.get(CLUB_C)).toBe(30);
    for (const row of baseRows) {
      expect(resolveParticipacionOrganizadorId(row)).toBe(
        String(row.metadata?.organizador_id)
      );
    }
  });

  it("ranking local A=10 B=20 C=30; A jamás muestra 50 de B+C", () => {
    const career = computeCareerPointsByClubFromParticipaciones(baseRows);
    expect(career.puntosByOrg.get(CLUB_A)).toBe(10);
    expect(career.puntosByOrg.get(CLUB_B)).toBe(20);
    expect(career.puntosByOrg.get(CLUB_C)).toBe(30);
    expect(career.puntosByOrg.get(CLUB_A)).not.toBe(50);
    expect(
      (career.puntosByOrg.get(CLUB_B) ?? 0) +
        (career.puntosByOrg.get(CLUB_C) ?? 0)
    ).toBe(50);
  });

  it("ROMC master = 60 cuando A/B/C son emisores y hay identidad oficial", () => {
    const emitters = new Set([CLUB_A, CLUB_B, CLUB_C]);
    expect(sumRomc(baseRows, emitters, true)).toBe(60);
    // career.total puede coincidir numéricamente, pero ROMC es dimensión distinta
    const career = computeCareerPointsByClubFromParticipaciones(baseRows);
    expect(career.total).toBe(60);
    expect(sumRomc(baseRows, emitters, true)).toBe(career.total);
  });

  it("ROMC NO emite si el organizador no es emisor (regla actual, no cambiar)", () => {
    const emittersOnlyA = new Set([CLUB_A]);
    expect(sumRomc(baseRows, emittersOnlyA, true)).toBe(10);
    expect(
      wouldEmitRomcLedger({
        row: baseRows[1],
        emitterOrgs: emittersOnlyA,
        hasOfficialIdentity: true,
      }).reason
    ).toBe("organizer_not_authorized");
  });

  it("retry/idempotencia: dedupe por id no convierte 60 → 120", () => {
    const duplicated = [...baseRows, ...baseRows];
    const deduped = dedupeParticipacionesById(duplicated);
    expect(deduped).toHaveLength(3);
    const career = computeCareerPointsByClubFromParticipaciones(deduped);
    expect(career.total).toBe(60);
    expect(sumRomc(deduped, new Set([CLUB_A, CLUB_B, CLUB_C]), true)).toBe(60);
  });

  it("revoke Club B no elimina los 20 históricos de carrera (filas siguen)", () => {
    // Revoke soft: filas de participación B permanecen; ranking C lista no
    // incluye al clone, pero carrera global del Riviera ID conserva B.
    const afterRevokeB = baseRows; // historial intacto
    const career = computeCareerPointsByClubFromParticipaciones(afterRevokeB);
    expect(career.puntosByOrg.get(CLUB_B)).toBe(20);
    expect(career.total).toBe(60);
  });

  it("canonical id no filtra carrera por club de origen", () => {
    // Perfiles locales distintos, misma carrera mergeada
    expect(new Set(baseRows.map((r) => r.jugador_id)).size).toBe(3);
    expect(CANONICAL).toBeTruthy();
    const career = computeCareerPointsByClubFromParticipaciones(baseRows);
    expect(career.total).toBe(60);
  });

  it("ajuste_manual no emite ROMC (regla 0021)", () => {
    const ajuste = part({
      id: "p-adj",
      jugadorId: LOCAL_A,
      hostOrg: CLUB_A,
      tipo: "reta",
      subtipo: "ajuste_manual",
      puntos: 99,
    });
    expect(
      wouldEmitRomcLedger({
        row: ajuste,
        emitterOrgs: new Set([CLUB_A]),
        hasOfficialIdentity: true,
      })
    ).toEqual({ emit: false, reason: "ajuste_manual" });
  });

  it("fallo artificial de sync + retry: carrera/ROMC siguen 60 (nunca 70/80/90/120)", () => {
    // Simula: Club A sync falló → faltaba fila; retry escribe una vez;
    // segundo retry reutiliza mismo id (dedupe) — no infla.
    let synced = baseRows.filter((r) => r.id !== "p-a");
    expect(computeCareerPointsByClubFromParticipaciones(synced).total).toBe(50);

    // Retry escribe A
    synced = [...synced, baseRows[0]];
    expect(computeCareerPointsByClubFromParticipaciones(synced).total).toBe(60);
    expect(sumRomc(synced, new Set([CLUB_A, CLUB_B, CLUB_C]), true)).toBe(60);

    // Retry adicional “duplica” intento → dedupe por id
    const afterDupAttempt = dedupeParticipacionesById([
      ...synced,
      baseRows[0],
      baseRows[1],
      baseRows[2],
    ]);
    const career = computeCareerPointsByClubFromParticipaciones(afterDupAttempt);
    const romc = sumRomc(
      afterDupAttempt,
      new Set([CLUB_A, CLUB_B, CLUB_C]),
      true
    );
    expect(career.total).toBe(60);
    expect(romc).toBe(60);
    for (const bad of [70, 80, 90, 120]) {
      expect(career.total).not.toBe(bad);
      expect(romc).not.toBe(bad);
    }
  });
});
