import React from "react";

interface AppHeaderProps {
  onCreateClick: () => void;
  isCreating: boolean;
}

const AppHeader: React.FC<AppHeaderProps> = ({ onCreateClick, isCreating }) => {
  return (
    <header className="app-header">
      <div className="app-header-container">
        <h1 className="app-header-title">🏆 Organiza tu Reta de Pádel</h1>
        <p className="app-header-subtitle">
          ¡Selecciona o crea una reta y comienza a jugar!
        </p>
        <button className="app-header-button" onClick={onCreateClick}>
          {isCreating ? "❌ Cancelar" : "+ Crear Nueva Reta"}
        </button>
      </div>
    </header>
  );
};

export default AppHeader;
