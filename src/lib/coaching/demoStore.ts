import type { RivieraJugadorCategoria } from "../rivieraJugadores/types";
import type {
  CoachingClubSnapshot,
  CoachingCoach,
  CoachingPlayerLink,
  CreateCoachInput,
} from "./types";

const keyFor = (organizadorId: string) =>
  `riviera_coaching_demo_v2:${organizadorId}`;

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeLink(
  raw: Partial<CoachingPlayerLink> & {
    coachId: string;
    coachNombre: string;
    jugadorId: string;
    jugadorNombre: string;
  }
): CoachingPlayerLink {
  return {
    id: raw.id || uid("link"),
    coachId: raw.coachId,
    coachNombre: raw.coachNombre,
    jugadorId: raw.jugadorId,
    jugadorNombre: raw.jugadorNombre,
    rivieraId:
      typeof raw.rivieraId === "string" && raw.rivieraId
        ? raw.rivieraId
        : "RIV-00000000",
    status:
      raw.status === "PAUSED" || raw.status === "ENDED" ? raw.status : "ACTIVE",
    isPrimary: Boolean(raw.isPrimary),
  };
}

function normalizeCoach(
  raw: Partial<CoachingCoach> & { nombre: string }
): CoachingCoach {
  const fuerzas = Array.isArray(raw.fuerzas)
    ? (raw.fuerzas as RivieraJugadorCategoria[])
    : [];
  return {
    id: raw.id || uid("coach"),
    coachCode: raw.coachCode || "RIV-C-00000",
    nombre: raw.nombre,
    email: raw.email ?? null,
    telefono: raw.telefono ?? null,
    paisCodigo: raw.paisCodigo ?? null,
    genero: raw.genero ?? null,
    categoria: raw.categoria ?? null,
    edad: raw.edad ?? null,
    manoDominante: raw.manoDominante ?? null,
    enCancha: raw.enCancha ?? null,
    fotoUrl: raw.fotoUrl ?? null,
    bio: raw.bio ?? null,
    especialidades: Array.isArray(raw.especialidades) ? raw.especialidades : [],
    fuerzas,
    membershipStatus:
      raw.membershipStatus === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  };
}

function parseSnapshot(rawJson: string): CoachingClubSnapshot | null {
  try {
    const parsed = JSON.parse(rawJson) as CoachingClubSnapshot;
    if (!parsed || !Array.isArray(parsed.coaches)) return null;
    return {
      source: "demo",
      links: (Array.isArray(parsed.links) ? parsed.links : []).map((l) =>
        normalizeLink(l)
      ),
      coaches: parsed.coaches.map((c) =>
        normalizeCoach({
          ...c,
          fuerzas: c.fuerzas?.length
            ? c.fuerzas
            : c.categoria
              ? [c.categoria]
              : ["3ra_fuerza"],
        })
      ),
    };
  } catch {
    return null;
  }
}

function readRaw(organizadorId: string): CoachingClubSnapshot | null {
  try {
    const raw = localStorage.getItem(keyFor(organizadorId));
    if (raw) return parseSnapshot(raw);

    const legacy = localStorage.getItem(
      `riviera_coaching_demo_v1:${organizadorId}`
    );
    if (!legacy) return null;
    return parseSnapshot(legacy);
  } catch {
    return null;
  }
}

function writeRaw(organizadorId: string, snapshot: CoachingClubSnapshot): void {
  localStorage.setItem(
    keyFor(organizadorId),
    JSON.stringify({ ...snapshot, source: "demo" })
  );
}

