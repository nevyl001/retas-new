import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  credentialSelectionReport,
  isJwtCredential,
  logCredentialSelection,
  readApiKeyMode,
  readPublishableCredential,
  readSecretCredential,
  sanitizeCredentialHeaders,
} from "./supabaseCredentials.ts";

const LEGACY = "eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";

function withEnv(name: string, value: string | null, run: () => void) {
  const previous = Deno.env.get(name);
  if (value === null) Deno.env.delete(name);
  else Deno.env.set(name, value);
  try {
    run();
  } finally {
    if (previous === undefined) Deno.env.delete(name);
    else Deno.env.set(name, previous);
  }
}

Deno.test("una clave sb_ no viaja como Bearer; un JWT de usuario sí", () => {
  assertEquals(isJwtCredential(LEGACY), true);
  assertEquals(isJwtCredential("sb_secret_default"), false);
  assertEquals(isJwtCredential("sb_publishable_default"), false);

  const stripped = sanitizeCredentialHeaders(
    "sb_secret_default",
    new Headers({ Authorization: "Bearer sb_secret_default" }),
  );
  assertEquals(stripped.get("apikey"), "sb_secret_default");
  assertEquals(stripped.get("Authorization"), null);

  const kept = sanitizeCredentialHeaders(
    "sb_publishable_default",
    new Headers({ Authorization: `Bearer ${LEGACY}` }),
  );
  assertEquals(kept.get("Authorization"), `Bearer ${LEGACY}`);
});

Deno.test("legacy ignora sb_* y new falla si la entrada default no es válida", () => {
  withEnv("RIVIERA_API_KEY_MODE", null, () => {
    assertEquals(readApiKeyMode(), "legacy");
    withEnv("SUPABASE_SECRET_KEYS", "{\"default\":\"sb_secret_default\"}", () => {
      withEnv("SUPABASE_SERVICE_ROLE_KEY", LEGACY, () => {
        assertEquals(readSecretCredential(), LEGACY);
      });
    });
  });

  withEnv("RIVIERA_API_KEY_MODE", "new", () => {
    withEnv("SUPABASE_SECRET_KEYS", "{\"default\":\"sb_secret_default\"}", () => {
      withEnv("RIVIERA_SUPABASE_SECRET_KEY", null, () => {
        withEnv("SUPABASE_SERVICE_ROLE_KEY", LEGACY, () => {
          assertEquals(readSecretCredential(), "sb_secret_default");
        });
      });
    });
    withEnv("SUPABASE_SECRET_KEYS", "{}", () => {
      withEnv("RIVIERA_SUPABASE_SECRET_KEY", null, () => {
        withEnv("SUPABASE_SERVICE_ROLE_KEY", LEGACY, () => {
          assertThrows(
            () => readSecretCredential(),
            Error,
            "Missing sb_secret_ for RIVIERA_API_KEY_MODE=new.",
          );
        });
      });
    });
    withEnv("SUPABASE_PUBLISHABLE_KEYS", "{\"default\":\"sb_publishable_default\"}", () => {
      assertEquals(readPublishableCredential(), "sb_publishable_default");
    });
  });

  withEnv("RIVIERA_API_KEY_MODE", "auto", () => {
    assertThrows(() => readApiKeyMode(), Error, "Invalid RIVIERA_API_KEY_MODE.");
  });
});

Deno.test("modo new acepta la alternativa y rechaza configuraciones inválidas", () => {
  const injected = "sb_secret_prueba_default";
  const custom = "sb_secret_prueba_alternativa";

  withEnv("RIVIERA_API_KEY_MODE", "legacy", () => {
    withEnv("SUPABASE_SERVICE_ROLE_KEY", LEGACY, () => {
      withEnv("RIVIERA_SUPABASE_SECRET_KEY", custom, () => {
        withEnv("SUPABASE_SECRET_KEYS", JSON.stringify({ default: injected }), () => {
          assertEquals(readSecretCredential(), LEGACY);
        });
      });
    });
  });

  withEnv("RIVIERA_API_KEY_MODE", "new", () => {
    withEnv("SUPABASE_SERVICE_ROLE_KEY", LEGACY, () => {
      withEnv("SUPABASE_SECRET_KEYS", "{}", () => {
        withEnv("RIVIERA_SUPABASE_SECRET_KEY", custom, () => {
          assertEquals(readSecretCredential(), custom);
        });
      });
      withEnv("SUPABASE_SECRET_KEYS", JSON.stringify({ default: injected }), () => {
        withEnv("RIVIERA_SUPABASE_SECRET_KEY", injected, () => {
          assertEquals(readSecretCredential(), injected);
        });
        withEnv("RIVIERA_SUPABASE_SECRET_KEY", custom, () => {
          assertThrows(
            () => readSecretCredential(),
            Error,
            "RIVIERA_SUPABASE_SECRET_KEY does not match SUPABASE_SECRET_KEYS.default.",
          );
        });
        withEnv("RIVIERA_SUPABASE_SECRET_KEY", "service-role-no-valida", () => {
          assertThrows(
            () => readSecretCredential(),
            Error,
            "RIVIERA_SUPABASE_SECRET_KEY must start with sb_secret_.",
          );
        });
      });
    });
  });
});

Deno.test("el informe de credencial dice el tipo y no el valor", () => {
  const secret = "sb_secret_valor_que_no_puede_aparecer";
  const publishable = "sb_publishable_valor_que_no_puede_aparecer";
  const legacy = "eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";
  const lines: string[] = [];
  const original = console.log;
  console.log = (line: string) => {
    lines.push(line);
  };
  try {
    withEnv("RIVIERA_API_KEY_MODE", "new", () => {
      logCredentialSelection({
        module: "coaching-activate-student",
        secret,
        publishable,
      });
      assertEquals(credentialSelectionReport({
        module: "procesar-notificaciones-evento",
        secret,
      }).publishableKind, "unused");
    });
    withEnv("RIVIERA_API_KEY_MODE", "legacy", () => {
      const report = credentialSelectionReport({
        module: "enviar-notificaciones",
        secret: legacy,
        publishable: legacy,
      });
      assertEquals(report.mode, "legacy");
      assertEquals(report.secretKind, "legacy_jwt");
    });
    withEnv("RIVIERA_API_KEY_MODE", "new", () => {
      assertThrows(
        () => credentialSelectionReport({ module: "reta-archive-proxy", secret: legacy }),
        Error,
        "Invalid secret selection for RIVIERA_API_KEY_MODE=new.",
      );
    });
  } finally {
    console.log = original;
  }
  assertEquals(lines.length, 1);
  assertEquals(lines[0].includes(secret), false);
  assertEquals(lines[0].includes(publishable), false);
  assertEquals(JSON.parse(lines[0]), {
    event: "credential_selection",
    module: "coaching-activate-student",
    mode: "new",
    secretKind: "sb_secret",
    publishableKind: "sb_publishable",
  });
});
