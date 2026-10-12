import {
  approveParticipations,
  assignFreeReta,
  campaignBalance,
  closeCampaign,
  emptyEngine,
  enqueueCandidate,
  invalidateParticipation,
  processQueue,
  redeem,
  type CampaignRule,
  type Candidate,
} from "./accrualEngine";
import { campaignsConflict, duplicateCampaign, type CampaignWindow } from "./campaigns";

const TZ = "America/Mexico_City";

function october(overrides: Partial<CampaignRule> = {}): CampaignRule {
  return {
    id: "octubre",
    organizadorId: "club-1",
    estado: "activa",
    acumulaDesde: new Date("2026-10-01T06:00:00.000Z"),
    acumulaHasta: new Date("2026-11-01T06:00:00.000Z"),
    canjeDesde: new Date("2026-11-01T06:00:00.000Z"),
    canjeHasta: new Date("2026-12-01T06:00:00.000Z"),
    puntosPorParticipacion: 10,
    timeZone: TZ,
    modalidades: ["round_robin", "reta_equipos", "americano", "duelo_2v2"],
    validationMode: "admin",
    ...overrides,
  };
}

function november(): CampaignRule {
  return october({
    id: "noviembre",
    acumulaDesde: new Date("2026-11-01T06:00:00.000Z"),
    acumulaHasta: new Date("2026-12-01T06:00:00.000Z"),
    canjeDesde: new Date("2026-12-01T06:00:00.000Z"),
    canjeHasta: new Date("2027-01-01T06:00:00.000Z"),
  });
}

function candidate(id: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    participacionId: id,
    organizadorId: "club-1",
    jugadorId: "oswaldo",
    tipoEvento: "reta",
    eventoId: `evento-${id}`,
    modalidad: "round_robin",
    closedAt: new Date("2026-10-03T18:00:00.000Z"),
    ...overrides,
  };
}

describe("campañas mensuales del mismo club", () => {
  it("permite acumular el mes nuevo mientras el anterior sigue en canje", () => {
    const oct = october();
    const nov = november();
    const left: CampaignWindow = oct;
    const right: CampaignWindow = nov;
    expect(campaignsConflict(left, right)).toBe(false);
    expect(
      campaignsConflict(left, {
        ...left,
        id: "otra",
        acumulaHasta: new Date("2026-10-20T06:00:00.000Z"),
      })
    ).toBe(true);
  });

  it("duplicar no arrastra el identificador ni la ventana de la original", () => {
    const copy = duplicateCampaign(october(), {
      id: "noviembre",
      acumulaDesde: new Date("2026-11-01T06:00:00.000Z"),
      acumulaHasta: new Date("2026-12-01T06:00:00.000Z"),
    });
    expect(copy.id).toBe("noviembre");
    expect(copy.estado).toBe("borrador");
    expect(copy.acumulaDesde.toISOString()).toBe("2026-11-01T06:00:00.000Z");
  });
});

describe("validación, cola y reta gratuita", () => {
  it("no acredita al cerrar; acredita una sola vez al validar y reintentar", () => {
    const state = emptyEngine();
    const row = candidate("p1");
    const rule = october();
    enqueueCandidate(state, row);
    expect(state.lots).toHaveLength(0);

    state.failNextProcess = true;
    approveParticipations(state, { candidates: [row], campaign: rule });
    expect(state.lots).toHaveLength(0);
    expect(state.queue[0].estado).toBe("error");

    processQueue(state, { candidates: [row], campaigns: [rule] });
    processQueue(state, { candidates: [row], campaigns: [rule] });
    expect(state.lots).toHaveLength(1);
    expect(state.lots[0].points).toBe(10);
    expect(state.queue[0].estado).toBe("acreditada");
    expect(state.queue[0].attempts).toBe(2);
  });

  it("una reta gratuita vinculada al canje no genera puntos", () => {
    const state = emptyEngine();
    const row = candidate("p2", { closedAt: new Date("2026-11-08T18:00:00.000Z") });
    const rule = november();
    enqueueCandidate(state, row);
    assignFreeReta(state, {
      redemptionId: "red-1",
      jugadorId: row.jugadorId,
      participacionId: row.participacionId,
      eventoId: row.eventoId,
    });
    approveParticipations(state, { candidates: [row], campaign: rule });
    expect(state.lots).toHaveLength(0);
    expect(state.queue[0].estado).toBe("omitida");
    expect(state.queue[0].lastError).toBe("Reta gratuita de Rewards");
  });

  it("no toma participaciones anteriores a la campaña ni de otro club", () => {
    const state = emptyEngine();
    const old = candidate("old", { closedAt: new Date("2026-09-01T18:00:00.000Z") });
    const rule = october();
    enqueueCandidate(state, old);
    approveParticipations(state, { candidates: [old], campaign: rule });
    expect(state.lots).toHaveLength(0);
    expect(state.queue[0].lastError).toBe("Fuera de campaña");

    expect(() =>
      approveParticipations(emptyEngine(), {
        candidates: [candidate("x", { organizadorId: "club-2" })],
        campaign: rule,
      })
    ).toThrow(/club/);
  });
});

