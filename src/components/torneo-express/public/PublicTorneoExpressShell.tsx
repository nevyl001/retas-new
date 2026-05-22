import React from "react";
import "./torneo-express-public.css";

export const PublicTorneoExpressShell: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => {
  return (
    <div
      className={`te-public App--public-full-width ro-public-view ${className}`.trim()}
    >
      <div className="te-public__grain" aria-hidden />
      <div className="te-public__glow te-public__glow--a" aria-hidden />
      <div className="te-public__glow te-public__glow--b" aria-hidden />
      <div className="te-public__inner">{children}</div>
    </div>
  );
};
