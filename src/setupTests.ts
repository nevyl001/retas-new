/**
 * Setup exclusivo de Jest (CRA: setupFilesAfterEnv → src/setupTests.*).
 * No se importa en start/build; no afecta preview ni producción.
 *
 * - scrollIntoView: JSDOM no implementa la API; los componentes reales la llaman.
 * - REACT_APP_SUPABASE_*: solo relleno si faltan (CI sin .env). No sobrescribe
 *   valores ya presentes desde el entorno del proceso de Jest.
 */

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* no-op en JSDOM */
  };
}

if (!process.env.REACT_APP_SUPABASE_URL) {
  process.env.REACT_APP_SUPABASE_URL = "https://jest-supabase-stub.supabase.co";
}

if (!process.env.REACT_APP_SUPABASE_ANON_KEY) {
  // JWT ficticio con formato válido (header.payload.sig); no es una clave real.
  process.env.REACT_APP_SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1qZXN0LXN0dWIiLCJyb2xlIjoiYW5vbiJ9.jest-stub-signature";
}

export {};
