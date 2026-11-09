/**
 * Plantillas premium para el worker de liga y comunicaciones.
 * Sistema visual unificado con co-branding "by Riviera Open", compatible con
 * Gmail, Apple Mail, Outlook y dispositivos móviles (max-width 600px).
 */

export interface LigaMailBranding {
  brandName: string;
  brandLogoUrl: string | null;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  brandAccentColor: string;
  brandTextOnPrimary: string;
  brandSupportLabel: string;
  isClubBranded: boolean;
  initials: string;
}

interface KnownClubConfig {
  name: string;
  logoPath: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textOnPrimary: string;
  initials: string;
}

const KNOWN_CLUBS: Record<string, KnownClubConfig> = {
  "hack-padel": {
    name: "Hack Pádel",
    logoPath: "/brands/hack-padel/logo-transparent.png",
    primaryColor: "#0D0E11",
    secondaryColor: "#1B1E24",
    accentColor: "#BFFF00",
    textOnPrimary: "#FFFFFF",
    initials: "HP",
  },
  "padel-court-series": {
    name: "Padel Court Series",
    logoPath: "/brands/padel-court-series/logo-light.png",
    primaryColor: "#192E2C",
    secondaryColor: "#242424",
    accentColor: "#FC9908",
    textOnPrimary: "#FFFFFF",
    initials: "PCS",
  },
  "padelito-warehouse": {
    name: "Padelito Warehouse",
    logoPath: "/brands/padelito-warehouse/logo-light.png",
    primaryColor: "#172E6F",
    secondaryColor: "#10204E",
    accentColor: "#D6EF3A",
    textOnPrimary: "#FFFFFF",
    initials: "PW",
  },
  "valvidub-sports": {
    name: "Valvidub Sports",
    logoPath: "/brands/valvidub-sports/logo-light.png",
    primaryColor: "#2A1C16",
    secondaryColor: "#3D2A22",
    accentColor: "#C4A892",
    textOnPrimary: "#FFFFFF",
    initials: "VS",
  },
  "acapulco-padel-tour": {
    name: "Acapulco Padel Tour",
    logoPath: "/brands/acapulco-padel-tour/logo-light.png",
    primaryColor: "#002B6B",
    secondaryColor: "#001F4D",
    accentColor: "#A7D800",
    textOnPrimary: "#FFFFFF",
    initials: "APT",
  },
};

