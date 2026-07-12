import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  navigateMobileNavTab,
  resolveMobileNavTab,
  type MobileNavTabId,
} from "../../lib/mobileAppNavigation";
import { PATH_SYNC_EVENT } from "../../lib/appRouting";
import { buildPrivacidadTerminosPath } from "../../lib/legalNav";
import { navigateAppTo } from "../../lib/appRouting";
import { TablerIcon } from "../ui/TablerIcon";
import { Modal } from "../ui/Modal";
import { MobileUserMenu } from "../MobileUserMenu";
import "./MobileAppNavigation.css";

const TABS: Array<{
  id: MobileNavTabId;
  label: string;
  icon: string;
  ariaLabel: string;
}> = [
  { id: "inicio", label: "Inicio", icon: "home", ariaLabel: "Ir al inicio" },
  { id: "eventos", label: "Eventos", icon: "calendar-event", ariaLabel: "Ver mis eventos" },
  { id: "jugadores", label: "Jugadores", icon: "users", ariaLabel: "Registro de jugadores" },
  { id: "ranking", label: "Ranking", icon: "trophy", ariaLabel: "Ranking del club" },
  { id: "mas", label: "Más", icon: "menu-2", ariaLabel: "Más opciones" },
];

export interface MobileAppNavigationProps {
  pathname: string;
}

export const MobileAppNavigation: React.FC<MobileAppNavigationProps> = ({
  pathname,
}) => {
  const { user, signOut } = useUser();
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" ? window.location.search : ""
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const sync = () => {
      setSearch(window.location.search);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener(PATH_SYNC_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(PATH_SYNC_EVENT, sync);
    };
  }, []);

  const activeTab = useMemo(
    () => resolveMobileNavTab(pathname, search),
    [pathname, search]
  );

  const handleTabClick = useCallback(
    (tab: MobileNavTabId) => {
      if (tab === "mas") {
        setMoreOpen(true);
        return;
      }
      setMoreOpen(false);
      navigateMobileNavTab(tab, user?.id);
    },
    [user?.id]
  );

  const handleLogout = useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      setMoreOpen(false);
    } finally {
      setIsSigningOut(false);
    }
  }, [isSigningOut, signOut]);

  const handleCloseMore = useCallback(() => {
    setMoreOpen(false);
    requestAnimationFrame(() => {
      moreTriggerRef.current?.focus();
    });
  }, []);

  return (
    <>
      <nav
        className="mobile-app-navigation"
        aria-label="Navegación principal"
      >
        <ul className="mobile-app-navigation__list">
          {TABS.map((tab) => {
            const isActive =
              tab.id === "mas" ? moreOpen : activeTab === tab.id;
            return (
              <li key={tab.id} className="mobile-app-navigation__item">
                <button
                  ref={tab.id === "mas" ? moreTriggerRef : undefined}
                  type="button"
                  className={[
                    "mobile-app-navigation__btn",
                    isActive ? "mobile-app-navigation__btn--active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handleTabClick(tab.id)}
                  aria-label={tab.ariaLabel}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="mobile-app-navigation__icon" aria-hidden>
                    <TablerIcon name={tab.icon} size={22} />
                  </span>
                  <span className="mobile-app-navigation__label">{tab.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <Modal
        open={moreOpen}
        onClose={handleCloseMore}
        title="Más"
        size="sm"
        sheet
        className="mobile-more-sheet"
        bodyClassName="mobile-more-sheet__body"
      >
        <MobileUserMenu onLogout={handleLogout} isSigningOut={isSigningOut} />
        <div className="mobile-more-sheet__legal">
          <button
            type="button"
            className="mobile-more-sheet__legal-btn"
            onClick={() => {
              setMoreOpen(false);
              navigateAppTo(buildPrivacidadTerminosPath());
            }}
          >
            <TablerIcon name="file-text" size={18} aria-hidden />
            Aviso de Privacidad y Términos
          </button>
        </div>
      </Modal>
    </>
  );
};
