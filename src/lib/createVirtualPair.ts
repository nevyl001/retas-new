import { isValidUuid } from "./db/schemaHelpers";
import { supabase } from "./supabaseClient";
import { normalizeVirtualPairLabel } from "./torneoExpress/virtualPairDraft";

export type VirtualPairRow = {
  id: string;
  tournament_id: string;
  is_virtual: true;
  virtual_label: string;
  player1_id: null;
  player2_id: null;
  player1_name: null;
  player2_name: null;
};

/**
 * Inserta una plaza virtual en `pairs`.
 * No crea jugadores ni reutiliza `createPair`.
 */
export async function createVirtualPair(input: {
  tournamentId: string;
  virtualLabel: string;
}): Promise<VirtualPairRow> {
  const tournamentId = input.tournamentId?.trim() ?? "";
  const virtualLabel = normalizeVirtualPairLabel(input.virtualLabel);
  if (!tournamentId || !isValidUuid(tournamentId)) {
    throw new Error("Falta tournament_id válido");
  }
  if (!virtualLabel) {
    throw new Error("Escribe un nombre para la pareja virtual");
  }

  const payload = {
    tournament_id: tournamentId,
    is_virtual: true,
    virtual_label: virtualLabel,
    player1_id: null,
    player2_id: null,
    player1_name: null,
    player2_name: null,
  };

  const { data, error } = await supabase
    .from("pairs")
    .insert([payload])
    .select(
      "id, tournament_id, is_virtual, virtual_label, player1_id, player2_id, player1_name, player2_name"
    )
    .single();

  if (error) throw error;
  return readVirtualPairRow(data);
}

function readVirtualPairRow(data: unknown): VirtualPairRow {
  if (!data || typeof data !== "object") {
    throw new Error("No se pudo crear la pareja virtual");
  }
  const row = data as Record<string, unknown>;
  const id = row.id;
  const tournamentId = row.tournament_id;
  const virtualLabel = row.virtual_label;
  if (
    typeof id !== "string" ||
    typeof tournamentId !== "string" ||
    typeof virtualLabel !== "string" ||
    row.is_virtual !== true ||
    row.player1_id != null ||
    row.player2_id != null ||
    row.player1_name != null ||
    row.player2_name != null
  ) {
    throw new Error("La pareja virtual no quedó en la forma esperada");
  }
  return {
    id,
    tournament_id: tournamentId,
    is_virtual: true,
    virtual_label: virtualLabel,
    player1_id: null,
    player2_id: null,
    player1_name: null,
    player2_name: null,
  };
}

/** Cambia solo la etiqueta. La plaza sigue siendo virtual. */
export async function updateVirtualPairLabel(
  pairId: string,
  virtualLabel: string
): Promise<void> {
  const id = pairId?.trim() ?? "";
  const label = normalizeVirtualPairLabel(virtualLabel);
  if (!id || !isValidUuid(id)) {
    throw new Error("Falta el id de la pareja");
  }
  if (!label) {
    throw new Error("Escribe un nombre para la pareja virtual");
  }

  const { error } = await supabase
    .from("pairs")
    .update({ virtual_label: label })
    .eq("id", id);

  if (error) throw error;
}
