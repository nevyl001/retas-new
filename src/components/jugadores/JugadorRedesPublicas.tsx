import React from "react";
import type { RedSocialLink } from "../../lib/rivieraJugadores/jugadorRedes";
import { TablerIcon } from "../ui/TablerIcon";

const RED_CONFIG: Record<
  RedSocialLink["id"],
  { icon: string; chipClass: string }
> = {
  instagram: { icon: "brand-instagram", chipClass: "rjp-ficha-social__chip--ig" },
  facebook: { icon: "brand-facebook", chipClass: "rjp-ficha-social__chip--fb" },
  tiktok: { icon: "brand-tiktok", chipClass: "rjp-ficha-social__chip--tt" },
};

function socialHandle(link: RedSocialLink): string {
  try {
    const u = new URL(link.href);
    const parts = u.pathname.split("/").filter(Boolean);
    const segment = parts[parts.length - 1] ?? "";
    const handle = segment.replace(/^@/, "");
    if (handle) return `@${handle}`;
  } catch {
    /* ignore */
  }
  return link.label;
}

interface JugadorRedesPublicasProps {
  redes: RedSocialLink[];
  className?: string;
  /** share = filas con handle para player card; default = iconos compactos */
  variant?: "default" | "share";
}

export const JugadorRedesPublicas: React.FC<JugadorRedesPublicasProps> = ({
  redes,
  className = "",
  variant = "default",
}) => {
  if (redes.length === 0) return null;

  const rootClass = [
    "rjp-ficha-social",
    variant === "share" ? "rjp-ficha-social--share" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={rootClass} aria-label="Redes sociales">
      <h2 className="rjp-ficha-social__title">Redes sociales</h2>
      <ul
        className={
          variant === "share"
            ? "rjp-ficha-social__links"
            : "rjp-ficha-social__grid"
        }
      >
        {redes.map((r) => {
          const cfg = RED_CONFIG[r.id];
          return (
            <li key={r.id}>
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  variant === "share"
                    ? "rjp-ficha-social__link"
                    : "rjp-ficha-social__btn"
                }
                aria-label={r.label}
                title={r.label}
              >
                <span
                  className={[
                    "rjp-ficha-social__chip",
                    cfg.chipClass,
                  ].join(" ")}
                >
                  <TablerIcon name={cfg.icon} size={18} />
                </span>
                {variant === "share" ? (
                  <span className="rjp-ficha-social__handle">{socialHandle(r)}</span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
