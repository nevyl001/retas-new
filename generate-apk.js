#!/usr/bin/env node

/**
 * Script para generar APK instalable de RetaPadel
 * Usa PWA Builder de Microsoft para crear un archivo APK
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const APP_URL = "https://retas-new.vercel.app/";
const APP_NAME = "RetaPadel";
const OUTPUT_DIR = "./dist";

console.log("🚀 Generando APK instalable para RetaPadel...\n");

// Crear directorio de salida
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Función para hacer petición a PWA Builder API
function generateAPK() {
  console.log("📱 Conectando con PWA Builder...");

  const postData = JSON.stringify({
    url: APP_URL,
    options: {
      name: APP_NAME,
      package: "com.retapadel.app",
      version: "1.0.0",
      description: "Gestor de Retas de Pádel",
      icon: `${APP_URL}favicon.svg`,
      startUrl: APP_URL,
      display: "standalone",
      orientation: "portrait",
      themeColor: "#ffd700",
      backgroundColor: "#0f0f23",
    },
  });

  const options = {
    hostname: "pwabuilder.com",
    port: 443,
    path: "/api/generate",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postData),
    },
  };

  const req = https.request(options, (res) => {
    let data = "";

    res.on("data", (chunk) => {
      data += chunk;
    });

    res.on("end", () => {
      try {
        const response = JSON.parse(data);
        if (response.downloadUrl) {
          downloadAPK(response.downloadUrl);
        } else {
          console.log("❌ Error en la respuesta:", response);
          createManualInstructions();
        }
      } catch (error) {
        console.log("❌ Error parsing response:", error.message);
        createManualInstructions();
      }
    });
  });

  req.on("error", (error) => {
    console.log("❌ Error en la petición:", error.message);
    createManualInstructions();
  });

  req.write(postData);
  req.end();
}

// Función para descargar el APK
function downloadAPK(downloadUrl) {
  console.log("⬇️ Descargando APK...");

  const file = fs.createWriteStream(path.join(OUTPUT_DIR, "RetaPadel.apk"));

  https
    .get(downloadUrl, (response) => {
      response.pipe(file);

      file.on("finish", () => {
        file.close();
        console.log("✅ APK generado exitosamente!");
        console.log(`📁 Archivo: ${path.join(OUTPUT_DIR, "RetaPadel.apk")}`);
        createInstallationGuide();
      });
    })
    .on("error", (error) => {
      fs.unlink(path.join(OUTPUT_DIR, "RetaPadel.apk"));
      console.log("❌ Error descargando APK:", error.message);
      createManualInstructions();
    });
}

// Crear instrucciones manuales si falla la generación automática
function createManualInstructions() {
  console.log("📋 Generando instrucciones de instalación manual...");

  const instructions = `# 📱 Instalación de RetaPadel APK

## 🚀 Instrucciones para generar APK

### Opción 1: PWA Builder (Recomendado)
1. Ve a: https://pwabuilder.com
2. Ingresa la URL: ${APP_URL}
3. Haz clic en "Generate"
4. Selecciona "Android" → "Download APK"

### Opción 2: Capacitor (Desarrolladores)
\`\`\`bash
# Instalar Capacitor
npm install -g @capacitor/cli

# Inicializar proyecto
npx cap init "${APP_NAME}" com.retapadel.app

# Agregar plataforma Android
npx cap add android

# Build y sync
npm run build
npx cap sync android

# Abrir en Android Studio
npx cap open android
\`\`\`

### Opción 3: TWA (Trusted Web Activity)
1. Usa Android Studio
2. Crea un proyecto TWA
3. Configura la URL: ${APP_URL}
4. Genera APK

## 📲 Instalación del APK

### En Android:
1. Descarga el archivo APK
2. Ve a Configuración → Seguridad → "Fuentes desconocidas" (activar)
3. Abre el archivo APK
4. Sigue las instrucciones de instalación

### En iOS:
iOS no permite APKs. Usa la PWA:
1. Abre Safari
2. Ve a: ${APP_URL}
3. Toca Compartir → "Agregar a Pantalla de Inicio"

## 🔗 URLs importantes:
- **App principal**: ${APP_URL}
- **Admin login**: ${APP_URL}admin-login
- **PWA Builder**: https://pwabuilder.com

## 🛡️ Credenciales de Admin:
- Email: admin@test.com
- Password: 123456

---
Generado automáticamente para RetaPadel
`;

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "INSTRUCCIONES-INSTALACION.md"),
    instructions
  );
  console.log(
    "✅ Instrucciones creadas en: ./dist/INSTRUCCIONES-INSTALACION.md"
  );
}

// Crear guía de instalación
function createInstallationGuide() {
  const guide = `# 📱 Guía de Instalación - RetaPadel APK

## ✅ APK generado exitosamente!

**Archivo**: RetaPadel.apk
**Tamaño**: ${fs.statSync(path.join(OUTPUT_DIR, "RetaPadel.apk")).size} bytes

## 📲 Cómo instalar:

### 1. En Android:
- Descarga el archivo APK
- Ve a Configuración → Seguridad → "Fuentes desconocidas"
- Abre el APK y sigue las instrucciones

### 2. En iOS:
- iOS no soporta APKs
- Usa la PWA: ${APP_URL}
- Safari → Compartir → "Agregar a Pantalla de Inicio"

## 🔗 Links útiles:
- **App web**: ${APP_URL}
- **Admin**: ${APP_URL}admin-login

---
¡Disfruta de RetaPadel! 🎾🏆
`;

  fs.writeFileSync(path.join(OUTPUT_DIR, "GUIA-INSTALACION.md"), guide);
  console.log("✅ Guía de instalación creada");
}

// Ejecutar
console.log("🔧 Configuración:");
console.log(`   URL: ${APP_URL}`);
console.log(`   Nombre: ${APP_NAME}`);
console.log(`   Salida: ${OUTPUT_DIR}\n`);

// Intentar generar APK
generateAPK();
