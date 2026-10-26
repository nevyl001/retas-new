import {
  headersForApiKey,
  isJwtCredential,
  sanitizeSupabaseFetch,
  sessionTokenForRealtime,
  stripNonJwtAuthorization,
} from "./supabaseApiKey";

const LEGACY = "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.signature";

describe("headersForApiKey", () => {
  it("mantiene el Bearer cuando la clave legacy es un JWT", () => {
    expect(isJwtCredential(LEGACY)).toBe(true);
    expect(headersForApiKey(LEGACY)).toEqual({
      apikey: LEGACY,
      Accept: "application/json",
      Authorization: `Bearer ${LEGACY}`,
    });
  });

  it("no envía sb_publishable_ ni sb_secret_ como Bearer", () => {
    expect(headersForApiKey("sb_publishable_default").Authorization).toBeUndefined();
    expect(headersForApiKey("sb_secret_default").Authorization).toBeUndefined();
    expect(headersForApiKey("sb_publishable_default").apikey).toBe("sb_publishable_default");
  });
});

describe("sanitizeSupabaseFetch", () => {
  it("quita la clave nueva y conserva el JWT del usuario", async () => {
    const seen: Headers[] = [];
    const base = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return new Response("ok");
    }) as typeof fetch;
    const wrapped = sanitizeSupabaseFetch("sb_publishable_default", base);

    await wrapped("https://example.test/rest", {
      headers: { Authorization: "Bearer sb_publishable_default", apikey: "sb_publishable_default" },
    });
    await wrapped("https://example.test/auth", {
      headers: { Authorization: `Bearer ${LEGACY}` },
    });

    expect(seen[0].get("Authorization")).toBeNull();
    expect(seen[0].get("apikey")).toBe("sb_publishable_default");
    expect(seen[1].get("Authorization")).toBe(`Bearer ${LEGACY}`);
    expect(stripNonJwtAuthorization(new Headers({ Authorization: "Bearer sb_secret_default" })).get("Authorization")).toBeNull();
  });
});

describe("sessionTokenForRealtime", () => {
  it("descarta la clave pública y conserva la sesión", () => {
    expect(sessionTokenForRealtime("sb_publishable_default")).toBeNull();
    expect(sessionTokenForRealtime(null)).toBeNull();
    expect(sessionTokenForRealtime(LEGACY)).toBe(LEGACY);
  });
});
