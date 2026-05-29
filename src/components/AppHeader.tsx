import React from "react";
import { RIVIERA_APP_TAGLINE } from "../lib/rivieraBranding";

interface AppHeaderProps {
  onCreateClick: () => void;
  isCreating: boolean;
}

const AppHeader: React.FC<AppHeaderProps> = ({ onCreateClick, isCreating }) => {
  return (
    <header className="app-header">
      <div className="app-header-container">
        <h1 className="app-header-title">🏆 RivieraApp</h1>
        <p className="app-header-subtitle">{RIVIERA_APP_TAGLINE}</p>
        <button className="app-header-button" onClick={onCreateClick}>
          {isCreating ? "❌ Cancelar" : "+ Crear Nueva Reta"}
        </button>
      </div>
    </header>
  );
};

export default AppHeader;
