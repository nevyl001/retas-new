import React, { useEffect, useRef, useState } from "react";
import { useAdmin } from "../../contexts/AdminContext";
import { ClubIdentity } from "../../club-experience";
import { TablerIcon } from "../ui/TablerIcon";
import {
  navigateAdminDashboard,
  type AdminControlSection,
} from "../../lib/admin/adminNav";
import "./AdminControlCenter.css";

export interface AdminNavBadgeCounts {
  cuentas?: number;
  competencias?: number;
  actividad?: number;
}

interface AdminControlLayoutProps {
  activeSection: AdminControlSection;
  onSelectSection?: (section: AdminControlSection) => void;
  title: string;
  eyebrow?: string;
  badges?: AdminNavBadgeCounts;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

interface NavItemConfig {
  id: AdminControlSection;
  label: string;
  icon: string;
  badgeKey?: keyof AdminNavBadgeCounts;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: "resumen", label: "Resumen", icon: "layout-dashboard" },
  {
    id: "cuentas",
    label: "Gestión de cuentas",
    icon: "users",
    badgeKey: "cuentas",
  },
  {
    id: "competencias",
    label: "Competencias",
    icon: "trophy",
    badgeKey: "competencias",
  },
  {
    id: "actividad",
    label: "Actividad",
    icon: "activity",
    badgeKey: "actividad",
  },
];

export const AdminControlLayout: React.FC<AdminControlLayoutProps> = ({
  activeSection,
  onSelectSection,
  title,
  eyebrow = "Riviera Open · Control Center",
  badges,
  headerActions,
  children,
}) => {
  const { adminUser, logoutAdmin } = useAdmin();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNavClick = (section: AdminControlSection) => {
    setMobileMenuOpen(false);
    if (onSelectSection) {
      onSelectSection(section);
    } else {
      navigateAdminDashboard(section);
    }
  };

  const handleLogout = async () => {
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
    try {
      await logoutAdmin();
    } finally {
      window.location.assign("/admin-login");
    }
  };

  const adminInitials = (adminUser?.email || "RO")
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="admin-cc">
      <div className="admin-cc__court-bg" aria-hidden="true" />

      {mobileMenuOpen ? (
        <div
          className="admin-cc__mobile-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <div className="admin-cc__shell">
        <aside
          className={`admin-cc__sidebar${
            mobileMenuOpen ? " admin-cc__sidebar--open" : ""
          }`}
          aria-label="Navegación principal del panel de administración"
        >
          <div className="admin-cc__brand">
            <button
              type="button"
              className="admin-cc__brand-logo-btn"
              onClick={() => handleNavClick("resumen")}
              title="Ir a Resumen del Control Center"
            >
              <ClubIdentity
                variant="compact"
                logoSurface="dark"
                forceRivieraLogo
                hideOrganizerName
              />
              <span className="admin-cc__brand-wordmark">Riviera Open</span>
            </button>
            <span className="admin-cc__brand-badge">
              <span className="admin-cc__brand-badge-dot" aria-hidden="true" />
              Admin Control Center
            </span>
          </div>

          <p className="admin-cc__nav-group-label">Módulos</p>
          <nav className="admin-cc__nav" aria-label="Secciones administrativas">
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              const badgeVal = item.badgeKey ? badges?.[item.badgeKey] : undefined;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`admin-cc__nav-item${
                    isActive ? " admin-cc__nav-item--active" : ""
                  }`}
                  onClick={() => handleNavClick(item.id)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="admin-cc__nav-item-main">
                    <TablerIcon
                      name={item.icon}
                      size={17}
                      className="admin-cc__nav-icon"
                    />
                    <span className="admin-cc__nav-label">{item.label}</span>
                  </span>
                  {typeof badgeVal === "number" ? (
                    <span className="admin-cc__nav-badge">{badgeVal}</span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="admin-cc__sidebar-footer">
            <div className="admin-cc__system-pill">
              <span className="admin-cc__system-dot" aria-hidden="true" />
              <span>Identidad oficial Riviera Open</span>
            </div>
          </div>
        </aside>

        <div className="admin-cc__workspace">
          <header className="admin-cc__topbar">
            <div className="admin-cc__topbar-left">
              <button
                type="button"
                className="admin-cc__mobile-menu-btn"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label={
                  mobileMenuOpen ? "Cerrar menú lateral" : "Abrir menú lateral"
                }
                aria-expanded={mobileMenuOpen}
              >
                <TablerIcon name={mobileMenuOpen ? "x" : "menu-2"} size={20} />
              </button>
              <div className="admin-cc__topbar-titles">
                <span className="admin-cc__topbar-eyebrow">{eyebrow}</span>
                <h1 className="admin-cc__topbar-title">{title}</h1>
              </div>
            </div>

            <div className="admin-cc__topbar-right">
              {headerActions ? (
                <div className="admin-cc__topbar-actions">{headerActions}</div>
              ) : null}

              <div className="admin-cc__account-menu" ref={accountMenuRef}>
                <button
                  type="button"
                  className="admin-cc__account-trigger"
                  onClick={() => setAccountMenuOpen((v) => !v)}
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  title={adminUser?.email ?? "Cuenta administradora"}
                >
                  <span className="admin-cc__account-avatar">
                    {adminInitials}
                  </span>
                  <span className="admin-cc__account-email">
                    {adminUser?.email ?? "Administrador"}
                  </span>
                  <TablerIcon name="chevron-down" size={14} />
                </button>

                {accountMenuOpen ? (
                  <div
                    className="admin-cc__account-dropdown"
                    role="menu"
                    aria-label="Menú de cuenta de administrador"
                  >
                    <div className="admin-cc__account-dropdown-head">
                      <span className="admin-cc__account-dropdown-role">
                        Administrador maestro
                      </span>
                      <span className="admin-cc__account-dropdown-mail">
                        {adminUser?.email ?? "Sin correo"}
                      </span>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      className="admin-cc__account-dropdown-item admin-cc__account-dropdown-item--danger"
                      onClick={() => void handleLogout()}
                    >
                      <TablerIcon name="logout" size={16} />
                      <span>Cerrar sesión</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <main className="admin-cc__content">{children}</main>
        </div>
      </div>
    </div>
  );
};
