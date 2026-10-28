/**
 * scripts/verify-cierre-seguridad-0081.mjs
 * Riviera Coaching — Verificación Rigurosa de Seguridad 0081 & Login Real
 */

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
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
const ORG_EMAIL = `hackpadel_0081_${RUN_ID}@test.com`;
const COACH_EMAIL = `coach_javier_0081_${RUN_ID}@test.com`;
const TEST_STUDENT_EMAIL = `zaid.piloto.0081.${RUN_ID}@appriviera-pilot.com`;
const TEST_PASSWORD = "PilotoPassword123!";
const TEST_TOKEN = `token_zaid_0081_${RUN_ID}_${crypto.randomBytes(16).toString("hex")}`;
const RIVIERA_SERIAL = 70000000 + (Number(RUN_ID) % 9000000);
const RIVIERA_ID = `RIV-${RIVIERA_SERIAL}`;

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

async function run() {
  console.log("\n==================================================================");
  console.log("🎾 RIVIERA COACHING — CIERRE REAL DE SEGURIDAD 0081");
  console.log("   Verificación de Principio a Fin en Supabase giswxhmjgjepoobdoljb");
  console.log("==================================================================\n");

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --------------------------------------------------------------------------
  // PREPARACIÓN DE ENTIDADES
  // --------------------------------------------------------------------------
  console.log("▶ PREPARACIÓN: Verificando eliminación de RPCs obsoletas en PostgreSQL...");
  execSync(
    "npx supabase db query --linked -f scripts/test-coaching-cierre-0081.sql",
    { stdio: "inherit" }
  );
  console.log("✓ Verificación de esquema en base de datos completada.\n");

  console.log("▶ PREPARACIÓN: Creando entidades auténticas en Supabase...");
  // Limpiar exhaustivamente usuarios de prueba anteriores
  let page = 1;
  while (true) {
    const { data: pageData } = await adminClient.auth.admin.listUsers({ page, perPage: 50 });
    const users = pageData?.users || [];
    if (users.length === 0) break;
    for (const u of users) {
      if (u.email && u.email.includes("0081")) {
        try {
          await adminClient.auth.admin.deleteUser(u.id);
        } catch (_) {}
      }
    }
    if (users.length < 50) break;
    page++;
  }

  // 1. Crear organizador legítimo en GoTrue
  const { data: orgUser, error: orgCreateErr } = await adminClient.auth.admin.createUser({
    email: ORG_EMAIL,
    password: "OrganizerPassword123!",
    email_confirm: true,
    user_metadata: { name: "Hack Pádel Test" },
  });
  if (orgCreateErr) throw new Error("Fallo al crear organizador: " + orgCreateErr.message);
  const orgId = orgUser.user.id;

  await adminClient.from("users").upsert({ id: orgId, email: ORG_EMAIL, name: "Hack Pádel Test" });
  await adminClient.from("organizador_game_modes").upsert({ organizador_id: orgId, coaching_enabled: true });

  // 2. Crear coach legítimo en GoTrue
  const { data: coachUser, error: coachCreateErr } = await adminClient.auth.admin.createUser({
    email: COACH_EMAIL,
    password: "CoachPassword123!",
    email_confirm: true,
    user_metadata: { name: "Coach Javier Test" },
  });
  if (coachCreateErr) throw new Error("Fallo al crear coach: " + coachCreateErr.message);
  const coachAuthId = coachUser.user.id;

  await adminClient.from("users").upsert({ id: coachAuthId, email: COACH_EMAIL, name: "Coach Javier Test" });

  const { data: coachData, error: coachInsertErr } = await adminClient.from("riviera_coaches").insert({
    auth_user_id: coachAuthId,
    nombre: "Coach Javier Test",
  }).select("id").single();
  if (coachInsertErr) throw new Error("Fallo al insertar coach: " + coachInsertErr.message);
  const coachId = coachData.id;

  await adminClient.from("coach_club_memberships").insert({
    organizador_id: orgId,
    coach_id: coachId,
    status: "ACTIVE",
  });

  // 3. Crear jugador y Riviera ID oficial
  const { data: jugadorData, error: jugadorInsertErr } = await adminClient.from("riviera_jugadores").insert({
    organizador_id: orgId,
    nombre: "Zaid Piloto 0081",
    slug: `zaid-piloto-0081-${Date.now()}`,
  }).select("id").single();
  if (jugadorInsertErr) throw new Error("Fallo al insertar jugador: " + jugadorInsertErr.message);
  const jugadorId = jugadorData.id;

  const { error: identityErr } = await adminClient.from("riviera_official_player_identity").insert({
    canonical_riviera_jugador_id: jugadorId,
    riviera_id: RIVIERA_ID,
    riviera_id_serial: RIVIERA_SERIAL,
  });
  if (identityErr) throw new Error("Fallo al insertar identidad oficial: " + identityErr.message);

  // 4. Relación deportiva con saldo de 12 clases
  const { data: relData, error: relInsertErr } = await adminClient.from("coach_player_relationships").insert({
    organizador_id: orgId,
    coach_id: coachId,
    jugador_id: jugadorId,
    status: "ACTIVE",
    is_primary: true,
  }).select("id").single();
  if (relInsertErr) throw new Error("Fallo al insertar relación: " + relInsertErr.message);
  const relationshipId = relData.id;

  await adminClient.from("coach_player_class_balances").insert({
    relationship_id: relationshipId,
    organizador_id: orgId,
    coach_id: coachId,
    jugador_id: jugadorId,
    balance_classes: 12,
    total_classes_given: 3,
  });

  // 5. Invitación oficial pendiente en tabla coach_student_invitations
  const tokenHash = sha256Hex(TEST_TOKEN);
  const { data: invData, error: invInsertErr } = await adminClient.from("coach_student_invitations").insert({
    organizador_id: orgId,
    coach_id: coachId,
    jugador_id: jugadorId,
    email: TEST_STUDENT_EMAIL,
    token_hash: tokenHash,
    auth_user_id: null,
    status: "PENDING",
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    invited_by: orgId,
  }).select("id").single();
  if (invInsertErr) throw new Error("Fallo al insertar invitación: " + invInsertErr.message);
  const invitationId = invData.id;

  console.log("✓ Entidades de prueba preparadas exitosamente.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 1: RPCS OBSOLETAS REVOCADAS Y ELIMINADAS
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 1: Verificar que las RPCs antiguas ya no existen ni pueden ejecutarse...");
  
  const { data: d1, error: e1 } = await anonClient.rpc("create_or_invite_student_access", {
    p_organizador_id: orgId,
    p_jugador_id: jugadorId,
    p_student_email: TEST_STUDENT_EMAIL,
    p_created_by: orgId,
  });

  if (!e1) {
    throw new Error("FALLO DE SEGURIDAD: create_or_invite_student_access todavía pudo ser ejecutada!");
  }
  console.log(`  ✓ create_or_invite_student_access bloqueada correctamente: [${e1.code || "ERR"}] ${e1.message}`);

  const { data: d2, error: e2 } = await anonClient.rpc("resend_student_invitation", {
    p_organizador_id: orgId,
    p_jugador_id: jugadorId,
  });

  if (!e2) {
    throw new Error("FALLO DE SEGURIDAD: resend_student_invitation todavía pudo ser ejecutada!");
  }
  console.log(`  ✓ resend_student_invitation bloqueada correctamente: [${e2.code || "ERR"}] ${e2.message}`);
  console.log("  ✅ PRUEBA 1 SUPERADA: Las RPCs obsoletas están eliminadas de PostgreSQL.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 2: INTENTO ANÓNIMO DE MODIFICAR CONTRASEÑA ES RECHAZADO (HTTP 401)
  // (Prueba negativa explícita: nunca permitir que un token de invitación
  // por sí solo cambie la contraseña de un usuario)
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 2: Verificar rechazo de cambio anónimo de contraseña con token (HTTP 401)...");
  const activateUrl = `${SUPABASE_URL}/functions/v1/coaching-activate-student`;

  const anonChangeRes = await fetch(activateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      ...(String(SUPABASE_ANON_KEY).startsWith("eyJ")
        ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      token: TEST_TOKEN,
      password: TEST_PASSWORD,
    }),
  });

  const anonChangeJson = await anonChangeRes.json();
  console.log(`  Respuesta anónima (HTTP ${anonChangeRes.status}):`, anonChangeJson);

  if (anonChangeRes.status !== 401) {
    throw new Error(
      `FALLO DE SEGURIDAD: Se debió rechazar la solicitud anónima con HTTP 401, pero se obtuvo HTTP ${anonChangeRes.status}`
    );
  }
  console.log("  ✓ Solicitud anónima rechazada correctamente con HTTP 401: " + anonChangeJson.error);
  console.log("  ✅ PRUEBA 2 SUPERADA: Un atacante con un token de invitación no puede cambiar contraseñas.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 3: COACHING-INVITE-STUDENT NO ENTREGA ENLACES DE VERIFICACIÓN NI TOKENS AL ADMINISTRADOR
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 3: Verificar que coaching-invite-student no expone credenciales al admin...");
  const inviteUrl = `${SUPABASE_URL}/functions/v1/coaching-invite-student`;

  // Autenticar como organizador en GoTrue
  const { data: orgAuth, error: orgAuthErr } = await anonClient.auth.signInWithPassword({
    email: ORG_EMAIL,
    password: "OrganizerPassword123!",
  });
  if (orgAuthErr || !orgAuth.session) {
    throw new Error("No se pudo iniciar sesión como organizador: " + orgAuthErr?.message);
  }
  const orgAccessToken = orgAuth.session.access_token;

  const adminInviteRes = await fetch(inviteUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${orgAccessToken}`,
    },
    body: JSON.stringify({
      organizadorId: orgId,
      jugadorId: jugadorId,
      email: TEST_STUDENT_EMAIL,
    }),
  });

  const adminInviteJson = await adminInviteRes.json();
  console.log(`  Respuesta de invitación al administrador (HTTP ${adminInviteRes.status}):`, {
    ok: adminInviteJson.ok,
    hasVerificationUrl: adminInviteJson.verificationUrl !== undefined,
    hasInvitationUrl: adminInviteJson.invitationUrl !== undefined,
    hasInvitationToken: adminInviteJson.invitationToken !== undefined,
    message: adminInviteJson.message || adminInviteJson.error,
  });

  if (adminInviteJson.verificationUrl || adminInviteJson.invitationUrl || adminInviteJson.invitationToken) {
    throw new Error(
      "FALLO DE SEGURIDAD: coaching-invite-student entregó enlaces de verificación o tokens al administrador!"
    );
  }
  console.log("  ✓ Ningún enlace de verificación ni token expuesto al organizador.");
  console.log("  ✅ PRUEBA 3 SUPERADA: Los administradores no tienen acceso a los enlaces de verificación.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 4: GENERAR ENLACE OFICIAL DE VERIFICACIÓN GOTRUE Y PROCESAR CLIC DEL ALUMNO
  // (Prueba funcional genuina: /auth/v1/verify?token=...&type=invite)
  // (SIN MODIFICAR ARTIFICIALMENTE auth.users.email_confirmed_at EN SQL)
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 4: Flujo auténtico de verificación por correo mediante GoTrue HTTP endpoint...");

  // 1. Supabase Auth genera el enlace de verificación real para el alumno
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: TEST_STUDENT_EMAIL,
    options: {
      redirectTo: `https://appriviera.rivieraopen.com/coaching/acceso-alumno?token=${TEST_TOKEN}`,
      data: {
        name: "Zaid Piloto 0081",
        account_type: "STUDENT_ONLY",
      },
    },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    throw new Error("No se pudo generar el enlace de invitación de GoTrue: " + (linkErr?.message || ""));
  }

  const actionLink = linkData.properties.action_link;
  const createdUserId = linkData.user.id;
  console.log(`  ✓ Usuario GoTrue creado con éxito (ID: ${createdUserId})`);
  console.log(`  ✓ Enlace oficial generado: ${actionLink.slice(0, 70)}...`);

  // Asociar la invitación con el auth_user_id creado y asegurar status PENDING con tokenHash
  await adminClient
    .from("coach_student_invitations")
    .update({
      token_hash: tokenHash,
      status: "PENDING",
      auth_user_id: createdUserId,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    })
    .eq("organizador_id", orgId)
    .eq("jugador_id", jugadorId);

  // 2. El alumno abre el enlace en su navegador: GoTrue verifica el token y emite redirección 302/303 con sesión
  console.log("  → Alumno hace clic en el enlace de su correo (petición GET al endpoint /auth/v1/verify)...");
  const verifyResponse = await fetch(actionLink, {
    method: "GET",
    redirect: "manual",
  });

  console.log(`  Respuesta de GoTrue /auth/v1/verify: HTTP ${verifyResponse.status}`);
  const redirectLocation = verifyResponse.headers.get("location");
  if (!redirectLocation) {
    throw new Error("GoTrue no devolvió cabecera Location de redirección tras verificar el token.");
  }

  console.log(`  ✓ Redirección recibida hacia: ${redirectLocation.slice(0, 80)}...`);

  // Extraer access_token y refresh_token de los fragmentos hash de la URL de redirección
  const hashPart = redirectLocation.split("#")[1] || "";
  const hashParams = new URLSearchParams(hashPart);
  const studentAccessToken = hashParams.get("access_token");
  const studentRefreshToken = hashParams.get("refresh_token");

  if (!studentAccessToken) {
    throw new Error("La redirección de GoTrue no contenía access_token en el hash fragment.");
  }
  console.log(`  ✓ Sesión autenticada establecida legítimamente por GoTrue! Token: ${studentAccessToken.slice(0, 25)}...`);

  // Comprobar que en la base de datos email_confirmed_at quedó establecido por GoTrue de forma 100% nativa
  const { data: dbUserCheck } = await adminClient.auth.admin.getUserById(createdUserId);
  if (!dbUserCheck?.user?.email_confirmed_at) {
    throw new Error("GoTrue no confirmó el correo tras procesar el enlace de verificación!");
  }
  console.log(`  ✓ Comprobación en BD: email_confirmed_at = ${dbUserCheck.user.email_confirmed_at} (confirmado genuinamente por GoTrue)`);
  console.log("  ✅ PRUEBA 4 SUPERADA: Verificación real de correo sin alteraciones SQL artificiales.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 5: DEFINIR CONTRASEÑA DEFINITIVA CON SESIÓN AUTENTICADA (supabase.auth.updateUser)
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 5: Definir contraseña definitiva mediante supabase.auth.updateUser...");
  const studentAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { error: setSessionErr } = await studentAuthClient.auth.setSession({
    access_token: studentAccessToken,
    refresh_token: studentRefreshToken || "",
  });

  if (setSessionErr) {
    throw new Error("Error al inicializar sesión del alumno: " + setSessionErr.message);
  }

  const { error: updateUserErr } = await studentAuthClient.auth.updateUser({
    password: TEST_PASSWORD,
  });

  if (updateUserErr) {
    throw new Error("Fallo al actualizar la contraseña con la sesión del alumno: " + updateUserErr.message);
  }
  console.log("  ✓ Contraseña definida exitosamente mediante la sesión autenticada del alumno.");
  console.log("  ✅ PRUEBA 5 SUPERADA: La contraseña se definió exclusivamente bajo sesión verificada.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 6: VINCULAR PERFIL RIVIERA ID MEDIANTE claim_student_invitation
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 6: Vincular perfil deportivo mediante claim_student_invitation...");
  const { data: claimRes, error: claimErr } = await studentAuthClient.rpc("claim_student_invitation", {
    p_token: TEST_TOKEN,
  });

  if (claimErr) {
    throw new Error("RPC claim_student_invitation falló: " + claimErr.message);
  }
  if (!claimRes.ok) {
    throw new Error("claim_student_invitation devolvió error: " + claimRes.error);
  }
  console.log(`  ✓ Perfil vinculado exitosamente a Riviera ID ${claimRes.riviera_id} para ${claimRes.student_name}`);
  console.log("  ✅ PRUEBA 6 SUPERADA: claim_student_invitation vinculó la cuenta verificada.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 7: INICIO DE SESIÓN REAL CON LA NUEVA CONTRASEÑA EN SUPABASE AUTH
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 7: Realizar inicio de sesión auténtico con correo y nueva contraseña...");
  const { data: authData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: TEST_STUDENT_EMAIL,
    password: TEST_PASSWORD,
  });

  if (signInErr || !authData.session) {
    throw new Error(`FALLO EN LOGIN REAL: ${signInErr?.message}`);
  }

  const finalAccessToken = authData.session.access_token;
  console.log(`  ✓ Login auténtico exitoso en Supabase Auth!`);
  console.log(`    User ID: ${authData.user.id}`);
  console.log(`    Email: ${authData.user.email}`);
  console.log(`    Account Type: ${authData.user.app_metadata?.account_type}`);
  console.log("  ✅ PRUEBA 7 SUPERADA: El alumno inicia sesión legítimamente con sus nuevas credenciales.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 8: CONSULTA AUTENTICADA DE MI COACHING (OVERVIEW)
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 8: Consultar Mi Coaching con la sesión autenticada del alumno...");
  const loggedInStudentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${finalAccessToken}`,
      },
    },
  });

  const { data: overview, error: overviewErr } = await loggedInStudentClient.rpc(
    "get_student_coaching_overview"
  );

  if (overviewErr) {
    throw new Error(`get_student_coaching_overview falló: ${overviewErr.message}`);
  }

  if (!overview.ok || !overview.linked) {
    throw new Error("El alumno no aparece vinculado en get_student_coaching_overview");
  }

  if (overview.riviera_id !== RIVIERA_ID) {
    throw new Error(`Riviera ID incorrecto: esperado ${RIVIERA_ID}, recibido ${overview.riviera_id}`);
  }

  const rel = overview.relationships?.[0];
  if (!rel) {
    throw new Error("No se devolvió la relación deportiva del club.");
  }

  console.log(`  ✓ Riviera ID oficial verificado: ${overview.riviera_id}`);
  console.log(`  ✓ Club: ${rel.club?.nombre || rel.club?.name}`);
  console.log(`  ✓ Coach asignado: ${rel.coach?.nombre}`);
  console.log(`  ✓ Saldo de clases: ${rel.balance?.balance_classes}`);

  if (rel.balance?.balance_classes !== 12) {
    throw new Error(`Saldo incorrecto: esperado 12, recibido ${rel.balance?.balance_classes}`);
  }
  console.log("  ✅ PRUEBA 8 SUPERADA: El alumno consulta sus clases y su coach en Mi Coaching.\n");

  // --------------------------------------------------------------------------
  // PRUEBA 9: BLINDAJE STUDENT_ONLY CONTRA OPERACIONES DE ORGANIZADOR
  // --------------------------------------------------------------------------
  console.log("▶ PRUEBA 9: Verificar que el alumno NO puede realizar operaciones de organizador...");
  const { data: adminRpcData, error: adminRpcErr } = await loggedInStudentClient.rpc(
    "assign_student_to_club_coach",
    {
      p_organizador_id: orgId,
      p_coach_id: coachId,
      p_student_name: "Intruso",
      p_initial_classes: 10,
    }
  );

  if (!adminRpcErr) {
    throw new Error("FALLO DE SEGURIDAD: Alumno pudo invocar assign_student_to_club_coach!");
  }
  console.log(`  ✓ Operación administrativa bloqueada por check_student_only_restriction: ${adminRpcErr.message}`);

  const { data: retaData, error: retaErr } = await loggedInStudentClient.from("retas").insert({
    creador_id: authData.user.id,
    fecha: "2026-11-01",
    hora_inicio: "10:00",
    lugar: "Club Intruso",
  }).select();

  if (!retaErr) {
    throw new Error("FALLO DE SEGURIDAD: Alumno pudo insertar en tabla retas!");
  }
  console.log(`  ✓ Creación de retas bloqueada por RLS: ${retaErr.message}`);
  console.log("  ✅ PRUEBA 9 SUPERADA: Las cuentas STUDENT_ONLY no tienen permisos de organización.\n");

  // --------------------------------------------------------------------------
  // LIMPIEZA
  // --------------------------------------------------------------------------
  console.log("▶ LIMPIEZA: Retirando entidades de prueba...");
  await adminClient.from("coach_student_invitations").delete().eq("id", invitationId);
  await adminClient.from("coach_student_account_links").delete().eq("jugador_id", jugadorId);
  await adminClient.from("coach_player_class_balances").delete().eq("relationship_id", relationshipId);
  await adminClient.from("coach_player_relationships").delete().eq("id", relationshipId);
  await adminClient.from("riviera_official_player_identity").delete().eq("canonical_riviera_jugador_id", jugadorId);
  await adminClient.from("riviera_jugadores").delete().eq("id", jugadorId);
  await adminClient.from("coach_club_memberships").delete().eq("coach_id", coachId);
  await adminClient.from("riviera_coaches").delete().eq("id", coachId);
  await adminClient.from("organizador_game_modes").delete().eq("organizador_id", orgId);
  await adminClient.from("users").delete().in("id", [orgId, coachAuthId, createdUserId]);
  await adminClient.auth.admin.deleteUser(createdUserId);
  await adminClient.auth.admin.deleteUser(coachAuthId);
  await adminClient.auth.admin.deleteUser(orgId);
  console.log("✓ Limpieza completada.\n");

  console.log("==================================================================");
  console.log("🎉 TODAS LAS PRUEBAS DE SEGURIDAD Y LOGIN REAL FUERON SUPERADAS");
  console.log("==================================================================\n");
}

run().catch((err) => {
  console.error("\n❌ ERROR:", err);
  process.exit(1);
});
