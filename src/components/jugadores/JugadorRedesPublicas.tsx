import React from "react";
import type { RedSocialLink } from "../../lib/rivieraJugadores/jugadorRedes";

const ICONS: Record<RedSocialLink["id"], React.ReactNode> = {
  instagram: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.334 3.608 1.308.974.974 1.246 2.241 1.308 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.334 2.633-1.308 3.608-.974.974-2.241 1.246-3.608 1.308-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.334-3.608-1.308-.974-.974-1.246-2.241-1.308-3.608C2.175 15.747 2.163 15.367 2.163 12s.012-3.584.07-4.85c.062-1.366.334-2.633 1.308-3.608.974-.974 2.241-1.246 3.608-1.308C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.017 7.052.082 5.775.147 4.602.398 3.56 1.44 2.518 2.482 2.267 3.655 2.202 4.932 2.137 6.212 2.12 6.621 2.12 12c0 5.379.017 5.788.082 7.068.065 1.277.316 2.45 1.358 3.492 1.042 1.042 2.215 1.293 3.492 1.358 1.28.065 1.689.082 7.068.082s5.788-.017 7.068-.082c1.277-.065 2.45-.316 3.492-1.358 1.042-1.042 1.293-2.215 1.358-3.492.065-1.28.082-1.689.082-7.068 0-5.379-.017-5.788-.082-7.068-.065-1.277-.316-2.45-1.358-3.492C21.398 4.602 20.225 4.351 18.948 4.286 17.668 4.221 17.259 4.204 12 4.204zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"
      />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
      />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"
      />
    </svg>
  ),
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
    <aside
      className={["rjp-profile-social", className].filter(Boolean).join(" ")}
      aria-label="Redes sociales"
    >
      <p className="rjp-profile-social__title">
        <span className="rjp-profile-social__dot" aria-hidden />
        Redes
      </p>
      <ul className="rjp-profile-social__list">
        {redes.map((r) => (
          <li key={r.id}>
            <a
              href={r.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`rjp-profile-social__link rjp-profile-social__link--${r.id}`}
            >
              <span className="rjp-profile-social__icon">{ICONS[r.id]}</span>
              <span>{r.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
};
