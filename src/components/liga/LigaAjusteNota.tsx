import React from "react";
import "./liga-ajuste-nota.css";

/** Motivo de un ajuste de puntos, cerrado hasta que se abre. */
export const LigaAjusteNota: React.FC<{ motivo: string }> = ({ motivo }) => {
  const texto = motivo.trim();
  if (!texto) return null;
  return (
    <details className="liga-ajuste-nota">
      <summary className="liga-ajuste-nota__summary">Ajuste</summary>
      <p className="liga-ajuste-nota__motivo">{texto}</p>
    </details>
  );
};
