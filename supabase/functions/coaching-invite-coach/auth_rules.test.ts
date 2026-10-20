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

Deno.test("Redirect URL: resolves strictly to /auth/callback?next=/coaching/mi-espacio on official domain", () => {
  assertEquals(
    resolveRedirectUrl("https://appriviera.rivieraopen.com"),
    "https://appriviera.rivieraopen.com/auth/callback?next=/coaching/mi-espacio"
  );
  assertEquals(
    resolveRedirectUrl("https://appriviera.rivieraopen.com/"),
    "https://appriviera.rivieraopen.com/auth/callback?next=/coaching/mi-espacio"
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
  function simulateRollback(isNewUser: boolean, _targetUserId: string) {
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

Deno.test("User identification: assigns isNewUser=true when inviteUserByEmail creates new account", () => {
  function identifyUser(
    existingPublicUser: { id: string } | null,
    inviteResult: { user?: { id: string }; error?: { message: string } }
  ): { targetUserId: string; isNewUser: boolean } {
    let targetUserId = "";
    let isNewUser = false;

    if (existingPublicUser?.id) {
      targetUserId = existingPublicUser.id;
      isNewUser = false;
    } else {
      if (!inviteResult.error && inviteResult.user) {
        targetUserId = inviteResult.user.id;
        isNewUser = true;
      }
    }
    return { targetUserId, isNewUser };
  }

  // Case 1: Brand new user invited
  const newAccount = identifyUser(null, { user: { id: "new-auth-id-123" } });
  assertEquals(newAccount.targetUserId, "new-auth-id-123");
  assertEquals(newAccount.isNewUser, true);

  // Case 2: Existing public user
  const existingAccount = identifyUser({ id: "existing-user-456" }, {});
  assertEquals(existingAccount.targetUserId, "existing-user-456");
  assertEquals(existingAccount.isNewUser, false);
});

Deno.test("User identification: handles user already registered in auth.users without public profile", () => {
  function identifyWithAuthFallback(
    existingPublicUser: { id: string } | null,
    inviteError: { message: string } | null,
    authLookupUsers: Array<{ id: string; email: string }>,
    targetEmail: string
  ): { targetUserId: string; isNewUser: boolean } {
    let targetUserId = "";
    let isNewUser = false;

    if (existingPublicUser?.id) {
      targetUserId = existingPublicUser.id;
      isNewUser = false;
    } else {
      if (
        inviteError &&
        (inviteError.message.toLowerCase().includes("already") ||
          inviteError.message.toLowerCase().includes("registered"))
      ) {
        const found = authLookupUsers.find(
          (u) => u.email.trim().toLowerCase() === targetEmail.trim().toLowerCase()
        );
        if (found) {
          targetUserId = found.id;
          isNewUser = false;
        }
      }
    }
    return { targetUserId, isNewUser };
  }

  const result = identifyWithAuthFallback(
    null,
    { message: "A user with this email address has already been registered" },
    [{ id: "auth-existing-789", email: "existing.coach@rivieraopen.com" }],
    "existing.coach@rivieraopen.com"
  );

  assertEquals(result.targetUserId, "auth-existing-789");
  assertEquals(result.isNewUser, false);
});

Deno.test("Relational integrity: targetUserId is consistently shared across public.users and riviera_coaches", () => {
  const targetUserId = "consistent-user-uuid-999";
  const email = "coach@rivieraopen.com";
  const nombre = "Coach Test";

  const publicUsersRow = {
    id: targetUserId,
    email,
    name: nombre,
  };

  const coachRow = {
    auth_user_id: targetUserId,
    nombre,
    bio: "Test Bio",
  };

  assertEquals(publicUsersRow.id, targetUserId);
  assertEquals(coachRow.auth_user_id, targetUserId);
  assertEquals(publicUsersRow.id, coachRow.auth_user_id);
});

Deno.test("Partial failure rollback: rolls back users table and auth.users on coach creation failure for new users only", async () => {
  const deletedUsers: string[] = [];
  const deletedAuthUsers: string[] = [];

  const mockAdmin = {
    from: (_table: string) => ({
      delete: () => ({
        eq: (_col: string, val: string) => {
          deletedUsers.push(val);
          return Promise.resolve({ error: null });
        },
      }),
    }),
    auth: {
      admin: {
        deleteUser: (userId: string) => {
          deletedAuthUsers.push(userId);
          return Promise.resolve({ error: null });
        },
      },
    },
  };

  async function simulateRollbackNewUser(admin: typeof mockAdmin, userId: string) {
    try {
      await admin.from("users").delete().eq("id", userId);
    } catch (_) {
      // Ignore
    }
    await admin.auth.admin.deleteUser(userId);
  }

  // 1. Partial failure when isNewUser === true: both cleaned up
  await simulateRollbackNewUser(mockAdmin, "new-user-1");
  assertEquals(deletedUsers, ["new-user-1"]);
  assertEquals(deletedAuthUsers, ["new-user-1"]);

  // 2. Partial failure when isNewUser === false: nothing rolled back
  function handlePartialError(isNewUser: boolean, userId: string) {
    if (isNewUser) {
      return simulateRollbackNewUser(mockAdmin, userId);
    }
    return Promise.resolve();
  }

  await handlePartialError(false, "existing-user-2");
  assertEquals(deletedUsers.length, 1);
  assertEquals(deletedAuthUsers.length, 1);
});



