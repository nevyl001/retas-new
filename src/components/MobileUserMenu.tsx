import React, { useEffect, useState } from "react";
import { BrandSignature } from "../branding";
import { useUser } from "../contexts/UserContext";
import "./MobileUserMenu.css";

export const MobileUserMenu: React.FC<{
  onLogout?: () => void | Promise<void>;
  isSigningOut?: boolean;
}> = ({ onLogout, isSigningOut = false }) => {
  const { user, userProfile, signOut } = useUser();
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [userProfile?.avatar_url]);

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
      return;
    }
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

      <div className="mobile-menu-options">
        <button
          type="button"
          className="mobile-menu-option mobile-menu-logout"
          onClick={handleLogout}
          disabled={isSigningOut}
        >
          <span className="mobile-menu-icon">🚪</span>
          <span className="mobile-menu-text">
            {isSigningOut ? "Cerrando..." : "Cerrar Sesión"}
          </span>
        </button>
      </div>

      <div className="mobile-menu-brand" aria-hidden="true">
        <BrandSignature variant="menu" showTagline={false} logoSurface="dark" />
      </div>
    </div>
  );
};
