/**
 * Una clave sb_publishable_ o sb_secret_ no es un JWT.
 * Solo un JWT legacy o el access token del usuario puede ir en Authorization.
 * El navegador no cambia de clave solo: usa el valor que el build recibió.
 * Mantener esta comprobación igual que supabase/functions/_shared/supabaseCredentials.ts.
 */
export function isJwtCredential(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return false;
  return parts.every((part) => part.length > 0 && !/\s/.test(part));
}

export function headersForApiKey(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: apiKey,
    Accept: "application/json",
  };
  if (isJwtCredential(apiKey)) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

/** Quita un Bearer que no es JWT. Conserva el access token del usuario. */
export function stripNonJwtAuthorization(headers: Headers, apiKey?: string): Headers {
  const next = new Headers(headers);
  if (apiKey && !next.has("apikey")) next.set("apikey", apiKey);
  const authorization = next.get("Authorization");
  if (!authorization) return next;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!isJwtCredential(token)) next.delete("Authorization");
  return next;
}

/**
 * El SDK 2.114.0 pone la clave del proyecto en Authorization cuando no hay sesión.
 * Esta envoltura deja pasar solo JWT reales hacia REST, Auth, Storage y Functions.
 */
export function sanitizeSupabaseFetch(
  apiKey: string,
  baseFetch: typeof fetch = fetch
): typeof fetch {
  return (input, init) => {
    const headers = stripNonJwtAuthorization(new Headers(init?.headers), apiKey);
    return baseFetch(input, { ...init, headers });
  };
}

/** Realtime solo acepta el JWT de la sesión, nunca la clave pública nueva. */
export function sessionTokenForRealtime(token: string | null | undefined): string | null {
  return token && isJwtCredential(token) ? token : null;
}
