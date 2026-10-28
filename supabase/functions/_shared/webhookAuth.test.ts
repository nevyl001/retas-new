import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { webhookAuthorized } from "./webhookAuth.ts";

Deno.test("el rechazo del webhook ocurre antes de tocar la cola", async () => {
  const source = await Deno.readTextFile(
    new URL("../procesar-notificaciones-evento/index.ts", import.meta.url),
  );
  const serveAt = source.indexOf("Deno.serve");
  const authAt = source.indexOf("if (!isAuthorizedWebhook(req))", serveAt);
  const rateAt = source.indexOf("checkRateLimit", serveAt);
  const idAt = source.indexOf("queueIdFromBody", serveAt);
  const claimAt = source.indexOf("tryClaimQueueEvent", serveAt);
  assertEquals(authAt > serveAt && rateAt > authAt && idAt > authAt && claimAt > idAt, true);
});

const SECRET = "webhook-secret-de-prueba";

Deno.test("sin secreto, con secreto distinto o vacío, el webhook queda rechazado", () => {
  assertEquals(webhookAuthorized(null, SECRET), false);
  assertEquals(webhookAuthorized("", SECRET), false);
  assertEquals(webhookAuthorized("otro", SECRET), false);
  assertEquals(webhookAuthorized(SECRET + "x", SECRET), false);
  assertEquals(webhookAuthorized("", ""), false);
  assertEquals(webhookAuthorized(SECRET, SECRET), true);
});
