/**
 * Bootstrap de tema de club ANTES de cargar CSS/React.
 * Mantener en sync con organizadorClubIndex + manifests/hack-padel.ts
 */
(function () {
  var CACHE_KEY = "ro_club_experience_v1";

  /** UUID → brandingKey (premium activo) */
  var ORG_BRAND = {
    "e724de97-3552-4a01-a269-f621e6f1ed26": "hack-padel",
  };

  /** Tokens mínimos por brandingKey (evita flash de acentos Riviera) */
  var BRAND_THEME = {
    "hack-padel": {
      primary: "#000000",
      secondary: "#4C4C4C",
      accent: "#BFFF00",
      surface: "#000000",
      surfaceAlt: "#0f0f0f",
      border: "#4C4C4C",
      text: "#FFFFFF",
      muted: "#4C4C4C",
      success: "#BFFF00",
      warning: "#fbbf24",
      danger: "#f87171",
      homeBg: "/brands/hack-padel/hero-bg.jpg",
      favicon: "/brands/hack-padel/favicon.png",
    },
  };

  function readSessionUserId() {
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (!key || key.indexOf("sb-") !== 0 || key.indexOf("-auth-token") === -1) continue;
        var raw = localStorage.getItem(key);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        var user =
          parsed &&
          (parsed.user ||
            (parsed.session && parsed.session.user) ||
            (parsed.currentSession && parsed.currentSession.user));
        if (user && user.id) return String(user.id).trim().toLowerCase();
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function readOrgFromPath() {
    try {
      var path = (window.location.pathname || "").replace(/\/+$/, "");
      var match =
        path.match(/^\/ranking\/o\/([^/]+)(?:\/(?:varonil|femenil|m|f))?$/i) ||
        path.match(/^\/ranking\/o\/([^/]+)$/i);
      if (!match || !match[1]) return null;
      return decodeURIComponent(match[1]).trim().toLowerCase();
    } catch (e) {
      return null;
    }
  }

  function readOrgFromCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var cache = JSON.parse(raw);
      if (cache && cache.organizadorId) return String(cache.organizadorId).trim().toLowerCase();
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function resolveBrandingKey() {
    var orgId = readOrgFromPath() || readSessionUserId() || readOrgFromCache();
    if (!orgId) return { orgId: null, brandingKey: null };
    return { orgId: orgId, brandingKey: ORG_BRAND[orgId] || null };
  }

  function setStyle(root, name, value) {
    root.style.setProperty(name, value);
  }

  function applyBrand(brandingKey) {
    var theme = BRAND_THEME[brandingKey];
    if (!theme) return;

    var root = document.documentElement;
    root.setAttribute("data-brand", brandingKey);
    root.setAttribute("data-club", brandingKey);
    root.classList.add("club-theme-early");

    setStyle(root, "--brand-primary", theme.primary);
    setStyle(root, "--brand-secondary", theme.secondary);
    setStyle(root, "--brand-accent", theme.accent);
    setStyle(root, "--brand-surface", theme.surface);
    setStyle(root, "--brand-surface-alt", theme.surfaceAlt);
    setStyle(root, "--brand-border", theme.border);
    setStyle(root, "--brand-text", theme.text);
    setStyle(root, "--brand-muted", theme.muted);
    setStyle(root, "--brand-success", theme.success);
    setStyle(root, "--brand-warning", theme.warning);
    setStyle(root, "--brand-danger", theme.danger);
    setStyle(root, "--bg-canvas", theme.surface);
    setStyle(root, "--bg-base", theme.surface);
    setStyle(root, "--accent-gold", theme.accent);
    setStyle(root, "--accent-gold-light", theme.accent);
    setStyle(root, "--ro-accent", theme.accent);
    setStyle(root, "--ro-border-accent", "color-mix(in srgb, " + theme.accent + " 35%, transparent)");
    setStyle(
      root,
      "--club-home-background-image",
      theme.homeBg ? "url(" + theme.homeBg + ")" : "none"
    );

    if (theme.favicon) {
      var link = document.querySelector('link[rel="icon"]');
      if (link) link.setAttribute("href", theme.favicon);
    }
  }

  var resolved = resolveBrandingKey();
  if (resolved.brandingKey) {
    applyBrand(resolved.brandingKey);
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          organizadorId: resolved.orgId,
          brandingKey: resolved.brandingKey,
        })
      );
    } catch (e) {
      /* ignore quota */
    }
  }
})();
