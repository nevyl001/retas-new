/**
 * Deduplicación in-flight mínima (misma key = misma Promise).
 * Sin cache persistente: se limpia al resolver/rechazar.
 */
const inflight = new Map<string, Promise<unknown>>();

export function dedupeInflight<T>(
  key: string,
  factory: () => Promise<T>
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = factory().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}
