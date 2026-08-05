/**
 * Prueba de carga (idempotencia bajo concurrencia) de finalize_reta_atomic.
 *
 * SOLO contra Supabase LOCAL (`supabase start`, ver supabase/config.toml —
 * API en el puerto 54821). Nunca apuntar esto a producción: llama al RPC
 * directamente, bypaseando el frontend (el wiring frontend queda pendiente,
 * ver plan), así que corre exactamente lo que va a correr en producción una
 * vez conectado.
 *
 * Qué prueba: N VUs llaman finalize_reta_atomic para el MISMO tournament_id
 * al mismo tiempo (simula doble toque / dos pestañas / reintento tras
 * timeout). El lock `FOR UPDATE` de la migración 0015 debe serializarlos: se
 * espera que EXACTAMENTE UNO obtenga status:'finalized' y el resto
 * status:'already_finalized' -- nunca dos 'finalized', nunca un error random
 * por condición de carrera.
 *
 * Preparación (una sola vez, con la CLI de Supabase local ya corriendo):
 *   1. supabase start
 *   2. Crear un organizador de prueba + una reta local con is_finished=false
 *      y CERO partidos (o solo partidos 'finished') -- así el payload vacío
 *      no dispara el guard de "pending_matches" y el escenario se queda
 *      enfocado en la concurrencia del lock, no en el cálculo de standings.
 *   3. Obtener un JWT válido de ese organizador (supabase login local /
 *      Studio en :54823) y el tournament_id de la reta creada.
 *
 * Uso:
 *   TOURNAMENT_ID=... AUTH_TOKEN=... k6 run k6/finalize-reta-idempotency.js
 *
 * Variables de entorno:
 *   SUPABASE_URL   default http://127.0.0.1:54821 (API local)
 *   SUPABASE_ANON_KEY  anon key local (ver .env.local.supabase-docker.bak)
 *   TOURNAMENT_ID  uuid de una reta local, is_finished=false, sin partidos
 *                  pendientes, propiedad del usuario de AUTH_TOKEN
 *   AUTH_TOKEN     JWT de ese organizador (Authorization: Bearer ...)
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

const SUPABASE_URL = __ENV.SUPABASE_URL || "http://127.0.0.1:54821";
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || "";
const TOURNAMENT_ID = __ENV.TOURNAMENT_ID || "";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

const finalizedCount = new Counter("finalize_reta_finalized_total");
const alreadyFinalizedCount = new Counter("finalize_reta_already_finalized_total");
const unexpectedCount = new Counter("finalize_reta_unexpected_total");

export const options = {
  scenarios: {
    // Escenario 1: concurrencia real -- 5 VUs disparan finalize_reta_atomic
    // para la MISMA reta en la misma iteración (una sola ola, no repetida),
    // exactamente lo que pide el spec ("doble toque", "dos pestañas").
    concurrent_finalize: {
      executor: "shared-iterations",
      vus: 5,
      iterations: 5,
      maxDuration: "30s",
    },
  },
  thresholds: {
    // Cero resultados inesperados es la condición de éxito real de esta
    // prueba -- no un percentil de latencia (integridad antes que velocidad,
    // por instrucción explícita del alcance de esta iniciativa).
    finalize_reta_unexpected_total: ["count==0"],
  },
};

export default function () {
  if (!TOURNAMENT_ID || !AUTH_TOKEN || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Faltan TOURNAMENT_ID / AUTH_TOKEN / SUPABASE_ANON_KEY -- ver preparación en el header de este archivo."
    );
  }

  const res = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/finalize_reta_atomic`,
    JSON.stringify({
      p_tournament_id: TOURNAMENT_ID,
      p_payload: { participaciones: [], ratings: [] },
      p_admin_override: false,
      p_force_partial: false,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
    }
  );

  const ok = check(res, {
    "status 200": (r) => r.status === 200,
  });

  if (!ok) {
    unexpectedCount.add(1);
    return;
  }

  let body;
  try {
    body = JSON.parse(res.body);
  } catch (e) {
    unexpectedCount.add(1);
    return;
  }

  if (body.status === "finalized") {
    finalizedCount.add(1);
  } else if (body.status === "already_finalized") {
    alreadyFinalizedCount.add(1);
  } else {
    unexpectedCount.add(1);
  }

  sleep(0.1);
}

/**
 * Verificación post-corrida (correr aparte, vía psql/Studio local, NO desde
 * k6): confirmar que finalize_reta_finalized_total == 1 en el resumen de k6
 * (exactamente un VU ganó el lock) y que no hay filas duplicadas:
 *
 *   SELECT jugador_id, tipo_evento, evento_id, resultado, count(*)
 *   FROM jugador_participaciones WHERE evento_id = '<TOURNAMENT_ID>'
 *   GROUP BY 1,2,3,4 HAVING count(*) > 1;
 *
 *   SELECT participacion_id, count(*) FROM riviera_official_points_ledger
 *   WHERE event_id = '<TOURNAMENT_ID>' GROUP BY 1 HAVING count(*) > 1;
 *
 * Ambas deben devolver cero filas.
 */
