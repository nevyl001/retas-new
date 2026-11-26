import { supabase } from "../supabaseClient";
import { getManifestByKey } from "../../club-experience/manifestCatalog";
import { ORGANIZADOR_CLUB_BINDINGS } from "../../club-experience/organizadorClubIndex";
import type { ClubBrandingKey } from "../../club-experience/types";
import {
  americanIdsFromPublicConfig,
  emptyFormatCounts,
  isDraftTournamentRow,
  teamIdsFromPublicConfig,
  type AdminCompetitionItem,
  type AdminFormatKey,
  type FormatCounts,
} from "./adminControlCenterData";

export interface AdminClubCoachItem {
  coachId: string;
  coachCode: string;
  displayName: string;
  status: string;
  createdAt: string;
}

export interface AdminClubStudentItem {
  authUserId: string;
  jugadorId: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  has_upgrade: boolean;
  upgrade_key: string | null;
  upgrade_label: string | null;
  tournaments_total: number;
  tournaments_active: number;
  tournaments_finished: number;
  retas_americano_total: number;
  retas_round_robin_total: number;
  retas_teams_total: number;
  express_total: number;
  ligas_total: number;
  duelos_total: number;
  competencias_total: number;
  competencias_activas: number;
  competencias_finalizadas: number;
  activity_total: number;
  jugadores_total: number;
  jugadores_publicos: number;
  formats: Record<AdminFormatKey, FormatCounts>;
  competitions: AdminCompetitionItem[];
  coaches: AdminClubCoachItem[];
  students: AdminClubStudentItem[];
  coaching_movements_count: number;
}

function addCount(c: FormatCounts, finished: boolean): void {
  c.total += 1;
  if (finished) c.finished += 1;
  else c.active += 1;
}

