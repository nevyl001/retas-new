import React, { useState, useEffect, useRef } from "react";
import { useUser } from "../contexts/UserContext";
import { MobileUserMenu } from "./MobileUserMenu";
import "./UserHeader.css";

export const UserHeader: React.FC = () => {
  const { user, userProfile, signOut } = useUser();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    if (isSigningOut) return; // Evitar múltiples clics

    console.log("🚪 Intentando cerrar sesión...");
    setIsSigningOut(true);
    setShowDropdown(false); // Cerrar dropdown inmediatamente

    try {
      await signOut();
      console.log("✅ Sesión cerrada exitosamente");
    } catch (error) {
      console.error("❌ Error al cerrar sesión:", error);
    } finally {
      setIsSigningOut(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  return (
    <header className="user-header">
      <div className="user-header-content">
        <div className="user-header-logo">
          <h1>🏆 Bienvenido al mejor gestor de retas de pádel</h1>
        </div>

        <div className="user-header-actions">
          {/* Menú de escritorio */}
          <div className="user-profile desktop-only" ref={dropdownRef}>
            <button
              className="user-profile-btn"
              onClick={() => setShowDropdown(!showDropdown)}
            >
              <div className="user-avatar">
                {userProfile?.avatar_url ? (
                  <img
                    src={userProfile.avatar_url}
                    alt={userProfile.name}
                    className="user-avatar-img"
                  />
                ) : (
                  <span className="user-avatar-initials">
                    {getInitials(userProfile?.name || user?.email || "U")}
                  </span>
                )}
              </div>
              <div className="user-info">
                <span className="user-name">
                  {userProfile?.name || "Usuario"}
                </span>
                <span className="user-email">{user?.email}</span>
              </div>
              <span className="user-dropdown-arrow">
                {showDropdown ? "▲" : "▼"}
              </span>
            </button>

            {showDropdown && (
              <div className="user-dropdown">
                <div className="user-dropdown-content">
                  <div className="user-dropdown-actions">
                    <button className="dropdown-action-btn">
                      <span className="dropdown-icon">👤</span>
                      Mi Perfil
                    </button>
                    <button className="dropdown-action-btn">
                      <span className="dropdown-icon">⚙️</span>
                      Configuración
                    </button>
                    <button className="dropdown-action-btn">
                      <span className="dropdown-icon">📊</span>
                      Estadísticas
                    </button>
                    <hr className="dropdown-divider" />
                    <button
                      className="dropdown-action-btn logout-btn"
                      onClick={handleSignOut}
                      disabled={isSigningOut}
                    >
                      <span className="dropdown-icon">🚪</span>
                      {isSigningOut ? "Cerrando..." : "Cerrar Sesión"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Menú móvil */}
          <div className="mobile-only">
            <MobileUserMenu />
          </div>
        </div>
      </div>
    </header>
  );
};
