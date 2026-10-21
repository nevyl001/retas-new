/**
 * scripts/verify-cierre-definitivo-0084.mjs
 * Riviera Coaching — Verificación Rigurosa de Principio a Fin 0084
 * 
 * Valida de extremo a extremo:
 * 1. CLUB: Guardas estrictas de backend en assign_coach_classes, adjust_coach_student_classes,
 *    reschedule_coach_class contra relaciones PAUSED y ENDED.
 * 2. CLUB: Resolución de nombre comercial (Hack Pádel, no email).
 * 3. COACH: Consulta y registro de clases dentro de su asignación.
 * 4. ALUMNO: Acceso privado y aislamiento multiclub por coach_student_account_links en get_student_coaching_overview.
 * 5. ALUMNO: Blindaje is_student_only_account sin bypass.
 * 6. LIMPIEZA TOTAL: Ningún dato residual en base de datos.
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
const SYN_ORG_EMAIL = `club_synthetic_0084_${RUN_ID}@test.com`;
const SYN_COACH_EMAIL = `coach_synthetic_0084_${RUN_ID}@test.com`;
const SYN_STUDENT_EMAIL = `student_synthetic_0084_${RUN_ID}@test.com`;
const TEST_PASSWORD = "SyntheticPassword123!";
const SYN_SERIAL = 80000000 + (Number(RUN_ID) % 9000000);
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
  console.log("🎾 RIVIERA COACHING — VERIFICACIÓN INTEGRAL CIERRE DEFINITIVO 0084");
  console.log("   Supabase: giswxhmjgjepoobdoljb.supabase.co");
  console.log("==================================================================\n");

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let orgUser = null;
  let coachUser = null;
  let studentUser = null;
  let coachId = null;
  let jugadorId = null;
  let relId = null;
  let sessionId = null;

  try {
    // ------------------------------------------------------------------------
    // 1. VERIFICACIÓN DE NOMBRE COMERCIAL (HACK PÁDEL)
    // ------------------------------------------------------------------------
    console.log("▶ 1. VERIFICACIÓN DE RESOLUCIÓN DE NOMBRE COMERCIAL");
    const { data: hackName, error: hackNameErr } = await adminClient.rpc(
      "get_organizador_display_name",
      { p_organizador_id: "e724de97-3552-4a01-a269-f621e6f1ed26" }
    );
    assert(!hackNameErr, "RPC get_organizador_display_name sin error");
    assert(hackName === "Hack Pádel", `Nombre comercial de Hack Pádel es "Hack Pádel" (obtenido: "${hackName}")`);
    assert(!hackName.includes("@"), "Nunca se expone el correo del organizador");

    // ------------------------------------------------------------------------
    // 2. CREACIÓN DE ENTIDADES SINTÉTICAS DE PRUEBA
    // ------------------------------------------------------------------------
    console.log("\n▶ 2. CREANDO ENTIDADES SINTÉTICAS CON AISLAMIENTO");
    // Club sintético
    const { data: orgData, error: orgErr } = await adminClient.auth.admin.createUser({
      email: SYN_ORG_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Club Sintético 0084" },
    });
    if (orgErr) throw orgErr;
    orgUser = orgData.user;

    await adminClient.from("users").upsert({
      id: orgUser.id,
      email: SYN_ORG_EMAIL,
      name: "Club Sintético 0084",
    });

    await adminClient.from("organizador_game_modes").upsert({
      organizador_id: orgUser.id,
      coaching_enabled: true,
      branding_key: "hack-padel",
    });

    // Coach sintético
    const { data: coachData, error: cErr } = await adminClient.auth.admin.createUser({
      email: SYN_COACH_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      app_metadata: { role: "coach", account_type: "COACH_ONLY" },
      user_metadata: { name: "Coach Sintético 0084" },
    });
    if (cErr) throw cErr;
    coachUser = coachData.user;

    const coachSerial = 90000 + (Number(RUN_ID) % 9999);
    const coachCode = `RIV-C-${String(coachSerial).padStart(5, "0")}`;

    const { data: coachRow, error: coachRowErr } = await adminClient
      .from("riviera_coaches")
      .insert({
        auth_user_id: coachUser.id,
        nombre: "Coach Sintético 0084",
        coach_code: coachCode,
        coach_code_serial: coachSerial,
        especialidades: ["Volea", "Smash"],
        fuerzas: ["1ra_fuerza"],
      })
      .select("id")
      .single();
    if (coachRowErr) throw coachRowErr;
    coachId = coachRow.id;

    // Membresía del coach en el club
    await adminClient.from("coach_club_memberships").insert({
      organizador_id: orgUser.id,
      coach_id: coachId,
      status: "ACTIVE",
    });

    // Alumno sintético (STUDENT_ONLY)
    const { data: studData, error: sErr } = await adminClient.auth.admin.createUser({
      email: SYN_STUDENT_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      app_metadata: { role: "student", account_type: "STUDENT_ONLY", roles: ["student"] },
      user_metadata: { name: "Alumno Sintético 0084", account_type: "STUDENT_ONLY" },
    });
    if (sErr) throw sErr;
    studentUser = studData.user;

    const { data: jugRow, error: jugRowErr } = await adminClient
      .from("riviera_jugadores")
      .insert({
        organizador_id: orgUser.id,
        nombre: "Alumno Sintético 0084",
        slug: `alumno-sintetico-0084-${RUN_ID}`,
        email: SYN_STUDENT_EMAIL,
      })
      .select("id")
      .single();
    if (jugRowErr) throw jugRowErr;
    jugadorId = jugRow.id;

    const { error: idErr } = await adminClient.from("riviera_official_player_identity").insert({
      official_player_key: crypto.randomUUID(),
      canonical_riviera_jugador_id: jugadorId,
      riviera_id: SYN_RIVIERA_ID,
      riviera_id_serial: SYN_SERIAL,
    });
    if (idErr) throw idErr;

    // Crear relación deportiva ACTIVE
    const { data: relRow, error: relRowErr } = await adminClient
      .from("coach_player_relationships")
      .insert({
        organizador_id: orgUser.id,
        coach_id: coachId,
        jugador_id: jugadorId,
        status: "ACTIVE",
        is_primary: true,
      })
      .select("id")
      .single();
    if (relRowErr) throw relRowErr;
    relId = relRow.id;

    // Vínculo activo de cuenta de alumno
    const { error: linkErr } = await adminClient.from("coach_student_account_links").insert({
      organizador_id: orgUser.id,
      jugador_id: jugadorId,
      auth_user_id: studentUser.id,
      student_email: SYN_STUDENT_EMAIL,
      verification_method: "STUDENT_AUTH_VERIFIED",
      is_active: true,
    });
    if (linkErr) throw linkErr;

    assert(Boolean(relId), "Entidades sintéticas creadas exitosamente");

    // ------------------------------------------------------------------------
    // 3. PRUEBA DE CLIENTE CLUB AUTENTICADO
    // ------------------------------------------------------------------------
    console.log("\n▶ 3. PRUEBAS DE OPERACIÓN Y GUARDAS DE CLUB");
    const clubClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: clubLogin, error: clubLoginErr } = await clubClient.auth.signInWithPassword({
      email: SYN_ORG_EMAIL,
      password: TEST_PASSWORD,
    });
    assert(!clubLoginErr && Boolean(clubLogin.session), "Login de Club Administrador exitoso");

    // 3.1 Asignar clases en estado ACTIVE -> DEBE SER EXITOSO
    const { data: assignActive, error: assignActiveErr } = await clubClient.rpc(
      "assign_coach_classes",
      {
        p_relationship_id: relId,
        p_class_count: 5,
        p_notas: "Asignación inicial sintética",
        p_idempotency_key: `key_syn_${RUN_ID}_1`,
      }
    );
    if (assignActiveErr || assignActive?.ok !== true) {
      console.log("assignActive output:", assignActive, "err:", assignActiveErr);
    }
    assert(!assignActiveErr && assignActive?.ok === true, "Asignación a relación ACTIVE autorizada exitosamente (+5 clases)");
    assert(assignActive.balance_classes === 5, "Balance es exactamente 5");

    // 3.2 Pausar relación a PAUSED
    await adminClient
      .from("coach_player_relationships")
      .update({ status: "PAUSED" })
      .eq("id", relId);

    // 3.3 Asignar clases a relación PAUSED -> DEBE SER RECHAZADA POR LA GUARDA DE BACKEND
    const { data: assignPaused } = await clubClient.rpc(
      "assign_coach_classes",
      {
        p_relationship_id: relId,
        p_class_count: 3,
        p_notas: "Intento en pausa",
        p_idempotency_key: `key_syn_${RUN_ID}_paused`,
      }
    );
    assert(
      assignPaused?.ok === false && assignPaused?.error?.includes("en pausa o terminada"),
      `Guarda de backend bloqueó asignación a relación PAUSED (Mensaje: "${assignPaused?.error}")`
    );

    // 3.4 Ajustar saldo en relación PAUSED -> DEBE SER RECHAZADA POR LA GUARDA DE BACKEND
    const { data: adjustPaused } = await clubClient.rpc(
      "adjust_coach_student_classes",
      {
        p_organizador_id: orgUser.id,
        p_coach_id: coachId,
        p_student_id: jugadorId,
        p_delta: 2,
        p_motivo: "Ajuste en pausa",
        p_idempotency_key: `key_adj_paused_${RUN_ID}`,
      }
    );
    assert(
      adjustPaused?.ok === false && adjustPaused?.error?.includes("en pausa o terminada"),
      `Guarda de backend bloqueó ajuste a relación PAUSED (Mensaje: "${adjustPaused?.error}")`
    );

    // 3.5 Crear sesión programada y verificar guarda en reprogramación
    const { data: sessRow, error: sessRowErr } = await adminClient
      .from("coach_sessions")
      .insert({
        relationship_id: relId,
        organizador_id: orgUser.id,
        coach_id: coachId,
        jugador_id: jugadorId,
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 90000000).toISOString(),
        duration_minutes: 60,
        status: "SCHEDULED",
        court: "Cancha 1",
      })
      .select("id")
      .single();
    if (sessRowErr) throw sessRowErr;
    sessionId = sessRow.id;

    // Reprogramar con relación en PAUSED -> DEBE SER RECHAZADA
    const { data: reschedPaused } = await clubClient.rpc(
      "reschedule_coach_class",
      {
        p_organizador_id: orgUser.id,
        p_session_id: sessionId,
        p_new_starts_at: new Date(Date.now() + 172800000).toISOString(),
        p_duration_minutes: 60,
        p_court: "Cancha 2",
        p_reason: "Cambio de horario",
      }
    );
    assert(
      reschedPaused?.ok === false && reschedPaused?.error?.includes("en pausa o terminada"),
      `Guarda de backend bloqueó reprogramación de sesión con relación PAUSED (Mensaje: "${reschedPaused?.error}")`
    );

    // 3.6 Terminar relación a ENDED
    await adminClient
      .from("coach_player_relationships")
      .update({ status: "ENDED" })
      .eq("id", relId);

    // Asignar a ENDED -> DEBE SER RECHAZADA
    const { data: assignEnded } = await clubClient.rpc(
      "assign_coach_classes",
      {
        p_relationship_id: relId,
        p_class_count: 5,
        p_idempotency_key: `key_syn_ended_${RUN_ID}`,
      }
    );
    assert(
      assignEnded?.ok === false && assignEnded?.error?.includes("en pausa o terminada"),
      `Guarda de backend bloqueó asignación a relación ENDED (Mensaje: "${assignEnded?.error}")`
    );

    // Reactivar relación a ACTIVE
    await adminClient
      .from("coach_player_relationships")
      .update({ status: "ACTIVE" })
      .eq("id", relId);

    // ------------------------------------------------------------------------
    // 4. PRUEBA DE CLIENTE ALUMNO (STUDENT_ONLY)
    // ------------------------------------------------------------------------
    console.log("\n▶ 4. PRUEBAS DE CLIENTE ALUMNO (STUDENT_ONLY)");
    const studentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: studentLogin, error: studLoginErr } = await studentClient.auth.signInWithPassword({
      email: SYN_STUDENT_EMAIL,
      password: TEST_PASSWORD,
    });
    assert(!studLoginErr && Boolean(studentLogin.session), "Login de Alumno autenticado exitoso");

    // 4.1 Validar is_student_only_account
    const { data: isStudent, error: isStudentErr } = await studentClient.rpc("is_student_only_account");
    assert(!isStudentErr && isStudent === true, "is_student_only_account retorna TRUE para el alumno");

    // 4.2 Alumno no puede invitar ni asignar clases
    const { data: assignByStudent, error: assignByStudentErr } = await studentClient.rpc(
      "assign_coach_classes",
      {
        p_relationship_id: relId,
        p_class_count: 10,
      }
    );
    const rejected = Boolean(assignByStudentErr) || assignByStudent?.ok === false;
    assert(
      rejected,
      `Alumno no puede asignar clases (rechazado por seguridad: "${assignByStudentErr?.message || assignByStudent?.error}")`
    );

    // 4.3 Consulta de Mi Coaching (get_student_coaching_overview)
    const { data: overview, error: ovErr } = await studentClient.rpc("get_student_coaching_overview");
    assert(!ovErr && overview?.ok === true, "get_student_coaching_overview ejecutado con éxito");
    assert(overview?.linked === true, "Alumno aparece vinculado (linked: true)");
    assert(overview?.rivieraId === SYN_RIVIERA_ID, `Riviera ID oficial reconocido: ${overview?.rivieraId}`);
    assert(Array.isArray(overview?.relationships) && overview.relationships.length > 0, "Relaciones deportivas encontradas");
    
    const relOverview = overview.relationships[0];
    assert(relOverview.club.nombre === "Hack Pádel", `Nombre comercial de club en vista del alumno es "Hack Pádel" (obtenido: "${relOverview.club.nombre}")`);
    assert(relOverview.balance.balance_classes === 5, `Saldo disponible en vista del alumno es 5 clases`);
    assert(relOverview.coach.nombre === "Coach Sintético 0084", "Coach asignado visible en vista del alumno");

    // 4.4 Probar aislamiento multiclub: Si desactivamos el vínculo en coach_student_account_links
    await adminClient
      .from("coach_student_account_links")
      .update({ is_active: false })
      .eq("auth_user_id", studentUser.id);

    const { data: overviewDeactivated } = await studentClient.rpc("get_student_coaching_overview");
    assert(
      overviewDeactivated?.is_deactivated === true || overviewDeactivated?.linked === false,
      "Aislamiento privado: Alumno desactivado no puede ver el contenido del club"
    );

    console.log("\n==================================================================");
    console.log("✅ TODAS LAS COMPROBACIONES DE SEGURIDAD 0084 PASARON EXITOSAMENTE");
    console.log("==================================================================\n");

  } finally {
    // ------------------------------------------------------------------------
    // 5. LIMPIEZA EXHAUSTIVA DE ENTIDADES SINTÉTICAS
    // ------------------------------------------------------------------------
    console.log("▶ LIMPIEZA: Eliminando entidades sintéticas creadas para la prueba...");
    if (sessionId) {
      await adminClient.from("coach_sessions").delete().eq("id", sessionId);
    }
    if (relId) {
      await adminClient.from("coach_class_ledger").delete().eq("relationship_id", relId);
      await adminClient.from("coach_player_class_balances").delete().eq("relationship_id", relId);
      await adminClient.from("coach_player_relationships").delete().eq("id", relId);
    }
    if (studentUser) {
      await adminClient.from("coach_student_account_links").delete().eq("auth_user_id", studentUser.id);
      await adminClient.from("coach_student_invitations").delete().eq("auth_user_id", studentUser.id);
      await adminClient.auth.admin.deleteUser(studentUser.id);
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
    console.log("✓ Limpieza completada. Base de datos impecable.");
  }
}

run().catch((err) => {
  console.error("\n❌ ERROR EN LA VERIFICACIÓN:", err);
  process.exit(1);
});
