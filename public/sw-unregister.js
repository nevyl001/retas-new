// Hotfix: desactivar Service Worker para evitar fallos de red
// (especialmente en refresh de token de Supabase).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      )
      .catch((error) => {
        console.log("SW unregister failed:", error);
      });
  });
}
