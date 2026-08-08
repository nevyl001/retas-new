/**
 * Instrumentación de rendimiento del pipeline de cierre (incidente 2026-08-06:
 * cerrar una reta de 8 jugadores tardó 78.1s). Mide, para UNA ejecución real
 * de finalizeCareerEvent, tiempo por etapa + toda llamada de red (RPC/tabla)
 * con nombre, duración y si fue exitosa.
 *
 * Costo cuando no está armada (uso normal en producción): un chequeo de
 * puntero nulo por llamada a supabase.rpc/.from -- no agrega latencia
 * medible. El parche al cliente se aplica una sola vez, de forma perezosa,
 * en el primer arm().
 */
import { supabase } from "../../supabaseClient";

export type PipelineStageName =
  | "validateParticipantsMs"
  | "collectPlayerRefsMs"
  | "resolveIdentitiesMs"
  | "registerParticipationsMs"
  | "ledgerMs"
  | "ratingMs"
  | "statisticsMs"
  | "historyMs"
  | "markFinishedMs"
  | "reloadMs";

export type PipelineRequestRecord = {
  name: string;
  kind: "rpc" | "table";
  startedAtMs: number;
  durationMs: number;
  ok: boolean;
};

export type PipelineTelemetryReport = {
  tournamentId: string;
  totalMs: number;
  stages: Partial<Record<PipelineStageName, number>>;
  rpcCounts: Record<string, number>;
  requestCounts: Record<string, number>;
  players: number;
  requests: PipelineRequestRecord[];
};

type Collector = {
  stages: Partial<Record<PipelineStageName, number>>;
  requests: PipelineRequestRecord[];
  startedAt: number;
};

let active: Collector | null = null;
let patched = false;

type ThenableBuilder<T = unknown> = PromiseLike<T> & {
  then: PromiseLike<T>["then"];
};

function recordRequest(
  name: string,
  kind: "rpc" | "table",
  startedAtMs: number,
  ok: boolean
): void {
  if (!active) return;
  active.requests.push({
    name,
    kind,
    startedAtMs,
    durationMs: performance.now() - startedAtMs,
    ok,
  });
}

function wrapThenable<T>(
  builder: ThenableBuilder<T>,
  name: string,
  kind: "rpc" | "table"
): ThenableBuilder<T> {
  const startedAtMs = performance.now();
  const originalThen = builder.then.bind(builder);
  // Reemplaza solo `.then` -- el builder sigue siendo el mismo objeto
  // encadenable (select/eq/maybeSingle/etc. no se tocan), solo se observa
  // cuándo se resuelve la promesa final. Tipado laxo intencional: es un
  // parche de runtime sobre el cliente de un tercero, no código de producto.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ver comentario arriba
  (builder as { then: any }).then = (onFulfilled?: any, onRejected?: any) =>
    originalThen(
      (res: unknown) => {
        const ok = !(res && typeof res === "object" && "error" in res && (res as { error: unknown }).error);
        recordRequest(name, kind, startedAtMs, ok);
        return onFulfilled ? onFulfilled(res as T) : res;
      },
      (err: unknown) => {
        recordRequest(name, kind, startedAtMs, false);
        if (onRejected) return onRejected(err);
        throw err;
      }
    );
  return builder;
}

const WRAPPED_MARKER = Symbol("pipelineTelemetryWrapped");

/**
 * supabase.from(table) NO es awaitable hasta que se encadena .select()/
 * .insert()/.update()/.delete()/.upsert() (recién ahí el builder implementa
 * `.then`). Envolver `.then` inmediatamente después de `.from(table)` -- como
 * hacía la primera versión de este archivo -- revienta con
 * "Cannot read properties of undefined (reading 'bind')" apenas se ejecuta
 * una query real (detectado en la primera medición en vivo, incidente
 * 2026-08-06). Fix: un Proxy que recorre la cadena y envuelve `.then` recién
 * en el objeto que realmente lo tenga, sin asumir en qué método aparece.
 */
function wrapBuilderChain<T>(
  value: T,
  name: string,
  kind: "rpc" | "table"
): T {
  if (value == null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }
  const obj = value as Record<string | symbol, unknown>;
  if (obj[WRAPPED_MARKER]) return value;

  if (typeof obj.then === "function") {
    wrapThenable(value as unknown as ThenableBuilder, name, kind);
    obj[WRAPPED_MARKER] = true;
    return value;
  }

  return new Proxy(value as object, {
    get(target, prop, receiver) {
      const result = Reflect.get(target, prop, receiver);
      if (typeof result !== "function") return result;
      return function (this: unknown, ...args: unknown[]) {
        const called = (result as (...a: unknown[]) => unknown).apply(
          this === receiver ? target : this,
          args
        );
        return wrapBuilderChain(called, name, kind);
      };
    },
  }) as T;
}

