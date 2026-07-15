// Configuración ESLint del proyecto (antes vivía en "eslintConfig" de
// package.json; se movió a este archivo porque JSON no admite comentarios
// y las reglas de abajo necesitan quedar documentadas).
//
// Alcance real de `npm run lint`: solo lint "src" con extensiones
// .ts/.tsx (ver script "lint" en package.json). La carpeta "scripts/"
// (herramientas CLI de Node, .mjs/.js) NO se ejecuta por ese comando, así
// que no necesita override aquí — ya está fuera de alcance por diseño.
module.exports = {
  extends: ["react-app", "react-app/jest"],
  rules: {
    // Código de aplicación (src/**/*.{ts,tsx,js,jsx}): un console.log/info/
    // debug/table/trace suelto es señal de instrumentación de desarrollo
    // que se coló. Diagnóstico real de desarrollo debe pasar por
    // src/lib/debug/debugLog.ts (no-op en producción); avisos/errores
    // legítimos siguen usando console.warn/console.error directamente.
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
  overrides: [
    {
      // Tests: pueden imprimir evidencia (payloads, mocks, snapshots de
      // depuración) sin que cuente como instrumentación de la app.
      files: ["**/*.test.*"],
      rules: {
        "no-console": "off",
      },
    },
    {
      // Único wrapper autorizado a llamar console.* directamente: es la
      // implementación del logger centralizado. Todo el resto del código
      // de aplicación debe consumirlo vía debugLog/debugWarn/etc., nunca
      // console.log/info/debug directo.
      files: ["src/lib/debug/debugLog.ts"],
      rules: {
        "no-console": "off",
      },
    },
  ],
};
