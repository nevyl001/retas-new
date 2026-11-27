import { supabase } from "../supabaseClient";
import { getManifestByKey } from "../../club-experience/manifestCatalog";
import { ORGANIZADOR_CLUB_BINDINGS } from "../../club-experience/organizadorClubIndex";
import type { ClubBrandingKey } from "../../club-experience/types";
import {
  accountHasRole,
  membershipStatusLabel,
  parseAdminDirectory,
  type AdminAccountRoles,
  type AdminCoachDirectoryRow,
  type AdminCoachMembershipStatus,
  type AdminDirectoryClassification,
  type AdminStudentDirectoryRow,
} from "./adminAccountClassification";

const DRAFT_DESCRIPTION = "Parejas en armado para torneo";

export function isDraftTournamentRow(row: {
  name?: string | null;
  description?: string | null;
}): boolean {
  const n = (row.name ?? "").trim();
  const d = (row.description ?? "").trim();
  return (
    n.startsWith("(Borrador)") ||
    n === "Torneo Express Draft" ||
    n === DRAFT_DESCRIPTION ||
    d === DRAFT_DESCRIPTION
  );
}

export function americanIdsFromPublicConfig(
  rows: Record<string, unknown>[] | null | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!rows) return ids;
  for (const row of rows) {
    if (!("americano_live" in row)) continue;
    const live = row.americano_live as unknown;
    if (
      live &&
      typeof live === "object" &&
      !Array.isArray(live) &&
      (live as { version?: number }).version === 1
    ) {
      const tid = row.tournament_id;
      if (typeof tid === "string") ids.add(tid);
    }
  }
  return ids;
}

export function teamIdsFromPublicConfig(
  rows: Record<string, unknown>[] | null | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!rows) return ids;
  for (const row of rows) {
    if (row.format !== "teams") continue;
    const tc = row.team_config as
      | { teamNames?: unknown[]; pairToTeam?: Record<string, unknown> }
      | undefined;
    const tid = row.tournament_id;
    if (
      typeof tid === "string" &&
      Array.isArray(tc?.teamNames) &&
      (tc?.teamNames?.length ?? 0) > 0 &&
      tc?.pairToTeam &&
      typeof tc.pairToTeam === "object"
    ) {
      ids.add(tid);
    }
  }
  return ids;
}

export interface FormatCounts {
  total: number;
  active: number;
  finished: number;
}

export function emptyFormatCounts(): FormatCounts {
  return { total: 0, active: 0, finished: 0 };
}

function addFormatCount(counts: FormatCounts, isFinished: boolean): void {
  counts.total += 1;
  if (isFinished) {
    counts.finished += 1;
  } else {
    counts.active += 1;
  }
}

export type AdminFormatKey =
  | "round_robin"
  | "americano"
  | "reta_equipos"
  | "duelo_2v2"
  | "torneo_express"
  | "liga_individual"
  | "liga_parejas"
  | "liga_flex";

export interface AdminFormatDescriptor {
  key: AdminFormatKey;
  label: string;
  shortLabel: string;
  category: "reta_rapida" | "torneo" | "liga";
  sourceTable: string;
  ruleNote: string;
  counts: FormatCounts;
}

export interface AdminCoachingSummary {
  coachesTotal: number;
  alumnosVinculados: number;
  clubesConCoaching: number;
  movimientosClases: number;
}

export interface AdminClubFormatBreakdown {
  roundRobin: FormatCounts;
  americano: FormatCounts;
  retaEquipos: FormatCounts;
  duelo2v2: FormatCounts;
  torneoExpress: FormatCounts;
  ligaIndividual: FormatCounts;
  ligaParejas: FormatCounts;
  ligaFlex: FormatCounts;
}

export type AdminAccountStatusKey = "en_curso" | "con_actividad" | "registrada";

export interface AdminAccountRow {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  account_kind: "club" | "coach" | "student";
  roles?: AdminAccountRoles;
  status_key: AdminAccountStatusKey;
  status_label: string;
  has_upgrade: boolean;
  upgrade_key: string | null;
  upgrade_label: string | null;
  visible_ranking_oficial: boolean;
  permite_ajuste_puntos: boolean;
  jugadores_total: number;
  jugadores_publicos: number;
  coaches_count: number;
  students_count: number;
  coaching_movements: number;
  competencias_total: number;
  competencias_activas: number;
  competencias_finalizadas: number;
  tournaments_total: number;
  tournaments_active: number;
  tournaments_finished: number;
  retas_round_robin_total: number;
  retas_round_robin_active: number;
  retas_round_robin_finished: number;
  retas_americano_total: number;
  retas_americano_active: number;
  retas_americano_finished: number;
  retas_teams_total: number;
  retas_teams_active: number;
  retas_teams_finished: number;
  express_total: number;
  express_active: number;
  express_finished: number;
  ligas_total: number;
  ligas_active: number;
  ligas_finished: number;
  duelos_total: number;
  duelos_active: number;
  duelos_finished: number;
  activity_total: number;
  formats: AdminClubFormatBreakdown;
  coach_info: {
    coach_id: string;
    coach_code: string;
    club_count: number;
    clubs: { organizadorId: string; name: string; status: string }[];
    student_count: number;
    class_count: number;
    foto_url: string | null;
    membership_status: AdminCoachMembershipStatus;
  } | null;
  student_info: {
    rivieraId: string | null;
    isActive: boolean;
    clubCount: number;
  } | null;
}

