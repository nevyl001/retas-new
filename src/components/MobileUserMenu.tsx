import React, { useEffect, useState } from "react";
import { useUser } from "../contexts/UserContext";
import "./MobileUserMenu.css";

export const MobileUserMenu: React.FC = () => {
  const { user, userProfile, signOut } = useUser();
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [userProfile?.avatar_url]);

  const handleLogout = async () => {
    await signOut();
  };

  if (!user || !userProfile) {
    return null;
  }

  const userInitials = userProfile.name
    ? userProfile.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <div className="mobile-user-menu">
      {/* Botón de cerrar sesión - Primero y centrado */}
      <div className="mobile-menu-options">
        <button
          className="mobile-menu-option mobile-menu-logout"
          onClick={handleLogout}
        >
          <span className="mobile-menu-icon">🚪</span>
          <span className="mobile-menu-text">Cerrar Sesión</span>
        </button>
      </div>

      {/* Información del usuario */}
      <div className="mobile-user-info">
        <div className="mobile-user-avatar">
          {userProfile.avatar_url && !avatarLoadFailed ? (
            <img
              src={userProfile.avatar_url}
              alt={userProfile.name}
              className="mobile-user-avatar-img"
              onError={() => setAvatarLoadFailed(true)}
            />
          ) : (
            <span className="mobile-user-avatar-initials">{userInitials}</span>
          )}
        </div>
        <div className="mobile-user-details">
          <div className="mobile-user-name">{userProfile.name}</div>
          <div className="mobile-user-email">{userProfile.email}</div>
        </div>
      </div>
    </div>
  );
};
