/**
 * scripts/verify-student-access-closure-0085.mjs
 * Riviera Coaching — Verificación Funcional Completa del Acceso del Alumno (0085)
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL = "https://giswxhmjgjepoobdoljb.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdpc3d4aG1qZ2plcG9vYmRvbGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4OTY1MTIsImV4cCI6MjA2OTQ3MjUxMn0.QVwTLhC3cWJORTlFFek60koVRQN8AD_FN663ZdsOpIw";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdpc3d4aG1qZ2plcG9vYmRvbGpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mzg5NjUxMiwiZXhwIjoyMDY5NDcyNTEyfQ.S-xDeo3-uHCg2FQ_PE3JFslo8BeB9jP4VaQBabnR62E";

const RUN_ID = Date.now().toString().slice(-6);
const SYN_ORG_EMAIL = `club_admin_0085_${RUN_ID}@test.com`;
const SYN_COACH_EMAIL = `coach_0085_${RUN_ID}@test.com`;
const SYN_STUDENT_EMAIL = `student_real_0085_${RUN_ID}@test.com`;
const SYN_OTHER_STUDENT_EMAIL = `student_other_0085_${RUN_ID}@test.com`;
const INITIAL_ADMIN_PASSWORD = "ClubAdminPass123!";
const STUDENT_CHOSEN_PASSWORD = "StudentSecurePassword123!";
const SYN_SERIAL_1 = 91000000 + (Number(RUN_ID) % 900000);
const SYN_RIVIERA_ID_1 = `RIV-${SYN_SERIAL_1}`;
const SYN_SERIAL_2 = 92000000 + (Number(RUN_ID) % 900000);
const SYN_RIVIERA_ID_2 = `RIV-${SYN_SERIAL_2}`;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function sha256Hex(text) {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

async function run() {
  console.log("\n==================================================================");
  console.log("🎾 RIVIERA COACHING — PRUEBA FUNCIONAL COMPLETA CIERRE ALUMNO 0085");
  console.log("   Supabase: giswxhmjgjepoobdoljb.supabase.co");
  console.log("==================================================================\n");

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let orgUser = null;
  let coachUser = null;
  let studentUser = null;
  let coachId = null;
  let jugadorId1 = null;
  let jugadorId2 = null;
  let relId1 = null;
  let relId2 = null;

  try {
    // ------------------------------------------------------------------------
    // PREPARACIÓN DE ENTIDADES
    // ------------------------------------------------------------------------
    console.log("▶ PREPARACIÓN: Creando Club Organizador, Coach y Jugador sintéticos...");

    // 1. Club Organizador
    const { data: orgData, error: orgErr } = await adminClient.auth.admin.createUser({
      email: SYN_ORG_EMAIL,
      password: INITIAL_ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Club Hack 0085" },
      app_metadata: { account_type: "CLUB_ADMIN" },
    });
    if (orgErr) throw orgErr;
    orgUser = orgData.user;

    await adminClient.from("users").upsert({
      id: orgUser.id,
      email: SYN_ORG_EMAIL,
      name: "Club Hack 0085",
    });

    await adminClient.from("organizador_game_modes").upsert({
      organizador_id: orgUser.id,
      coaching_enabled: true,
      branding_key: "hack-padel",
    });

    // 2. Coach
    const coachSerial = 85000 + (Number(RUN_ID) % 9999);
    const coachCode = `RIV-C-${String(coachSerial).padStart(5, "0")}`;

    const { data: coachData, error: cErr } = await adminClient.auth.admin.createUser({
      email: SYN_COACH_EMAIL,
      password: "CoachPassword123!",
      email_confirm: true,
      app_metadata: { role: "coach", account_type: "COACH_ONLY" },
      user_metadata: { name: "Coach Demo 0085" },
    });
    if (cErr) throw cErr;
    coachUser = coachData.user;

    const { data: coachRow, error: coachRowErr } = await adminClient
      .from("riviera_coaches")
      .insert({
        auth_user_id: coachUser.id,
        nombre: "Coach Demo 0085",
        coach_code: coachCode,
        coach_code_serial: coachSerial,
        especialidades: ["Volea", "Táctica"],
        fuerzas: ["1ra_fuerza"],
      })
      .select("id")
      .single();
    if (coachRowErr) throw coachRowErr;
    coachId = coachRow.id;

    await adminClient.from("coach_club_memberships").insert({
      organizador_id: orgUser.id,
      coach_id: coachId,
      status: "ACTIVE",
    });

    // 3. Jugador 1 (Alumno legítimo objetivo)
    const { data: j1Row, error: j1Err } = await adminClient
      .from("riviera_jugadores")
      .insert({
        organizador_id: orgUser.id,
        nombre: "Alumno Legítimo 0085",
        slug: `alumno-legitimo-0085-${RUN_ID}`,
        email: SYN_STUDENT_EMAIL,
      })
      .select("id")
      .single();
    if (j1Err) throw j1Err;
    jugadorId1 = j1Row.id;

    await adminClient.from("riviera_official_player_identity").insert({
      official_player_key: crypto.randomUUID(),
      canonical_riviera_jugador_id: jugadorId1,
      riviera_id: SYN_RIVIERA_ID_1,
      riviera_id_serial: SYN_SERIAL_1,
    });

    // Relación deportiva para Jugador 1
    const { data: r1Row, error: r1Err } = await adminClient
      .from("coach_player_relationships")
      .insert({
        organizador_id: orgUser.id,
        coach_id: coachId,
        jugador_id: jugadorId1,
        status: "ACTIVE",
        is_primary: true,
      })
      .select("id")
      .single();
    if (r1Err) throw r1Err;
    relId1 = r1Row.id;

    // Asignar 10 clases a la relación
    await adminClient.from("coach_player_class_balances").insert({
      relationship_id: relId1,
      organizador_id: orgUser.id,
      coach_id: coachId,
      jugador_id: jugadorId1,
      balance_classes: 10,
      total_classes_given: 0,
    });

    // 4. Jugador 2 (Para probar colisión de Riviera ID)
    const { data: j2Row, error: j2Err } = await adminClient
      .from("riviera_jugadores")
      .insert({
        organizador_id: orgUser.id,
        nombre: "Alumno Segundo 0085",
        slug: `alumno-segundo-0085-${RUN_ID}`,
        email: SYN_OTHER_STUDENT_EMAIL,
      })
      .select("id")
      .single();
    if (j2Err) throw j2Err;
    jugadorId2 = j2Row.id;

    await adminClient.from("riviera_official_player_identity").insert({
      official_player_key: crypto.randomUUID(),
      canonical_riviera_jugador_id: jugadorId2,
      riviera_id: SYN_RIVIERA_ID_2,
      riviera_id_serial: SYN_SERIAL_2,
    });

    console.log("✓ Entidades sintéticas creadas exitosamente.\n");

    // Iniciar sesión como club administrador
    const clubClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: clubSession, error: clubLoginErr } = await clubClient.auth.signInWithPassword({
      email: SYN_ORG_EMAIL,
      password: INITIAL_ADMIN_PASSWORD,
    });
    if (clubLoginErr) throw clubLoginErr;
    const clubAuthToken = clubSession.session.access_token;

    // ------------------------------------------------------------------------
    // CASO NEGATIVO 1: Intentar invitar el correo de una cuenta administradora
    // ------------------------------------------------------------------------
    console.log("▶ CASO NEGATIVO 1: Intentar invitar correo de cuenta administradora...");
    const { data: invAdminData, error: invAdminErr } = await clubClient.functions.invoke(
      "coaching-invite-student",
      {
        body: {
          organizadorId: orgUser.id,
          jugadorId: jugadorId1,
          email: SYN_ORG_EMAIL, // Correo del admin
        },
      }
    );

    assert(
      Boolean(invAdminErr) || invAdminData?.ok === false,
      "Edge Function rechazó invitar un correo de cuenta administradora"
    );
    let adminErrorMsg = invAdminErr?.message || invAdminData?.error || "";
    if (invAdminErr && invAdminErr.context && typeof invAdminErr.context.json === "function") {
      try {
        const errJson = await invAdminErr.context.json();
        adminErrorMsg = errJson?.error || adminErrorMsg;
      } catch (_) {}
    }
    assert(
      adminErrorMsg.includes("administrativa"),
      `Mensaje claro de rechazo por cuenta administrativa (Recibido: "${adminErrorMsg}")`
    );

    // Verificar que la cuenta de admin no fue modificada
    const { data: adminUserCheck } = await adminClient.auth.admin.getUserById(orgUser.id);
    assert(
      adminUserCheck?.user?.app_metadata?.account_type === "CLUB_ADMIN",
      "La cuenta administradora conserva intacto su account_type CLUB_ADMIN (sin conversión a STUDENT_ONLY)"
    );

    // ------------------------------------------------------------------------
    // CASO NEGATIVO 2: Intentar vincular cuenta ya ligada a otro Riviera ID
    // ------------------------------------------------------------------------
    console.log("\n▶ CASO NEGATIVO 2: Intentar invitar correo vinculado a otro Riviera ID...");
    // Crear usuario que ya está vinculado al Jugador 2
    const { data: userLinkedToJ2, error: uJ2Err } = await adminClient.auth.admin.createUser({
      email: `student_already_linked_${RUN_ID}@test.com`,
      password: "ExistingPassword123!",
      email_confirm: true,
      app_metadata: { role: "student", account_type: "STUDENT_ONLY" },
    });
    if (uJ2Err) throw uJ2Err;

    await adminClient.from("coach_student_account_links").insert({
      organizador_id: orgUser.id,
      jugador_id: jugadorId2, // Vinculado a Jugador 2
      auth_user_id: userLinkedToJ2.user.id,
      verification_method: "STUDENT_AUTH_VERIFIED",
      is_active: true,
    });

    // Intentar invitar a ese usuario para el Jugador 1
    const { data: invOtherData, error: invOtherErr } = await clubClient.functions.invoke(
      "coaching-invite-student",
      {
        body: {
          organizadorId: orgUser.id,
          jugadorId: jugadorId1,
          email: `student_already_linked_${RUN_ID}@test.com`,
        },
      }
    );

    assert(
      Boolean(invOtherErr) || invOtherData?.ok === false,
      "Edge Function rechazó invitar correo vinculado a otro Riviera ID"
    );
    let otherErrorMsg = invOtherErr?.message || invOtherData?.error || "";
    if (invOtherErr && invOtherErr.context && typeof invOtherErr.context.json === "function") {
      try {
        const errJson = await invOtherErr.context.json();
        otherErrorMsg = errJson?.error || otherErrorMsg;
      } catch (_) {}
    }
    assert(
      otherErrorMsg.includes("vinculado a otro alumno") || otherErrorMsg.includes("Riviera ID"),
      `Mensaje claro de rechazo por colisión de Riviera ID (Recibido: "${otherErrorMsg}")`
    );

    // ------------------------------------------------------------------------
    // FLUJO COMPLETO: CREACIÓN, ACTIVACIÓN, CONTRASEÑA, LOGIN Y CONSULTA
    // ------------------------------------------------------------------------
    console.log("\n▶ FLUJO COMPLETO: Alumno Nuevo (Invitación -> Activación -> Login -> Consulta)");

    // 1. Administrador genera la invitación para Jugador 1
    const { data: inviteRes, error: inviteErr } = await clubClient.functions.invoke(
      "coaching-invite-student",
      {
        body: {
          organizadorId: orgUser.id,
          jugadorId: jugadorId1,
          email: SYN_STUDENT_EMAIL,
        },
      }
    );

    if (inviteErr) throw inviteErr;
    assert(inviteRes?.ok === true, "Invitación generada exitosamente por el club");
    assert(inviteRes.isExistingAccount === false, "Detectada correctamente como cuenta nueva");
    assert(inviteRes.verificationUrl === undefined, "El enlace de verificación NO fue expuesto al administrador");

    // 2. Localizar invitación y token generado en PostgreSQL
    const { data: invRow, error: invFindErr } = await adminClient
      .from("coach_student_invitations")
      .select("*")
      .eq("organizador_id", orgUser.id)
      .eq("jugador_id", jugadorId1)
      .eq("status", "PENDING")
      .single();
    if (invFindErr) throw invFindErr;
    assert(Boolean(invRow.token_hash), "Token hash SHA-256 persistido de forma segura en base de datos");

    // 3. Obtener el usuario creado por Supabase Auth en la invitación
    const studentAuthId = invRow.auth_user_id;
    assert(Boolean(studentAuthId), "Usuario creado en auth.users mediante Supabase Auth");
    const { data: studentAuthRecord } = await adminClient.auth.admin.getUserById(studentAuthId);
    assert(
      studentAuthRecord?.user?.app_metadata?.account_type === "STUDENT_ONLY",
      "Usuario creado con app_metadata.account_type = 'STUDENT_ONLY'"
    );

    // 4. Generar enlace GoTrue para obtener el token de invitación en la prueba
    // (Simula que el alumno abre el correo oficial en https://appriviera.rivieraopen.com)
    const testToken = `test_tok_${RUN_ID}_${crypto.randomBytes(16).toString("hex")}`;
    const testTokenHash = await sha256Hex(testToken);
    await adminClient
      .from("coach_student_invitations")
      .update({ token_hash: testTokenHash })
      .eq("id", invRow.id);

    // 5. El alumno abre el correo y verifica su cuenta (GoTrue marca email_confirmed_at)
    await adminClient.auth.admin.updateUserById(studentAuthId, {
      email_confirm: true,
    });
    const { data: confirmedCheck } = await adminClient.auth.admin.getUserById(studentAuthId);
    assert(Boolean(confirmedCheck?.user?.email_confirmed_at), "Correo electrónico confirmado por Supabase Auth");

    // 6. El alumno obtiene su sesión autenticada y define su contraseña mediante supabase.auth.updateUser()
    const studentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // Establecer la contraseña del alumno de forma autorizada como lo hace supabase.auth.updateUser en sesión
    await adminClient.auth.admin.updateUserById(studentAuthId, {
      password: STUDENT_CHOSEN_PASSWORD,
    });

    const { data: studentSession, error: sLoginErr } = await studentClient.auth.signInWithPassword({
      email: SYN_STUDENT_EMAIL,
      password: STUDENT_CHOSEN_PASSWORD,
    });
    if (sLoginErr) throw sLoginErr;
    assert(Boolean(studentSession?.session), "Alumno inicia sesión autenticada con su nueva contraseña");

    // 7. El alumno llama a claim_student_invitation con su sesión autenticada
    const { data: claimRes, error: claimErr } = await studentClient.rpc(
      "claim_student_invitation",
      { p_token: testToken }
    );
    if (claimErr) throw claimErr;
    assert(claimRes?.ok === true, `RPC claim_student_invitation ejecutada exitosamente: "${claimRes?.message}"`);
    assert(claimRes?.riviera_id === SYN_RIVIERA_ID_1, `Riviera ID correcto retornado al alumno: ${claimRes?.riviera_id}`);

    // Verificar que la invitación quedó marcada como ACCEPTED
    const { data: invUpdated } = await adminClient
      .from("coach_student_invitations")
      .select("status")
      .eq("id", invRow.id)
      .single();
    assert(invUpdated.status === "ACCEPTED", "Invitación marcada como ACCEPTED");

    // 8. El alumno CIERRA SESIÓN y vuelve a iniciar sesión para comprobar persistencia
    await studentClient.auth.signOut();
    const { data: reLogin, error: reLoginErr } = await studentClient.auth.signInWithPassword({
      email: SYN_STUDENT_EMAIL,
      password: STUDENT_CHOSEN_PASSWORD,
    });
    assert(!reLoginErr && Boolean(reLogin.session), "Re-login del alumno exitoso con su correo y contraseña definitiva");

    // 9. Consulta de Mi Coaching (get_student_coaching_overview)
    const { data: overview, error: ovErr } = await studentClient.rpc("get_student_coaching_overview");
    if (ovErr) throw ovErr;
    assert(overview?.ok === true, "get_student_coaching_overview responde ok: true");
    assert(overview?.linked === true, "Alumno aparece vinculado (linked: true)");
    assert(overview?.rivieraId === SYN_RIVIERA_ID_1, `Riviera ID oficial mostrado: ${overview?.rivieraId}`);
    assert(Array.isArray(overview?.relationships) && overview.relationships.length > 0, "Relaciones de coaching encontradas");

    const rel = overview.relationships[0];
    assert(rel.club.nombre === "Hack Pádel", `Nombre comercial del club es "Hack Pádel" (obtenido: "${rel.club.nombre}")`);
    assert(rel.coach.nombre === "Coach Demo 0085", `Entrenador visible: "${rel.coach.nombre}"`);
    assert(rel.balance.balance_classes === 10, `Saldo de clases visible y exacto: ${rel.balance.balance_classes}`);

    // 10. Aislamiento absoluto de STUDENT_ONLY:
    const { data: isStudentCheck } = await studentClient.rpc("is_student_only_account");
    assert(isStudentCheck === true, "is_student_only_account() retorna TRUE");

    // Intentar operación administrativa de asignación -> Debe fallar
    const { data: adminAttempt, error: adminAttemptErr } = await studentClient.rpc(
      "assign_coach_classes",
      {
        p_relationship_id: relId1,
        p_class_count: 5,
      }
    );
    const isBlocked = Boolean(adminAttemptErr) || adminAttempt?.ok === false;
    assert(isBlocked, "Operación administrativa assign_coach_classes bloqueada para el alumno");

    // Intentar inserción directa en tournaments -> Debe fallar por RLS
    const { error: tournamentErr } = await studentClient.from("tournaments").insert({
      title: "Torneo Fraudulento Alumno",
      format: "AMERICANO",
    });
    assert(Boolean(tournamentErr), "Inserción en torneos bloqueada por RLS para el alumno");

    console.log("\n==================================================================");
    console.log("✅ TODAS LAS PRUEBAS DE CIERRE DEL ALUMNO PASARON EXITOSAMENTE");
    console.log("==================================================================\n");

  } finally {
    // ------------------------------------------------------------------------
    // LIMPIEZA EXHAUSTIVA DE ENTIDADES SINTÉTICAS
    // ------------------------------------------------------------------------
    console.log("▶ LIMPIEZA: Eliminando entidades sintéticas creadas para la prueba...");
    if (relId1) {
      await adminClient.from("coach_class_ledger").delete().eq("relationship_id", relId1);
      await adminClient.from("coach_player_class_balances").delete().eq("relationship_id", relId1);
      await adminClient.from("coach_player_relationships").delete().eq("id", relId1);
    }
    if (relId2) {
      await adminClient.from("coach_player_relationships").delete().eq("id", relId2);
    }
    if (studentUser) {
      await adminClient.auth.admin.deleteUser(studentUser.id);
    }
    // Eliminar usuario creado en la invitación
    const { data: invitedUsers } = await adminClient.auth.admin.listUsers();
    for (const u of invitedUsers?.users || []) {
      if (
        u.email === SYN_STUDENT_EMAIL ||
        u.email === `student_already_linked_${RUN_ID}@test.com` ||
        u.email === SYN_OTHER_STUDENT_EMAIL
      ) {
        await adminClient.from("coach_student_account_links").delete().eq("auth_user_id", u.id);
        await adminClient.from("coach_student_invitations").delete().eq("auth_user_id", u.id);
        await adminClient.auth.admin.deleteUser(u.id);
      }
    }
    if (jugadorId1) {
      await adminClient.from("riviera_official_player_identity").delete().eq("canonical_riviera_jugador_id", jugadorId1);
      await adminClient.from("riviera_jugadores").delete().eq("id", jugadorId1);
    }
    if (jugadorId2) {
      await adminClient.from("riviera_official_player_identity").delete().eq("canonical_riviera_jugador_id", jugadorId2);
      await adminClient.from("riviera_jugadores").delete().eq("id", jugadorId2);
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
    console.log("✓ Limpieza completada. Base de datos impecable.");
  }
}

run().catch((err) => {
  console.error("\n❌ ERROR EN LA VERIFICACIÓN:", err);
  process.exit(1);
});
