import React from "react";
import {
  RIVIERA_SOCIAL_HANDLE,
  RIVIERA_SOCIAL_LINKS,
} from "../../lib/rivieraBranding";
import { TablerIcon } from "../ui/TablerIcon";
import "./riviera-public-social.css";

const ICON_BY_ID = {
  instagram: "brand-instagram",
  tiktok: "brand-tiktok",
  facebook: "brand-facebook",
} as const;

export const PublicRivieraSocialBar: React.FC<{
  className?: string;
  compact?: boolean;
}> = ({ className = "", compact = false }) => (
  <div
    className={[
      "ro-pub-social",
      compact ? "ro-pub-social--compact" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    aria-label="Redes sociales Riviera Open"
  >
    <p className="ro-pub-social__handle">{RIVIERA_SOCIAL_HANDLE}</p>
    <ul className="ro-pub-social__list">
      {RIVIERA_SOCIAL_LINKS.map((link) => (
        <li key={link.id}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`ro-pub-social__link ro-pub-social__link--${link.id}`}
            aria-label={`${link.label} ${RIVIERA_SOCIAL_HANDLE}`}
            title={`${link.label} · ${RIVIERA_SOCIAL_HANDLE}`}
          >
            <TablerIcon
              name={ICON_BY_ID[link.id]}
              size={compact ? 20 : 18}
              className="ro-pub-social__icon"
            />
            {!compact ? (
              <span className="ro-pub-social__label">{link.label}</span>
            ) : null}
          </a>
        </li>
      ))}
    </ul>
  </div>
);