describe("saldos por campaña", () => {
  it("junta el mes en un solo saldo y lo cierra junto", () => {
    const state = emptyEngine();
    const early = candidate("a", { closedAt: new Date("2026-10-03T18:00:00.000Z") });
    const later = candidate("b", {
      eventoId: "evento-b",
      closedAt: new Date("2026-10-28T18:00:00.000Z"),
    });
    const oct = october();
    enqueueCandidate(state, early);
    enqueueCandidate(state, later);
    approveParticipations(state, { candidates: [early, later], campaign: oct });

    const duringOctober = new Date("2026-10-29T00:00:00.000Z");
    expect(campaignBalance(state, "oswaldo", oct, duringOctober)).toMatchObject({
      fase: "acumulacion",
      acumulando: 20,
      disponible: 0,
    });
    expect(() => redeem(state, { jugadorId: "oswaldo", campaign: oct, points: 10, now: duringOctober })).toThrow(
      /ventana de canje/
    );

    const duringNovember = new Date("2026-11-15T00:00:00.000Z");
    redeem(state, { jugadorId: "oswaldo", campaign: oct, points: 15, now: duringNovember });
    expect(campaignBalance(state, "oswaldo", oct, duringNovember).disponible).toBe(5);

    const afterClose = new Date("2026-12-02T00:00:00.000Z");
    closeCampaign(state, oct, afterClose);
    expect(campaignBalance(state, "oswaldo", oct, afterClose)).toMatchObject({
      fase: "cerrada",
      disponible: 0,
      utilizado: 15,
      cerrado: 5,
    });
    expect(state.ledger.filter((line) => line.tipo === "canje")).toHaveLength(2);
    expect(state.ledger.filter((line) => line.tipo === "acreditacion")).toHaveLength(2);
  });

  it("no mezcla octubre con noviembre", () => {
    const state = emptyEngine();
    const oct = october();
    const nov = november();
    const octoberPlay = candidate("oct");
    const novemberPlay = candidate("nov", { closedAt: new Date("2026-11-04T18:00:00.000Z") });
    enqueueCandidate(state, octoberPlay);
    enqueueCandidate(state, novemberPlay);
    approveParticipations(state, { candidates: [octoberPlay], campaign: oct });
    approveParticipations(state, { candidates: [novemberPlay], campaign: nov });

    const midNovember = new Date("2026-11-20T00:00:00.000Z");
    expect(campaignBalance(state, "oswaldo", oct, midNovember).disponible).toBe(10);
    expect(campaignBalance(state, "oswaldo", nov, midNovember)).toMatchObject({
      fase: "acumulacion",
      acumulando: 10,
      disponible: 0,
    });
    expect(() => redeem(state, { jugadorId: "oswaldo", campaign: nov, points: 10, now: midNovember })).toThrow(
      /ventana de canje/
    );
    redeem(state, { jugadorId: "oswaldo", campaign: oct, points: 10, now: midNovember });
    expect(campaignBalance(state, "oswaldo", nov, midNovember).acumulando).toBe(10);
  });

  it("duplicar la campaña no copia los puntos ya acreditados", () => {
    const state = emptyEngine();
    const oct = october();
    enqueueCandidate(state, candidate("oct"));
    approveParticipations(state, { candidates: [candidate("oct")], campaign: oct });
    const copy = november();
    expect(state.lots.filter((lot) => lot.campaignId === copy.id)).toHaveLength(0);
    expect(state.lots.filter((lot) => lot.campaignId === oct.id)).toHaveLength(1);
  });

  it("compensa una obligación sin borrar el canje", () => {
    const state = emptyEngine();
    const oct = october();
    const nov = november();
    const spent = candidate("spent");
    const next = candidate("next", { closedAt: new Date("2026-11-06T18:00:00.000Z") });
    enqueueCandidate(state, spent);
    approveParticipations(state, { candidates: [spent], campaign: oct });
    redeem(state, {
      jugadorId: "oswaldo",
      campaign: oct,
      points: 10,
      now: new Date("2026-11-10T00:00:00.000Z"),
    });
    invalidateParticipation(state, "spent");
    expect(state.ledger.filter((line) => line.tipo === "canje")).toHaveLength(1);
    expect(state.obligations[0].pending).toBe(10);

    enqueueCandidate(state, next);
    approveParticipations(state, { candidates: [next], campaign: nov });
    const fresh = state.lots.find((lot) => lot.participacionId === "next");
    expect(fresh?.points).toBe(10);
    expect(fresh?.remaining).toBe(0);
    expect(state.obligations[0].pending).toBe(0);
    expect(campaignBalance(state, "oswaldo", nov, new Date("2026-11-20T00:00:00.000Z")).acumulando).toBe(0);
    expect(state.ledger.filter((line) => line.tipo === "canje")).toHaveLength(1);
  });
});
