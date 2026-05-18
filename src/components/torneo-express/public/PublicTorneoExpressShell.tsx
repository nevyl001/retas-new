import React, { useEffect } from "react";
import "./torneo-express-public.css";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@400;500;600;700&display=swap";

function usePublicFonts() {
  useEffect(() => {
    const id = "te-public-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

export const PublicTorneoExpressShell: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => {
  usePublicFonts();

  return (
    <div className={`te-public App--public-full-width ${className}`.trim()}>
      <div className="te-public__grain" aria-hidden />
      <div className="te-public__glow te-public__glow--a" aria-hidden />
      <div className="te-public__glow te-public__glow--b" aria-hidden />
      <div className="te-public__inner">{children}</div>
    </div>
  );
};
