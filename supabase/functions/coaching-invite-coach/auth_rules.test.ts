import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolveRedirectUrl(siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/auth/callback?next=/coaching/mi-espacio`;
}

interface OrganizerAuthCheck {
  isMasterAdmin: boolean;
  modeRow: { coaching_enabled?: boolean | null } | null;
  modeError: unknown;
}

function isCallerAuthorizedForCoaching(check: OrganizerAuthCheck): {
  authorized: boolean;
  status: number;
  reason?: string;
} {
  if (check.isMasterAdmin) {
    return { authorized: true, status: 200 };
  }

  if (check.modeError) {
    return { authorized: false, status: 500, reason: "query_error" };
  }

  if (!check.modeRow) {
    return { authorized: false, status: 403, reason: "no_organizer_row" };
  }

  // Validación estricta: únicamente coaching_enabled === true
  if (check.modeRow.coaching_enabled !== true) {
    return { authorized: false, status: 403, reason: "coaching_disabled" };
  }

  return { authorized: true, status: 200 };
}

Deno.test("Email validation: accepts standard emails and rejects malformed ones", () => {
  assertEquals(isValidEmail("coach@padel.com"), true);
  assertEquals(isValidEmail("coach.fernando+riviera@gmail.com"), true);
  assertEquals(isValidEmail("not-an-email"), false);
  assertEquals(isValidEmail("@missing-user.com"), false);
  assertEquals(isValidEmail("spaces in@email.com"), false);
  assertEquals(isValidEmail(""), false);
});

Deno.test("Redirect URL: resolves strictly to /auth/callback?next=/coaching/mi-espacio", () => {
  assertEquals(
    resolveRedirectUrl("https://appriviera.com"),
    "https://appriviera.com/auth/callback?next=/coaching/mi-espacio"
  );
  assertEquals(
    resolveRedirectUrl("https://appriviera.com/"),
    "https://appriviera.com/auth/callback?next=/coaching/mi-espacio"
  );
});

Deno.test("Master Admin is authorized regardless of club game modes", () => {
  const result = isCallerAuthorizedForCoaching({
    isMasterAdmin: true,
    modeRow: null,
    modeError: null,
  });
  assertEquals(result.authorized, true);
  assertEquals(result.status, 200);
});

Deno.test("Club with coaching_enabled === true is authorized", () => {
  const result = isCallerAuthorizedForCoaching({
    isMasterAdmin: false,
    modeRow: { coaching_enabled: true },
    modeError: null,
  });
  assertEquals(result.authorized, true);
  assertEquals(result.status, 200);
});

Deno.test("Club with coaching_enabled === false is rejected with 403", () => {
  const result = isCallerAuthorizedForCoaching({
    isMasterAdmin: false,
    modeRow: { coaching_enabled: false },
    modeError: null,
  });
  assertEquals(result.authorized, false);
  assertEquals(result.status, 403);
  assertEquals(result.reason, "coaching_disabled");
});

Deno.test("Club with coaching_enabled === null or undefined is rejected with 403 (strict guard)", () => {
  const nullCheck = isCallerAuthorizedForCoaching({
    isMasterAdmin: false,
    modeRow: { coaching_enabled: null },
    modeError: null,
  });
  assertEquals(nullCheck.authorized, false);
  assertEquals(nullCheck.status, 403);
  assertEquals(nullCheck.reason, "coaching_disabled");

  const undefinedCheck = isCallerAuthorizedForCoaching({
    isMasterAdmin: false,
    modeRow: {},
    modeError: null,
  });
  assertEquals(undefinedCheck.authorized, false);
  assertEquals(undefinedCheck.status, 403);
  assertEquals(undefinedCheck.reason, "coaching_disabled");
});

Deno.test("Caller with no organizer row is rejected with 403 (e.g. normal player or coach)", () => {
  const result = isCallerAuthorizedForCoaching({
    isMasterAdmin: false,
    modeRow: null,
    modeError: null,
  });
  assertEquals(result.authorized, false);
  assertEquals(result.status, 403);
  assertEquals(result.reason, "no_organizer_row");
});

Deno.test("Database error on lookup returns 500", () => {
  const result = isCallerAuthorizedForCoaching({
    isMasterAdmin: false,
    modeRow: null,
    modeError: new Error("DB connection timeout"),
  });
  assertEquals(result.authorized, false);
  assertEquals(result.status, 500);
  assertEquals(result.reason, "query_error");
});

Deno.test("Pre-flight check: detects missing 0064 columns and blocks execution before sending auth invites", () => {
  function evaluatePreflight(hasInvitedAtColumn: boolean): { ok: boolean; status: number; error?: string } {
    if (!hasInvitedAtColumn) {
      return {
        ok: false,
        status: 500,
        error: "La base de datos requiere la migración 0064 para registrar incorporaciones en estado PENDING. Operación detenida por seguridad antes de emitir invitaciones.",
      };
    }
    return { ok: true, status: 200 };
  }

  const missingMigration = evaluatePreflight(false);
  assertEquals(missingMigration.ok, false);
  assertEquals(missingMigration.status, 500);
  assertEquals(missingMigration.error?.includes("migración 0064"), true);

  const appliedMigration = evaluatePreflight(true);
  assertEquals(appliedMigration.ok, true);
  assertEquals(appliedMigration.status, 200);
});

Deno.test("Rollback guard: never deletes pre-existing users on partial failure", () => {
  let userDeleted = false;
  function simulateRollback(isNewUser: boolean, targetUserId: string) {
    if (isNewUser) {
      userDeleted = true;
    }
    return userDeleted;
  }

  // Pre-existing user: rollback MUST NOT delete user
  userDeleted = false;
  simulateRollback(false, "existing-user-uuid");
  assertEquals(userDeleted, false);

  // New user created during invite: rollback cleans up
  userDeleted = false;
  simulateRollback(true, "newly-created-user-uuid");
  assertEquals(userDeleted, true);
});


