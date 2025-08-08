import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

console.log("🔧 Configuración de Supabase:");
console.log("URL:", supabaseUrl ? "✅ Configurada" : "❌ No configurada");
console.log("Key:", supabaseKey ? "✅ Configurada" : "❌ No configurada");

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

// Función para probar la conexión
export const testConnection = async () => {
  try {
    console.log("🧪 Probando conexión a Supabase...");
    const { error } = await supabase
      .from("tournaments")
      .select("count")
      .limit(1);

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