export function loadCoachingDemo(organizadorId: string): CoachingClubSnapshot {
  const existing = readRaw(organizadorId);
  if (existing) return existing;

  const seedCoach: CoachingCoach = {
    id: uid("coach"),
    coachCode: "RIV-C-00001",
    nombre: "Coach Demo",
    email: "coach.demo@riviera.open",
    telefono: null,
    paisCodigo: "MX",
    genero: "M",
    categoria: "2da_fuerza",
    edad: 34,
    manoDominante: "derecha",
    enCancha: "drive",
    bio: "Ejemplo para recorrer el flujo de Riviera Coaching.",
    especialidades: ["Técnica", "Competencia"],
    fuerzas: ["2da_fuerza", "3ra_fuerza", "4ta_fuerza"],
    membershipStatus: "ACTIVE",
    fotoUrl: null,
  };
  const seed: CoachingClubSnapshot = {
    source: "demo",
    coaches: [seedCoach],
    links: [
      {
        id: uid("link"),
        coachId: seedCoach.id,
        coachNombre: seedCoach.nombre,
        jugadorId: uid("jug"),
        jugadorNombre: "Jugador Demo",
        rivieraId: "RIV-00000001",
        status: "ACTIVE",
        isPrimary: true,
      },
    ],
  };
  writeRaw(organizadorId, seed);
  return seed;
}

export function saveCoachingDemo(
  organizadorId: string,
  snapshot: CoachingClubSnapshot
): CoachingClubSnapshot {
  const next = { ...snapshot, source: "demo" as const };
  writeRaw(organizadorId, next);
  return next;
}

export function addDemoCoach(
  organizadorId: string,
  input: CreateCoachInput
): CoachingClubSnapshot {
  const current = loadCoachingDemo(organizadorId);
  const serial = String(current.coaches.length + 1).padStart(5, "0");
  const coach = normalizeCoach({
    id: uid("coach"),
    coachCode: `RIV-C-${serial}`,
    nombre: input.nombre.trim() || "Coach sin nombre",
    email: input.email.trim() || null,
    telefono: input.telefono?.trim() || null,
    paisCodigo: input.paisCodigo ?? null,
    genero: input.genero,
    categoria: input.categoria,
    edad: input.edad ?? null,
    manoDominante: input.manoDominante ?? null,
    enCancha: input.enCancha ?? null,
    bio: input.bio?.trim() || null,
    especialidades: input.especialidades,
    fuerzas: input.fuerzas.length ? input.fuerzas : [input.categoria],
    membershipStatus: "ACTIVE",
    fotoUrl: null,
  });
  return saveCoachingDemo(organizadorId, {
    ...current,
    coaches: [coach, ...current.coaches],
  });
}

export function addDemoPlayerLinkByRivieraId(
  organizadorId: string,
  coachId: string,
  input: {
    rivieraId: string;
    jugadorId: string;
    jugadorNombre: string;
  }
): CoachingClubSnapshot {
  const current = loadCoachingDemo(organizadorId);
  const coach = current.coaches.find((c) => c.id === coachId);
  if (!coach) return current;

  const rivieraId = input.rivieraId.trim();
  const existing = current.links.find(
    (l) =>
      l.coachId === coachId &&
      l.rivieraId === rivieraId &&
      l.status !== "ENDED"
  );
  if (existing) return current;

  const link: CoachingPlayerLink = {
    id: uid("link"),
    coachId: coach.id,
    coachNombre: coach.nombre,
    jugadorId: input.jugadorId,
    jugadorNombre: input.jugadorNombre.trim() || "Jugador",
    rivieraId,
    status: "ACTIVE",
    isPrimary: !current.links.some(
      (l) => l.rivieraId === rivieraId && l.isPrimary && l.status === "ACTIVE"
    ),
  };
  return saveCoachingDemo(organizadorId, {
    ...current,
    links: [link, ...current.links],
  });
}

export function setDemoLinkStatus(
  organizadorId: string,
  linkId: string,
  status: CoachingPlayerLink["status"]
): CoachingClubSnapshot {
  const current = loadCoachingDemo(organizadorId);
  return saveCoachingDemo(organizadorId, {
    ...current,
    links: current.links.map((l) =>
      l.id === linkId
        ? {
            ...l,
            status,
            isPrimary: status === "ACTIVE" ? l.isPrimary : false,
          }
        : l
    ),
  });
}
