# 🔐 Configuración del Panel de Administración

## 📋 Pasos para Configurar el Admin Panel

### 1. **Ejecutar el Script SQL**

```sql
-- Ejecutar en Supabase SQL Editor
-- El archivo admin-setup.sql contiene:
- Creación de tabla admin_users
- Inserción del usuario admin por defecto
- Configuración de RLS
```

### 2. **Credenciales por Defecto**

```
Email: admin@test.com
Contraseña: 123456
```

### 3. **URLs del Admin Panel**

```
Login: /admin-login
Dashboard: /admin-dashboard
```

### 4. **Funcionalidades del Panel**

- ✅ **Estadísticas Generales**: Total de usuarios, retas creadas, usuarios activos
- ✅ **Lista de Usuarios**: Con email, nombre, cantidad de retas, fecha de registro
- ✅ **Sesión Segura**: Login/logout independiente del sistema de usuarios
- ✅ **Responsive**: Funciona en móvil y escritorio

### 5. **Seguridad**

- 🔒 **RLS Habilitado**: Solo admins pueden acceder a la tabla admin_users
- 🔒 **Sesión Local**: Se guarda en localStorage
- 🔒 **Rutas Protegidas**: AdminRoute protege el dashboard

### 6. **Estructura de Archivos Creados**

```
src/
├── contexts/
│   └── AdminContext.tsx          # Contexto de admin
├── components/
│   └── admin/
│       ├── AdminLogin.tsx        # Página de login
│       ├── AdminLogin.css        # Estilos del login
│       ├── AdminDashboard.tsx    # Panel de estadísticas
│       ├── AdminDashboard.css    # Estilos del dashboard
│       ├── AdminRoute.tsx        # Protección de rutas
│       └── AdminRoute.css        # Estilos de carga
└── admin-setup.sql               # Script de configuración
```

### 7. **Próximos Pasos**

1. Ejecutar `admin-setup.sql` en Supabase
2. Agregar las rutas en `App.tsx`
3. Envolver la app con `AdminProvider`
4. Probar el login con las credenciales

### 8. **Notas Importantes**

- ⚠️ **Cambiar contraseña**: En producción, cambiar la contraseña por defecto
- ⚠️ **Hash de contraseña**: Implementar bcrypt para mayor seguridad
- ⚠️ **Validación**: Agregar validación de email y contraseña
- ⚠️ **Logs**: Considerar agregar logs de acceso de admin

## 🚀 **¿Listo para implementar?**
