import React, { useEffect, useState } from "react";
import { ClubIdentity } from "../club-experience";
import { useUser } from "../contexts/UserContext";
import {
  navigateCoaching,
  navigateCoachPortal,
  navigateStudentCoaching,
} from "./coaching/coachingNav";
import { useCoachingNavRoles } from "./coaching/useCoachingNavRoles";
import "./MobileUserMenu.css";

export const MobileUserMenu: React.FC<{
  onLogout?: () => void | Promise<void>;
  isSigningOut?: boolean;
}> = ({ onLogout, isSigningOut = false }) => {
  const { user, userProfile, signOut } = useUser();
  const {
    canAccessClubCoaching,
    canAccessCoachPortal,
    canAccessStudentCoaching,
  } = useCoachingNavRoles();
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
        {canAccessClubCoaching && (
          <button
            type="button"
            className="mobile-menu-option"
            onClick={() => {
              navigateCoaching("/coaching");
            }}
          >
            <span className="mobile-menu-icon">🎾</span>
            <span className="mobile-menu-text">Riviera Coaching</span>
          </button>
        )}
        {canAccessCoachPortal && (
          <button
            type="button"
            className="mobile-menu-option"
            onClick={() => {
              navigateCoachPortal();
            }}
          >
            <span className="mobile-menu-icon">📋</span>
            <span className="mobile-menu-text">Mi Espacio</span>
          </button>
        )}
        {canAccessStudentCoaching && (
          <button
            type="button"
            className="mobile-menu-option"
            onClick={() => {
              navigateStudentCoaching();
            }}
          >
            <span className="mobile-menu-icon">🎾</span>
            <span className="mobile-menu-text">Mi Coaching</span>
          </button>
        )}
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
        <ClubIdentity variant="menu" showTagline={false} logoSurface="dark" />
      </div>
    </div>
  );
};
