import React from "react";
import { CourtLines } from "../components/CourtLines";
import { officialClipUrl } from "../utils/paymentLinks";

const CLIP_URL = officialClipUrl();

export const PagosLandingPage: React.FC = () => (
  <>
    <section className="pagos-hero" aria-labelledby="pagos-hero-title">
      <div className="pagos-wrap pagos-hero__grid">
        <div>
          <p className="pagos-kicker">RIVIERA OPEN | PAGOS OFICIALES</p>
          <h1 id="pagos-hero-title">TU SIGUIENTE PARTIDO COMIENZA AQUÍ.</h1>
          <p className="pagos-lead">
            Cada partido cuenta. Asegura tu lugar y sigue construyendo tu historia en Riviera Open.
          </p>
        </div>
        <CourtLines className="pagos-hero__court" />
      </div>
    </section>

    <section className="pagos-paysection" aria-labelledby="pagos-pay-title">
      <div className="pagos-wrap pagos-sheet">
        <h2 id="pagos-pay-title">REALIZA TU PAGO.</h2>
        <p className="pagos-lead">Completa tu pago en Clip siguiendo estas indicaciones.</p>

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

        <p className="pagos-example">
          <span>Ejemplo ilustrativo</span>
          Reta varonil — Sábado 21 de noviembre.
        </p>

        {CLIP_URL ? (
          <a className="pagos-pay" href={CLIP_URL} target="_blank" rel="noopener noreferrer">
            PAGAR AHORA
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                d="M7 17 17 7M9 7h8v8"
              />
            </svg>
            <span className="pagos-sr">, se abre Clip en una pestaña nueva</span>
          </a>
        ) : null}

        <div className="pagos-trust">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              d="M12 3.5 5.5 6.2v5.1c0 4.2 2.8 7.2 6.5 8.7 3.7-1.5 6.5-4.5 6.5-8.7V6.2L12 3.5z"
            />
            <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M9 12.1 11 14.1 15.2 9.8" />
          </svg>
          <div>
            <h3>TU PAGO, EN UN ENTORNO SEGURO.</h3>
            <p>El pago se realiza directamente en Clip. Riviera Open no solicita ni almacena los datos de tu tarjeta.</p>
          </div>
        </div>
      </div>
    </section>

    <section className="pagos-close" aria-labelledby="pagos-close-title">
      <div className="pagos-wrap">
        <h2 id="pagos-close-title">SIGUE JUGANDO. SIGUE SUMANDO.</h2>
        <p>Cada partido es una nueva oportunidad para escribir tu historia.</p>
        <p className="pagos-close__sign">RIVIERA OPEN — CADA PARTIDO CUENTA.</p>
      </div>
    </section>
  </>
);
