const fs = require("fs");
const path = require("path");

// Crear un icono 512x512 simple usando canvas (si está disponible) o crear un placeholder
function create512Icon() {
  console.log("🎨 Generando icono 512x512...");

  // Por ahora, vamos a copiar el icono 192x192 y escalarlo
  // En un entorno real, usarías canvas para crear el icono

  const icon192Path = path.join(__dirname, "public", "icon-192x192.png");
  const icon512Path = path.join(__dirname, "public", "icon-512x512.png");

  if (fs.existsSync(icon192Path)) {
    // Copiar el archivo 192x192 como base
    fs.copyFileSync(icon192Path, icon512Path);
    console.log("✅ Icono 512x512 creado (copiado desde 192x192)");
    console.log("📁 Archivo creado:", icon512Path);
  } else {
    console.log("❌ No se encontró icon-192x192.png");
    console.log("💡 Usa create-png-icons.html para generar los iconos");
  }
}

// También crear screenshot-mobile.png si no existe
function createMobileScreenshot() {
  console.log("📱 Verificando screenshot móvil...");

  const mobileScreenshotPath = path.join(
    __dirname,
    "public",
    "screenshot-mobile.png"
  );

  if (!fs.existsSync(mobileScreenshotPath)) {
    const desktopScreenshotPath = path.join(
      __dirname,
      "public",
      "screenshot-desktop.png"
    );

    if (fs.existsSync(desktopScreenshotPath)) {
      // Copiar el screenshot desktop como base
      fs.copyFileSync(desktopScreenshotPath, mobileScreenshotPath);
      console.log("✅ Screenshot móvil creado (copiado desde desktop)");
    } else {
      console.log("❌ No se encontró screenshot-desktop.png");
      console.log(
        "💡 Usa create-screenshots.html para generar los screenshots"
      );
    }
  } else {
    console.log("✅ Screenshot móvil ya existe");
  }
}

// Ejecutar
console.log("🚀 Generando archivos faltantes para PWA...\n");

create512Icon();
createMobileScreenshot();

console.log("\n🎯 Archivos generados. Ahora puedes:");
console.log("1. Hacer commit de los archivos");
console.log("2. Hacer push a GitHub");
console.log("3. Probar en PWA Builder nuevamente");
