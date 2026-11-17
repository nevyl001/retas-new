import React from "react";

export const PagosFooter: React.FC = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="pagos-footer">
      <div className="pagos-wrap pagos-footer__inner">
        <img src="/logo-riviera.png" alt="" width={32} height={32} />
        <div>
          <p className="pagos-footer__name">RIVIERA OPEN</p>
          <p className="pagos-footer__line">Cada partido cuenta.</p>
        </div>
        <a className="pagos-footer__site" href="https://rivieraopen.com">
          rivieraopen.com
        </a>
        <p className="pagos-footer__copy">© {year} Riviera Open</p>
      </div>
    </footer>
  );
};
