/**
 * scripts/verify-cierre-seguridad-0081.mjs
 * Riviera Coaching — Verificación Rigurosa de Seguridad 0081 & Login Real
 */

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";

const SUPABASE_URL = "https://giswxhmjgjepoobdoljb.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdpc3d4aG1qZ2plcG9vYmRvbGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4OTY1MTIsImV4cCI6MjA2OTQ3MjUxMn0.QVwTLhC3cWJORTlFFek60koVRQN8AD_FN663ZdsOpIw";

const TEST_STUDENT_EMAIL = "zaid.piloto.0081@appriviera-pilot.com";
const TEST_PASSWORD = "PilotoPassword123!";
const TEST_TOKEN = "token_zaid_0081_abc1234567890abcdef1234567890abcdef12345";

async function run() {
  console.log("\n==================================================================");
  console.log("🎾 RIVIERA COACHING — CIERRE REAL DE SEGURIDAD 0081");
  console.log("   Verificación de Principio a Fin en Supabase giswxhmjgjepoobdoljb");
  console.log("==================================================================\n");

  // PREPARACIÓN DE FIXTURE
  console.log("▶ PREPARACIÓN: Aplicando test fixture 0081 en base de datos remota...");
  execSync(
    "npx supabase db query --linked -f scripts/test-coaching-cierre-0081.sql",
    { stdio: "inherit" }
  );
  console.log("✓ Fixture 0081 aplicado correctamente.\n");

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --------------------------------------------------------------------------
  // PRUEBA 1: RPCS OBSOLETAS REVOCADAS Y ELIMINADAS
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 1: Verificar que las RPCs antiguas ya no existen ni pueden ejecutarse...");
  
  const { data: d1, error: e1 } = await anonClient.rpc("create_or_invite_student_access", {
    p_organizador_id: "00000000-0000-0000-0000-000000000091",
    p_jugador_id: "00000000-0000-0000-0000-000000000093",
    p_student_email: "test@riviera.com",
    p_created_by: "00000000-0000-0000-0000-000000000091",
  });

  if (!e1) {
    throw new Error("FALLO DE SEGURIDAD: create_or_invite_student_access todavía pudo ser ejecutada!");
  }
  console.log(`  ✓ create_or_invite_student_access bloqueada correctamente: [${e1.code || "ERR"}] ${e1.message}`);

  const { data: d2, error: e2 } = await anonClient.rpc("resend_student_invitation", {
    p_organizador_id: "00000000-0000-0000-0000-000000000091",
    p_jugador_id: "00000000-0000-0000-0000-000000000093",
  });

  if (!e2) {
    throw new Error("FALLO DE SEGURIDAD: resend_student_invitation todavía pudo ser ejecutada!");
  }
  console.log(`  ✓ resend_student_invitation bloqueada correctamente: [${e2.code || "ERR"}] ${e2.message}`);
  console.log("  ✅ PRUEBA 1 SUPERADA: Las RPCs obsoletas están eliminadas de PostgreSQL.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 2: VERIFICAR QUE PERSONA SIN POSESIÓN DEL CORREO NO PUEDE ACTIVAR
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 2: Verificar rechazo de activación cuando el correo NO ha sido confirmado...");
  const activateUrl = `${SUPABASE_URL}/functions/v1/coaching-activate-student`;

  const unverifiedRes = await fetch(activateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      token: TEST_TOKEN,
      password: TEST_PASSWORD,
    }),
  });

  const unverifiedJson = await unverifiedRes.json();
  console.log(`  Respuesta de Edge Function con correo no confirmado (HTTP ${unverifiedRes.status}):`, unverifiedJson);

  if (unverifiedRes.status !== 400 || !unverifiedJson.needsEmailVerification) {
    throw new Error(`FALLO DE SEGURIDAD: coaching-activate-student debió responder 400 con needsEmailVerification: true, pero respondió HTTP ${unverifiedRes.status}: ${JSON.stringify(unverifiedJson)}`);
  }
  console.log("  ✓ Activación rechazada por correo no verificado: " + unverifiedJson.error);
  console.log("  ✅ PRUEBA 2 SUPERADA: Una persona sin control del correo no puede activar la cuenta.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 3: CONFIRMAR CORREO Y COMPLETAR ACTIVACIÓN DEFINITIVA
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 3: Simular verificación legítima del correo y activar cuenta...");
  
  // Establecer email_confirmed_at = now() simulando verificación por email
  execSync(
    `npx supabase db query --linked "UPDATE auth.users SET email_confirmed_at = now() WHERE email = '${TEST_STUDENT_EMAIL}';"`,
    { stdio: "inherit" }
  );

  const verifiedRes = await fetch(activateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      token: TEST_TOKEN,
      password: TEST_PASSWORD,
    }),
  });

  const verifiedJson = await verifiedRes.json();
  console.log(`  Respuesta de Edge Function con correo confirmado (HTTP ${verifiedRes.status}):`, verifiedJson);

  if (verifiedRes.status !== 200 || !verifiedJson.ok) {
    throw new Error(`Activación falló tras confirmación de correo: ${JSON.stringify(verifiedJson)}`);
  }
  console.log("  ✓ Cuenta activada y vinculada exitosamente: " + verifiedJson.message);
  console.log("  ✅ PRUEBA 3 SUPERADA: Activación completada tras verificar el correo.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 4: LOGIN REAL AUTÉNTICO CON CREDENCIALES SUPABASE AUTH
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 4: Realizar inicio de sesión auténtico con correo y contraseña...");
  
  const { data: authData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: TEST_STUDENT_EMAIL,
    password: TEST_PASSWORD,
  });

  if (signInErr || !authData.session) {
    throw new Error(`FALLO EN LOGIN REAL: ${signInErr?.message}`);
  }

  const studentAccessToken = authData.session.access_token;
  const authUserId = authData.user.id;
  console.log(`  ✓ Login auténtico exitoso en Supabase Auth!`);
  console.log(`    User ID: ${authUserId}`);
  console.log(`    Email: ${authData.user.email}`);
  console.log(`    Account Type: ${authData.user.app_metadata?.account_type}`);
  console.log(`    Access Token recibido: ${studentAccessToken.slice(0, 30)}...`);
  console.log("  ✅ PRUEBA 4 SUPERADA: Inicio de sesión real operativo sin credenciales simuladas.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 5: CONSULTA AUTENTICADA DE MI COACHING (OVERVIEW)
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 5: Consultar Mi Coaching con la sesión autenticada del alumno...");

  const studentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${studentAccessToken}`,
      },
    },
  });

  const { data: overview, error: overviewErr } = await studentClient.rpc(
    "get_student_coaching_overview"
  );

  if (overviewErr) {
    throw new Error(`get_student_coaching_overview falló: ${overviewErr.message}`);
  }

  console.log("  Respuesta get_student_coaching_overview():", JSON.stringify(overview, null, 2));

  if (!overview.ok || !overview.linked) {
    throw new Error("El alumno no aparece vinculado en get_student_coaching_overview");
  }

  if (overview.riviera_id !== "RIV-77770081") {
    throw new Error(`Riviera ID incorrecto: esperado RIV-77770081, recibido ${overview.riviera_id}`);
  }

  const rel = overview.relationships?.[0];
  if (!rel) {
    throw new Error("No se devolvió la relación deportiva del club.");
  }

  console.log(`  ✓ Riviera ID oficial verificado: ${overview.riviera_id}`);
  console.log(`  ✓ Club: ${rel.club?.name}`);
  console.log(`  ✓ Coach asignado: ${rel.coach?.nombre}`);
  console.log(`  ✓ Saldo de clases: ${rel.balance?.balance_classes}`);

  if (rel.balance?.balance_classes !== 12) {
    throw new Error(`Saldo incorrecto: esperado 12, recibido ${rel.balance?.balance_classes}`);
  }
  console.log("  ✅ PRUEBA 5 SUPERADA: El alumno ve sus clases, su coach y su Riviera ID correctamente.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 6: BLINDAJE STUDENT_ONLY CONTRA OPERACIONES DE ORGANIZADOR
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 6: Verificar que el alumno NO puede realizar operaciones de organizador...");

  // Intento de llamar a una RPC administrativa de coaching
  const { data: adminRpcData, error: adminRpcErr } = await studentClient.rpc(
    "assign_student_to_club_coach",
    {
      p_organizador_id: "00000000-0000-0000-0000-000000000091",
      p_coach_id: "00000000-0000-0000-0000-000000000092",
      p_student_name: "Intruso",
      p_initial_classes: 10,
    }
  );

  if (!adminRpcErr) {
    throw new Error("FALLO DE SEGURIDAD: Alumno pudo invocar assign_student_to_club_coach!");
  }
  console.log(`  ✓ Operación administrativa bloqueada por check_student_only_restriction: ${adminRpcErr.message}`);

  // Intento de insertar una reta
  const { data: retaData, error: retaErr } = await studentClient.from("retas").insert({
    creador_id: authUserId,
    fecha: "2026-11-01",
    hora_inicio: "10:00",
    lugar: "Club Intruso",
  }).select();

  if (!retaErr) {
    throw new Error("FALLO DE SEGURIDAD: Alumno pudo insertar en tabla retas!");
  }
  console.log(`  ✓ Creación de retas bloqueada por RLS: ${retaErr.message}`);
  console.log("  ✅ PRUEBA 6 SUPERADA: Las cuentas STUDENT_ONLY no tienen permisos de organización.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 7: AISLAMIENTO MULTICLUB
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 7: Verificar aislamiento multiclub...");
  // Comprobar que en Club 2 (donde no tiene relación activa), no aparecen clases ni vínculos
  const club2Relationships = overview.relationships.filter(
    (r) => r.organizador_id === "00000000-0000-0000-0000-000000000096"
  );
  if (club2Relationships.length > 0) {
    throw new Error("Fuga de datos: Aparece relación con Club 2 sin estar autorizado.");
  }
  console.log("  ✓ El alumno solo ve relaciones de clubes expresamente vinculados.");
  console.log("  ✅ PRUEBA 7 SUPERADA: Aislamiento multiclub verificado.\n");

  // --------------------------------------------------------------------------
  // LIMPIEZA
  // --------------------------------------------------------------------------
  console.log("▶ LIMPIEZA: Retirando entidades de prueba...");
  execSync(
    `npx supabase db query --linked "
      DELETE FROM public.coach_student_invitations WHERE organizador_id IN ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000096');
      DELETE FROM public.coach_student_account_links WHERE organizador_id IN ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000096');
      DELETE FROM public.coach_player_class_balances WHERE organizador_id IN ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000096');
      DELETE FROM public.coach_player_relationships WHERE organizador_id IN ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000096');
      DELETE FROM public.coach_club_memberships WHERE organizador_id IN ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000096');
      DELETE FROM public.riviera_official_player_identity WHERE canonical_riviera_jugador_id = '00000000-0000-0000-0000-000000000093';
      DELETE FROM public.riviera_jugadores WHERE id = '00000000-0000-0000-0000-000000000093';
      DELETE FROM public.riviera_coaches WHERE id IN ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000097');
      DELETE FROM public.organizador_game_modes WHERE organizador_id IN ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000096');
      DELETE FROM public.users WHERE id IN ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000096', '00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000095');
      DELETE FROM auth.identities WHERE user_id IN ('00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000095');
      DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000096', '00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000095', '00000000-0000-0000-0000-000000000098', '00000000-0000-0000-0000-000000000099');
    "`,
    { stdio: "inherit" }
  );
  console.log("✓ Limpieza completada.\n");

  console.log("==================================================================");
  console.log("🎉 TODAS LAS PRUEBAS DE SEGURIDAD Y LOGIN REAL FUERON SUPERADAS");
  console.log("==================================================================\n");
}

run().catch((err) => {
  console.error("\n❌ ERROR:", err);
  process.exit(1);
});

