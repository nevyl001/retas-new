import type { LigaMailBranding } from "./ligaMailBranding";

export interface InfoCardItem {
  label: string;
  value: string | null | undefined;
}

export interface PremiumEmailLayoutInput {
  branding: LigaMailBranding;
  asunto: string;
  preheaderSnippet?: string;
  badgeLabel?: string | null;
  title: string;
  paragraphsHtml: string;
  infoCards?: InfoCardItem[];
  actionButton?: {
    label: string;
    url: string;
  } | null;
  cierreTexto?: string | null;
  footerNotice?: string | null;
  ligaUrl?: string | null;
  footerLine?: string | null;
  vistaPrevia?: boolean;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderPremiumEmailHtml(input: PremiumEmailLayoutInput): string {
  const { branding } = input;
  const asunto = input.asunto.trim();
  const preheaderSnippet = input.preheaderSnippet || asunto;
  const brandName = branding.brandName || "Riviera Open";
  const brandSupport = branding.isClubBranded ? branding.brandSupportLabel : "";

  const previewBanner = input.vistaPrevia
    ? `<tr><td style="background-color:#111827;color:#F9FAFB;text-align:center;padding:10px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">VISTA PREVIA — este mensaje no se ha enviado</td></tr>`
    : "";

  const logoOrMonogram = branding.brandLogoUrl
    ? `<img src="${escapeHtml(branding.brandLogoUrl)}" alt="${escapeHtml(brandName)}" style="display:block;border:0;outline:none;text-decoration:none;max-height:40px;max-width:180px;width:auto;height:auto;">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="width:36px;height:36px;border-radius:6px;background-color:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.24);text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#FFFFFF;">
            ${escapeHtml(branding.initials)}
          </td>
          <td style="padding-left:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;">
            ${escapeHtml(brandName)}
          </td>
        </tr>
      </table>`;

  const coBrandPill = brandSupport
    ? `<td align="right" valign="middle" style="padding-left:12px;">
        <span style="display:inline-block;padding:4px 10px;border-radius:9999px;background-color:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.04em;color:#E5E7EB;text-transform:uppercase;white-space:nowrap;">
          ${escapeHtml(brandSupport)}
        </span>
      </td>`
    : "";

  const badgeHtml = input.badgeLabel?.trim()
    ? `<div style="display:inline-block;padding:3px 9px;border-radius:4px;background-color:#F3F4F6;border:1px solid #E5E7EB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;color:#4B5563;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:14px;">
        ${escapeHtml(input.badgeLabel.trim())}
      </div>`
    : "";

  const cards = (input.infoCards || []).filter((c) => c.value && String(c.value).trim());
  let infoCardsHtml = "";
  if (cards.length > 0) {
    const rows = cards
      .map(
        (c) =>
          `<tr>
            <td style="padding:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;">
              ${escapeHtml(c.label)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.4;color:#111827;">
              ${escapeHtml(String(c.value).trim())}
            </td>
          </tr>`
      )
      .join("");
    infoCardsHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;margin:20px 0 24px;">
        <tr>
          <td style="padding:18px 20px 4px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${rows}
            </table>
          </td>
        </tr>
      </table>`;
  }

  let actionButtonHtml = "";
  if (input.actionButton?.url?.trim()) {
    actionButtonHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 24px;">
        <tr>
          <td align="center" style="border-radius:6px;background-color:${escapeHtml(branding.brandPrimaryColor)};">
            <a href="${escapeHtml(input.actionButton.url.trim())}" style="display:inline-block;padding:13px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1;letter-spacing:0.08em;color:#FFFFFF;text-decoration:none;font-weight:700;border-radius:6px;border:1px solid rgba(255,255,255,0.12);text-transform:uppercase;">
              ${escapeHtml(input.actionButton.label)}
            </a>
          </td>
        </tr>
      </table>`;
  }

  const cierreTextoHtml = input.cierreTexto?.trim()
    ? `<p style="margin:24px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.5;color:#4B5563;font-style:italic;">
        ${escapeHtml(input.cierreTexto.trim())}
      </p>`
    : "";

  const footerNoticeHtml = input.footerNotice?.trim()
    ? `<p style="margin:6px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#6B7280;">
        ${escapeHtml(input.footerNotice.trim())}
      </p>`
    : "";

  const ligaLinkHtml = input.ligaUrl?.trim()
    ? `<p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.4;">
        <a href="${escapeHtml(input.ligaUrl.trim())}" style="color:#111827;text-decoration:underline;font-weight:600;">Ver la liga</a>
      </p>`
    : "";

  const footerExtraHtml = input.footerLine?.trim()
    ? `<p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6B7280;">
        ${escapeHtml(input.footerLine.trim())}
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(asunto)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
${escapeHtml(preheaderSnippet)}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F4F6;margin:0;padding:24px 12px;">
<tr>
<td align="center" valign="top">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin-bottom:8px;">
    <tr>
      <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#6B7280;letter-spacing:0.02em;text-align:left;padding:0 4px;">
        Comunicación deportiva oficial · ${escapeHtml(brandName)}
      </td>
    </tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E5E7EB;border-top:3px solid ${escapeHtml(branding.brandAccentColor)};border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
    ${previewBanner}
    <tr>
      <td style="background-color:${escapeHtml(branding.brandPrimaryColor)};padding:24px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left" valign="middle">
              ${logoOrMonogram}
            </td>
            ${coBrandPill}
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background-color:${escapeHtml(branding.brandAccentColor)};height:3px;font-size:0;line-height:0;" height="3">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding:32px 28px 24px;background-color:#FFFFFF;">
        ${badgeHtml}
        <h1 style="margin:0 0 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;line-height:1.25;color:#111827;letter-spacing:-0.02em;">
          ${escapeHtml(input.title)}
        </h1>
        ${input.paragraphsHtml}
        ${infoCardsHtml}
        ${actionButtonHtml}
        ${cierreTextoHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:22px 28px;background-color:#F9FAFB;border-top:1px solid #E5E7EB;">
        <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;line-height:1.4;color:#374151;">
          Enviado por ${escapeHtml(brandName)}
        </p>
        <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.45;color:#6B7280;">
          Gestionado con Riviera Open · Comunicación deportiva oficial.
        </p>
        ${footerNoticeHtml}
        ${ligaLinkHtml}
        ${footerExtraHtml}
      </td>
    </tr>
  </table>
</td>
</tr>
</table>
</body>
</html>`;
}
