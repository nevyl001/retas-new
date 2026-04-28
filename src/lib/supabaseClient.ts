import { createClient } from "@supabase/supabase-js";

const FALLBACK_SUPABASE_URL = "https://giswxhmjgjepoobdoljb.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdpc3d4aG1qZ2plcG9vYmRvbGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4OTY1MTIsImV4cCI6MjA2OTQ3MjUxMn0.QVwTLhC3cWJORTlFFek60koVRQN8AD_FN663ZdsOpIw";
const BROKEN_SUPABASE_URL = "https://cjdgebqralybtyhiuwmq.supabase.co";

const rawSupabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const rawSupabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

const useEmergencyFallback = rawSupabaseUrl === BROKEN_SUPABASE_URL;
const supabaseUrl = useEmergencyFallback
  ? FALLBACK_SUPABASE_URL
  : rawSupabaseUrl;
const supabaseKey = useEmergencyFallback
  ? FALLBACK_SUPABASE_ANON_KEY
  : rawSupabaseKey;

console.log("🔧 Configuración de Supabase:");
console.log("URL:", supabaseUrl ? "✅ Configurada" : "❌ No configurada");
console.log("Key:", supabaseKey ? "✅ Configurada" : "❌ No configurada");
if (useEmergencyFallback) {
  console.warn(
    "⚠️ Detectada URL de Supabase caída en env. Se aplicó fallback automático al proyecto activo."
  );
}

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Error: Supabase environment variables are not configured!");
  console.error("Please create a .env file with the following variables:");
  console.error("REACT_APP_SUPABASE_URL=your_supabase_project_url");
  console.error("REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key");
  console.error(
    "You can get these values from your Supabase project settings."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder_key"
);

// Nota: no exportar cliente con service role aquí. Esa clave no puede ir en el bundle
// del navegador (cualquiera la extrae). Borrado en Auth: panel Supabase o Edge Function.

// Función para probar la conexión
export const testConnection = async () => {
  try {
    console.log("🧪 Probando conexión a Supabase...");
    console.log("🔗 URL:", supabaseUrl);
    console.log("🔑 Key:", supabaseKey ? "Configurada" : "No configurada");

    const { error } = await supabase.from("users").select("count").limit(1);

    if (error) {
      console.error("❌ Error de conexión:", error);
      return false;
    }

    console.log("✅ Conexión exitosa a Supabase");
    return true;
  } catch (err) {
    console.error("❌ Error de conexión:", err);
    return false;
  }
};
