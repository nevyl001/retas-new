import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideQueueClaim, settleQueueClaim } from "./queueClaim.ts";

/**
 * Nivel B. No hay un proyecto Supabase aislado en este repositorio.
 * Estas pruebas simulan la cola y el destinatario. No validan producción,
 * no usan secretos reales y no envían correo.
 */
Deno.test("un evento sintético se procesa una vez y el POST repetido no reenvía", () => {
  const recipient = "buzon-de-prueba-aislado";
  let sends: string[] = [];
  let row: { estado: string; attempts: number; error_detalle: string | null } = {
    estado: "pendiente",
    attempts: 0,
    error_detalle: null,
  };

  function deliver() {
    const decision = decideQueueClaim(row);
    if (!decision.write) return { skipped: true, sends: sends.length };
    const settled = settleQueueClaim(decision.attempts, false);
    row = { ...settled };
    sends = sends.concat(recipient);
    return { skipped: false, sends: sends.length };
  }

  const first = deliver();
  const second = deliver();
  assertEquals(first, { skipped: false, sends: 1 });
  assertEquals(second, { skipped: true, sends: 1 });
  assertEquals(row.estado, "procesado");
  assertEquals(row.attempts, 1);
  assertEquals(row.error_detalle, null);
  assertEquals(sends, [recipient]);
});

Deno.test("un fallo deja intento y error, y no se reintenta solo", () => {
  const decision = decideQueueClaim({ estado: "pendiente", attempts: 0 });
  assertEquals(decision.write, true);
  if (!decision.write) return;
  const failed = settleQueueClaim(decision.attempts, true);
  assertEquals(failed, { estado: "error", attempts: 1, error_detalle: "error" });
  assertEquals(decideQueueClaim(failed).write, false);
});

Deno.test("un uuid inexistente no escribe la cola", async () => {
  assertEquals(decideQueueClaim(null), { write: false });
  assertEquals(decideQueueClaim({ estado: "procesado", attempts: 1 }).write, false);
  const source = await Deno.readTextFile(
    new URL("../procesar-notificaciones-evento/index.ts", import.meta.url),
  );
  const guard = source.indexOf("if (!decision.write) return null;");
  const update = source.indexOf("estado: \"procesando\"");
  assertEquals(guard > 0 && update > guard, true);
});
