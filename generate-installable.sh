#!/bin/bash

# Script para generar archivo instalable de RetaPadel
# Genera instrucciones y links para crear APK

echo "🚀 Generando archivo instalable para RetaPadel..."
echo ""

# Crear directorio de salida
mkdir -p ./dist

# URL de la app
APP_URL="https://retas-new.vercel.app/"
APP_NAME="RetaPadel"

echo "📱 Configuración:"
echo "   URL: $APP_URL"
echo "   Nombre: $APP_NAME"
echo ""

# Crear archivo de instrucciones
cat > ./dist/INSTRUCCIONES-APK.md << EOF
# 📱 Instalación de RetaPadel APK

## 🚀 Generar APK con PWA Builder

### Paso 1: Ir a PWA Builder
1. Abre tu navegador
2. Ve a: **https://pwabuilder.com**
3. Ingresa la URL: **$APP_URL**
4. Haz clic en **"Start"**

### Paso 2: Configurar la app
- **Nombre**: $APP_NAME
- **Descripción**: Gestor de Retas de Pádel
- **Icono**: Se detectará automáticamente
- **Colores**: Se detectarán automáticamente

### Paso 3: Generar APK
1. Haz clic en **"Generate"**
2. Selecciona **"Android"**
3. Haz clic en **"Download APK"**
4. Guarda el archivo APK

## 📲 Instalar APK en Android

### Configuración previa:
1. Ve a **Configuración** → **Seguridad**
2. Activa **"Fuentes desconocidas"** o **"Instalar apps desconocidas"**
3. Selecciona **Chrome** (o tu navegador)

### Instalación:
1. Descarga el archivo APK
2. Abre el archivo descargado
3. Sigue las instrucciones de instalación
4. ¡Listo! RetaPadel aparecerá en tu pantalla de inicio

## 🍎 Para iOS (iPhone/iPad)

iOS no permite APKs. Usa la PWA:

### Instalación PWA:
1. Abre **Safari**
2. Ve a: **$APP_URL**
3. Toca el botón **Compartir** (📤)
4. Selecciona **"Agregar a Pantalla de Inicio"**
5. Toca **"Agregar"**

## 🔗 URLs importantes:
- **App principal**: $APP_URL
- **Admin login**: ${APP_URL}admin-login
- **PWA Builder**: https://pwabuilder.com

## 🛡️ Credenciales de Admin:
- **Email**: admin@test.com
- **Password**: 123456

## 📋 Características de la app:
- ✅ Gestión de torneos de pádel
- ✅ Estadísticas en tiempo real
- ✅ Enlaces públicos para compartir
- ✅ Panel de administración
- ✅ Funciona offline (PWA)
- ✅ Notificaciones push

---
**Generado automáticamente para RetaPadel** 🎾🏆
EOF

echo "✅ Instrucciones creadas en: ./dist/INSTRUCCIONES-APK.md"

# Crear script de instalación rápida
cat > ./dist/install-retapadel.bat << EOF
@echo off
echo 🚀 Abriendo PWA Builder para RetaPadel...
echo.
echo 📱 URL: $APP_URL
echo.
start https://pwabuilder.com
echo.
echo ✅ PWA Builder abierto en tu navegador
echo 📋 Sigue las instrucciones en INSTRUCCIONES-APK.md
pause
EOF

echo "✅ Script de instalación creado: ./dist/install-retapadel.bat"

# Crear script para macOS/Linux
cat > ./dist/install-retapadel.sh << EOF
#!/bin/bash
echo "🚀 Abriendo PWA Builder para RetaPadel..."
echo ""
echo "📱 URL: $APP_URL"
echo ""
open https://pwabuilder.com
echo "✅ PWA Builder abierto en tu navegador"
echo "📋 Sigue las instrucciones en INSTRUCCIONES-APK.md"
EOF

chmod +x ./dist/install-retapadel.sh
echo "✅ Script para macOS/Linux creado: ./dist/install-retapadel.sh"

# Crear archivo de configuración para PWA Builder
cat > ./dist/pwabuilder-config.json << EOF
{
  "url": "$APP_URL",
  "name": "$APP_NAME",
  "short_name": "$APP_NAME",
  "description": "Gestor de Retas de Pádel",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#ffd700",
  "background_color": "#0f0f23",
  "categories": ["sports", "productivity"],
  "lang": "es"
}
EOF

echo "✅ Configuración PWA Builder creada: ./dist/pwabuilder-config.json"

echo ""
echo "🎉 ¡Archivos generados exitosamente!"
echo ""
echo "📁 Archivos creados:"
echo "   📋 ./dist/INSTRUCCIONES-APK.md - Instrucciones completas"
echo "   🖥️  ./dist/install-retapadel.bat - Script Windows"
echo "   🍎 ./dist/install-retapadel.sh - Script macOS/Linux"
echo "   ⚙️  ./dist/pwabuilder-config.json - Configuración PWA"
echo ""
echo "📤 Puedes enviar estos archivos a quien quieras que instale la app"
echo ""
echo "🔗 Link directo para PWA Builder:"
echo "   https://pwabuilder.com"
echo ""
echo "📱 URL de tu app: $APP_URL"
