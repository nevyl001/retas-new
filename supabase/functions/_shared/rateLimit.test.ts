/**
 * Pruebas de integración REALES contra Postgres local (supabase start,
 * migración 0006_edge_rate_limit.sql aplicada) — no mocks. Ejecutar con:
 *
 *   supabase start
 *   SUPABASE_URL=http://127.0.0.1:54821 \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role local> \
 *   deno test --allow-net --allow-env supabase/functions/_shared/rateLimit.test.ts
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitedResponse } from "./rateLimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const canRunIntegration = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

function uniqueBucket(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

Deno.test({
  name: "permite solicitudes dentro del límite y expone remaining decreciente",
  ignore: !canRunIntegration,
  fn: async () => {
    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
    const bucket = uniqueBucket("test:normal");

    const r1 = await checkRateLimit(admin, bucket, 5, 60);
    assertEquals(r1.allowed, true);
    assertEquals(r1.remaining, 4);

    const r2 = await checkRateLimit(admin, bucket, 5, 60);
    assertEquals(r2.allowed, true);
    assertEquals(r2.remaining, 3);
  },
});

Deno.test({
  name: "ATAQUE: ráfaga por encima del límite es rechazada con 429 y Retry-After > 0",
  ignore: !canRunIntegration,
  fn: async () => {
    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
    const bucket = uniqueBucket("test:burst");
    const limit = 3;

    const results = [];
    for (let i = 0; i < limit + 4; i++) {
      results.push(await checkRateLimit(admin, bucket, limit, 60));
    }

    const allowed = results.filter((r) => r.allowed);
    const rejected = results.filter((r) => !r.allowed);

    assertEquals(allowed.length, limit, "solo las primeras `limit` deben pasar");
    assertEquals(rejected.length, 4, "el resto de la ráfaga debe ser rechazado");

    for (const r of rejected) {
      assertEquals(r.allowed, false);
      assert(r.retryAfterSeconds > 0, "Retry-After debe ser > 0 en un rechazo");
    }

    // La respuesta HTTP real que vería el atacante: 429 + header Retry-After.
    const response = rateLimitedResponse(rejected[0], {});
    assertEquals(response.status, 429);
    assert(Number(response.headers.get("Retry-After")) > 0);
    const body = await response.json();
    assertEquals(typeof body.error, "string");
  },
});

Deno.test({
  name: "ATAQUE: 15 requests concurrentes al mismo bucket no exceden el límite (sin condición de carrera)",
  ignore: !canRunIntegration,
  fn: async () => {
    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
    const bucket = uniqueBucket("test:concurrent");
    const limit = 5;

    const results = await Promise.all(
      Array.from({ length: 15 }, () => checkRateLimit(admin, bucket, limit, 60))
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    assertEquals(
      allowedCount,
      limit,
      "el conteo atómico en Postgres debe permitir EXACTAMENTE `limit`, incluso bajo concurrencia"
    );
  },
});

Deno.test({
  name: "buckets distintos no interfieren entre sí (aislamiento por clave)",
  ignore: !canRunIntegration,
  fn: async () => {
    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
    const bucketA = uniqueBucket("test:isolated:a");
    const bucketB = uniqueBucket("test:isolated:b");

    for (let i = 0; i < 3; i++) await checkRateLimit(admin, bucketA, 3, 60);
    const rA = await checkRateLimit(admin, bucketA, 3, 60);
    const rB = await checkRateLimit(admin, bucketB, 3, 60);

    assertEquals(rA.allowed, false, "bucket A ya agotó su límite");
    assertEquals(rB.allowed, true, "bucket B es independiente y no debe verse afectado");
  },
});

if (!canRunIntegration) {
  Deno.test(
    "aviso: pruebas de integración omitidas (falta SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY locales)",
    () => {
      console.warn(
        "rateLimit.test.ts: integración omitida — exportar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de `supabase status -o env` con el stack local levantado."
      );
    }
  );
}
