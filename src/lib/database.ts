import { supabase } from "./supabaseClient";

// Tipos de datos para la base de datos
export interface Tournament {
  id: string;
  name: string;
  description?: string;
  courts: number;
  is_started: boolean;
  is_finished: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Player {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface Pair {
  id: string;
  tournament_id: string;
  player1_id: string;
  player2_id: string;
  player1_name: string;
  player2_name: string;
  created_at: string;
  player1?: Player;
  player2?: Player;
}

export interface Match {
  id: string;
  tournament_id: string;
  pair1_id: string;
  pair2_id: string;
  pair1_name: string;
  pair2_name: string;
  court: number;
  round?: number;
  status: string;
  pair1_score?: number;
  pair2_score?: number;
  created_at: string;
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

// Funciones para Retas
export const createTournament = async (
  name: string,
  userId: string,
  description?: string,
  courts: number = 1
) => {
  console.log("Creating tournament:", { name, description, courts, userId });

  const { data, error } = await supabase
    .from("tournaments")
    .insert([
      {
        name,
        description,
        courts,
        user_id: userId,
        is_public: true, // Marcar como público por defecto
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Error creating tournament:", error);
    throw error;
  }

  console.log("Tournament created successfully:", data);
  return data;
};

export const getTournaments = async (userId?: string) => {
  console.log("Fetching tournaments for user:", userId);

  let query = supabase
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: false });

  // Si se proporciona userId, filtrar por usuario
  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching tournaments:", error);
    throw error;
  }

  console.log(
    "Tournaments fetched successfully:",
    data?.length || 0,
    "tournaments"
  );
  return data || [];
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
export const createPlayer = async (name: string, userId: string) => {
  // Generar email automático basado en el nombre
  const email = `${name.toLowerCase().replace(/\s+/g, "")}@padel.local`;

  console.log("Creating player:", { name, email, userId });

  const { data, error } = await supabase
    .from("players")
    .insert([
      {
        name,
        email,
        user_id: userId,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Error creating player:", error);
    throw error;
  }

  console.log("Player created successfully:", data);
  return data;
};

export const getPlayers = async (userId?: string) => {
  console.log("Fetching players for user:", userId);

  let query = supabase.from("players").select("*").order("name");

  // Si se proporciona userId, filtrar por usuario
  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching players:", error);
    throw error;
  }

  console.log("Players fetched successfully:", data?.length || 0, "players");
  return data || [];
};

export const deletePlayer = async (id: string) => {
  const { error } = await supabase.from("players").delete().eq("id", id);

  if (error) throw error;
};

// Funciones para Parejas
export const createPair = async (
  tournamentId: string,
  player1Id: string,
  player2Id: string,
  userId: string
) => {
  console.log("=== CREATING PAIR IN DATABASE ===");
  console.log("Tournament ID:", tournamentId);
  console.log("Player 1 ID:", player1Id);
  console.log("Player 2 ID:", player2Id);

  // First, get the player names from the players table
  const { data: player1, error: player1Error } = await supabase
    .from("players")
    .select("name")
    .eq("id", player1Id)
    .single();

  if (player1Error) {
    console.error("Error fetching player 1:", player1Error);
    throw player1Error;
  }

  const { data: player2, error: player2Error } = await supabase
    .from("players")
    .select("name")
    .eq("id", player2Id)
    .single();

  if (player2Error) {
    console.error("Error fetching player 2:", player2Error);
    throw player2Error;
  }

  console.log("Player 1 name:", player1.name);
  console.log("Player 2 name:", player2.name);

  const { data, error } = await supabase
    .from("pairs")
    .insert([
      {
        tournament_id: tournamentId,
        player1_id: player1Id,
        player2_id: player2Id,
        player1_name: player1.name,
        player2_name: player2.name,
        user_id: userId,
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
  round: number = 1,
  userId: string
) => {
  console.log("=== CREATING MATCH IN DATABASE ===");
  console.log("Tournament ID:", tournamentId);
  console.log("Pair 1 ID:", pair1Id);
  console.log("Pair 2 ID:", pair2Id);
  console.log("Court:", court);
  console.log("Round:", round);

  // First, get the pair names from the pairs table
  const { data: pair1, error: pair1Error } = await supabase
    .from("pairs")
    .select("player1_name, player2_name")
    .eq("id", pair1Id)
    .single();

  if (pair1Error) {
    console.error("Error fetching pair 1:", pair1Error);
    throw pair1Error;
  }

  const { data: pair2, error: pair2Error } = await supabase
    .from("pairs")
    .select("player1_name, player2_name")
    .eq("id", pair2Id)
    .single();

  if (pair2Error) {
    console.error("Error fetching pair 2:", pair2Error);
    throw pair2Error;
  }

  const pair1Name = `${pair1.player1_name}/${pair1.player2_name}`;
  const pair2Name = `${pair2.player1_name}/${pair2.player2_name}`;

  console.log("Pair 1 name:", pair1Name);
  console.log("Pair 2 name:", pair2Name);

  // Crear el objeto de inserción sin el campo round por ahora
  const insertData: any = {
    tournament_id: tournamentId,
    pair1_id: pair1Id,
    pair2_id: pair2Id,
    pair1_name: pair1Name,
    pair2_name: pair2Name,
    court,
    user_id: userId,
  };

  // Agregar round a los datos de inserción
  insertData.round = round;

  const { data, error } = await supabase
    .from("matches")
    .insert([insertData])
    .select("*")
    .single();

  if (error) {
    console.error("Database error creating match:", error);
    throw error;
  }

  console.log("Match created in database:", data);
  return data;
};

export const getMatches = async (tournamentId: string) => {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId)
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

export const deleteMatchesByTournament = async (tournamentId: string) => {
  const { error } = await supabase
    .from("matches")
    .delete()
    .eq("tournament_id", tournamentId);

  if (error) throw error;
};

// Funciones para Juegos
export const createGame = async (
  matchId: string,
  gameNumber: number,
  userId: string
) => {
  const { data, error } = await supabase
    .from("games")
    .insert([
      {
        match_id: matchId,
        game_number: gameNumber,
        user_id: userId,
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

// Nueva función para obtener todos los games de una reta
export const getTournamentGames = async (tournamentId: string) => {
  try {
    // Primero obtenemos todos los matches de la reta
    const { data: matches, error: matchesError } = await supabase
      .from("matches")
      .select("id")
      .eq("tournament_id", tournamentId);

    if (matchesError) throw matchesError;

    if (!matches || matches.length === 0) {
      return []; // No hay matches, no hay games
    }

    // Extraemos los IDs de los matches
    const matchIds = matches.map((match) => match.id);

    // Ahora obtenemos todos los games de esos matches
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .in("match_id", matchIds)
      .order("game_number");

    if (gamesError) throw gamesError;
    return games || [];
  } catch (error) {
    console.error("Error getting tournament games:", error);
    throw error;
  }
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
