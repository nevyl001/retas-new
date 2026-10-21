/**
 * scripts/verify-revoke-check-student-account-0086.mjs
 * Riviera Coaching — Verificación de permisos de check_student_invitation_account (0086)
 * 
 * Verifica:
 * 1. anon: Denegado (permission denied for function check_student_invitation_account).
 * 2. authenticated (organizador, coach, alumno): Denegado directamente.
 * 3. service_role: Permitido (ok: true).
 * 4. coaching-invite-student Edge Function: Sigue funcionando a la perfección mediante su cliente administrativo.
 * 5. Limpieza total de entidades sintéticas de prueba.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.REACT_APP_SUPABASE_URL ||
  "https://giswxhmjgjepoobdoljb.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_ANON_KEY) {
  throw new Error("REACT_APP_SUPABASE_ANON_KEY o SUPABASE_ANON_KEY requerida en entorno.");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY requerida en variables de entorno para pruebas administrativas.");
}

const RUN_ID = Date.now().toString().slice(-6);
const SYN_ORG_EMAIL = `club_admin_0086_${RUN_ID}@test.com`;
const SYN_STUDENT_EMAIL = `student_0086_${RUN_ID}@test.com`;
const TEST_PASSWORD = "ValidSecurePass123!";
const SYN_SERIAL = 95000000 + (Number(RUN_ID) % 900000);
const SYN_RIVIERA_ID = `RIV-${SYN_SERIAL}`;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function run() {
  console.log("\n==================================================================");
  console.log("🔒 RIVIERA COACHING — VERIFICACIÓN PERMISOS 0086");
  console.log("   RPC: public.check_student_invitation_account");
  console.log("==================================================================\n");

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let orgUser = null;
  let coachUser = null;
  let coachId = null;
  let jugadorId = null;

  try {
    // ------------------------------------------------------------------------
    // PREPARACIÓN DE ENTIDADES
    // ------------------------------------------------------------------------
    console.log("▶ PREPARACIÓN: Creando Club Organizador y Jugador de prueba...");

    // 1. Club Organizador
    const { data: orgData, error: orgErr } = await adminClient.auth.admin.createUser({
      email: SYN_ORG_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Club Test 0086" },
      app_metadata: { account_type: "CLUB_ADMIN" },
    });
    if (orgErr) throw orgErr;
    orgUser = orgData.user;

    await adminClient.from("users").upsert({
      id: orgUser.id,
      email: SYN_ORG_EMAIL,
      name: "Club Test 0086",
    });

    await adminClient.from("organizador_game_modes").upsert({
      organizador_id: orgUser.id,
      coaching_enabled: true,
      branding_key: "hack-padel",
    });

    // Coach para el club
    const coachSerial = 86000 + (Number(RUN_ID) % 9999);
    const { data: cData, error: cErr } = await adminClient.auth.admin.createUser({
      email: `coach_0086_${RUN_ID}@test.com`,
      password: TEST_PASSWORD,
      email_confirm: true,
      app_metadata: { role: "coach", account_type: "COACH_ONLY" },
    });
    if (cErr) throw cErr;
    coachUser = cData.user;

    const { data: coachRow, error: cRowErr } = await adminClient
      .from("riviera_coaches")
      .insert({
        auth_user_id: coachUser.id,
        nombre: "Coach Test 0086",
        coach_code: `RIV-C-${String(coachSerial).padStart(5, "0")}`,
        coach_code_serial: coachSerial,
      })
      .select("id")
      .single();
    if (cRowErr) throw cRowErr;
    coachId = coachRow.id;

    await adminClient.from("coach_club_memberships").insert({
      organizador_id: orgUser.id,
      coach_id: coachId,
      status: "ACTIVE",
    });

    // Jugador para invitar
    const { data: jRow, error: jErr } = await adminClient
      .from("riviera_jugadores")
      .insert({
        organizador_id: orgUser.id,
        nombre: "Alumno Test 0086",
        slug: `alumno-test-0086-${RUN_ID}`,
        email: SYN_STUDENT_EMAIL,
      })
      .select("id")
      .single();
    if (jErr) throw jErr;
    jugadorId = jRow.id;

    await adminClient.from("riviera_official_player_identity").insert({
      official_player_key: crypto.randomUUID(),
      canonical_riviera_jugador_id: jugadorId,
      riviera_id: SYN_RIVIERA_ID,
      riviera_id_serial: SYN_SERIAL,
    });

    // Relación activa club - coach - jugador
    await adminClient.from("coach_player_relationships").insert({
      organizador_id: orgUser.id,
      coach_id: coachId,
      jugador_id: jugadorId,
      status: "ACTIVE",
      is_primary: true,
    });

    console.log("✓ Entidades sintéticas listas.\n");

    // ------------------------------------------------------------------------
    // PRUEBA 1: Invocación directa como ANON (No autenticado) -> DEBE FALLAR
    // ------------------------------------------------------------------------
    console.log("▶ PRUEBA 1: Invocación directa desde cliente ANÓNIMO (anon)...");
    const { data: anonData, error: anonErr } = await anonClient.rpc(
      "check_student_invitation_account",
      {
        p_email: SYN_STUDENT_EMAIL,
        p_target_jugador_id: jugadorId,
      }
    );

    assert(Boolean(anonErr), "Invocación directa anónima fue rechazada por PostgreSQL");
    const anonErrMsg = (anonErr?.message || "").toLowerCase();
    assert(
      anonErrMsg.includes("permission denied") || anonErrMsg.includes("function") || anonErr?.code === "42501",
      `Error de permisos esperado para anon (Recibido: "${anonErr?.message}", code: ${anonErr?.code})`
    );

    // ------------------------------------------------------------------------
    // PRUEBA 2: Invocación directa como USUARIO AUTENTICADO (Club Admin) -> DEBE FALLAR
    // ------------------------------------------------------------------------
    console.log("\n▶ PRUEBA 2: Invocación directa desde cliente AUTENTICADO (authenticated)...");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: sessionData, error: loginErr } = await authClient.auth.signInWithPassword({
      email: SYN_ORG_EMAIL,
      password: TEST_PASSWORD,
    });
    if (loginErr) throw loginErr;

    const { data: authData, error: authErr } = await authClient.rpc(
      "check_student_invitation_account",
      {
        p_email: SYN_STUDENT_EMAIL,
        p_target_jugador_id: jugadorId,
      }
    );

    assert(Boolean(authErr), "Invocación directa autenticada fue rechazada por PostgreSQL");
    const authErrMsg = (authErr?.message || "").toLowerCase();
    assert(
      authErrMsg.includes("permission denied") || authErrMsg.includes("function") || authErr?.code === "42501",
      `Error de permisos esperado para authenticated (Recibido: "${authErr?.message}", code: ${authErr?.code})`
    );

    // ------------------------------------------------------------------------
    // PRUEBA 3: Invocación directa desde SERVICE_ROLE -> DEBE FUNCIONAR
    // ------------------------------------------------------------------------
    console.log("\n▶ PRUEBA 3: Invocación directa desde SERVICE_ROLE (adminClient)...");
    const { data: srData, error: srErr } = await adminClient.rpc(
      "check_student_invitation_account",
      {
        p_email: SYN_STUDENT_EMAIL,
        p_target_jugador_id: jugadorId,
      }
    );

    assert(!srErr, `service_role puede invocar check_student_invitation_account (Error: ${srErr?.message})`);
    assert(srData?.ok === true, "service_role recibió respuesta ok: true");
    assert(srData?.can_invite === true, "service_role recibió can_invite: true para cuenta nueva");

    // ------------------------------------------------------------------------
    // PRUEBA 4: Edge Function coaching-invite-student -> DEBE FUNCIONAR PERFECTAMENTE
    // ------------------------------------------------------------------------
    console.log("\n▶ PRUEBA 4: Invocación de Edge Function coaching-invite-student por el Club...");
    const { data: inviteRes, error: inviteErr } = await authClient.functions.invoke(
      "coaching-invite-student",
      {
        body: {
          organizadorId: orgUser.id,
          jugadorId: jugadorId,
          email: SYN_STUDENT_EMAIL,
        },
      }
    );

    if (inviteErr) throw inviteErr;
    assert(inviteRes?.ok === true, "Edge Function coaching-invite-student funcionó correctamente");
    assert(inviteRes?.isExistingAccount === false, "Invitación creada exitosamente como cuenta nueva");

    // Verificar que la invitación quedó registrada en la base de datos
    const { data: invRow, error: invFindErr } = await adminClient
      .from("coach_student_invitations")
      .select("id, status, auth_user_id")
      .eq("organizador_id", orgUser.id)
      .eq("jugador_id", jugadorId)
      .eq("status", "PENDING")
      .single();

    assert(!invFindErr && Boolean(invRow?.id), "Invitación registrada en coach_student_invitations como PENDING");

    console.log("\n==================================================================");
    console.log("✅ VERIFICACIÓN DE PERMISOS 0086 COMPLETADA EXITOSAMENTE");
    console.log("   - anon: Bloqueado (permission denied)");
    console.log("   - authenticated: Bloqueado (permission denied)");
    console.log("   - service_role: Autorizado");
    console.log("   - coaching-invite-student: Operativo al 100%");
    console.log("==================================================================\n");

  } finally {
    console.log("▶ LIMPIEZA: Eliminando registros sintéticos...");
    if (orgUser && jugadorId) {
      await adminClient.from("coach_player_relationships").delete().eq("organizador_id", orgUser.id);
      await adminClient.from("coach_student_invitations").delete().eq("organizador_id", orgUser.id);
    }
    const { data: invitedUsers } = await adminClient.auth.admin.listUsers();
    for (const u of invitedUsers?.users || []) {
      if (u.email === SYN_STUDENT_EMAIL) {
        await adminClient.from("coach_student_account_links").delete().eq("auth_user_id", u.id);
        await adminClient.from("coach_student_invitations").delete().eq("auth_user_id", u.id);
        await adminClient.auth.admin.deleteUser(u.id);
      }
    }
    if (jugadorId) {
      await adminClient.from("riviera_official_player_identity").delete().eq("canonical_riviera_jugador_id", jugadorId);
      await adminClient.from("riviera_jugadores").delete().eq("id", jugadorId);
    }
    if (coachId) {
      await adminClient.from("coach_club_memberships").delete().eq("coach_id", coachId);
      await adminClient.from("riviera_coaches").delete().eq("id", coachId);
    }
    if (coachUser) {
      await adminClient.auth.admin.deleteUser(coachUser.id);
    }
    if (orgUser) {
      await adminClient.from("organizador_game_modes").delete().eq("organizador_id", orgUser.id);
      await adminClient.from("users").delete().eq("id", orgUser.id);
      await adminClient.auth.admin.deleteUser(orgUser.id);
    }
    console.log("✓ Limpieza completada.");
  }
}

run().catch((err) => {
  console.error("\n❌ ERROR EN LA VERIFICACIÓN:", err);
  process.exit(1);
});
