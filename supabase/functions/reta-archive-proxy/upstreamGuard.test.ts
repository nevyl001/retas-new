import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSafeUpstreamBase } from "./upstreamGuard.ts";

Deno.test("acepta el host real de producción", () => {
  const url = assertSafeUpstreamBase("https://rivieraopen.com");
  assertEquals(url.hostname, "rivieraopen.com");
});

Deno.test("acepta un subdominio real de rivieraopen.com", () => {
  const url = assertSafeUpstreamBase("https://api.rivieraopen.com");
  assertEquals(url.hostname, "api.rivieraopen.com");
});

Deno.test("ATAQUE: rechaza http:// (sin TLS) aunque el host sea correcto", () => {
  assertThrows(() => assertSafeUpstreamBase("http://rivieraopen.com"));
});

Deno.test("ATAQUE: rechaza un host completamente ajeno", () => {
  assertThrows(() => assertSafeUpstreamBase("https://evil.com"));
});

Deno.test("ATAQUE: rechaza el truco de sufijo 'rivieraopen.com.evil.com'", () => {
  assertThrows(() => assertSafeUpstreamBase("https://rivieraopen.com.evil.com"));
});

Deno.test("ATAQUE: rechaza el truco de prefijo 'notrivieraopen.com'", () => {
  assertThrows(() => assertSafeUpstreamBase("https://notrivieraopen.com"));
});

Deno.test("ATAQUE: rechaza intento de apuntar a una IP/host interno (SSRF clásico)", () => {
  assertThrows(() => assertSafeUpstreamBase("https://169.254.169.254"));
  assertThrows(() => assertSafeUpstreamBase("https://localhost"));
  assertThrows(() => assertSafeUpstreamBase("http://127.0.0.1:8080"));
});

Deno.test("ATAQUE: rechaza un valor que no es una URL en absoluto", () => {
  assertThrows(() => assertSafeUpstreamBase("javascript:alert(1)"));
  assertThrows(() => assertSafeUpstreamBase("not-a-url"));
});