export function getClubInitialsWorker(name: string): string {
  const clean = (name || "").trim().replace(/[^\p{L}\p{N}\s]/gu, "");
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "RO";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function isRivieraOwnAccountNameWorker(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim().toLowerCase();
  if (!trimmed) return true;
  return (
    trimmed === "riviera open" ||
    trimmed === "riviera" ||
    trimmed === "club deportivo riviera" ||
    trimmed === "club riviera"
  );
}

export function resolveLigaMailBrandingWorker(options: {
  clubNombre?: string | null;
  brandingKey?: string | null;
  premiumBrandingEnabled?: boolean;
  appBaseUrl?: string;
}): LigaMailBranding {
  const base = (options.appBaseUrl || "https://appriviera.rivieraopen.com").replace(/\/+$/, "");
  const rawKey = (options.brandingKey || "").trim().toLowerCase();
  const known = KNOWN_CLUBS[rawKey];

  if (known && options.premiumBrandingEnabled !== false) {
    const brandName = options.clubNombre?.trim() || known.name;
    return {
      brandName,
      brandLogoUrl: `${base}${known.logoPath}`,
      brandPrimaryColor: known.primaryColor,
      brandSecondaryColor: known.secondaryColor,
      brandAccentColor: known.accentColor,
      brandTextOnPrimary: known.textOnPrimary,
      brandSupportLabel: "by Riviera Open",
      isClubBranded: true,
      initials: known.initials,
    };
  }

  const rawClub = (options.clubNombre || "").trim();
  const isRiviera = isRivieraOwnAccountNameWorker(rawClub);

  if (isRiviera || !rawClub) {
    return {
      brandName: "Riviera Open",
      brandLogoUrl: `${base}/logo-riviera.png`,
      brandPrimaryColor: "#15191F",
      brandSecondaryColor: "#232830",
      brandAccentColor: "#BFFF00",
      brandTextOnPrimary: "#FFFFFF",
      brandSupportLabel: "",
      isClubBranded: false,
      initials: "RO",
    };
  }

  // Club con nombre personalizado pero sin branding key registrada
  return {
    brandName: rawClub,
    brandLogoUrl: null,
    brandPrimaryColor: "#15191F",
    brandSecondaryColor: "#232830",
    brandAccentColor: "#BFFF00",
    brandTextOnPrimary: "#FFFFFF",
    brandSupportLabel: "by Riviera Open",
    isClubBranded: true,
    initials: getClubInitialsWorker(rawClub),
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface WorkerEmailLayoutInput {
  branding: LigaMailBranding;
  asunto: string;
  preheaderSnippet?: string;
  badgeLabel?: string | null;
  title: string;
  paragraphsHtml: string;
  infoCards?: Array<{ label: string; value: string | null | undefined }>;
  jornadaCard?: { fecha: string; horario: string; sede: string } | null;
  actionButton?: {
    label: string;
    url: string;
  } | null;
  cierreTexto?: string | null;
  cierreDetalleHtml?: string | null;
  footerNotice?: string | null;
  ligaUrl?: string | null;
  vistaPrevia?: boolean;
  maxWidth?: number;
}

export function renderPremiumEmailLayout(input: WorkerEmailLayoutInput): string {
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

  let jornadaCardHtml = "";
  if (input.jornadaCard) {
    jornadaCardHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;margin:22px 0 24px;">
        <tr>
          <td style="padding:22px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748B;">
                  FECHA
                </td>
              </tr>
              <tr>
                <td style="padding:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:1.4;color:#111827;">
                  ${escapeHtml(input.jornadaCard.fecha)}
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #E5E7EB;padding-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748B;">
                  HORARIO
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:1.4;color:#111827;">
                  ${escapeHtml(input.jornadaCard.horario)}
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #E5E7EB;padding-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748B;">
                  SEDE
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:1.4;color:#111827;">
                  ${escapeHtml(input.jornadaCard.sede)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
  }

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
          <td align="center" style="border-radius:6px;background-color:#0D0F12;">
            <a href="${escapeHtml(input.actionButton.url.trim())}" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1;letter-spacing:0.08em;color:#FFFFFF;text-decoration:none;font-weight:700;border-radius:6px;background-color:#0D0F12;border:1px solid rgba(255,255,255,0.12);text-transform:uppercase;">
              ${escapeHtml(input.actionButton.label)}
            </a>
          </td>
        </tr>
      </table>`;
  }

  const cierreTextoHtml = input.cierreDetalleHtml?.trim()
    ? input.cierreDetalleHtml
    : input.cierreTexto?.trim()
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

  const maxWidth = input.maxWidth || 600;

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
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${maxWidth}px;margin-bottom:8px;">
    <tr>
      <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#6B7280;letter-spacing:0.02em;text-align:left;padding:0 4px;">
        Comunicación deportiva oficial · ${escapeHtml(brandName)}
      </td>
    </tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${maxWidth}px;background-color:#FFFFFF;border:1px solid #E5E7EB;border-top:3px solid ${escapeHtml(branding.brandAccentColor)};border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
    ${previewBanner}
    <tr>
      <td style="background-color:#0D0F12;padding:24px 28px;">
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
        ${jornadaCardHtml}
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
      </td>
    </tr>
  </table>
</td>
</tr>
</table>
</body>
</html>`;
}

export function renderBienvenidaWorker(input: {
  clubNombre: string;
  ligaNombre: string;
  jugadorNombre: string;
  perfilUrl: string;
  ligaUrl: string;
  branding?: LigaMailBranding;
}): { asunto: string; html: string; text: string } {
  const club = input.clubNombre.trim() || "Riviera Open";
  const liga = input.ligaNombre.trim() || "tu liga";
  const jugador = input.jugadorNombre.trim() || "jugador";
  const asunto = `Bienvenido a ${liga}`;
  const branding = input.branding ?? resolveLigaMailBrandingWorker({ clubNombre: club });

  const paragraphsHtml = `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">Hola, ${escapeHtml(jugador)}:<br><br>Tu inscripción a ${escapeHtml(liga)} ha sido confirmada.<br><br>Nos alegra que formes parte de esta temporada.<br><br>Desde tu perfil podrás consultar tu participación, resultados e historial deportivo conforme avance la competencia.</p>`;

  const html = renderPremiumEmailLayout({
    branding,
    asunto,
    preheaderSnippet: `Tu inscripción a ${liga} ha sido confirmada.`,
    badgeLabel: liga,
    title: "¡Bienvenido a tu liga!",
    paragraphsHtml,
    infoCards: [
      { label: "Club", value: club },
      { label: "Liga", value: liga },
    ],
    actionButton: {
      label: "VER MI PERFIL",
      url: input.perfilUrl,
    },
    cierreTexto: "Compite. Juega limpio. Vive Riviera Open.",
    footerNotice:
      "Las preferencias de comunicación de esta liga las administra el club. Si no deseas recibir estos avisos, solicita al organizador que desactive tus notificaciones.",
    ligaUrl: input.ligaUrl,
  });

  const text = [
    club,
    branding.isClubBranded ? branding.brandSupportLabel : "",
    "¡Bienvenido a tu liga!",
    `Hola, ${jugador}:`,
    `Tu inscripción a ${liga} ha sido confirmada.`,
    `VER MI PERFIL: ${input.perfilUrl}`,
    `Ver la liga: ${input.ligaUrl}`,
    "Compite. Juega limpio. Vive Riviera Open.",
    "Gestionado con Riviera Open",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { asunto, html, text };
}

export function renderVerificacionWorker(input: {
  clubNombre: string;
  ligaNombre: string;
  jugadorNombre: string | null;
  verificarUrl: string;
  branding?: LigaMailBranding;
}): { asunto: string; html: string; text: string } {
  const club = input.clubNombre.trim() || "Riviera Open";
  const liga = input.ligaNombre.trim() || "tu liga";
  const nombre = input.jugadorNombre?.trim() || null;
  const saludo = nombre ? `Hola, ${escapeHtml(nombre)}:` : "Hola:";
  const saludoTexto = nombre ? `Hola, ${nombre}:` : "Hola:";
  const asunto = `Verifica tu correo · ${liga}`;
  const branding = input.branding ?? resolveLigaMailBrandingWorker({ clubNombre: club });

  const paragraphsHtml = `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">${saludo}<br><br>Estamos verificando que esta dirección te pertenece para avisos de tu participación en ${escapeHtml(liga)}.<br><br>Este enlace caduca en 24 horas. Si no solicitaste esta verificación, puedes ignorar este mensaje.</p>`;

  const html = renderPremiumEmailLayout({
    branding,
    asunto,
    preheaderSnippet: `Estamos verificando que esta dirección de correo te pertenece para avisos de tu participación en ${liga}.`,
    badgeLabel: liga,
    title: "Confirma tu correo electrónico",
    paragraphsHtml,
    actionButton: {
      label: "VERIFICAR MI CORREO",
      url: input.verificarUrl,
    },
    footerNotice: "Confirmar el correo no activa notificaciones por sí solo. El club administra esas preferencias.",
  });

  const text = [
    club,
    branding.isClubBranded ? branding.brandSupportLabel : "",
    liga,
    "Confirma tu correo electrónico",
    saludoTexto,
    `VERIFICAR MI CORREO: ${input.verificarUrl}`,
    "Gestionado con Riviera Open",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { asunto, html, text };
}

export function extractJornadaDetailsFromTextWorker(
  cuerpo: string,
  fallbackSede?: string
): {
  cleanBody: string;
  jornadaCard: { fecha: string; horario: string; sede: string } | null;
} {
  const fechaMatch = cuerpo.match(/^[ \t]*Fecha:[ \t]*(.+)$/im);
  const horarioMatch = cuerpo.match(/^[ \t]*Horario:[ \t]*(.+)$/im);
  const sedeMatch = cuerpo.match(/^[ \t]*Sede:[ \t]*(.+)$/im);

  if (!fechaMatch && !horarioMatch) {
    return { cleanBody: cuerpo, jornadaCard: null };
  }

  const fecha = fechaMatch ? fechaMatch[1].trim() : "Por definir";
  const horario = horarioMatch ? horarioMatch[1].trim() : "Por definir";
  const sede = sedeMatch ? sedeMatch[1].trim() : fallbackSede || "Por definir";

  const cleanBody = cuerpo
    .replace(/^[ \t]*Fecha:[ \t]*.+$/gim, "")
    .replace(/^[ \t]*Horario:[ \t]*.+$/gim, "")
    .replace(/^[ \t]*Sede:[ \t]*.+$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    cleanBody,
    jornadaCard: {
      fecha: fecha || "Por definir",
      horario: horario || "Por definir",
      sede: sede || "Por definir",
    },
  };
}

const MARCA_RESULTADOS = /^RESULTADOS_URL:(\S+)\s*$/m;

/** Acepta la ruta pública real de la jornada. Rechaza el panel /liga/. */
export function extraerUrlPublicaJornadaWorker(cuerpo: string, base: string): string | null {
  const match = cuerpo.match(MARCA_RESULTADOS);
  if (!match) return null;
  const raw = match[1];
  const origen = base.trim().replace(/\/+$/, "");
  const absoluta = raw.startsWith("/public/liga/")
    ? `${origen}${raw}`
    : raw;
  try {
    const parsed = new URL(absoluta);
    if (parsed.protocol !== "https:") return null;
    if (!/^\/public\/liga\/[^/]+\/jornada\/\d+$/.test(parsed.pathname)) return null;
    return absoluta;
  } catch {
    return null;
  }
}

export function cuerpoSinMarcaResultados(cuerpo: string): string {
  return cuerpo.replace(MARCA_RESULTADOS, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Mensaje manual: asunto/cuerpo ya resueltos; se escapan al HTML con diseño premium. */
export function renderComunicacionWorker(input: {
  clubNombre: string;
  ligaNombre: string;
  asunto: string;
  cuerpoTexto: string;
  replyTo?: string | null;
  branding?: LigaMailBranding;
  tipo?: string | null;
  ligaUrl?: string | null;
}): { asunto: string; html: string; text: string } {
  const club = input.clubNombre.trim() || "Riviera Open";
  const liga = input.ligaNombre.trim() || "tu liga";
  const asunto = input.asunto.trim().slice(0, 180) || `Mensaje de ${liga}`;
  const origenPublico = (() => {
    try {
      return new URL(input.ligaUrl ?? "").origin;
    } catch {
      return "";
    }
  })();
  const resultadosUrl = extraerUrlPublicaJornadaWorker(input.cuerpoTexto, origenPublico);
  const cuerpo = cuerpoSinMarcaResultados(input.cuerpoTexto).slice(0, 8000);
  const reply = input.replyTo?.trim() ?? "";
  const footerNotice = reply
    ? "Puedes responder directamente a este correo para comunicarte con el club."
    : "Este aviso no recibe respuestas por correo. El club administra las comunicaciones de la liga.";
  const branding = input.branding ?? resolveLigaMailBrandingWorker({ clubNombre: club });

  const parsed = extractJornadaDetailsFromTextWorker(cuerpo, club);
  const esJornada = input.tipo === "jornada" || Boolean(parsed.jornadaCard);

  const paragraphsHtml = parsed.cleanBody
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = escapeHtml(block).replace(/\n/g, "<br />");
      return `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">${lines}</p>`;
    })
    .join("");

  const esResultados = input.tipo === "resultados_jornada";
  let actionButton = null;
  if (esResultados && resultadosUrl) {
    actionButton = {
      label: "VER RESULTADOS DE LA JORNADA",
      url: resultadosUrl,
    };
  } else if ((esJornada || input.tipo === "recordatorio_jornada") && (resultadosUrl || input.ligaUrl?.trim())) {
    actionButton = {
      label: input.tipo === "recordatorio_jornada" ? "VER LA JORNADA" : "VER MI JORNADA",
      url: resultadosUrl || input.ligaUrl!.trim(),
    };
  }

  const cierreDetalleHtml = esResultados
    ? `<div style="margin:28px 0 0;padding-top:20px;border-top:1px solid #E5E7EB;">
        <p style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.5;color:#4B5563;">Sigue compitiendo, superándote y construyendo tu historia dentro de Riviera Open.</p>
        <p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.5;color:#4B5563;font-style:italic;">¡Nos vemos en la próxima jornada!</p>
        <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#111827;">RIVIERA OPEN</p>
        <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.5;color:#475569;font-style:italic;">Compite. Juega limpio. Vive Riviera Open.</p>
        <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#0D0F12;">Cada partido cuenta.</p>
      </div>`
    : esJornada
    ? `<div style="margin:28px 0 0;padding-top:20px;border-top:1px solid #E5E7EB;">
        <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#111827;">
          RIVIERA OPEN
        </p>
        <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.5;color:#475569;font-style:italic;">
          Compite. Juega limpio. Vive Riviera Open.
        </p>
        <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#0D0F12;">
          Cada partido cuenta.
        </p>
      </div>`
    : null;

  const title = esResultados
    ? "¡Tu jornada ha terminado, pero tu historia continúa!"
    : esJornada && asunto.toLowerCase().includes("jornada")
    ? "¡Tu próxima jornada te espera!"
    : asunto;

  const html = renderPremiumEmailLayout({
    branding,
    asunto,
    preheaderSnippet: parsed.cleanBody.slice(0, 140).replace(/\s+/g, " "),
    badgeLabel: liga,
    title,
    paragraphsHtml: paragraphsHtml || `<p style="margin:0;color:#374151;"> </p>`,
    jornadaCard: parsed.jornadaCard,
    actionButton,
    cierreDetalleHtml,
    footerNotice,
    ligaUrl: input.ligaUrl,
    maxWidth: esJornada ? 640 : 600,
  });

  const textLines = [
    club,
    branding.isClubBranded ? branding.brandSupportLabel : "by Riviera Open",
    liga,
    title,
    parsed.cleanBody,
    parsed.jornadaCard
      ? `TARJETA DE JORNADA:\nFecha: ${parsed.jornadaCard.fecha}\nHorario: ${parsed.jornadaCard.horario}\nSede: ${parsed.jornadaCard.sede}`
      : "",
    actionButton ? `${actionButton.label}: ${actionButton.url}` : "",
    esJornada
      ? "RIVIERA OPEN\nCompite. Juega limpio. Vive Riviera Open.\nCada partido cuenta."
      : "",
    footerNotice,
    input.ligaUrl ? `Ver la liga: ${input.ligaUrl}` : "",
    "Gestionado con Riviera Open",
  ].filter(Boolean);

  return { asunto, html, text: textLines.join("\n\n") };
}

export function isFakeOrInvalidEmail(email: string | null | undefined): boolean {
  const value = email?.trim().toLowerCase() ?? "";
  if (!value || value.endsWith("@padel.local")) return true;
  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