export interface AdminCompetitionItem {
  id: string;
  title: string;
  formatKey: AdminFormatKey;
  formatLabel: string;
  organizadorId: string;
  organizadorName: string;
  status: "active" | "finished";
  statusLabel: string;
  createdAt: string;
  publicPath: string | null;
}

export interface AdminActivityEvent {
  id: string;
  kind: "competencia" | "cuenta" | "coaching";
  title: string;
  subtitle: string;
  actorName: string;
  organizadorId: string | null;
  badge: string;
  timestamp: string;
}

export interface AdminControlCenterSnapshot {
  clubesCount: number;
  coachesCount: number;
  studentsCount: number;
  totalAccountsCount: number;
  jugadoresTotal: number;
  jugadoresPublicos: number;
  competenciasTotal: number;
  competenciasActivas: number;
  competenciasFinalizadas: number;
  retasTournamentsTableTotal: number;
  formats: Record<AdminFormatKey, FormatCounts>;
  formatList: AdminFormatDescriptor[];
  coaching: AdminCoachingSummary;
  accounts: AdminAccountRow[];
  competitions: AdminCompetitionItem[];
  activities: AdminActivityEvent[];
  unclassifiedCount?: number;
}

function emptyClubBreakdown(): AdminClubFormatBreakdown {
  return {
    roundRobin: emptyFormatCounts(),
    americano: emptyFormatCounts(),
    retaEquipos: emptyFormatCounts(),
    duelo2v2: emptyFormatCounts(),
    torneoExpress: emptyFormatCounts(),
    ligaIndividual: emptyFormatCounts(),
    ligaParejas: emptyFormatCounts(),
    ligaFlex: emptyFormatCounts(),
  };
}

function resolveClubUpgradeInfo(
  organizadorId: string,
  ogmRow?: {
    premium_branding_enabled?: boolean | null;
    branding_key?: string | null;
  } | null
): {
  hasUpgrade: boolean;
  upgradeKey: string | null;
  upgradeLabel: string | null;
  logoUrl: string | null;
} {
  const normId = organizadorId.trim().toLowerCase();
  let key: ClubBrandingKey | null = null;

  if (ogmRow) {
    if (ogmRow.premium_branding_enabled === true && ogmRow.branding_key?.trim()) {
      key = ogmRow.branding_key.trim() as ClubBrandingKey;
    }
  } else {
    const staticBind = ORGANIZADOR_CLUB_BINDINGS.find(
      (b) =>
        b.organizadorId.trim().toLowerCase() === normId &&
        b.active &&
        b.premiumBrandingEnabled
    );
    if (staticBind) {
      key = staticBind.brandingKey;
    }
  }

  if (!key || key === "riviera") {
    return {
      hasUpgrade: false,
      upgradeKey: null,
      upgradeLabel: null,
      logoUrl: null,
    };
  }

  const manifest = getManifestByKey(key);
  if (!manifest || manifest.brandingKey === "riviera") {
    return {
      hasUpgrade: false,
      upgradeKey: null,
      upgradeLabel: null,
      logoUrl: null,
    };
  }

  const logoUrl =
    manifest.logos.dark || manifest.logos.light || manifest.logos.square || null;

  return {
    hasUpgrade: true,
    upgradeKey: manifest.brandingKey,
    upgradeLabel: manifest.displayName || manifest.brandingKey,
    logoUrl,
  };
}

type QueryError = { message?: string; code?: string } | null;

