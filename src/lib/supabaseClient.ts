import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Faltan variables de entorno de Supabase.\n" +
    "Define REACT_APP_SUPABASE_URL y REACT_APP_SUPABASE_ANON_KEY " +
    "en tu archivo .env o en Vercel."
  );
}

const resolvedSupabaseUrl: string = supabaseUrl;
const resolvedSupabaseAnonKey: string = supabaseKey;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storageKey: "riviera-app-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Alias del singleton — evita múltiples GoTrueClient en el mismo browser context. */
export const supabasePublicRead = supabase;

/**
 * Lectura REST con la llave anónima, sin el JWT de la sesión.
 * Un usuario logueado que no es el organizador no pasa la policy de dueño;
 * el rol anon sí puede leer un evento publicado.
 */
export async function anonRestGet<T extends Record<string, unknown>>(
  table: string,
  params: Record<string, string>
): Promise<T[] | null> {
  const query = new URLSearchParams(params).toString();
  try {
    const response = await fetch(
      `${resolvedSupabaseUrl}/rest/v1/${table}?${query}`,
      {
        headers: {
          apikey: resolvedSupabaseAnonKey,
          Authorization: `Bearer ${resolvedSupabaseAnonKey}`,
          Accept: "application/json",
        },
      }
    );
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return Array.isArray(body) ? (body as T[]) : null;
  } catch {
    return null;
  }
}

export const testConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from("users").select("count").limit(1);
    return !error;
  } catch {
    return false;
  }
};
