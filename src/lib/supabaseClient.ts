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

export const supabase = createClient(supabaseUrl, supabaseKey);

export const supabasePublicRead = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "riviera-public-read",
  },
});

export const testConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from("users").select("count").limit(1);
    return !error;
  } catch {
    return false;
  }
};
