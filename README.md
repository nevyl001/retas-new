# 🏆 RivieraApp — Retas y torneos de pádel

Un sistema profesional para gestionar retas de pádel con persistencia de datos, autenticación multi-usuario, panel de administración y Progressive Web App (PWA) para iOS y Android.

## 🌐 **URLs del Sistema**

- **App Principal**: [https://retas-new.vercel.app/](https://retas-new.vercel.app/)
- **Admin Login**: [https://retas-new.vercel.app/admin-login](https://retas-new.vercel.app/admin-login)
- **PWA Builder**: [https://pwabuilder.com](https://pwabuilder.com)

### Producción y base de datos

Guía paso a paso (Vercel, Supabase, SQL, caché): **[docs/DESPLIEGUE-Y-SUPABASE.md](docs/DESPLIEGUE-Y-SUPABASE.md)**  
Orden de scripts SQL: **[docs/SQL-ORDEN.md](docs/SQL-ORDEN.md)**

### Nota sobre capacidades (README vs implementación)

Algunas frases históricas del README (por ejemplo notificaciones push u “offline total”) pueden no reflejar el estado actual del código. Prioriza lo que veas en el repositorio y en la guía de despliegue anterior.

## ✨ **Características Principales**

### 🎾 **Gestión de Retas**

- ✅ Crear, editar y eliminar retas con nombres personalizados
- ✅ Sistema multi-usuario con autenticación Supabase
- ✅ Retas públicas y privadas
- ✅ Enlaces públicos para compartir torneos

### 👥 **Gestión de Jugadores**

- ✅ Registrar y gestionar jugadores por usuario
- ✅ Información completa: nombre, email, teléfono, nivel
- ✅ Persistencia de jugadores entre retas

### 🤝 **Sistema de Parejas**

- ✅ Formar parejas seleccionando jugadores
- ✅ Estadísticas automáticas por pareja
- ✅ Historial de parejas

### 🏆 **Sistema de Partidos**

- ✅ Distribución automática Round-Robin
- ✅ Distribución por canchas
- ✅ Marcador en tiempo real
- ✅ Juegos normales y tie breaks
- ✅ Clasificación automática

### 📱 **Progressive Web App (PWA)**

- ✅ **Android**: Instalable como APK
- ✅ **iOS**: Instalable desde Safari
- ✅ **Nombre**: "RivieraApp"
- ✅ **Icono profesional** optimizado
- ✅ **Funciona offline**
- ✅ **Notificaciones push**

### 🔐 **Panel de Administración**

- ✅ **Login seguro** independiente
- ✅ **Estadísticas generales** del sistema
- ✅ **Gestión de usuarios**
- ✅ **Dashboard responsive**

## 🚀 **Instalación y Configuración**

### **1. Configurar Supabase**

1. Crear cuenta en [supabase.com](https://supabase.com)
2. Crear nuevo proyecto
3. Obtener credenciales:
   - Project URL
   - anon/public key

### **2. Configurar Variables de Entorno**

Crear archivo `.env` en la raíz:

```env
REACT_APP_SUPABASE_URL=tu_project_url_aqui
REACT_APP_SUPABASE_ANON_KEY=tu_anon_key_aqui
```

### **3. Base de datos**

El esquema (tablas, RLS, triggers) vive en el proyecto **Supabase** ya configurado. Conecta la app con las variables de entorno del paso 2. Para vaciar datos operativos sin borrar cuentas, ver `supabase/reset-datos-operativos.sql`.

### **4. Instalar y Ejecutar**

```bash
npm install
npm start
```

## 📊 **Estructura de Base de Datos**

### **Tablas Principales**

- `users` - Perfiles de usuario extendidos
- `tournaments` - Retas por usuario
- `players` - Jugadores por usuario
- `pairs` - Parejas por usuario
- `matches` - Partidos por usuario
- `games` - Juegos por usuario
- `admin_users` - Administradores del sistema

### **Características de Seguridad**

- ✅ **Row Level Security (RLS)** habilitado
- ✅ **Políticas por usuario** - Solo ven sus datos
- ✅ **Triggers automáticos** para updated_at
- ✅ **Función de perfil** automático al registrarse

## 🎮 **Cómo Usar el Sistema**

### **Para Usuarios Normales**

1. **Registrarse/Iniciar Sesión**

   - Crear cuenta con email
   - Perfil automático creado

2. **Crear Reta**

   - Nombre y descripción
   - Número de canchas
   - Hacer pública/privada

3. **Gestionar Jugadores**

   - Agregar jugadores
   - Información completa

4. **Formar Parejas**

   - Seleccionar 2 jugadores
   - Crear pareja

5. **Iniciar Reta**

   - Generación automática de partidos
   - Distribución por rondas

6. **Registrar Resultados**
   - Marcador en tiempo real
   - Juegos normales y tie breaks
   - Clasificación automática

### **Para Administradores**

1. **Acceder al Panel**

   - URL: `/admin-login`
   - Credenciales por defecto:
     - Email: `admin@test.com`
     - Password: `123456`

2. **Dashboard de Estadísticas**

   - Total de usuarios
   - Retas creadas
   - Usuarios activos

3. **Gestión de Usuarios**
   - Lista completa de usuarios
   - Estadísticas por usuario
   - Fechas de registro

## 📱 **Instalación PWA**

### **Para Android**

1. **Usar PWA Builder**:

   - Ir a [pwabuilder.com](https://pwabuilder.com)
   - Ingresar URL: `https://retas-new.vercel.app/`
   - Generar APK
   - Instalar archivo APK

2. **Configuración previa**:
   - Activar "Fuentes desconocidas"
   - Permitir instalación de APKs

### **Para iOS**

1. **Instalación PWA**:

   - Abrir **Safari** (no Chrome)
   - Ir a: `https://retas-new.vercel.app/`
   - Tocar **Compartir** (📤)
   - Seleccionar **"Agregar a Pantalla de Inicio"**
   - Tocar **"Agregar"**

2. **Requisitos**:
   - iOS 11.3+
   - Safari (navegador requerido)

### **Características PWA**

- ✅ **Icono profesional** "RivieraApp"
- ✅ **Modo standalone** (sin barras del navegador)
- ✅ **Funciona offline** (datos básicos)
- ✅ **Notificaciones push**
- ✅ **Splash screen** personalizado
- ✅ **Safe Area** compatible con iPhone X+

## 🎾 **Reglas del Juego**

### **Juegos Normales**

- Puntuación de 0 a 7
- Gana quien tenga más puntos

### **Tie Break**

- Puntuación de 0 a 20
- Gana quien llegue a 10 puntos con diferencia de 2
- Se activa con botón "🎾 Cambiar a Tie Break"

### **Cálculo de Ganador**

- Se cuenta cuántos juegos ganó cada pareja
- La pareja con más juegos ganados gana el partido
- En caso de empate, gana quien tenga más puntos totales

## 🛠️ **Tecnologías Utilizadas**

### **Frontend**

- **React 18** + TypeScript
- **React Hooks** para estado
- **CSS3** responsive
- **PWA** con Service Worker

### **Backend**

- **Supabase** (PostgreSQL)
- **Row Level Security**
- **Autenticación Supabase Auth**
- **Triggers y funciones SQL**

### **Deploy**

- **Vercel** (deploy automático)
- **GitHub** (control de versiones)
- **HTTPS** automático

## 📁 **Estructura del Proyecto**

```
src/
├── components/
│   ├── admin/              # Panel de administración
│   ├── auth/               # Autenticación
│   ├── MainLayout.tsx      # Layout principal
│   └── ...                 # Componentes de la app
├── contexts/
│   ├── AdminContext.tsx    # Contexto de admin
│   ├── UserContext.tsx     # Contexto de usuario
│   └── ThemeContext.tsx    # Contexto de tema
├── hooks/                  # Custom hooks
├── lib/
│   ├── database.ts         # Funciones de base de datos
│   └── supabaseClient.ts   # Cliente Supabase
└── styles/                 # Estilos globales

public/
├── manifest.json           # Configuración PWA
├── apple-touch-icon.svg    # Icono iOS
├── favicon.svg             # Icono general
└── ios-pwa.css            # Estilos iOS PWA

supabase/
└── reset-datos-operativos.sql      # Vaciar datos (no borra usuarios)
```

## 🔧 **Solución de Problemas**

### **Error: Variables de entorno no configuradas**

```bash
# Verificar archivo .env existe
# Reiniciar aplicación después de cambios
```

### **Error: Tablas no existen**

```bash
# Verificar REACT_APP_SUPABASE_URL y proyecto correcto en Supabase
# Revisar Table Editor del proyecto
```

### **Error: Icono feo en iOS**

```bash
# Eliminar app de pantalla de inicio
# Limpiar cache de Safari
# Reinstalar PWA
```

### **Error: Admin no funciona**

```bash
# Verificar tabla admin_users y credenciales en Supabase
```

## 🚀 **Deploy y Distribución**

### **Deploy Automático**

- Push a `main` → Deploy automático en Vercel
- URL pública: `https://retas-new.vercel.app/`
- HTTPS automático

### **Distribución PWA**

- **Android**: Generar APK con PWA Builder
- **iOS**: Instalar PWA desde Safari
- **Web**: Acceso directo desde navegador

## 📞 **Soporte y Contacto**

### **Documentación Adicional**

- `SOLUCION-ICONO-iOS.md` - Solución iconos iOS
- `SETUP-PWA-iOS.md` - Instrucciones PWA iOS
- `create-ios-icons.html` - Generador de iconos

### **Credenciales por Defecto**

- **Admin**: admin@test.com / 123456
- **Usuario**: Registro libre con email

## 🎯 **Roadmap Futuro**

### **Versión 1.1**

- [ ] Modo eliminatoria
- [ ] Grupos y fase de grupos
- [ ] Horarios de partidos
- [ ] Notificaciones push

### **Versión 1.2**

- [ ] Exportación PDF de resultados
- [ ] API REST para integraciones
- [ ] Dashboard de estadísticas avanzadas
- [ ] Modo offline completo

### **Versión 2.0**

- [ ] Múltiples deportes
- [ ] Sistema de rankings
- [ ] Retas internacionales
- [ ] App Store / Play Store

## 📄 **Licencia**

Este proyecto está bajo la Licencia MIT.

---

**¡Disfruta gestionando tus retas de pádel con RivieraApp!** 🎾🏆📱
