/**
 * Plantillas HTML Riviera Open — diseño premium sutil (tema oscuro, acento blanco).
 */

export type RivieraEmailKind =
  | "bienvenida_torneo"
  | "asignacion_grupo"
  | "clasifico_eliminatoria"
  | "no_clasifico"
  | "clasifico_final"
  | "no_llego_final";

export interface RivieraEmailResult {
  subject: string;
  text: string;
  html: string;
}

export interface RivieraEmailParams {
  kind: RivieraEmailKind;
  playerName: string;
  torneoNombre: string;
  torneoId: string;
  grupoId?: string | null;
  categoria?: string | null;
  compañero?: string | null;
  grupoNombre?: string | null;
  rivales?: string | null;
}

/** Premium subtle — dark theme, white accent */
const C = {
  bgDeep: "#0a0a0b",
  surface: "#111113",
  cardBg: "rgba(255,255,255,0.04)",
  cardBorder: "rgba(255,255,255,0.08)",
  text: "#ffffff",
  textBody: "rgba(255,255,255,0.75)",
  textSecondary: "rgba(255,255,255,0.45)",
  textMuted: "rgba(255,255,255,0.25)",
  textLabel: "rgba(255,255,255,0.3)",
  textTagline: "rgba(255,255,255,0.35)",
  gold: "#ffffff",
  goldSubtleBg: "rgba(255,255,255,0.08)",
  goldSubtleBorder: "rgba(255,255,255,0.15)",
  goldBadgeBorder: "rgba(255,255,255,0.3)",
  goldAvatarBg: "rgba(255,255,255,0.12)",
  goldAvatarBorder: "rgba(255,255,255,0.25)",
  goldLink: "rgba(255,255,255,0.6)",
  onGold: "#000000",
  divider: "rgba(255,255,255,0.06)",
  headerBorder: "rgba(255,255,255,0.07)",
  pairBg: "rgba(255,255,255,0.03)",
  pairBorder: "rgba(255,255,255,0.07)",
  vsBadgeBg: "rgba(255,255,255,0.06)",
  vsBadgeText: "rgba(255,255,255,0.35)",
  pairName: "rgba(255,255,255,0.8)",
  footerBorder: "rgba(255,255,255,0.06)",
  footerText: "rgba(255,255,255,0.2)",
};

/** Espaciado vertical entre bloques del cuerpo */
const SECTION_GAP = "14px";

const FONT =
  "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const BRAND_TAGLINE = "GESTIÓN DE RETAS Y TORNEOS";

const DEFAULT_ORIGIN = "https://appriviera.rivieraopen.com";

export function getAppBaseUrl(): string {
  const raw = (Deno.env.get("APP_PUBLIC_URL") ?? DEFAULT_ORIGIN).trim();
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return url.origin;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | null | undefined): boolean {
  if (!id) return false;
  const t = id.trim();
  if (t.includes("{") || t.includes("}")) return false;
  return UUID_RE.test(t);
}

export function linkTorneosList(): string {
  return `${getAppBaseUrl()}/torneos`;
}

export function linkTorneoGrupo(torneoId: string, grupoId: string): string {
  return `${getAppBaseUrl()}/torneo-express/${torneoId}/grupo/${grupoId}`;
}

export function linkTorneoEliminatoria(torneoId: string): string {
  return `${getAppBaseUrl()}/torneo-express/${torneoId}/eliminatoria`;
}