function patchSupabaseClientOnce(): void {
  if (patched) return;
  patched = true;

  const originalRpc = supabase.rpc.bind(supabase);
  supabase.rpc = ((name: string, ...rest: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- passthrough wrapper, arity variable across supabase-js overloads
    const builder = (originalRpc as any)(name, ...rest);
    if (!active) return builder;
    return wrapBuilderChain(builder, name, "rpc");
  }) as typeof supabase.rpc;

  const originalFrom = supabase.from.bind(supabase);
  supabase.from = ((table: string) => {
    const builder = originalFrom(table);
    if (!active) return builder;
    return wrapBuilderChain(builder, table, "table");
  }) as typeof supabase.from;
}

/** Arma la captura de requests + etapas para UNA ejecución del pipeline. */
export function armPipelineTelemetry(): void {
  patchSupabaseClientOnce();
  active = { stages: {}, requests: [], startedAt: performance.now() };
}

/** true si hay una captura en curso (evita medir dos cierres simultáneos como uno). */
export function isPipelineTelemetryArmed(): boolean {
  return active != null;
}

/**
 * Suma `durationMs` a la etapa indicada (llamable varias veces por etapa si
 * el paso real está repartido en más de un tramo de código).
 */
export async function withStage<T>(
  stage: PipelineStageName,
  fn: () => Promise<T>
): Promise<T> {
  if (!active) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    if (active) {
      active.stages[stage] = (active.stages[stage] ?? 0) + (performance.now() - start);
    }
  }
}

/**
 * Suma `elapsedMs` a una etapa sin envolver el bloque medido en un closure
 * -- para tramos de código existentes donde envolverlos en una función
 * cambiaría el scoping de variables usadas después. Uso:
 *   const t0 = performance.now();
 *   ...código existente sin tocar...
 *   addStageMs("collectPlayerRefsMs", performance.now() - t0);
 */
export function addStageMs(stage: PipelineStageName, elapsedMs: number): void {
  if (!active) return;
  active.stages[stage] = (active.stages[stage] ?? 0) + elapsedMs;
}

/** Cierra la captura y devuelve el reporte; deja el telemetry desarmado. */
export function disarmPipelineTelemetry(
  tournamentId: string,
  players: number
): PipelineTelemetryReport | null {
  if (!active) return null;
  const collector = active;
  active = null;

  const rpcCounts: Record<string, number> = {};
  const requestCounts: Record<string, number> = {};
  for (const req of collector.requests) {
    const bucket = req.kind === "rpc" ? rpcCounts : requestCounts;
    bucket[req.name] = (bucket[req.name] ?? 0) + 1;
  }

  return {
    tournamentId,
    totalMs: performance.now() - collector.startedAt,
    stages: collector.stages,
    rpcCounts,
    requestCounts,
    players,
    requests: collector.requests,
  };
}

const TELEMETRY_LOG_PREFIX = "[career-event-pipeline:telemetry]";

declare global {
  interface Window {
    __pipelineTelemetryReports?: PipelineTelemetryReport[];
  }
}

/**
 * Log estructurado del reporte -- una sola línea, fácil de copiar de la
 * consola -- y lo apila en window.__pipelineTelemetryReports para lectura
 * programática confiable (la consola del navegador puede truncar/colapsar
 * objetos anidados; esto evita depender de eso durante la medición).
 */
export function logPipelineTelemetryReport(report: PipelineTelemetryReport): void {
  if (typeof window !== "undefined") {
    window.__pipelineTelemetryReports = window.__pipelineTelemetryReports ?? [];
    window.__pipelineTelemetryReports.push(report);
  }
  const { requests, ...summary } = report;
  // eslint-disable-next-line no-console -- reporte de diagnóstico pedido explícitamente (incidente 2026-08-06), solo cuando options.telemetry=true
  console.info(TELEMETRY_LOG_PREFIX, summary);
  if (requests.length > 0) {
    // eslint-disable-next-line no-console -- ver comentario arriba
    console.info(
      `${TELEMETRY_LOG_PREFIX} requests`,
      requests.map((r) => ({
        name: r.name,
        kind: r.kind,
        durationMs: Math.round(r.durationMs),
        ok: r.ok,
      }))
    );
  }
}
