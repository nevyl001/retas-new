import { supabase } from "./supabaseClient";

// Tipos de datos para la base de datos
export interface Tournament {
  id: string;
  name: string;
  description?: string;
  courts: number;
  is_started: boolean;
  is_finished: boolean;
  created_at: string;
  updated_at: string;
}

export interface Player {
  id: string;
  name: string;
  created_at: string;
}

export interface Pair {
  id: string;
  tournament_id: string;
  player1_id: string;
  player2_id: string;
  sets_won: number;
  games_won: number;
  points: number;
  matches_played: number;
  created_at: string;
  updated_at: string;
  player1?: Player;
  player2?: Player;
}

export interface Match {
  id: string;
  tournament_id: string;
  pair1_id: string;
  pair2_id: string;
  court: number;
  round: number;
  winner_id?: string;
  is_finished: boolean;
  scheduled_time?: string;
  created_at: string;
  updated_at: string;
  pair1?: Pair;
  pair2?: Pair;
}

export interface Game {
  id: string;
  match_id: string;
  game_number: number;
  pair1_games: number;
  pair2_games: number;
  is_tie_break: boolean;
  tie_break_pair1_points: number;
  tie_break_pair2_points: number;
  created_at: string;
  updated_at: string;
}

// Funciones para Torneos
export const createTournament = async (
  name: string,
  description?: string,
  courts: number = 1
) => {
  console.log("Creating tournament:", { name, description, courts });

  const { data, error } = await supabase
    .from("tournaments")
    .insert([{ name, description, courts }])
    .select()
    .single();

  if (error) {
    console.error("Error creating tournament:", error);
    throw error;
  }

  console.log("Tournament created successfully:", data);
  return data;
};

export const getTournaments = async () => {
  console.log("Fetching tournaments...");

  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching tournaments:", error);
    throw error;
  }

  console.log("Tournaments fetched successfully:", data);
  return data;
};

export const getTournament = async (id: string) => {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
};

export const updateTournament = async (
  id: string,
  updates: Partial<Tournament>
) => {
  const { data, error } = await supabase
    .from("tournaments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteTournament = async (id: string) => {
  const { error } = await supabase.from("tournaments").delete().eq("id", id);

  if (error) throw error;
};

// Funciones para Jugadores
export const createPlayer = async (name: string) => {
  const { data, error } = await supabase
    .from("players")
    .insert([{ name }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getPlayers = async () => {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .order("name");

  if (error) throw error;
  return data;
};

export const deletePlayer = async (id: string) => {
  const { error } = await supabase.from("players").delete().eq("id", id);

  if (error) throw error;
};

// Funciones para Parejas
export const createPair = async (
  tournamentId: string,
  player1Id: string,
  player2Id: string
) => {
  console.log("=== CREATING PAIR IN DATABASE ===");
  console.log("Tournament ID:", tournamentId);
  console.log("Player 1 ID:", player1Id);
  console.log("Player 2 ID:", player2Id);

  const { data, error } = await supabase
    .from("pairs")
    .insert([
      {
        tournament_id: tournamentId,
        player1_id: player1Id,
        player2_id: player2Id,
      },
    ])
    .select(
      `
      *,
      player1:players!player1_id(*),
      player2:players!player2_id(*)
    `
    )
    .single();

  if (error) {
    console.error("Database error creating pair:", error);
    throw error;
  }

  console.log("Pair created in database:", data);
  return data;
};

export const getPairs = async (tournamentId: string) => {
  console.log("=== FETCHING PAIRS FROM DATABASE ===");
  console.log("Tournament ID:", tournamentId);

  const { data, error } = await supabase
    .from("pairs")
    .select(
      `
      *,
      player1:players!player1_id(*),
      player2:players!player2_id(*)
    `
    )
    .eq("tournament_id", tournamentId)
    .order("created_at");

  if (error) {
    console.error("Database error fetching pairs:", error);
    throw error;
  }

  console.log("Pairs fetched from database:", data);
  return data;
};

export const updatePair = async (id: string, updates: Partial<Pair>) => {
  const { data, error } = await supabase
    .from("pairs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deletePair = async (id: string) => {
  const { error } = await supabase.from("pairs").delete().eq("id", id);

  if (error) throw error;
};

export const deletePairsByTournament = async (tournamentId: string) => {
  const { error } = await supabase
    .from("pairs")
    .delete()
    .eq("tournament_id", tournamentId);

  if (error) throw error;
};

// Funciones para Partidos
export const createMatch = async (
  tournamentId: string,
  pair1Id: string,
  pair2Id: string,
  court: number,
  round: number
) => {
  const { data, error } = await supabase
    .from("matches")
    .insert([
      {
        tournament_id: tournamentId,
        pair1_id: pair1Id,
        pair2_id: pair2Id,
        court,
        round,
      },
    ])
    .select(
      `
      *,
      pair1:pairs!pair1_id(*, player1:players!player1_id(*), player2:players!player2_id(*)),
      pair2:pairs!pair2_id(*, player1:players!player1_id(*), player2:players!player2_id(*))
    `
    )
    .single();

  if (error) throw error;
  return data;
};

export const getMatches = async (tournamentId: string) => {
  const { data, error } = await supabase
    .from("matches")
    .select(
      `
      *,
      pair1:pairs!pair1_id(*, player1:players!player1_id(*), player2:players!player2_id(*)),
      pair2:pairs!pair2_id(*, player1:players!player1_id(*), player2:players!player2_id(*))
    `
    )
    .eq("tournament_id", tournamentId)
    .order("round")
    .order("court");

  if (error) throw error;
  return data;
};

export const updateMatch = async (id: string, updates: Partial<Match>) => {
  const { data, error } = await supabase
    .from("matches")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteMatch = async (id: string) => {
  const { error } = await supabase.from("matches").delete().eq("id", id);

  if (error) throw error;
};

export const deleteMatchesByTournament = async (tournamentId: string) => {
  const { error } = await supabase
    .from("matches")
    .delete()
    .eq("tournament_id", tournamentId);

  if (error) throw error;
};

// Funciones para Juegos
export const createGame = async (matchId: string, gameNumber: number) => {
  const { data, error } = await supabase
    .from("games")
    .insert([
      {
        match_id: matchId,
        game_number: gameNumber,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getGames = async (matchId: string) => {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("match_id", matchId)
    .order("game_number");

  if (error) throw error;
  return data;
};

export const updateGame = async (id: string, updates: Partial<Game>) => {
  const { data, error } = await supabase
    .from("games")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteGame = async (id: string) => {
  const { error } = await supabase.from("games").delete().eq("id", id);

  if (error) throw error;
};
