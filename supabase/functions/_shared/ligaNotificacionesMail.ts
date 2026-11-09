/**
 * Plantillas mínimas para el worker de liga.
 * Espejo funcional de bienvenida/verificación del frontend (sin React).
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderBienvenidaWorker(input: {
  clubNombre: string;
  ligaNombre: string;
  jugadorNombre: string;
  perfilUrl: string;
  ligaUrl: string;
}): { asunto: string; html: string; text: string } {
  const club = input.clubNombre.trim() || "Riviera Open";
  const liga = input.ligaNombre.trim() || "tu liga";
  const jugador = input.jugadorNombre.trim() || "jugador";
  const asunto = `Bienvenido a ${liga}`;
  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#050505;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px;background:#0c0c0c;border:1px solid #2a2a2a;">
<p style="letter-spacing:0.12em;color:#a3a3a3;font-size:13px;">${escapeHtml(club)}</p>
<h1 style="color:#fff;font-size:28px;">¡Bienvenido a tu liga!</h1>
<p>Hola, ${escapeHtml(jugador)}:</p>
<p>Tu inscripción a ${escapeHtml(liga)} ha sido confirmada.</p>
<p><a href="${escapeHtml(input.perfilUrl)}" style="display:inline-block;padding:12px 20px;background:#f5f5f5;color:#0a0a0a;text-decoration:none;font-weight:700;">VER MI PERFIL</a></p>
<p style="color:#a3a3a3;font-size:13px;"><a href="${escapeHtml(input.ligaUrl)}" style="color:#f5f5f5;">Ver la liga</a></p>
<p style="color:#a3a3a3;font-size:12px;">Riviera Open · Las preferencias de comunicación las administra el club.</p>
</div></body></html>`;
  const text = [
    club,
    "¡Bienvenido a tu liga!",
    `Hola, ${jugador}:`,
    `Tu inscripción a ${liga} ha sido confirmada.`,
    `VER MI PERFIL: ${input.perfilUrl}`,
    `Ver la liga: ${input.ligaUrl}`,
    "Riviera Open",
  ].join("\n\n");
  return { asunto, html, text };
}

export function renderVerificacionWorker(input: {
  clubNombre: string;
  ligaNombre: string;
  jugadorNombre: string | null;
  verificarUrl: string;
}): { asunto: string; html: string; text: string } {
  const club = input.clubNombre.trim() || "Riviera Open";
  const liga = input.ligaNombre.trim() || "tu liga";
  const nombre = input.jugadorNombre?.trim() || null;
  const saludo = nombre ? `Hola, ${nombre}:` : "Hola:";
  const asunto = `Verifica tu correo · ${liga}`;
  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#050505;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px;background:#0c0c0c;border:1px solid #2a2a2a;">
<p style="letter-spacing:0.12em;color:#a3a3a3;font-size:13px;">${escapeHtml(club)} · ${escapeHtml(liga)}</p>
<h1 style="color:#fff;font-size:26px;">Confirma tu correo electrónico</h1>
<p>${escapeHtml(saludo)}</p>
<p>Estamos verificando que esta dirección te pertenece para avisos de tu participación en ${escapeHtml(liga)}.</p>
<p><a href="${escapeHtml(input.verificarUrl)}" style="display:inline-block;padding:12px 20px;background:#f5f5f5;color:#0a0a0a;text-decoration:none;font-weight:700;">VERIFICAR MI CORREO</a></p>
<p style="color:#a3a3a3;font-size:12px;">Confirmar el correo no activa notificaciones por sí solo.</p>
</div></body></html>`;
  const text = [
    club,
    liga,
    "Confirma tu correo electrónico",
    saludo,
    `VERIFICAR MI CORREO: ${input.verificarUrl}`,
    "Riviera Open",
  ].join("\n\n");
  return { asunto, html, text };
}

export function isFakeOrInvalidEmail(email: string | null | undefined): boolean {
  const value = email?.trim().toLowerCase() ?? "";
  if (!value || value.endsWith("@padel.local")) return true;
  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
