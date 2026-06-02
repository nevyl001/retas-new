import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PairNames {
  pair_id: string;
  player1_name: string;
  player2_name: string;
}

export interface GrupoContext {
  grupoId: string | null;
  grupoNombre: string | null;
  rivales: string | null;
}

export function companeroFromPair(
  pair: { player1_id: string; player2_id: string; player1_name: string; player2_name: string },
  playerId: string,
): string | null {
  if (pair.player1_id === playerId) return pair.player2_name;
  if (pair.player2_id === playerId) return pair.player1_name;
  return null;
}

export async function fetchGrupoContextForPair(
  supabase: SupabaseClient,
  torneoId: string,
  pairId: string,
): Promise<GrupoContext> {
  const empty: GrupoContext = { grupoId: null, grupoNombre: null, rivales: null };

  const { data: grupos, error: gErr } = await supabase
    .from("torneo_express_grupos")
    .select("id, nombre")
    .eq("torneo_id", torneoId);
  if (gErr || !grupos?.length) {
    return empty;
  }

  const grupoIds = grupos.map((g) => g.id as string);
  const grupoNombreById = new Map(
    grupos.map((g) => [g.id as string, g.nombre as string]),
  );

  const { data: gp, error: gpErr } = await supabase
    .from("torneo_express_grupo_parejas")
    .select("grupo_id")
    .eq("pareja_id", pairId)
    .in("grupo_id", grupoIds)
    .maybeSingle();
  if (gpErr || !gp?.grupo_id) {
    return empty;
  }

  const grupoId = gp.grupo_id as string;
  const grupoNombre = grupoNombreById.get(grupoId) ?? null;

  const { data: otras, error: oErr } = await supabase
    .from("torneo_express_grupo_parejas")
    .select("pareja_id")
    .eq("grupo_id", grupoId)
    .neq("pareja_id", pairId);
  if (oErr || !otras?.length) {
    return { grupoId, grupoNombre, rivales: null };
  }

  const rivalPairIds = otras.map((r) => r.pareja_id as string).filter(Boolean);
  const { data: pairs, error: pErr } = await supabase
    .from("pairs_with_contact")
    .select("pair_id, player1_name, player2_name")
    .in("pair_id", rivalPairIds);
  if (pErr || !pairs?.length) {
    return { grupoId, grupoNombre, rivales: null };
  }

  const rivales = (pairs as PairNames[])
    .map((p) => `${p.player1_name} / ${p.player2_name}`)
    .join(", ");

  return { grupoId, grupoNombre, rivales: rivales || null };
}

