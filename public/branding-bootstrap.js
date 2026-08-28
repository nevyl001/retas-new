(function () {
  try {
    var path = (location.pathname || "/").replace(/\/+$/, "") || "/";
    if (
      path === "/auth/callback" ||
      path === "/auth/reset-password" ||
      path === "/admin-login" ||
      path === "/privacidad-terminos" ||
      /^\/jugar\//i.test(path) ||
      /^\/reta-abierta\//i.test(path) ||
      /^\/public\//i.test(path) ||
      /^\/eventos\//i.test(path)
    ) {
      return;
    }
    var raw = localStorage.getItem("ro_club_experience_v1");
    if (!raw) return;
    var parsed = JSON.parse(raw);
    var key = parsed && parsed.brandingKey;
    if (key !== "padel-court-series" && key !== "hack-padel") return;
    document.documentElement.setAttribute("data-brand", key);
    document.documentElement.setAttribute("data-club", key);
    document.documentElement.classList.remove("branding-bootstrapping");
  } catch (e) {}
})();