export function resolveEmailCtaUrl(params: {
  kind: RivieraEmailKind;
  torneoId: string;
  grupoId?: string | null;
}): string {
  if (params.kind === "bienvenida_torneo") {
    return linkTorneosList();
  }
  if (
    (params.kind === "clasifico_eliminatoria" ||
      params.kind === "clasifico_final" ||
      params.kind === "no_llego_final") &&
    isValidUuid(params.torneoId)
  ) {
    return linkTorneoEliminatoria(params.torneoId.trim());
  }
  if (isValidUuid(params.torneoId) && isValidUuid(params.grupoId)) {
    return linkTorneoGrupo(params.torneoId.trim(), params.grupoId!.trim());
  }
  return linkTorneosList();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hrefAttr(url: string): string {
  return url.replace(/"/g, "%22");
}

const BADGE_LABEL: Record<RivieraEmailKind, string> = {
  bienvenida_torneo: "INSCRITO",
  asignacion_grupo: "INSCRITO",
  clasifico_eliminatoria: "CLASIFICÓ",
  no_clasifico: "TORNEO",
  clasifico_final: "FINALISTA",
  no_llego_final: "ELIMINATORIA",
};

const CTA_LABEL: Record<RivieraEmailKind, string> = {
  bienvenida_torneo: "Ver torneos →",
  asignacion_grupo: "Ver mi grupo",
  clasifico_eliminatoria: "Ver el cuadro",
  no_clasifico: "Ver mi grupo",
  clasifico_final: "Ver el cuadro",
  no_llego_final: "Ver mi grupo",
};

type EmailTile =
  | { layout: "half"; label: string; value: string; highlight?: boolean }
  | {
      layout: "full";
      label: string;
      value: string;
      /** Parejas del grupo (cada ítem: "Jugador1 / Jugador2") */
      pairs?: string[];
      accent?: "rivals" | "partner" | "default";
    }
  | { layout: "banner"; text: string };

/** Convierte "A / B, C / D" en lista de parejas para el HTML del email. */
export function parseGroupPairs(rivales: string): string[] {
  const trimmed = rivales.trim();
  if (!trimmed || trimmed === "Por confirmar") return [];
  return trimmed
    .split(/,\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function emailLogoUrl(): string {
  return `${getAppBaseUrl()}/logo-riviera.png?v=1`;
}

/** Imagen de cancha en producción (public/images + build). */
function emailCourtBackgroundUrl(): string {
  return `${getAppBaseUrl()}/images/cancha-riviera.jpg`;
}

function emailHeroBackgroundStyle(courtUrl: string): string {
  const url = courtUrl.replace(/'/g, "%27");
  return [
    "background-color:#111113",
    `background-image:linear-gradient(to bottom, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.35) 42%, rgba(0,0,0,0.48) 70%, rgba(17,17,19,0.97) 100%), url('${url}')`,
    "background-size:cover",
    "background-position:center center",
    "background-repeat:no-repeat",
  ].join(";");
}

const EMAIL_CARD_MAX_WIDTH = 520;
/** Solo foto de cancha + badge (sin texto encima). */
const EMAIL_COURT_BANNER_HEIGHT = 150;

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function renderThinDivider(): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 14px;">
      <tr>
        <td style="height:0.5px;background:${C.divider};font-size:0;line-height:0;">&nbsp;</td>
      </tr>
    </table>`;
}

function parseBannerText(text: string): {
  icon: string;
  emphasis: string | null;
  after: string;
} {
  const trimmed = text.trim();
  const emojiRe = /^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]+\s*)/u;
  let icon = "";
  let rest = trimmed;
  const em = trimmed.match(emojiRe);
  if (em) {
    icon = em[1].trim();
    rest = trimmed.slice(em[0].length).trim();
  }
  const exc = rest.match(/^(¡[^!]+!)\s*(.*)$/s);
  if (exc) {
    return { icon: icon || "✦", emphasis: exc[1], after: exc[2] };
  }
  return { icon: icon || "✦", emphasis: null, after: rest };
}

function tileLabel(text: string): string {
  return `<p style="margin:0 0 6px;font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.textLabel};">${escapeHtml(text)}</p>`;
}

function tileValue(text: string, highlight = false): string {
  const color = highlight ? C.gold : C.text;
  return `<p style="margin:0;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.35;color:${color};">${escapeHtml(text)}</p>`;
}

function renderPairMiniCard(pair: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 14px;background:${C.pairBg};border:0.5px solid ${C.pairBorder};border-radius:12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="36" valign="middle" style="padding-right:12px;">
                <div style="width:32px;height:32px;border-radius:8px;background:${C.vsBadgeBg};text-align:center;line-height:32px;font-family:${FONT};font-size:10px;font-weight:700;color:${C.vsBadgeText};">VS</div>
              </td>
              <td valign="middle">
                <p style="margin:0;font-family:${FONT};font-size:14px;font-weight:600;line-height:1.4;color:${C.pairName};">${escapeHtml(pair)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function renderPartnerCard(label: string, name: string): string {
  const initials = initialsFromName(name);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${SECTION_GAP};border-collapse:collapse;">
      <tr>
        <td style="padding:12px 14px;background:${C.pairBg};border:0.5px solid ${C.pairBorder};border-radius:12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="44" valign="middle" style="padding-right:12px;">
                <div style="width:36px;height:36px;border-radius:50%;background:${C.goldAvatarBg};border:1px solid ${C.goldAvatarBorder};text-align:center;line-height:36px;font-family:${FONT};font-size:13px;font-weight:700;color:${C.gold};">${escapeHtml(initials)}</div>
              </td>
              <td valign="middle">
                ${tileLabel(label)}
                <p style="margin:0;font-family:${FONT};font-size:14px;font-weight:600;line-height:1.4;color:${C.pairName};">${escapeHtml(name)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function renderGroupPairsSection(label: string, pairs: string[]): string {
  const cards = pairs.map((p) => renderPairMiniCard(p)).join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${SECTION_GAP};border-collapse:collapse;">
      <tr>
        <td>
          ${tileLabel(label)}
          ${cards}
        </td>
      </tr>
    </table>`;
}

function renderMotivationalBanner(text: string): string {
  const { icon, emphasis, after } = parseBannerText(text);
  const bodyHtml = emphasis
    ? `<span style="font-weight:700;color:${C.gold};">${escapeHtml(emphasis)}</span>${after ? ` <span style="color:${C.textBody};">${escapeHtml(after)}</span>` : ""}`
    : `<span style="color:${C.textBody};">${escapeHtml(after || text)}</span>`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${SECTION_GAP};border-collapse:collapse;">
      <tr>
        <td style="padding:14px 16px;background:${C.goldSubtleBg};border:1px solid ${C.goldSubtleBorder};border-radius:12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="32" valign="top" style="padding-right:12px;font-size:20px;line-height:1.4;">${escapeHtml(icon)}</td>
              <td valign="middle">
                <p style="margin:0;font-family:${FONT};font-size:14px;font-weight:500;line-height:1.55;">${bodyHtml}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function renderEmailLogoStrip(): string {
  const logoUrl = emailLogoUrl();
  return `
          <tr>
            <td align="center" style="padding:20px 24px 10px;background-color:${C.surface};">
              <img src="${hrefAttr(logoUrl)}" alt="Riviera Open" height="48" style="display:block;margin:0 auto;height:48px;width:auto;max-width:160px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
            </td>
          </tr>`;
}

/** Banda de cancha con badge; sin logo ni textos (evita amontonar). */
function renderEmailCourtBanner(badge: string): string {
  const courtUrl = emailCourtBackgroundUrl();
  const courtAttr = hrefAttr(courtUrl);
  const badgeHtml = escapeHtml(badge);
  const h = EMAIL_COURT_BANNER_HEIGHT;
  const w = EMAIL_CARD_MAX_WIDTH;
  const bgStyle = emailHeroBackgroundStyle(courtUrl);

  return `
          <tr>
            <td align="center" valign="top" height="${h}" background="${courtAttr}"
                style="height:${h}px;padding:0;${bgStyle};">
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${w}px;height:${h}px;">
                <v:fill type="frame" src="${courtAttr}" color="#111113" />
                <v:textbox inset="0,0,0,0" style="mso-fit-shape-to-text:true;">
              <![endif]-->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                <tr>
                  <td align="right" valign="top" style="padding:12px 16px 0;line-height:normal;font-size:14px;">
                    <span style="display:inline-block;padding:5px 12px;border-radius:100px;border:1px solid rgba(255,255,255,0.4);background:rgba(0,0,0,0.45);font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:0.1em;color:${C.gold};">&#9679; ${badgeHtml}</span>
                  </td>
                </tr>
              </table>
              <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
            </td>
          </tr>`;
}

function renderEmailBrandLeadIn(): string {
  return `
              <p style="margin:0 0 6px;font-family:${FONT};font-size:13px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.55);">RIVIERA OPEN</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
                <tr>
                  <td style="width:48px;height:1.5px;background-color:${C.gold};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:0 0 18px;font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.textMuted};">${BRAND_TAGLINE}</p>`;
}

function renderEmailHeroHeader(badge: string): string {
  return `${renderEmailLogoStrip()}${renderEmailCourtBanner(badge)}`;
}

function renderTiles(tiles: EmailTile[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < tiles.length) {
    const t = tiles[i];
    if (t.layout === "banner") {
      parts.push(renderMotivationalBanner(t.text));
      i += 1;
      continue;
    }
    if (t.layout === "half") {
      const next = tiles[i + 1]?.layout === "half" ? (tiles[i + 1] as Extract<EmailTile, { layout: "half" }>) : null;
      parts.push(`
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${SECTION_GAP};border-collapse:separate;border-spacing:10px 0;">
          <tr>
            <td width="50%" valign="top" style="padding:16px;background:${C.cardBg};border:0.5px solid ${C.cardBorder};border-radius:12px;">
              ${tileLabel(t.label)}
              ${tileValue(t.value, t.highlight)}
            </td>
            <td width="50%" valign="top" style="padding:16px;background:${C.cardBg};border:0.5px solid ${C.cardBorder};border-radius:12px;">
              ${next ? `${tileLabel(next.label)}${tileValue(next.value, next.highlight)}` : "&nbsp;"}
            </td>
          </tr>
        </table>`);
      i += next ? 2 : 1;
      continue;
    }
    const full = t;
    if (full.pairs && full.pairs.length > 0 && full.accent === "rivals") {
      parts.push(renderThinDivider());
      parts.push(renderGroupPairsSection(full.label, full.pairs));
      i += 1;
      continue;
    }
    if (full.accent === "partner") {
      parts.push(renderPartnerCard(full.label, full.value));
      i += 1;
      continue;
    }
    parts.push(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${SECTION_GAP};border-collapse:collapse;">
        <tr>
          <td style="padding:16px;background:${C.cardBg};border:0.5px solid ${C.cardBorder};border-radius:12px;">
            ${tileLabel(full.label)}
            ${tileValue(full.value)}
          </td>
        </tr>
      </table>`);
    i += 1;
  }
  return parts.join("");
}

function renderSocialLinksBlock(): string {
  const networks = [
    { label: "Facebook", href: "https://www.facebook.com/rivieraopen/" },
    { label: "Instagram", href: "https://www.instagram.com/rivieraopen" },
    { label: "TikTok", href: "https://www.tiktok.com/@rivieraopen" },
  ];
  const cells = networks
    .map(
      (n) => `
            <td align="center" valign="top" style="padding:0 5px;">
              <a href="${hrefAttr(n.href)}" target="_blank" style="display:inline-block;min-width:88px;padding:12px 10px;font-family:${FONT};font-size:13px;font-weight:600;color:${C.text};text-decoration:none;border:0.5px solid ${C.cardBorder};border-radius:12px;background:${C.cardBg};">
                ${escapeHtml(n.label)}<br />
                <span style="font-size:11px;font-weight:500;color:${C.textSecondary};">@rivieraopen</span>
              </a>
            </td>`,
    )
    .join("");

  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
          <tr>
            <td align="center" style="padding:12px 0 10px;">
              <p style="margin:0;font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.textMuted};">Síguenos en redes</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 0 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>${cells}</tr>
              </table>
            </td>
          </tr>
        </table>`;
}

function buildLayout(options: {
  preheader: string;
  badge: string;
  playerName: string;
  headline: string;
  subtitle: string;
  tiles: EmailTile[];
  ctaLabel?: string;
  ctaHref?: string;
  socialLinks?: boolean;
}): string {
  const preheader = escapeHtml(options.preheader);
  const badge = escapeHtml(options.badge);
  const playerName = escapeHtml(options.playerName);
  const headline = escapeHtml(options.headline);
  const subtitle = escapeHtml(options.subtitle);

  const ctaBlock =
    options.ctaLabel && options.ctaHref
      ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
          <tr>
            <td style="padding:4px 0 8px;">
              <a href="${hrefAttr(options.ctaHref)}" target="_blank" style="display:block;width:100%;box-sizing:border-box;padding:14px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.onGold};text-align:center;text-decoration:none;background:${C.gold};border-radius:14px;">${escapeHtml(options.ctaLabel)} &rarr;</a>
            </td>
          </tr>
        </table>`
      : "";

  const socialBlock = options.socialLinks ? renderSocialLinksBlock() : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>Riviera Open</title>
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <!--<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${C.bgDeep};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.bgDeep};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="${EMAIL_CARD_MAX_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="max-width:${EMAIL_CARD_MAX_WIDTH}px;width:100%;background-color:${C.surface};border:0.5px solid rgba(255,255,255,0.1);border-radius:20px;overflow:hidden;">
          ${renderEmailHeroHeader(badge)}
          <!-- Body copy -->
          <tr>
            <td style="padding:24px 28px 12px;">
              ${renderEmailBrandLeadIn()}
              <p style="margin:0 0 14px;font-family:${FONT};font-size:13px;color:${C.textBody};">Hola, <span style="color:${C.text};font-weight:600;">${playerName}</span></p>
              <h1 style="margin:0 0 12px;font-family:${FONT};font-size:26px;font-weight:700;line-height:1.2;color:${C.text};letter-spacing:-0.02em;">${headline}</h1>
              <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.55;color:${C.textSecondary};">${subtitle}</p>
            </td>
          </tr>
          <!-- Tiles -->
          <tr>
            <td style="padding:8px 28px 28px;">
              ${renderTiles(options.tiles)}
              ${ctaBlock}
              ${socialBlock}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px 22px;border-top:0.5px solid ${C.footerBorder};background-color:${C.bgDeep};">
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.footerText};text-align:center;">
                <strong style="color:${C.textSecondary};">Riviera Open</strong> &middot;
                <a href="https://rivieraopen.com" style="color:${C.goldLink};text-decoration:none;">rivieraopen.com</a>
              </p>
              <p style="margin:8px 0 0;font-family:${FONT};font-size:11px;color:${C.textMuted};text-align:center;">Responde <strong style="color:${C.textSecondary};">BAJA</strong> para dejar de recibir emails.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

interface ShellContent {
  subject: string;
  preheader: string;
  headline: string;
  subtitle: string;
  tiles: EmailTile[];
  textBody: string;
  withCta?: boolean;
  withSocialLinks?: boolean;
}

function buildEmailShell(
  params: RivieraEmailParams,
  content: ShellContent,
): RivieraEmailResult {
  const ctaUrl = resolveEmailCtaUrl({
    kind: params.kind,
    torneoId: params.torneoId,
    grupoId: params.grupoId,
  });
  const ctaLabel = CTA_LABEL[params.kind];
  const badge = BADGE_LABEL[params.kind];
  const playerName = params.playerName.trim() || "Jugador";
  const useCta = content.withCta !== false && !content.withSocialLinks;
  const textSocial = content.withSocialLinks
    ? "\n\nSíguenos en redes (@rivieraopen):\n" +
      "Facebook: https://www.facebook.com/rivieraopen/\n" +
      "Instagram: https://www.instagram.com/rivieraopen\n" +
      "TikTok: https://www.tiktok.com/@rivieraopen"
    : "";
  const textLink = useCta
    ? `\n\n${ctaLabel}: ${ctaUrl}`
    : textSocial;

  return {
    subject: content.subject,
    text: content.textBody + textLink + "\n\nRiviera Open",
    html: buildLayout({
      preheader: content.preheader,
      badge,
      playerName,
      headline: content.headline,
      subtitle: content.subtitle,
      tiles: content.tiles,
      ctaLabel: useCta ? ctaLabel : undefined,
      ctaHref: useCta ? ctaUrl : undefined,
      socialLinks: content.withSocialLinks,
    }),
  };
}

export function buildRivieraEmail(params: RivieraEmailParams): RivieraEmailResult {
  const name = params.playerName.trim() || "Jugador";
  const torneo = params.torneoNombre.trim() || "Torneo";
  const cat = params.categoria?.trim() ? ` · ${params.categoria.trim()}` : "";
  const grupo = params.grupoNombre?.trim() || "Por confirmar";
  const rivales = params.rivales?.trim() || "Por confirmar";
  const compañero = params.compañero?.trim() || "";

  switch (params.kind) {
    case "bienvenida_torneo": {
      const categoriaLabel = params.categoria?.trim() || "Por confirmar";
      return buildEmailShell(params, {
        subject: `¡Inscrito en ${torneo}! 🎾`,
        preheader: `${torneo}${cat} — Inscripción confirmada`,
        headline: "¡Ya eres parte del torneo!",
        subtitle: `${name} · ${torneo}${cat}`,
        tiles: [
          { layout: "half", label: "Torneo", value: torneo },
          {
            layout: "half",
            label: "Tu categoría",
            value: categoriaLabel,
            highlight: false,
          },
          {
            layout: "banner",
            text: "🎾 ¡Prepárate para competir! Pronto te asignamos tu grupo.",
          },
        ],
        textBody:
          `Hola ${name},\n\n` +
          `Inscripción confirmada en ${torneo}${cat}.\n\n` +
          `🎾 ¡Prepárate para competir! Pronto te asignamos tu grupo.`,
        withCta: false,
        withSocialLinks: true,
      });
    }

    case "asignacion_grupo": {
      const groupPairs = parseGroupPairs(rivales);
      const parejasTexto =
        groupPairs.length > 0
          ? groupPairs.map((p) => `  · ${p}`).join("\n")
          : rivales;
      return buildEmailShell(params, {
        subject: `¡Estás inscrito/a! — ${torneo}`,
        preheader: `${torneo} — Grupo ${grupo}`,
        headline: "¡Ya estás en el torneo!",
        subtitle: `${torneo}${cat} · Tu grupo ha sido asignado`,
        tiles: [
          { layout: "half", label: "Torneo", value: torneo },
          { layout: "half", label: "Grupo", value: grupo, highlight: true },
          {
            layout: "banner",
            text: "🎾 ¡Listo para competir! Vive la experiencia Riviera Open.",
          },
          {
            layout: "full",
            label: "Parejas en tu grupo",
            value: rivales,
            pairs: groupPairs.length > 0 ? groupPairs : undefined,
            accent: "rivals",
          },
          ...(compañero
            ? [{ layout: "full" as const, label: "Tu pareja", value: compañero, accent: "partner" as const }]
            : []),
        ],
        textBody:
          `Hola ${name},\n\nInscripción confirmada en ${torneo}${cat}.\nGrupo: ${grupo}\nParejas en tu grupo:\n${parejasTexto}` +
          (compañero ? `\nTu pareja: ${compañero}` : "") +
          "\n\n🎾 ¡Listo para competir! Vive la experiencia Riviera Open.",
      });
    }

    case "clasifico_eliminatoria": {
      const grupoLabel = params.grupoNombre?.trim() || "—";
      return buildEmailShell(params, {
        subject: `🎯 ¡CLASIFICASTE! — ${torneo}`,
        preheader: `Eliminatoria · ${torneo} — ¡Sigue la aventura!`,
        headline: "¡Pasaste a ELIMINATORIA!",
        subtitle: `${torneo}${cat} · Entraste al cuadro — el campeonato continúa`,
        tiles: [
          { layout: "half", label: "Torneo", value: torneo },
          { layout: "half", label: "Grupo", value: grupoLabel, highlight: true },
          {
            layout: "banner",
            text: "🎯 ¡Gran trabajo en la fase de grupos! Ahora empieza lo más intenso: el cuadro eliminatorio.",
          },
          ...(compañero
            ? [{ layout: "full" as const, label: "Tu pareja", value: compañero, accent: "partner" as const }]
            : []),
        ],
        textBody:
          `Hola ${name},\n\n` +
          `¡Felicidades! Tu pareja clasificó a ELIMINATORIA en ${torneo}${cat}.\n` +
          `Grupo: ${grupoLabel}\n` +
          `El cuadro te espera — ¡a darlo todo en la cancha!\n\n` +
          `🎯 ¡Gran trabajo en grupos! Ahora empieza lo más intenso: el cuadro eliminatorio.`,
      });
    }

    case "no_clasifico": {
      const grupoLabel = params.grupoNombre?.trim() || "—";
      return buildEmailShell(params, {
        subject: `Riviera Open — ${torneo}`,
        preheader: `Gracias por competir · ${torneo}`,
        headline: "Gracias por participar",
        subtitle: `${torneo}${cat} · Tu esfuerzo en la fase de grupos cuenta`,
        tiles: [
          { layout: "half", label: "Torneo", value: torneo },
          { layout: "half", label: "Grupo", value: grupoLabel, highlight: false },
          {
            layout: "banner",
            text: "💪 ¡Esto no acaba aquí! Sigue preparándote — te esperamos en el próximo torneo Riviera Open.",
          },
          ...(compañero
            ? [{ layout: "full" as const, label: "Tu pareja", value: compañero, accent: "partner" as const }]
            : []),
        ],
        textBody:
          `Hola ${name},\n\n` +
          `Gracias por participar en ${torneo}${cat}.\n` +
          `Grupo: ${grupoLabel}\n\n` +
          `💪 ¡Esto no acaba aquí! Sigue preparándote — te esperamos en el próximo torneo Riviera Open.`,
        withCta: true,
      });
    }

    case "clasifico_final":
      return buildEmailShell(params, {
        subject: `🏆 ¡FINALISTA! — ${torneo}`,
        preheader: `Gran final · ${torneo} — ¡A por el título!`,
        headline: "¡Llegaste a la GRAN FINAL!",
        subtitle: `${torneo}${cat} · A un paso de levantar el trofeo`,
        tiles: [
          { layout: "half", label: "Torneo", value: torneo },
          { layout: "half", label: "Fase", value: "Gran final", highlight: true },
          {
            layout: "banner",
            text: "🏆 ¡Este es tu momento! Demuestra de qué están hechos y vive la experiencia Riviera Open.",
          },
          ...(compañero
            ? [{ layout: "full" as const, label: "Tu pareja", value: compañero, accent: "partner" as const }]
            : []),
        ],
        textBody:
          `Hola ${name},\n\n` +
          `¡Felicidades! Tu pareja llegó a la GRAN FINAL de ${torneo}${cat}.\n` +
          `A un paso del campeonato — ¡a darlo todo en la cancha!\n\n` +
          `🏆 ¡Este es tu momento! Vive la experiencia Riviera Open.`,
      });

    case "no_llego_final":
      return buildEmailShell(params, {
        subject: `Riviera Open — ${torneo}`,
        preheader: `Gracias por competir — ${torneo}`,
        headline: "Gracias por competir",
        subtitle: `${torneo}${cat} · Gran esfuerzo en eliminatoria`,
        tiles: [
          { layout: "half", label: "Torneo", value: torneo },
          { layout: "half", label: "Resultado", value: "No llegó a final" },
          ...(compañero
            ? [{ layout: "full" as const, label: "Tu pareja", value: compañero, accent: "partner" as const }]
            : []),
        ],
        textBody: `Hola ${name},\n\nGracias por competir en ${torneo}${cat}.`,
        withCta: true,
      });
  }
}

export function formatTorneoFecha(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-MX", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

