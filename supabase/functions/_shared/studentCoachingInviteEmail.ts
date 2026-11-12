/**
 * Correo de bienvenida para activar el acceso de un alumno.
 * El enlace es el de un solo uso que ya generó el servidor.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type StudentInviteEmailInput = {
  studentName: string;
  clubName: string;
  coachName: string;
  rivieraId: string | null;
  actionUrl: string;
  needsPassword: boolean;
};

export const STUDENT_INVITE_SUBJECT = "Bienvenido a Riviera Coaching | Activa tu cuenta";

export function renderStudentCoachingInviteEmail(input: StudentInviteEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const name = input.studentName.trim() || "alumno";
  const club = input.clubName.trim() || "Tu club";
  const coach = input.coachName.trim();
  const rivieraId = input.rivieraId?.trim() || "";
  const actionUrl = input.actionUrl.trim();
  const needsPassword = input.needsPassword;

  const subject = needsPassword
    ? STUDENT_INVITE_SUBJECT
    : `Riviera Coaching | ${club} te dio acceso`;

  const idLine = rivieraId ? `Tu Riviera ID: ${rivieraId}` : "";
  const coachLine = coach ? `Entrenador: ${coach}` : "";
  const actionLine = needsPassword
    ? "Para comenzar, activa tu cuenta y crea tu contraseña personal."
    : "Tu cuenta ya tiene contraseña. Entra con tu Riviera ID para consultar tus clases.";
  const buttonLabel = needsPassword ? "ACTIVAR MI CUENTA" : "ENTRAR A MI COACHING";

  const text = [
    `Hola, ${name}:`,
    "",
    `${club} te ha dado acceso a Riviera Coaching, el espacio donde podrás consultar tus clases, conocer tus avances y dar seguimiento a tu entrenamiento.`,
    idLine,
    coachLine,
    "",
    actionLine,
    actionUrl,
    "",
    "Tu evolución comienza con cada entrenamiento.",
    "",
    "Riviera Coaching",
    "by Riviera Open",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const safeName = escapeHtml(name);
  const safeClub = escapeHtml(club);
  const safeCoach = escapeHtml(coach);
  const safeId = escapeHtml(rivieraId);
  const safeUrl = escapeHtml(actionUrl);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0c0c0d;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0d;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#161618;border:1px solid #2a2a2e;border-radius:16px;">
          <tr>
            <td style="padding:28px 28px 8px;font-family:Georgia, 'Times New Roman', serif;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#a3a3a8;">
              Riviera Coaching
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;line-height:1.3;font-weight:650;color:#f5f5f5;">
              Hola, ${safeName}:
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#d4d4d8;">
              <strong style="color:#f5f5f5;">${safeClub}</strong> te ha dado acceso a Riviera Coaching, el espacio donde podrás consultar tus clases, conocer tus avances y dar seguimiento a tu entrenamiento.
            </td>
          </tr>
          ${
            safeId
              ? `<tr><td style="padding:18px 28px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#a3a3a8;">Tu Riviera ID<br/><span style="display:inline-block;margin-top:4px;color:#f5f5f5;font-size:16px;font-weight:700;letter-spacing:0.04em;">${safeId}</span></td></tr>`
              : ""
          }
          ${
            safeCoach
              ? `<tr><td style="padding:12px 28px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#a3a3a8;">Entrenador<br/><span style="color:#f5f5f5;">${safeCoach}</span></td></tr>`
              : ""
          }
          <tr>
            <td style="padding:18px 28px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#d4d4d8;">
              ${escapeHtml(actionLine)}
            </td>
          </tr>
          <tr>
            <td style="padding:22px 28px 8px;">
              <a href="${safeUrl}" style="display:inline-block;background:#f5f5f5;color:#111113;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;font-weight:750;letter-spacing:0.06em;padding:12px 18px;border-radius:999px;">${buttonLabel}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:1.5;color:#71717a;">
              Si el botón no abre, copia este enlace en el navegador:<br/>
              <a href="${safeUrl}" style="color:#d4d4d8;word-break:break-all;">${safeUrl}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 28px 28px;font-family:Georgia, 'Times New Roman', serif;font-size:15px;line-height:1.45;color:#f5f5f5;">
              Tu evolución comienza con cada entrenamiento.
              <div style="margin-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#a3a3a8;">
                Riviera Coaching<br/>
                <span style="letter-spacing:0.04em;text-transform:none;color:#71717a;">by Riviera Open</span>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
