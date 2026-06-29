import React, { useState, useEffect, useRef } from "react";
import { useUser } from "../contexts/UserContext";
import { BrandSignature, useBrand } from "../branding";
import { MobileUserMenu } from "./MobileUserMenu";
import "./UserHeader.css";

export const UserHeader: React.FC = () => {
  const { user, userProfile, signOut } = useUser();
  const { isCoBranded } = useBrand();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setShowDropdown(false);
    setShowMobileMenu(false);

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
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        showDropdown &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setShowDropdown(false);
      }

      if (
        showMobileMenu &&
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(target) &&
        mobileButtonRef.current &&
        !mobileButtonRef.current.contains(target)
      ) {
        setShowMobileMenu(false);
      }
    };

    if (showDropdown || showMobileMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown, showMobileMenu]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [userProfile?.avatar_url]);

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
    <header className="user-header">
      <div className="user-header-content">
        <div className="user-header-main">
          <div className="user-header-logo">
            <BrandSignature variant="header" showTagline={!isCoBranded} />
          </div>

          <div className="user-header-actions desktop-only">
            <div className="user-profile-wrapper">
              <button
                ref={buttonRef}
                className="user-profile-btn"
                onClick={() => setShowDropdown(!showDropdown)}
                aria-expanded={showDropdown}
                aria-haspopup="menu"
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
                <div ref={dropdownRef} className="user-dropdown-menu">
                  <button
                    className="logout-button"
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                  >
                    <span>🚪</span>
                    <span>
                      {isSigningOut ? "Cerrando..." : "Cerrar Sesión"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="user-header-mobile mobile-only">
            <button
              ref={mobileButtonRef}
              type="button"
              className="user-header-mobile-btn"
              onClick={() => setShowMobileMenu((open) => !open)}
              aria-expanded={showMobileMenu}
              aria-haspopup="menu"
              aria-label="Menú de usuario"
            >
              <div className="user-avatar">{avatarContent}</div>
              <span className="user-header-mobile-chevron" aria-hidden>
                {showMobileMenu ? "▲" : "▼"}
              </span>
            </button>

            {showMobileMenu && (
              <div ref={mobileMenuRef} className="user-header-mobile-panel">
                <MobileUserMenu
                  onLogout={handleSignOut}
                  isSigningOut={isSigningOut}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
