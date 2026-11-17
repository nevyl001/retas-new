import React from "react";
import { CourtLines } from "../components/CourtLines";
import { officialClipUrl } from "../utils/paymentLinks";

const CLIP_URL = officialClipUrl();

const BADGES = [
  "Pago oficial Riviera Open",
  "Proceso seguro con Clip",
  "Sin registro",
  "Pago rápido y directo",
];

export const PagosLandingPage: React.FC = () => (
  <>
    <section className="pagos-hero" aria-labelledby="pagos-hero-title">
      <div className="pagos-wrap pagos-hero__grid">
        <div className="pagos-hero__copy">
          <p className="pagos-kicker">RIVIERA OPEN | PAGOS OFICIALES</p>
          <h1 id="pagos-hero-title">
            TU SIGUIENTE
            <br />
            PARTIDO
            <br />
            COMIENZA
            <br />
            AQUÍ.
          </h1>
          <p className="pagos-lead">
            Cada partido cuenta. Asegura tu lugar y sigue construyendo tu historia en Riviera Open.
          </p>
          <ul className="pagos-badges">
            {BADGES.map((badge) => (
              <li key={badge}>{badge}</li>
            ))}
          </ul>
        </div>

        <figure className="pagos-blueprint">
          <div className="pagos-blueprint__frame">
            <CourtLines className="pagos-blueprint__court" />
            <p className="pagos-blueprint__index">01 · CANCHA</p>
          </div>
          <figcaption>
            <span>Sistema de pago</span>
            Oficial · directo en Clip
          </figcaption>
        </figure>
      </div>
    </section>

    <section className="pagos-paysection" aria-labelledby="pagos-pay-title">
      <div className="pagos-wrap">
        <div className="pagos-panel">
          <header className="pagos-panel__head">
            <div>
              <p className="pagos-kicker">CLIP</p>
              <h2 id="pagos-pay-title">REALIZA TU PAGO.</h2>
              <p className="pagos-lead">Completa tu pago en Clip siguiendo estas indicaciones.</p>
            </div>
            <p className="pagos-panel__note">El monto y el concepto se capturan directamente en Clip.</p>
          </header>

          <ol className="pagos-steps">
            <li>
              <span className="pagos-step__index">01</span>
              <div>
                <h3>MONTO</h3>
                <p>Ingresa la cantidad exacta que te indicó el organizador.</p>
              </div>
            </li>
            <li>
              <span className="pagos-step__index">02</span>
              <div>
                <h3>CONCEPTO DE PAGO</h3>
                <p>Escribe el nombre de la reta, torneo, liga o actividad por la que estás pagando.</p>
              </div>
            </li>
          </ol>

          <div className="pagos-example">
            <span>Ejemplo ilustrativo</span>
            <p>Reta varonil — Sábado 21 de noviembre.</p>
          </div>

          {CLIP_URL ? (
            <a className="pagos-pay" href={CLIP_URL} target="_blank" rel="noopener noreferrer">
              PAGAR AHORA
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="none" stroke="currentColor" strokeWidth="1.6" d="M7 17 17 7M9 7h8v8" />
              </svg>
              <span className="pagos-sr">, se abre Clip en una pestaña nueva</span>
            </a>
          ) : null}

          <p className="pagos-redirect">Serás redirigido a Clip para completar tu pago de forma segura.</p>
        </div>
      </div>
    </section>

    <section className="pagos-benefits" aria-labelledby="pagos-benefits-title">
      <div className="pagos-wrap">
        <h2 id="pagos-benefits-title" className="pagos-sr">
          Por qué pagar aquí
        </h2>
        <ul className="pagos-benefits__grid">
          <li>
            <ShieldIcon />
            <h3>Pago directo y seguro</h3>
            <p>Tu pago se realiza en Clip. Riviera Open no solicita ni almacena los datos de tu tarjeta.</p>
          </li>
          <li>
            <StepsIcon />
            <h3>Proceso claro</h3>
            <p>Tú defines el monto y el concepto tal como te lo indique el organizador.</p>
          </li>
          <li>
            <BoltIcon />
            <h3>Acceso inmediato</h3>
            <p>Entra, revisa las instrucciones y paga en segundos.</p>
          </li>
        </ul>
      </div>
    </section>

    <section className="pagos-close" aria-labelledby="pagos-close-title">
      <div className="pagos-wrap pagos-close__inner">
        <h2 id="pagos-close-title">
          SIGUE JUGANDO.
          <br />
          SIGUE SUMANDO.
        </h2>
        <p>Cada partido es una nueva oportunidad para competir, mejorar y escribir tu historia.</p>
        <p className="pagos-close__sign">RIVIERA OPEN — CADA PARTIDO CUENTA.</p>
      </div>
    </section>
  </>
);

const ShieldIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      d="M12 3.5 5.5 6.2v5.1c0 4.2 2.8 7.2 6.5 8.7 3.7-1.5 6.5-4.5 6.5-8.7V6.2L12 3.5z"
    />
    <path fill="none" stroke="currentColor" strokeWidth="1.4" d="M9 12.1 11 14.1 15.2 9.8" />
  </svg>
);

const StepsIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="none" stroke="currentColor" strokeWidth="1.4" d="M5 7h14M5 12h10M5 17h7" />
  </svg>
);

const BoltIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="none" stroke="currentColor" strokeWidth="1.4" d="M13 3.5 6.5 13H12l-1 7.5 6.5-9.5H12l1-7.5z" />
  </svg>
);
