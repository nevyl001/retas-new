# 🔐 Configuración de Autenticación Supabase

## 📋 Pasos para configurar las URLs de redirección

### 1. Acceder al Dashboard de Supabase
1. Ve a [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Selecciona tu proyecto
3. Ve a **Authentication** > **URL Configuration**

### 2. Configurar Site URL
En el campo **Site URL**, agrega:
```
https://retas-new.vercel.app
```

### 3. Configurar Redirect URLs
En el campo **Redirect URLs**, agrega estas URLs (una por línea):
```
https://retas-new.vercel.app/auth/callback
http://localhost:3000/auth/callback
https://retas-new.vercel.app/auth/reset-password
http://localhost:3000/auth/reset-password
```

### 4. Configurar Email Templates (Opcional)
Si quieres personalizar los emails de confirmación:

1. Ve a **Authentication** > **Email Templates**
2. Selecciona **Confirm signup**
3. Puedes personalizar el template HTML
4. Asegúrate de que el enlace de confirmación use: `{{ .ConfirmationURL }}`

### 5. Verificar Configuración
Después de guardar los cambios:

1. **Espera 2-3 minutos** para que se propaguen los cambios
2. **Prueba el registro** de un nuevo usuario
3. **Verifica** que el email llegue con el enlace correcto
4. **Confirma** que al hacer clic te redirija a tu sitio

## 🚨 URLs Importantes

### Producción:
- **Site URL:** `https://retas-new.vercel.app`
- **Callback:** `https://retas-new.vercel.app/auth/callback`
- **Reset Password:** `https://retas-new.vercel.app/auth/reset-password`

### Desarrollo Local:
- **Site URL:** `http://localhost:3000`
- **Callback:** `http://localhost:3000/auth/callback`
- **Reset Password:** `http://localhost:3000/auth/reset-password`

## 🔧 Archivos Modificados

- `src/contexts/UserContext.tsx` - Configuración de emailRedirectTo
- `src/components/auth/AuthCallback.tsx` - Página de callback
- `src/App.tsx` - Ruta de callback
- `src/config/auth.ts` - Configuración centralizada

## ✅ Verificación

Para verificar que todo funciona:

1. **Registra un nuevo usuario**
2. **Revisa el email** (bandeja de entrada y spam)
3. **Haz clic en el enlace** de confirmación
4. **Verifica** que te redirija a tu sitio
5. **Confirma** que el usuario quede autenticado

## 🆘 Solución de Problemas

### El enlace no funciona:
- Verifica que las URLs estén correctamente configuradas en Supabase
- Asegúrate de que no haya espacios extra en las URLs
- Espera 2-3 minutos después de guardar los cambios

### El usuario no se autentica después del callback:
- Revisa la consola del navegador para errores
- Verifica que la función `AuthCallback` esté funcionando
- Confirma que el usuario existe en la tabla `users`

### El email no llega:
- Revisa la carpeta de spam
- Verifica la configuración de email en Supabase
- Confirma que el email esté bien escrito
