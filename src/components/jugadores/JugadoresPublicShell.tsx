import React from "react";
import "./riviera-jugadores.css";
import "./riviera-jugadores-public.css";

export const JugadoresPublicShell: React.FC<{
  children: React.ReactNode;
  variant?: "ranking" | "ficha";
  /** Página de reglas de puntos: más ancha en escritorio */
  layout?: "ranking" | "rules";
}> = ({ children, variant = "ranking", layout }) => {
  const shellLayout = layout ?? (variant === "ranking" ? "ranking" : "default");
  const rootClass = [
    "rjp-public",
    variant === "ficha" ? "rjp-public--ficha" : "",
    variant === "ranking" ? "rjp-public--ranking" : "",
    shellLayout === "rules" ? "rjp-public--rules" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <div className="rjp-public__grain" aria-hidden />
      <div className="rjp-public__glow rjp-public__glow--top" aria-hidden />
      <div className="rjp-public__inner">{children}</div>
    </div>
  );
};
