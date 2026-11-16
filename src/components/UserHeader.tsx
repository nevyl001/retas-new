import React, { useEffect, useRef, useState } from "react";
import { ClubIdentity } from "../club-experience";
import { useUser } from "../contexts/UserContext";
import {
  navigateCoaching,
  navigateCoachPortal,
  navigateStudentCoaching,
} from "./coaching/coachingNav";
import { useCoachingNavRoles } from "./coaching/useCoachingNavRoles";
import "./UserHeader.css";

export const UserHeader: React.FC = () => {
  const { user, userProfile, signOut } = useUser();
  const {
    canAccessClubCoaching,
    canAccessCoachPortal,
    canAccessStudentCoaching,
  } = useCoachingNavRoles();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const desktopRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setShowDropdown(false);

    try {
      await signOut();
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
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

  useEffect(() => {
    if (!showDropdown) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        desktopRef.current?.contains(target) ||
        mobileRef.current?.contains(target)
      ) {
        return;
      }
      setShowDropdown(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [showDropdown]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [userProfile?.avatar_url]);

  const closeMenu = () => setShowDropdown(false);

  const renderAccountMenu = () => (
    <>
      {canAccessClubCoaching && (
        <button
          type="button"
          className="user-dropdown-item"
          role="menuitem"
          onClick={() => {
            closeMenu();
            navigateCoaching("/coaching");
          }}
        >
          <span>🎾</span>
          <span>Riviera Coaching</span>
        </button>
      )}
      {canAccessCoachPortal && (
        <button
          type="button"
          className="user-dropdown-item"
          role="menuitem"
          onClick={() => {
            closeMenu();
            navigateCoachPortal();
          }}
        >
          <span>📋</span>
          <span>Mi Espacio</span>
        </button>
      )}
      {canAccessStudentCoaching && (
        <button
          type="button"
          className="user-dropdown-item"
          role="menuitem"
          onClick={() => {
            closeMenu();
            navigateStudentCoaching();
          }}
        >
          <span>🎾</span>
          <span>Mi Coaching</span>
        </button>
      )}
      <button
        type="button"
        className="logout-button"
        role="menuitem"
        onClick={handleSignOut}
        disabled={isSigningOut}
      >
        <span>🚪</span>
        <span>{isSigningOut ? "Cerrando..." : "Cerrar Sesión"}</span>
      </button>
    </>
  );

  const avatarContent =
    userProfile?.avatar_url && !avatarLoadFailed ? (
      <img
        src={userProfile.avatar_url}
        alt={userProfile.name}
        className="user-avatar-img"
        onError={() => setAvatarLoadFailed(true)}
      />
    ) : (
      <span className="user-avatar-initials">
        {getInitials(userProfile?.name || user?.email || "U")}
      </span>
    );

  return (
    <header className="user-header ro-surface-dark">
      <div className="user-header-content">
        <div className="user-header-main">
          <div className="user-header-logo">
            <ClubIdentity variant="header" showTagline={false} />
          </div>

          <div className="user-header-actions desktop-only">
            <div className="user-profile-wrapper" ref={desktopRef}>
              <button
                type="button"
                className="user-profile-btn"
                onClick={() => setShowDropdown((open) => !open)}
                aria-expanded={showDropdown}
                aria-haspopup="menu"
                aria-label="Menú de cuenta"
              >
                <div className="user-avatar">{avatarContent}</div>
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
                <div className="user-dropdown-menu" role="menu">
                  {renderAccountMenu()}
                </div>
              )}
            </div>
          </div>

          <div className="user-header-mobile mobile-only" ref={mobileRef}>
            <button
              type="button"
              className="user-header-mobile-btn"
              onClick={() => setShowDropdown((open) => !open)}
              aria-expanded={showDropdown}
              aria-haspopup="menu"
              aria-label="Menú de cuenta"
            >
              <span className="user-header-mobile-avatar user-avatar">{avatarContent}</span>
            </button>
            {showDropdown && (
              <div className="user-header-mobile-panel" role="menu">
                {renderAccountMenu()}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