async function safeSelect<T>(
  promise: PromiseLike<{ data: T[] | null; error: QueryError }>,
  label: string
): Promise<T[]> {
  try {
    const { data, error } = await promise;
    if (error) {
      console.warn(`[adminControlCenter] ${label}:`, error.message || error.code);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.warn(`[adminControlCenter] ${label} exception:`, err);
    return [];
  }
}

function queryFailureMessage(label: string, error: QueryError): string {
  const detail = error?.message || error?.code || "sin detalle";
  return `No se pudo consultar ${label}. ${detail}`;
}

export async function fetchAdminControlCenterSnapshot(
  excludeAdminUserId?: string | null
): Promise<AdminControlCenterSnapshot> {
  const [
    usersRows,
    ogmRows,
    tournamentsRows,
    publicConfigRows,
    expressRows,
    ligasRows,
    duelosRows,
    jugadoresRows,
    membershipsRows,
    studentLinksRows,
    identitiesRows,
    ledgerRows,
    directoryRpcResult,
  ] = await Promise.all([
    safeSelect<Record<string, unknown>>(
      supabase.from("users").select("*").order("created_at", { ascending: false }),
      "users"
    ),
    safeSelect<Record<string, unknown>>(
      supabase.from("organizador_game_modes").select("*"),
      "organizador_game_modes"
    ),
    safeSelect<Record<string, unknown>>(
      supabase
        .from("tournaments")
        .select("id, user_id, name, description, is_finished, created_at")
        .order("created_at", { ascending: false }),
      "tournaments"
    ),
    safeSelect<Record<string, unknown>>(
      supabase
        .from("tournament_public_config")
        .select("tournament_id, format, americano_live, team_config"),
      "tournament_public_config"
    ),
    safeSelect<Record<string, unknown>>(
      supabase
        .from("torneo_express")
        .select("id, organizador_id, nombre, estado, created_at")
        .order("created_at", { ascending: false }),
      "torneo_express"
    ),
    safeSelect<Record<string, unknown>>(
      supabase
        .from("ligas")
        .select("id, organizador_id, nombre, modalidad, estado, created_at")
        .order("created_at", { ascending: false }),
      "ligas"
    ),
    safeSelect<Record<string, unknown>>(
      supabase
        .from("duelos_2v2")
        .select("id, organizador_id, titulo, estado, archived_at, created_at")
        .order("created_at", { ascending: false }),
      "duelos_2v2"
    ),
    safeSelect<Record<string, unknown>>(
      supabase
        .from("riviera_jugadores")
        .select("id, organizador_id, estado, visible_publico, created_at"),
      "riviera_jugadores"
    ),
    safeSelect<Record<string, unknown>>(
      supabase
        .from("coach_club_memberships")
        .select("coach_id, organizador_id, status, created_at"),
      "coach_club_memberships"
    ),
    safeSelect<Record<string, unknown>>(
      supabase
        .from("coach_student_account_links")
        .select(
          "auth_user_id, jugador_id, organizador_id, is_active, student_email, created_at"
        ),
      "coach_student_account_links"
    ),
    safeSelect<Record<string, unknown>>(
      supabase
        .from("riviera_official_player_identity")
        .select("canonical_riviera_jugador_id, riviera_id"),
      "riviera_official_player_identity"
    ),
    safeSelect<Record<string, unknown>>(
      supabase
        .from("coach_class_ledger")
        .select("id, organizador_id, coach_id, jugador_id, delta, tipo, created_at")
        .order("created_at", { ascending: false })
        .limit(120),
      "coach_class_ledger"
    ),
    supabase.rpc("admin_directorio_clasificacion"),
  ]);

  const americanIds = americanIdsFromPublicConfig(publicConfigRows);
  const teamIds = teamIdsFromPublicConfig(publicConfigRows);

  const ogmByOrg = new Map<string, Record<string, unknown>>();
  for (const row of ogmRows) {
    const oid = String(row.organizador_id ?? "");
    if (oid) ogmByOrg.set(oid, row);
  }

  const userNamesById = new Map<string, string>();
  for (const u of usersRows) {
    const id = String(u.id ?? "");
    const name = String(u.name ?? u.email ?? "Organizador").trim();
    if (id) userNamesById.set(id, name);
  }

  // Riviera IDs por jugador
  const rivieraByJugador = new Map<string, string>();
  for (const row of identitiesRows) {
    const jid = String(row.canonical_riviera_jugador_id ?? "");
    const rid = String(row.riviera_id ?? "").trim();
    if (jid && rid) rivieraByJugador.set(jid, rid);
  }

  // Alumnos por auth_user_id y por organizador
  const studentByAuth = new Map<
    string,
    {
      rivieraId: string | null;
      isActive: boolean;
      clubs: Set<string>;
      email: string;
      createdAt: string;
    }
  >();
  const studentsByOrg = new Map<string, Set<string>>();

  for (const row of studentLinksRows) {
    const authId = String(row.auth_user_id ?? "");
    const jugadorId = String(row.jugador_id ?? "");
    const orgId = String(row.organizador_id ?? "");
    const email = String(row.student_email ?? "").trim();
    const createdAt = String(row.created_at ?? "");

    if (orgId && (authId || jugadorId)) {
      const set = studentsByOrg.get(orgId) ?? new Set<string>();
      set.add(authId || jugadorId);
      studentsByOrg.set(orgId, set);
    }

    if (!authId) continue;
    const current = studentByAuth.get(authId) ?? {
      rivieraId: null,
      isActive: false,
      clubs: new Set<string>(),
      email: "",
      createdAt,
    };
    if (jugadorId && !current.rivieraId) {
      current.rivieraId = rivieraByJugador.get(jugadorId) ?? null;
    }
    if (row.is_active === true) current.isActive = true;
    if (orgId) current.clubs.add(orgId);
    if (email && !current.email) current.email = email;
    studentByAuth.set(authId, current);
  }

  // Coaches y membresías
  const coachesByOrg = new Map<string, Set<string>>();
  const clubsWithCoaching = new Set<string>();

  for (const m of membershipsRows) {
    const cid = String(m.coach_id ?? "");
    const oid = String(m.organizador_id ?? "");
    if (oid && cid) {
      clubsWithCoaching.add(oid);
      const set = coachesByOrg.get(oid) ?? new Set<string>();
      set.add(cid);
      coachesByOrg.set(oid, set);
    }
  }

  if (directoryRpcResult.error || directoryRpcResult.data == null) {
    throw new Error(
      queryFailureMessage(
        "la clasificación de cuentas",
        directoryRpcResult.error ?? { message: "respuesta vacía" }
      )
    );
  }
  const directory: AdminDirectoryClassification | null = parseAdminDirectory(
    directoryRpcResult.data
  );
  if (!directory) {
    throw new Error(
      "La clasificación del servidor no tiene el formato esperado. No se muestran cuentas parciales."
    );
  }
  const coachDirectory: AdminCoachDirectoryRow[] = directory.coaches;
  const clubIdSet = new Set(directory.clubIds);
  const studentDirectory = new Map<string, AdminStudentDirectoryRow>();
  for (const student of directory.students) {
    studentDirectory.set(student.authUserId, student);
  }

  const authCoachMap = new Map<string, AdminCoachDirectoryRow>();
  for (const coach of coachDirectory) {
    if (coach.authUserId) authCoachMap.set(coach.authUserId, coach);
  }

  // Movimientos de coaching por organizador
  const coachingMovementsByOrg = new Map<string, number>();
  for (const l of ledgerRows) {
    const oid = String(l.organizador_id ?? "");
    if (oid) {
      clubsWithCoaching.add(oid);
      coachingMovementsByOrg.set(oid, (coachingMovementsByOrg.get(oid) || 0) + 1);
    }
  }

  // Jugadores por organizador
  let jugadoresTotal = 0;
  let jugadoresPublicos = 0;
  const jugadoresByOrg = new Map<string, { total: number; publicos: number }>();

  for (const j of jugadoresRows) {
    const estado = String(j.estado ?? "activo");
    if (estado === "archivado") continue;
    const oid = String(j.organizador_id ?? "");
    const isPub = j.visible_publico === true;
    jugadoresTotal += 1;
    if (isPub) jugadoresPublicos += 1;
    if (oid) {
      const curr = jugadoresByOrg.get(oid) ?? { total: 0, publicos: 0 };
      curr.total += 1;
      if (isPub) curr.publicos += 1;
      jugadoresByOrg.set(oid, curr);
    }
  }

  // Contadores globales y por club de los 8 formatos activos
  const globalFormats: Record<AdminFormatKey, FormatCounts> = {
    round_robin: emptyFormatCounts(),
    americano: emptyFormatCounts(),
    reta_equipos: emptyFormatCounts(),
    duelo_2v2: emptyFormatCounts(),
    torneo_express: emptyFormatCounts(),
    liga_individual: emptyFormatCounts(),
    liga_parejas: emptyFormatCounts(),
    liga_flex: emptyFormatCounts(),
  };

  const clubFormats = new Map<string, AdminClubFormatBreakdown>();
  const getClubFmt = (orgId: string): AdminClubFormatBreakdown => {
    let entry = clubFormats.get(orgId);
    if (!entry) {
      entry = emptyClubBreakdown();
      clubFormats.set(orgId, entry);
    }
    return entry;
  };

  const competitions: AdminCompetitionItem[] = [];
  const activities: AdminActivityEvent[] = [];

  // 1) Tabla tournaments: Round Robin, Americano Dinámico y Reta por Equipos
  const realTournaments = tournamentsRows.filter(
    (t) =>
      !isDraftTournamentRow({
        name: t.name as string | null,
        description: t.description as string | null,
      })
  );

  for (const t of realTournaments) {
    const id = String(t.id ?? "");
    const uid = String(t.user_id ?? "");
    const name = String(t.name ?? "Reta").trim() || "Reta";
    const isFinished = t.is_finished === true;
    const createdAt = String(t.created_at ?? "");
    const orgName = userNamesById.get(uid) ?? "Club";
    const clubFmt = getClubFmt(uid);

    let formatKey: AdminFormatKey = "round_robin";
    let formatLabel = "Round Robin";
    let publicPath = `/public/${id}`;

    if (americanIds.has(id)) {
      formatKey = "americano";
      formatLabel = "Americano Dinámico";
      publicPath = `/public/americano/${id}`;
      addFormatCount(globalFormats.americano, isFinished);
      addFormatCount(clubFmt.americano, isFinished);
    } else if (teamIds.has(id)) {
      formatKey = "reta_equipos";
      formatLabel = "Reta por Equipos";
      addFormatCount(globalFormats.reta_equipos, isFinished);
      addFormatCount(clubFmt.retaEquipos, isFinished);
    } else {
      addFormatCount(globalFormats.round_robin, isFinished);
      addFormatCount(clubFmt.roundRobin, isFinished);
    }

    competitions.push({
      id,
      title: name,
      formatKey,
      formatLabel,
      organizadorId: uid,
      organizadorName: orgName,
      status: isFinished ? "finished" : "active",
      statusLabel: isFinished ? "Finalizada" : "En curso",
      createdAt,
      publicPath,
    });
  }

  // 2) Tabla torneo_express: Torneo Express
  for (const row of expressRows) {
    const id = String(row.id ?? "");
    const oid = String(row.organizador_id ?? "");
    const nombre = String(row.nombre ?? "Torneo Express").trim() || "Torneo Express";
    if (isDraftTournamentRow({ name: nombre })) continue;
    const estado = String(row.estado ?? "pendiente");
    const isFinished = estado === "finalizado";
    const createdAt = String(row.created_at ?? "");
    const orgName = userNamesById.get(oid) ?? "Club";

    addFormatCount(globalFormats.torneo_express, isFinished);
    if (oid) {
      addFormatCount(getClubFmt(oid).torneoExpress, isFinished);
    }

    competitions.push({
      id,
      title: nombre,
      formatKey: "torneo_express",
      formatLabel: "Torneo Express",
      organizadorId: oid,
      organizadorName: orgName,
      status: isFinished ? "finished" : "active",
      statusLabel: isFinished ? "Finalizado" : "En curso",
      createdAt,
      publicPath: `/torneo-express/${id}/public`,
    });
  }

  // 3) Tabla ligas: Liga Individual, Liga de Parejas Fijas y Riviera Flex League
  for (const row of ligasRows) {
    const id = String(row.id ?? "");
    const oid = String(row.organizador_id ?? "");
    const nombre = String(row.nombre ?? "Liga").trim() || "Liga";
    const modalidad = String(row.modalidad ?? "individual_rotativo");
    const estado = String(row.estado ?? "upcoming");
    if (estado === "archived") continue;
    const isFinished = estado === "completed";
    const createdAt = String(row.created_at ?? "");
    const orgName = userNamesById.get(oid) ?? "Club";
    const clubFmt = getClubFmt(oid);

    let formatKey: AdminFormatKey = "liga_individual";
    let formatLabel = "Liga Individual";

    if (modalidad === "flex_league") {
      formatKey = "liga_flex";
      formatLabel = "Riviera Flex League";
      addFormatCount(globalFormats.liga_flex, isFinished);
      addFormatCount(clubFmt.ligaFlex, isFinished);
    } else if (
      modalidad === "parejas_fijas" ||
      modalidad === "parejas_fijas_playoffs"
    ) {
      formatKey = "liga_parejas";
      formatLabel = "Liga de Parejas Fijas";
      addFormatCount(globalFormats.liga_parejas, isFinished);
      addFormatCount(clubFmt.ligaParejas, isFinished);
    } else {
      addFormatCount(globalFormats.liga_individual, isFinished);
      addFormatCount(clubFmt.ligaIndividual, isFinished);
    }

    competitions.push({
      id,
      title: nombre,
      formatKey,
      formatLabel,
      organizadorId: oid,
      organizadorName: orgName,
      status: isFinished ? "finished" : "active",
      statusLabel: isFinished ? "Finalizada" : estado === "in_progress" ? "En curso" : "Próxima",
      createdAt,
      publicPath: `/public/liga/${id}`,
    });
  }

  // 4) Tabla duelos_2v2: Duelo 2v2
  for (const row of duelosRows) {
    if (row.archived_at != null) continue;
    const estado = String(row.estado ?? "borrador");
    if (estado === "borrador") continue;
    const id = String(row.id ?? "");
    const oid = String(row.organizador_id ?? "");
    const titulo = String(row.titulo ?? "Duelo 2 vs 2").trim() || "Duelo 2 vs 2";
    const isFinished = estado === "finalizado";
    const createdAt = String(row.created_at ?? "");
    const orgName = userNamesById.get(oid) ?? "Club";

    addFormatCount(globalFormats.duelo_2v2, isFinished);
    if (oid) {
      addFormatCount(getClubFmt(oid).duelo2v2, isFinished);
    }

    competitions.push({
      id,
      title: titulo,
      formatKey: "duelo_2v2",
      formatLabel: "Duelo 2v2",
      organizadorId: oid,
      organizadorName: orgName,
      status: isFinished ? "finished" : "active",
      statusLabel: isFinished ? "Finalizado" : "En juego",
      createdAt,
      publicPath: `/public/duelo-2v2/${id}`,
    });
  }

  competitions.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  // Construir cuentas (Clubes, Coaches, Alumnos)
  const accounts: AdminAccountRow[] = [];
  const knownIds = new Set<string>();

  for (const u of usersRows) {
    const uid = String(u.id ?? "");
    if (!uid || (excludeAdminUserId && uid === excludeAdminUserId)) continue;
    knownIds.add(uid);

    const email = String(u.email ?? "");
    const name = String(u.name ?? email ?? "Cuenta").trim();
    const avatarUrl = (u.avatar_url as string | null) ?? null;
    const createdAt = String(u.created_at ?? new Date(0).toISOString());
    const updatedAt = String(u.updated_at ?? createdAt);

    const coachInfoRaw = authCoachMap.get(uid) ?? null;
    const studentFromServer = studentDirectory.get(uid) ?? null;
    const roles = {
      club: clubIdSet.has(uid),
      coach: coachInfoRaw !== null,
      student: studentFromServer !== null,
    };
    if (!roles.club && !roles.coach && !roles.student) continue;

    const accountKind: AdminAccountRow["account_kind"] = roles.coach
      ? "coach"
      : roles.student
        ? "student"
        : "club";

    const fmt = getClubFmt(uid);
    const ogm = ogmByOrg.get(uid) as
      | {
          premium_branding_enabled?: boolean | null;
          branding_key?: string | null;
          visible_ranking_oficial?: boolean | null;
          permite_ajuste_puntos_manuales?: boolean | null;
        }
      | undefined;

    const upgrade = resolveClubUpgradeInfo(uid, ogm);
    const jStats = jugadoresByOrg.get(uid) ?? { total: 0, publicos: 0 };
    const coachesInClub = coachesByOrg.get(uid)?.size ?? 0;
    const studentsInClub = studentsByOrg.get(uid)?.size ?? 0;
    const coachingMovs = coachingMovementsByOrg.get(uid) ?? 0;

    const tournamentsTotal =
      fmt.roundRobin.total + fmt.americano.total + fmt.retaEquipos.total;
    const tournamentsActive =
      fmt.roundRobin.active + fmt.americano.active + fmt.retaEquipos.active;
    const tournamentsFinished =
      fmt.roundRobin.finished + fmt.americano.finished + fmt.retaEquipos.finished;

    const ligasTotal =
      fmt.ligaIndividual.total + fmt.ligaParejas.total + fmt.ligaFlex.total;
    const ligasActive =
      fmt.ligaIndividual.active + fmt.ligaParejas.active + fmt.ligaFlex.active;
    const ligasFinished =
      fmt.ligaIndividual.finished + fmt.ligaParejas.finished + fmt.ligaFlex.finished;

    const competenciasTotal =
      tournamentsTotal + fmt.torneoExpress.total + ligasTotal + fmt.duelo2v2.total;
    const competenciasActivas =
      tournamentsActive + fmt.torneoExpress.active + ligasActive + fmt.duelo2v2.active;
    const competenciasFinalizadas =
      tournamentsFinished +
      fmt.torneoExpress.finished +
      ligasFinished +
      fmt.duelo2v2.finished;

    const statusKey: AdminAccountStatusKey =
      accountKind === "coach"
        ? coachInfoRaw?.membershipStatus === "activo"
          ? "con_actividad"
          : "registrada"
        : competenciasActivas > 0
          ? "en_curso"
          : competenciasTotal > 0 || jStats.total > 0
            ? "con_actividad"
            : "registrada";
    const statusLabel =
      accountKind === "coach" && coachInfoRaw
        ? membershipStatusLabel(coachInfoRaw.membershipStatus)
        : statusKey === "en_curso"
          ? "En operación"
          : statusKey === "con_actividad"
            ? "Activa"
            : "Sin actividad";
    const coachName = coachInfoRaw?.nombre || name;
    const coachEmail = coachInfoRaw?.email || email;
    const coachPhoto = coachInfoRaw?.fotoUrl || avatarUrl;

    accounts.push({
      id: uid,
      email: accountKind === "coach" ? coachEmail : email,
      name: accountKind === "coach" ? coachName : name,
      avatar_url: accountKind === "coach" ? coachPhoto : avatarUrl,
      logo_url: accountKind === "coach" ? coachPhoto : avatarUrl || upgrade.logoUrl,
      created_at: createdAt,
      updated_at: updatedAt,
      account_kind: accountKind,
      roles,
      status_key: statusKey,
      status_label: statusLabel,
      has_upgrade: upgrade.hasUpgrade,
      upgrade_key: upgrade.upgradeKey,
      upgrade_label: upgrade.upgradeLabel,
      visible_ranking_oficial: ogm?.visible_ranking_oficial === true || jStats.publicos > 0,
      permite_ajuste_puntos: ogm?.permite_ajuste_puntos_manuales !== false,
      jugadores_total: jStats.total,
      jugadores_publicos: jStats.publicos,
      coaches_count: coachesInClub,
      students_count: studentsInClub,
      coaching_movements: coachingMovs,
      competencias_total: competenciasTotal,
      competencias_activas: competenciasActivas,
      competencias_finalizadas: competenciasFinalizadas,
      tournaments_total: tournamentsTotal,
      tournaments_active: tournamentsActive,
      tournaments_finished: tournamentsFinished,
      retas_round_robin_total: fmt.roundRobin.total,
      retas_round_robin_active: fmt.roundRobin.active,
      retas_round_robin_finished: fmt.roundRobin.finished,
      retas_americano_total: fmt.americano.total,
      retas_americano_active: fmt.americano.active,
      retas_americano_finished: fmt.americano.finished,
      retas_teams_total: fmt.retaEquipos.total,
      retas_teams_active: fmt.retaEquipos.active,
      retas_teams_finished: fmt.retaEquipos.finished,
      express_total: fmt.torneoExpress.total,
      express_active: fmt.torneoExpress.active,
      express_finished: fmt.torneoExpress.finished,
      ligas_total: ligasTotal,
      ligas_active: ligasActive,
      ligas_finished: ligasFinished,
      duelos_total: fmt.duelo2v2.total,
      duelos_active: fmt.duelo2v2.active,
      duelos_finished: fmt.duelo2v2.finished,
      activity_total: competenciasTotal,
      formats: fmt,
      coach_info: coachInfoRaw
        ? {
            coach_id: coachInfoRaw.coachId,
            coach_code: coachInfoRaw.coachCode,
            club_count: coachInfoRaw.clubs.length,
            clubs: coachInfoRaw.clubs,
            student_count: coachInfoRaw.studentCount,
            class_count: coachInfoRaw.classCount,
            foto_url: coachInfoRaw.fotoUrl,
            membership_status: coachInfoRaw.membershipStatus,
          }
        : null,
      student_info: studentFromServer
        ? {
            rivieraId: studentFromServer.rivieraId,
            isActive: studentFromServer.isActive,
            clubCount: studentFromServer.clubCount,
          }
        : null,
    });
  }

  for (const coach of coachDirectory) {
    if (
      !coach.authUserId ||
      knownIds.has(coach.authUserId) ||
      (excludeAdminUserId && coach.authUserId === excludeAdminUserId)
    ) {
      continue;
    }
    knownIds.add(coach.authUserId);
    const createdAt = coach.createdAt || new Date(0).toISOString();
    accounts.push({
      id: coach.authUserId,
      email: coach.email,
      name: coach.nombre || coach.email || coach.coachCode || "Coach",
      avatar_url: coach.fotoUrl,
      logo_url: coach.fotoUrl,
      created_at: createdAt,
      updated_at: createdAt,
      account_kind: "coach",
      roles: {
        club: clubIdSet.has(coach.authUserId),
        coach: true,
        student: studentDirectory.has(coach.authUserId),
      },
      status_key: coach.membershipStatus === "activo" ? "con_actividad" : "registrada",
      status_label: membershipStatusLabel(coach.membershipStatus),
      has_upgrade: false,
      upgrade_key: null,
      upgrade_label: null,
      visible_ranking_oficial: false,
      permite_ajuste_puntos: false,
      jugadores_total: 0,
      jugadores_publicos: 0,
      coaches_count: 0,
      students_count: coach.studentCount,
      coaching_movements: coach.classCount,
      competencias_total: 0,
      competencias_activas: 0,
      competencias_finalizadas: 0,
      tournaments_total: 0,
      tournaments_active: 0,
      tournaments_finished: 0,
      retas_round_robin_total: 0,
      retas_round_robin_active: 0,
      retas_round_robin_finished: 0,
      retas_americano_total: 0,
      retas_americano_active: 0,
      retas_americano_finished: 0,
      retas_teams_total: 0,
      retas_teams_active: 0,
      retas_teams_finished: 0,
      express_total: 0,
      express_active: 0,
      express_finished: 0,
      ligas_total: 0,
      ligas_active: 0,
      ligas_finished: 0,
      duelos_total: 0,
      duelos_active: 0,
      duelos_finished: 0,
      activity_total: 0,
      formats: emptyClubBreakdown(),
      coach_info: {
        coach_id: coach.coachId,
        coach_code: coach.coachCode,
        club_count: coach.clubs.length,
        clubs: coach.clubs,
        student_count: coach.studentCount,
        class_count: coach.classCount,
        foto_url: coach.fotoUrl,
        membership_status: coach.membershipStatus,
      },
      student_info: null,
    });
  }

  // Alumnos en coach_student_account_links que no tienen fila en public.users
  for (const student of directory.students) {
    if (
      knownIds.has(student.authUserId) ||
      (excludeAdminUserId && student.authUserId === excludeAdminUserId)
    ) {
      continue;
    }
    knownIds.add(student.authUserId);
    const createdAt = student.createdAt || new Date(0).toISOString();
    accounts.push({
      id: student.authUserId,
      email: student.email,
      name: student.rivieraId || student.email || "Alumno",
      avatar_url: null,
      logo_url: null,
      created_at: createdAt,
      updated_at: createdAt,
      account_kind: "student",
      roles: { club: false, coach: false, student: true },
      status_key: student.isActive ? "con_actividad" : "registrada",
      status_label: student.isActive ? "Acceso activo" : "Pendiente",
      has_upgrade: false,
      upgrade_key: null,
      upgrade_label: null,
      visible_ranking_oficial: false,
      permite_ajuste_puntos: false,
      jugadores_total: 0,
      jugadores_publicos: 0,
      coaches_count: 0,
      students_count: 0,
      coaching_movements: 0,
      competencias_total: 0,
      competencias_activas: 0,
      competencias_finalizadas: 0,
      tournaments_total: 0,
      tournaments_active: 0,
      tournaments_finished: 0,
      retas_round_robin_total: 0,
      retas_round_robin_active: 0,
      retas_round_robin_finished: 0,
      retas_americano_total: 0,
      retas_americano_active: 0,
      retas_americano_finished: 0,
      retas_teams_total: 0,
      retas_teams_active: 0,
      retas_teams_finished: 0,
      express_total: 0,
      express_active: 0,
      express_finished: 0,
      ligas_total: 0,
      ligas_active: 0,
      ligas_finished: 0,
      duelos_total: 0,
      duelos_active: 0,
      duelos_finished: 0,
      activity_total: 0,
      formats: emptyClubBreakdown(),
      coach_info: null,
      student_info: {
        rivieraId: student.rivieraId,
        isActive: student.isActive,
        clubCount: student.clubCount,
      },
    });
  }

  // Cronología de actividad real verificable
  for (const comp of competitions.slice(0, 45)) {
    if (!comp.createdAt) continue;
    activities.push({
      id: `comp-${comp.formatKey}-${comp.id}`,
      kind: "competencia",
      title: comp.title,
      subtitle: `${comp.formatLabel} · ${comp.statusLabel}`,
      actorName: comp.organizadorName,
      organizadorId: comp.organizadorId,
      badge: comp.formatLabel,
      timestamp: comp.createdAt,
    });
  }

  for (const acc of accounts) {
    if (!acc.created_at || acc.created_at.startsWith("1970-")) continue;
    const roleLabel =
      acc.account_kind === "club"
        ? "Registro de club"
        : acc.account_kind === "coach"
          ? `Alta de coach (${acc.coach_info?.coach_code ?? "RIV-C"})`
          : `Vinculación de alumno (${acc.student_info?.rivieraId ?? "Alumno"})`;
    activities.push({
      id: `acc-${acc.id}`,
      kind: "cuenta",
      title: acc.name || acc.email,
      subtitle: `${roleLabel}${acc.email ? ` · ${acc.email}` : ""}`,
      actorName: acc.name || acc.email,
      organizadorId: acc.account_kind === "club" ? acc.id : null,
      badge:
        acc.account_kind === "club"
          ? "Club"
          : acc.account_kind === "coach"
            ? "Coach"
            : "Alumno",
      timestamp: acc.created_at,
    });
  }

  for (const l of ledgerRows.slice(0, 30)) {
    const id = String(l.id ?? "");
    const oid = String(l.organizador_id ?? "");
    const createdAt = String(l.created_at ?? "");
    if (!createdAt) continue;
    const delta = Number(l.delta ?? 0);
    const movType = String(l.tipo ?? "clase");
    const orgName = userNamesById.get(oid) ?? "Club";
    activities.push({
      id: `coach-ledger-${id}`,
      kind: "coaching",
      title:
        delta > 0
          ? `Asignación de +${delta} ${delta === 1 ? "clase" : "clases"}`
          : delta < 0
            ? `Registro de clase (${delta})`
            : `Movimiento de coaching (${movType})`,
      subtitle: `Riviera Coaching · ${orgName}`,
      actorName: orgName,
      organizadorId: oid || null,
      badge: "Coaching",
      timestamp: createdAt,
    });
  }

  activities.sort(
    (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  );

  const formatList: AdminFormatDescriptor[] = [
    {
      key: "round_robin",
      label: "Round Robin",
      shortLabel: "RR",
      category: "reta_rapida",
      sourceTable: "tournaments",
      ruleNote: "Retas todos contra todos sin borradores.",
      counts: globalFormats.round_robin,
    },
    {
      key: "americano",
      label: "Americano Dinámico",
      shortLabel: "Am",
      category: "reta_rapida",
      sourceTable: "tournaments + tournament_public_config",
      ruleNote: "Rotación individual con configuración americano_live v1.",
      counts: globalFormats.americano,
    },
    {
      key: "reta_equipos",
      label: "Reta por Equipos",
      shortLabel: "Eq",
      category: "reta_rapida",
      sourceTable: "tournaments + tournament_public_config",
      ruleNote: "Parejas agrupadas en equipos con team_config válido.",
      counts: globalFormats.reta_equipos,
    },
    {
      key: "torneo_express",
      label: "Torneo Express",
      shortLabel: "TE",
      category: "torneo",
      sourceTable: "torneo_express",
      ruleNote: "Fase de grupos y eliminatoria directa (1 torneo = 1 competencia).",
      counts: globalFormats.torneo_express,
    },
    {
      key: "duelo_2v2",
      label: "Duelo 2v2",
      shortLabel: "D2v2",
      category: "reta_rapida",
      sourceTable: "duelos_2v2",
      ruleNote: "Duelos oficiales en juego o finalizados (excluye borradores y archivados).",
      counts: globalFormats.duelo_2v2,
    },
    {
      key: "liga_individual",
      label: "Liga Individual",
      shortLabel: "L.Ind",
      category: "liga",
      sourceTable: "ligas (individual_rotativo)",
      ruleNote: "Temporada completa (no cuenta jornadas ni partidos por separado).",
      counts: globalFormats.liga_individual,
    },
    {
      key: "liga_parejas",
      label: "Liga de Parejas Fijas",
      shortLabel: "L.Par",
      category: "liga",
      sourceTable: "ligas (parejas_fijas / playoffs)",
      ruleNote: "Temporada por equipos fijos (regular y playoffs).",
      counts: globalFormats.liga_parejas,
    },
    {
      key: "liga_flex",
      label: "Riviera Flex League",
      shortLabel: "Flex",
      category: "liga",
      sourceTable: "ligas (flex_league)",
      ruleNote: "Temporada flexible por jornadas (1 temporada = 1 competencia).",
      counts: globalFormats.liga_flex,
    },
  ];

  const retasTournamentsTableTotal =
    globalFormats.round_robin.total +
    globalFormats.americano.total +
    globalFormats.reta_equipos.total;

  let competenciasTotal = 0;
  let competenciasActivas = 0;
  let competenciasFinalizadas = 0;
  for (const item of formatList) {
    competenciasTotal += item.counts.total;
    competenciasActivas += item.counts.active;
    competenciasFinalizadas += item.counts.finished;
  }

  const clubesCount = accounts.filter((a) => accountHasRole(a, "club")).length;
  const coachesCount = accounts.filter((a) => accountHasRole(a, "coach")).length;
  const studentsCount = accounts.filter((a) => accountHasRole(a, "student")).length;

  return {
    clubesCount,
    coachesCount,
    studentsCount,
    totalAccountsCount: accounts.length,
    jugadoresTotal,
    jugadoresPublicos,
    competenciasTotal,
    competenciasActivas,
    competenciasFinalizadas,
    retasTournamentsTableTotal,
    formats: globalFormats,
    formatList,
    coaching: {
      coachesTotal: coachDirectory.length,
      alumnosVinculados: studentByAuth.size || studentsCount,
      clubesConCoaching: clubsWithCoaching.size,
      movimientosClases: ledgerRows.length,
    },
    accounts,
    competitions,
    activities,
    unclassifiedCount: directory.unclassified.length,
  };
}
