import React from "react";
import { useUser } from "../contexts/UserContext";
import "./MobileUserMenu.css";

export const MobileUserMenu: React.FC = () => {
  const { user, userProfile } = useUser();

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
      {/* Información del usuario */}
      <div className="mobile-user-info">
        <div className="mobile-user-avatar">
          {userProfile.avatar_url ? (
            <img
              src={userProfile.avatar_url}
              alt={userProfile.name}
              className="mobile-user-avatar-img"
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