export async function fetchAdminUserDetail(
  userId: string
): Promise<AdminUserDetail | null> {
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !user) return null;

  const [
    { data: ogmRow },
    { data: tournamentsData },
    { data: expressData },
    { data: publicConfigData },
    { data: ligasData },
    { data: duelosData },
    { data: jugadoresData },
    { data: membershipsData },
    { data: coachesData },
    { data: studentsData },
    { data: ledgerData },
  ] = await Promise.all([
    supabase
      .from("organizador_game_modes")
      .select("*")
      .eq("organizador_id", userId)
      .maybeSingle(),
    supabase
      .from("tournaments")
      .select("id, user_id, is_finished, name, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("torneo_express")
      .select("id, organizador_id, nombre, estado, created_at")
      .eq("organizador_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tournament_public_config")
      .select("tournament_id, format, americano_live, team_config"),
    supabase
      .from("ligas")
      .select("id, organizador_id, nombre, modalidad, estado, created_at")
      .eq("organizador_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("duelos_2v2")
      .select("id, organizador_id, titulo, estado, archived_at, created_at")
      .eq("organizador_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("riviera_jugadores")
      .select("id, estado, visible_publico")
      .eq("organizador_id", userId),
    supabase
      .from("coach_club_memberships")
      .select("coach_id, organizador_id, status, created_at")
      .eq("organizador_id", userId),
    supabase
      .from("riviera_coaches")
      .select("id, coach_code, display_name"),
    supabase
      .from("coach_student_account_links")
      .select("auth_user_id, jugador_id, student_email, is_active, created_at")
      .eq("organizador_id", userId),
    supabase
      .from("coach_class_ledger")
      .select("id")
      .eq("organizador_id", userId),
  ]);

  const americanIds = americanIdsFromPublicConfig(
    publicConfigData as Record<string, unknown>[] | null | undefined
  );
  const teamIds = teamIdsFromPublicConfig(
    publicConfigData as Record<string, unknown>[] | null | undefined
  );

  const formats: Record<AdminFormatKey, FormatCounts> = {
    round_robin: emptyFormatCounts(),
    americano: emptyFormatCounts(),
    reta_equipos: emptyFormatCounts(),
    duelo_2v2: emptyFormatCounts(),
    torneo_express: emptyFormatCounts(),
    liga_individual: emptyFormatCounts(),
    liga_parejas: emptyFormatCounts(),
    liga_flex: emptyFormatCounts(),
  };

  const clubName = String(user.name || user.email || "Club");
  const competitions: AdminCompetitionItem[] = [];

  const realTournaments =
    tournamentsData?.filter((t) => !isDraftTournamentRow(t)) ?? [];

  for (const t of realTournaments) {
    const tid = String(t.id);
    const isFinished = t.is_finished === true;
    const title = String(t.name || "Reta").trim() || "Reta";
    const createdAt = String(t.created_at ?? "");

    if (americanIds.has(tid)) {
      addCount(formats.americano, isFinished);
      competitions.push({
        id: tid,
        title,
        formatKey: "americano",
        formatLabel: "Americano Dinámico",
        organizadorId: userId,
        organizadorName: clubName,
        status: isFinished ? "finished" : "active",
        statusLabel: isFinished ? "Finalizada" : "En curso",
        createdAt,
        publicPath: `/public/americano/${tid}`,
      });
    } else if (teamIds.has(tid)) {
      addCount(formats.reta_equipos, isFinished);
      competitions.push({
        id: tid,
        title,
        formatKey: "reta_equipos",
        formatLabel: "Reta por Equipos",
        organizadorId: userId,
        organizadorName: clubName,
        status: isFinished ? "finished" : "active",
        statusLabel: isFinished ? "Finalizada" : "En curso",
        createdAt,
        publicPath: `/public/${tid}`,
      });
    } else {
      addCount(formats.round_robin, isFinished);
      competitions.push({
        id: tid,
        title,
        formatKey: "round_robin",
        formatLabel: "Round Robin",
        organizadorId: userId,
        organizadorName: clubName,
        status: isFinished ? "finished" : "active",
        statusLabel: isFinished ? "Finalizada" : "En curso",
        createdAt,
        publicPath: `/public/${tid}`,
      });
    }
  }

  for (const row of expressData ?? []) {
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? "");
    const title = String(r.nombre ?? "Torneo Express").trim() || "Torneo Express";
    if (isDraftTournamentRow({ name: title })) continue;
    const isFinished = String(r.estado ?? "pendiente") === "finalizado";
    addCount(formats.torneo_express, isFinished);
    competitions.push({
      id,
      title,
      formatKey: "torneo_express",
      formatLabel: "Torneo Express",
      organizadorId: userId,
      organizadorName: clubName,
      status: isFinished ? "finished" : "active",
      statusLabel: isFinished ? "Finalizado" : "En curso",
      createdAt: String(r.created_at ?? ""),
      publicPath: `/torneo-express/${id}/public`,
    });
  }

  for (const row of ligasData ?? []) {
    const r = row as Record<string, unknown>;
    const estado = String(r.estado ?? "upcoming");
    if (estado === "archived") continue;
    const id = String(r.id ?? "");
    const title = String(r.nombre ?? "Liga").trim() || "Liga";
    const modalidad = String(r.modalidad ?? "individual_rotativo");
    const isFinished = estado === "completed";

    let formatKey: AdminFormatKey = "liga_individual";
    let formatLabel = "Liga Individual";
    if (modalidad === "flex_league") {
      formatKey = "liga_flex";
      formatLabel = "Riviera Flex League";
      addCount(formats.liga_flex, isFinished);
    } else if (
      modalidad === "parejas_fijas" ||
      modalidad === "parejas_fijas_playoffs"
    ) {
      formatKey = "liga_parejas";
      formatLabel = "Liga de Parejas Fijas";
      addCount(formats.liga_parejas, isFinished);
    } else {
      addCount(formats.liga_individual, isFinished);
    }

    competitions.push({
      id,
      title,
      formatKey,
      formatLabel,
      organizadorId: userId,
      organizadorName: clubName,
      status: isFinished ? "finished" : "active",
      statusLabel: isFinished ? "Finalizada" : estado === "in_progress" ? "En curso" : "Próxima",
      createdAt: String(r.created_at ?? ""),
      publicPath: `/public/liga/${id}`,
    });
  }

  for (const row of duelosData ?? []) {
    const r = row as Record<string, unknown>;
    if (r.archived_at != null) continue;
    const estado = String(r.estado ?? "borrador");
    if (estado === "borrador") continue;
    const id = String(r.id ?? "");
    const title = String(r.titulo ?? "Duelo 2 vs 2").trim() || "Duelo 2 vs 2";
    const isFinished = estado === "finalizado";
    addCount(formats.duelo_2v2, isFinished);
    competitions.push({
      id,
      title,
      formatKey: "duelo_2v2",
      formatLabel: "Duelo 2v2",
      organizadorId: userId,
      organizadorName: clubName,
      status: isFinished ? "finished" : "active",
      statusLabel: isFinished ? "Finalizado" : "En juego",
      createdAt: String(r.created_at ?? ""),
      publicPath: `/public/duelo-2v2/${id}`,
    });
  }

  competitions.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  const tournamentsTotal =
    formats.round_robin.total + formats.americano.total + formats.reta_equipos.total;
  const tournamentsActive =
    formats.round_robin.active + formats.americano.active + formats.reta_equipos.active;
  const tournamentsFinished =
    formats.round_robin.finished +
    formats.americano.finished +
    formats.reta_equipos.finished;

  const ligasTotal =
    formats.liga_individual.total +
    formats.liga_parejas.total +
    formats.liga_flex.total;

  const competenciasTotal =
    tournamentsTotal +
    formats.torneo_express.total +
    ligasTotal +
    formats.duelo_2v2.total;
  const competenciasActivas =
    tournamentsActive +
    formats.torneo_express.active +
    formats.liga_individual.active +
    formats.liga_parejas.active +
    formats.liga_flex.active +
    formats.duelo_2v2.active;
  const competenciasFinalizadas =
    tournamentsFinished +
    formats.torneo_express.finished +
    formats.liga_individual.finished +
    formats.liga_parejas.finished +
    formats.liga_flex.finished +
    formats.duelo_2v2.finished;

  let jugadoresTotal = 0;
  let jugadoresPublicos = 0;
  for (const j of jugadoresData ?? []) {
    const row = j as Record<string, unknown>;
    if (String(row.estado ?? "activo") === "archivado") continue;
    jugadoresTotal += 1;
    if (row.visible_publico === true) jugadoresPublicos += 1;
  }

  const coachById = new Map<string, { code: string; name: string }>();
  for (const c of coachesData ?? []) {
    const row = c as Record<string, unknown>;
    coachById.set(String(row.id ?? ""), {
      code: String(row.coach_code ?? "RIV-C"),
      name: String(row.display_name ?? row.coach_code ?? "Coach"),
    });
  }

  const coaches: AdminClubCoachItem[] = (membershipsData ?? []).map((m) => {
    const row = m as Record<string, unknown>;
    const cid = String(row.coach_id ?? "");
    const info = coachById.get(cid);
    return {
      coachId: cid,
      coachCode: info?.code ?? "RIV-C",
      displayName: info?.name ?? "Coach",
      status: String(row.status ?? "active"),
      createdAt: String(row.created_at ?? ""),
    };
  });

  const students: AdminClubStudentItem[] = (studentsData ?? []).map((s) => {
    const row = s as Record<string, unknown>;
    return {
      authUserId: String(row.auth_user_id ?? ""),
      jugadorId: String(row.jugador_id ?? ""),
      email: String(row.student_email ?? ""),
      isActive: row.is_active === true,
      createdAt: String(row.created_at ?? ""),
    };
  });

  // Resolver upgrade visual
  const ogm = ogmRow as
    | {
        premium_branding_enabled?: boolean | null;
        branding_key?: string | null;
      }
    | null;
  let upgradeKey: ClubBrandingKey | null = null;
  if (ogm) {
    if (ogm.premium_branding_enabled === true && ogm.branding_key?.trim()) {
      upgradeKey = ogm.branding_key.trim() as ClubBrandingKey;
    }
  } else {
    const norm = userId.trim().toLowerCase();
    const bind = ORGANIZADOR_CLUB_BINDINGS.find(
      (b) =>
        b.organizadorId.trim().toLowerCase() === norm &&
        b.active &&
        b.premiumBrandingEnabled
    );
    if (bind) upgradeKey = bind.brandingKey;
  }

  const manifest =
    upgradeKey && upgradeKey !== "riviera" ? getManifestByKey(upgradeKey) : null;
  const hasUpgrade = Boolean(manifest && manifest.brandingKey !== "riviera");
  const logoUrl =
    (user.avatar_url as string | null) ||
    (hasUpgrade
      ? manifest?.logos.dark || manifest?.logos.light || manifest?.logos.square || null
      : null);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    logo_url: logoUrl,
    created_at: user.created_at,
    updated_at: user.updated_at,
    has_upgrade: hasUpgrade,
    upgrade_key: hasUpgrade ? manifest!.brandingKey : null,
    upgrade_label: hasUpgrade ? manifest!.displayName || manifest!.brandingKey : null,
    tournaments_total: tournamentsTotal,
    tournaments_active: tournamentsActive,
    tournaments_finished: tournamentsFinished,
    retas_americano_total: formats.americano.total,
    retas_round_robin_total: formats.round_robin.total,
    retas_teams_total: formats.reta_equipos.total,
    express_total: formats.torneo_express.total,
    ligas_total: ligasTotal,
    duelos_total: formats.duelo_2v2.total,
    competencias_total: competenciasTotal,
    competencias_activas: competenciasActivas,
    competencias_finalizadas: competenciasFinalizadas,
    activity_total: competenciasTotal,
    jugadores_total: jugadoresTotal,
    jugadores_publicos: jugadoresPublicos,
    formats,
    competitions,
    coaches,
    students,
    coaching_movements_count: (ledgerData ?? []).length,
  };
}
