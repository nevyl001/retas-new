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

interface JugadorRedesPublicasProps {
  redes: RedSocialLink[];
  className?: string;
}

export const JugadorRedesPublicas: React.FC<JugadorRedesPublicasProps> = ({
  redes,
  className = "",
}) => {
  if (redes.length === 0) return null;

  return (
    <section
      className={["rjp-ficha-card rjp-ficha-social", className].filter(Boolean).join(" ")}
      aria-label="Redes sociales"
    >
      <h2 className="rjp-ficha-social__title">
        <span className="rjp-ficha-social__dot" aria-hidden />
        Redes sociales
      </h2>
      <ul className="rjp-ficha-social__grid">
        {redes.map((r) => {
          const cfg = RED_CONFIG[r.id];
          return (
            <li key={r.id}>
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rjp-ficha-social__btn"
              >
                <span
                  className={[
                    "rjp-ficha-social__chip",
                    cfg.chipClass,
                  ].join(" ")}
                >
                  <TablerIcon name={cfg.icon} size={15} />
                </span>
                <span className="rjp-ficha-social__label">{r.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
