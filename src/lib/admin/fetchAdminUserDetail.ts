import { supabase } from "../supabaseClient";

const DRAFT_DESCRIPTION = "Parejas en armado para torneo";

function isDraftTournamentRow(row: {
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

function americanIdsFromPublicConfig(
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

function teamIdsFromPublicConfig(
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

export interface AdminUserDetail {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  tournaments_total: number;
  tournaments_active: number;
  tournaments_finished: number;
  retas_americano_total: number;
  retas_round_robin_total: number;
  retas_teams_total: number;
  express_total: number;
  activity_total: number;
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
    { data: tournamentsData },
    { data: expressData },
    { data: publicConfigData },
  ] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, user_id, is_finished, name, description")
      .eq("user_id", userId),
    supabase.from("torneo_express").select("organizador_id, estado"),
    supabase.from("tournament_public_config").select("*"),
  ]);

  const americanIds = americanIdsFromPublicConfig(
    publicConfigData as Record<string, unknown>[] | null | undefined
  );
  const teamIds = teamIdsFromPublicConfig(
    publicConfigData as Record<string, unknown>[] | null | undefined
  );

  const realTournaments =
    tournamentsData?.filter((t) => !isDraftTournamentRow(t)) ?? [];

  let tournamentsActive = 0;
  let tournamentsFinished = 0;
  let americanoTotal = 0;
  let roundRobinTotal = 0;
  let teamsTotal = 0;

  for (const t of realTournaments) {
    if (t.is_finished === true) tournamentsFinished += 1;
    else tournamentsActive += 1;

    const tid = String(t.id);
    if (americanIds.has(tid)) americanoTotal += 1;
    else if (teamIds.has(tid)) teamsTotal += 1;
    else roundRobinTotal += 1;
  }

  let expressTotal = 0;
  for (const row of expressData ?? []) {
    if ((row as { organizador_id?: string }).organizador_id === userId) {
      expressTotal += 1;
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    created_at: user.created_at,
    updated_at: user.updated_at,
    tournaments_total: realTournaments.length,
    tournaments_active: tournamentsActive,
    tournaments_finished: tournamentsFinished,
    retas_americano_total: americanoTotal,
    retas_round_robin_total: roundRobinTotal,
    retas_teams_total: teamsTotal,
    express_total: expressTotal,
    activity_total: realTournaments.length + expressTotal,
  };
}
