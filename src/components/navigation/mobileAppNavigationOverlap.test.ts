import fs from "fs";
import path from "path";

describe("MobileAppNavigation and Sticky CTA Layout & Overlap Guards", () => {
  const rootDir = path.resolve(__dirname, "../../..");
  const appShellCssPath = path.join(rootDir, "src/styles/riviera-app-shell.css");
  const qmWorkspaceCssPath = path.join(rootDir, "src/styles/quick-mode-workspace.css");
  const mobileNavCssPath = path.join(rootDir, "src/components/navigation/MobileAppNavigation.css");
  const footerCssPath = path.join(rootDir, "src/components/legal/app-site-footer.css");

  const appShellCss = fs.readFileSync(appShellCssPath, "utf8");
  const qmWorkspaceCss = fs.readFileSync(qmWorkspaceCssPath, "utf8");
  const mobileNavCss = fs.readFileSync(mobileNavCssPath, "utf8");
  const footerCss = fs.readFileSync(footerCssPath, "utf8");

  describe("CSS Variables & Height Calculations", () => {
    it("defines --mobile-app-nav-total-height in :root and .has-mobile-app-navigation", () => {
      expect(appShellCss).toContain("--mobile-app-nav-total-height: 0px;");
      expect(appShellCss).toContain(
        "--mobile-app-nav-total-height: calc(\n    var(--mobile-app-navigation-height) + var(--ro-safe-bottom, env(safe-area-inset-bottom, 0px))\n  );"
      );
    });

    it("resets mobile navigation height and offset to 0px on tablet/desktop (min-width: 768px)", () => {
      expect(appShellCss).toMatch(
        /@media \(min-width: 768px\) \{[\s\S]*?--mobile-app-nav-total-height: 0px;[\s\S]*?--mobile-app-navigation-offset: 0px;/
      );
    });

    it("defines --qm-ws-sticky-cta-height for exact clearance calculations", () => {
      expect(appShellCss).toContain("--qm-ws-sticky-cta-height: 60px;");
    });
  });

  describe("Sticky CTA Positioning Above Bottom Navigation", () => {
    it("anchors .qm-ws__sticky-cta to bottom: 0 by default with safe-area padding", () => {
      expect(qmWorkspaceCss).toMatch(
        /\.qm-ws__sticky-cta \{[\s\S]*?position: fixed;[\s\S]*?bottom: 0;[\s\S]*?padding-bottom: calc\(0\.55rem \+ var\(--ro-safe-bottom/
      );
    });

    it("anchors .qm-ws--create-compose .qm-ws__sticky-cta to bottom: 0 by default with safe-area padding", () => {
      expect(qmWorkspaceCss).toMatch(
        /\.qm-ws--create-compose \.qm-ws__sticky-cta \{[\s\S]*?position: fixed;[\s\S]*?bottom: 0;[\s\S]*?padding-bottom: calc\(0\.5rem \+ var\(--ro-safe-bottom/
      );
    });

    it("elevates .has-mobile-app-navigation .qm-ws__sticky-cta above the total bottom navigation height", () => {
      expect(qmWorkspaceCss).toMatch(
        /\.has-mobile-app-navigation \.qm-ws__sticky-cta \{[\s\S]*?bottom: var\(--mobile-app-nav-total-height/
      );
      expect(qmWorkspaceCss).toMatch(
        /\.has-mobile-app-navigation \.qm-ws--create-compose \.qm-ws__sticky-cta \{[\s\S]*?bottom: var\(--mobile-app-nav-total-height/
      );
    });

    it("does NOT position sticky CTA using raw --mobile-app-navigation-height (which ignores safe-area)", () => {
      expect(qmWorkspaceCss).not.toContain(
        "bottom: var(--mobile-app-navigation-height, 0px);"
      );
    });

    it("styles mobile bar with centered proportional button with 44px touch target", () => {
      expect(qmWorkspaceCss).toMatch(
        /\.qm-ws__compose-mobile-bar \{[\s\S]*?justify-content: center;[\s\S]*?max-width: 480px;/
      );
      expect(qmWorkspaceCss).toMatch(
        /\.qm-ws__compose-mobile-bar \.qm-primary-cta__btn[\s\S]*?min-height: 44px;[\s\S]*?height: 44px;/
      );
    });
  });

  describe("Stacking Context & Fixed Positioning Containment", () => {
    it("gives .mobile-app-navigation a z-index higher than .qm-ws__sticky-cta", () => {
      expect(mobileNavCss).toContain("z-index: calc(var(--ro-z-sticky, 50) + 2);");
      expect(qmWorkspaceCss).toContain("z-index: calc(var(--ro-z-sticky, 50) + 1);");
    });

    it("disables animation and transform on main-layout and duelo2v2-page when holding qm-ws", () => {
      expect(qmWorkspaceCss).toMatch(
        /\.main-layout:has\(\.qm-ws\),[\s\S]*?\.main-layout:has\(\.qm-ws__sticky-cta\),[\s\S]*?\.duelo2v2-page:has\(\.qm-ws\) \{[\s\S]*?animation: none;[\s\S]*?transform: none;[\s\S]*?\}/
      );
    });
  });

  describe("Scroll Clearance and Void Elimination", () => {
    it("ensures .home-inner and .home-create-details workspaces do not double-pad before the footer", () => {
      expect(qmWorkspaceCss).toContain(
        ".home-inner .qm-ws.qm-ws--create-compose,\n  .home-create-details .qm-ws.qm-ws--create-compose {\n    padding-bottom: 0 !important;\n  }"
      );
    });

    it("clears both the sticky CTA and mobile navigation on .home-inner:has(.qm-ws--create-compose) .app-site-foot", () => {
      expect(footerCss).toMatch(
        /\.has-mobile-app-navigation \.home-inner:has\(\.qm-ws--create-compose\)[\s\S]*?\{[\s\S]*?padding-bottom: calc\([\s\S]*?--mobile-app-nav-total-height[\s\S]*?--qm-ws-sticky-cta-height/
      );
    });

    it("prevents double-padding on shell level for create-compose screens", () => {
      expect(appShellCss).toContain(
        ".has-mobile-app-navigation .main-layout:has(.qm-ws--create-compose),\n  .has-mobile-app-navigation .duelo2v2-page:has(.qm-ws--create-compose) {\n    padding-bottom: 0 !important;\n  }"
      );
    });
  });

  describe("DOM Cascade and Selector Verification", () => {
    let styleEl: HTMLStyleElement;

    beforeAll(() => {
      styleEl = document.createElement("style");
      styleEl.innerHTML = [appShellCss, qmWorkspaceCss, mobileNavCss, footerCss].join("\n");
      document.head.appendChild(styleEl);
    });

    afterAll(() => {
      styleEl.remove();
    });

    it("matches the real QuickStartSheet DOM hierarchy (.home-inner > .home-create-details > .qm-ws) and zeroes out intermediate workspace padding", () => {
      const container = document.createElement("div");
      container.className = "App has-mobile-app-navigation";
      container.innerHTML = `
        <div class="main-layout">
          <div class="home-inner rv-page">
            <div class="home-create-details home-create-details--qm rv-page">
              <div class="qm-ws qm-ws--wide qm-ws--create-compose">
                <div class="qm-ws__body">
                  <aside class="qm-ws__sidebar">
                    <div class="qm-ws-panel qm-ws-panel--compose">Resumen</div>
                  </aside>
                </div>
                <div class="qm-ws__sticky-cta">
                  <div class="qm-ws__compose-mobile-bar">
                    <div class="qm-primary-cta qm-primary-cta--sidebar">
                      <button class="qm-primary-cta__btn">Guardar y continuar</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <footer class="app-site-foot">Footer</footer>
          </div>
        </div>
        <nav class="mobile-app-navigation ro-surface-dark"></nav>
      `;
      document.body.appendChild(container);

      const workspace = container.querySelector(".qm-ws--create-compose") as HTMLElement;
      expect(workspace.matches(".home-create-details .qm-ws.qm-ws--create-compose")).toBe(true);
      expect(workspace.matches(".home-inner .qm-ws.qm-ws--create-compose")).toBe(true);

      const computed = window.getComputedStyle(workspace);
      // Confirma que el selector específico (.home-create-details .qm-ws.qm-ws--create-compose) aplica 0px
      expect(computed.paddingBottom).toBe("0px");

      const btn = container.querySelector(".qm-primary-cta__btn") as HTMLButtonElement;
      expect(btn.textContent).toBe("Guardar y continuar");

      // Confirma que no hay mensaje duplicado de estatus en la barra móvil
      expect(container.querySelector(".qm-ws__compose-mobile-status")).toBeNull();

      container.remove();
    });
  });
});

