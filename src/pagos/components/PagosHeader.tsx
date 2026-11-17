import React from "react";

export const PagosHeader: React.FC<{ homeHref: string }> = ({ homeHref }) => (
  <header className="pagos-header">
    <div className="pagos-wrap pagos-header__inner">
      <a className="pagos-brand" href={homeHref}>
        <img src="/logo-riviera.png" alt="Riviera Open" width={40} height={40} />
      </a>
      <p className="pagos-header__label">PAGOS OFICIALES</p>
    </div>
  </header>
);
