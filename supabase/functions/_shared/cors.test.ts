import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAllowedOrigin, corsHeaders } from "./cors.ts";

function reqWithOrigin(origin: string | null): Request {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  return new Request("https://example.supabase.co/functions/v1/x", { headers });
}

Deno.test("acepta el origin real de producción", () => {
  assertEquals(isAllowedOrigin("https://appriviera.rivieraopen.com"), true);
});

Deno.test("acepta el sitio oficial rivieraopen.com", () => {
  assertEquals(isAllowedOrigin("https://www.rivieraopen.com"), true);
  assertEquals(isAllowedOrigin("https://rivieraopen.com"), true);
});

Deno.test("acepta un preview real de Vercel del proyecto", () => {
  assertEquals(isAllowedOrigin("https://retas-new-abc123xyz.vercel.app"), true);
});

Deno.test("ATAQUE: rechaza un origin completamente ajeno", () => {
  assertEquals(isAllowedOrigin("https://evil.com"), false);
});

Deno.test("ATAQUE: rechaza el truco de subdominio 'rivieraopen.com.evil.com'", () => {
  assertEquals(isAllowedOrigin("https://rivieraopen.com.evil.com"), false);
});

Deno.test("ATAQUE: rechaza un preview de Vercel de OTRO proyecto (no retas-new-*)", () => {
  assertEquals(isAllowedOrigin("https://otro-proyecto-abc123.vercel.app"), false);
});

Deno.test("ATAQUE: rechaza null/vacío (sin header Origin)", () => {
  assertEquals(isAllowedOrigin(null), false);
  assertEquals(isAllowedOrigin(""), false);
});

Deno.test("ATAQUE: origin no autorizado no recibe Access-Control-Allow-Origin en la respuesta", () => {
  const headers = corsHeaders(reqWithOrigin("https://evil.com"));
  assertEquals("Access-Control-Allow-Origin" in headers, false);
});

Deno.test("origin autorizado SÍ recibe Access-Control-Allow-Origin reflejando exactamente ese origin", () => {
  const headers = corsHeaders(reqWithOrigin("https://appriviera.rivieraopen.com"));
  assertEquals(headers["Access-Control-Allow-Origin"], "https://appriviera.rivieraopen.com");
});

Deno.test("toda respuesta incluye Vary: Origin (para no envenenar caches compartidos)", () => {
  const allowed = corsHeaders(reqWithOrigin("https://rivieraopen.com"));
  const denied = corsHeaders(reqWithOrigin("https://evil.com"));
  assertEquals(allowed["Vary"], "Origin");
  assertEquals(denied["Vary"], "Origin");
});
