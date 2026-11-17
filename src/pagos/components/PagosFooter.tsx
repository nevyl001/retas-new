import React from "react";

export const PagosFooter: React.FC = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="pagos-footer">
      <div className="pagos-wrap pagos-footer__inner">
        <div className="pagos-footer__brand">
          <img src="/logo-riviera.png" alt="" width={36} height={36} />
          <div>
            <p className="pagos-footer__name">RIVIERA OPEN</p>
            <p className="pagos-footer__line">Cada partido cuenta.</p>
          </div>
        </div>
        <a className="pagos-footer__site" href="https://rivieraopen.com">
          rivieraopen.com
        </a>
        <p className="pagos-footer__copy">© {year} Riviera Open</p>
      </div>
    </footer>
  );
};
