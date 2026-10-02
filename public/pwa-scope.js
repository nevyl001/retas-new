/**
 * Gate de PWA antes de React.
 * El HTML no incluye <link rel="manifest">. Este script impide el mini-infobar
 * de Chrome hasta que la app privada ponga window.__rivieraAllowPwaInstall = true,
 * y da de baja service workers que una visita anterior hubiera registrado.
 *
 * No vuelve a registrar /sw.js: el fetch del SW interfería con el refresh de
 * token de Supabase. Chrome instala con el manifest; el SW no es requisito.
 */
(function () {
  var w = window;
  if (typeof w.__rivieraAllowPwaInstall !== "boolean") {
    w.__rivieraAllowPwaInstall = false;
  }

  w.addEventListener("beforeinstallprompt", function (event) {
    if (w.__rivieraAllowPwaInstall === true) return;
    event.preventDefault();
  });

  function stripManifest() {
    if (w.__rivieraAllowPwaInstall === true) return;
    var links = document.querySelectorAll('link[rel="manifest"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].parentNode) links[i].parentNode.removeChild(links[i]);
    }
  }

  function unregisterServiceWorkers() {
    try {
      if (!("serviceWorker" in navigator) || !navigator.serviceWorker) return;
      var pending = navigator.serviceWorker.getRegistrations();
      if (!pending || typeof pending.then !== "function") return;
      pending
        .then(function (registrations) {
          var jobs = [];
          for (var i = 0; i < registrations.length; i++) {
            jobs.push(registrations[i].unregister());
          }
          return Promise.all(jobs);
        })
        .catch(function () {});
    } catch (e) {}
  }

  stripManifest();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", stripManifest);
  }
  w.addEventListener("load", function () {
    stripManifest();
    unregisterServiceWorkers();
  });
})();
