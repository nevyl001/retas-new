# 📧 Configuración de SMTP Personalizado para Supabase

## 🚨 Problema Actual

Supabase ha restringido el envío de emails debido a alta tasa de rebotes. Necesitamos configurar un proveedor SMTP personalizado.

## 🎯 Soluciones Recomendadas

### 1. **SendGrid (Recomendado)**

- **Gratis:** 100 emails/día
- **Fácil configuración**
- **Excelente deliverability**

#### Pasos:

1. Crear cuenta en [SendGrid](https://sendgrid.com)
2. Verificar dominio (opcional pero recomendado)
3. Generar API Key
4. Configurar en Supabase

### 2. **Mailgun**

- **Gratis:** 5,000 emails/mes
- **Muy confiable**
- **Fácil de usar**

### 3. **Amazon SES**

- **Muy barato:** $0.10 por 1,000 emails
- **Escalable**
- **Requiere verificación de dominio**

## 🔧 Configuración en Supabase

### Paso 1: Ir a Authentication Settings

1. Ve a tu **Supabase Dashboard**
2. **Authentication** → **Settings**
3. Scroll hasta **SMTP Settings**

### Paso 2: Configurar SMTP

```
Enable custom SMTP: ✅ ON
SMTP Host: [tu-proveedor-smtp]
SMTP Port:
587 (o 465 para SSL)
SMTP User: [tu-usuario]
SMTP Pass: [tu-contraseña]
SMTP Admin Email: [tu-email-admin]
SMTP Sender Name: Retas de Pádel
```

### Paso 3: Configurar Templates

1. **Authentication** → **Email Templates**
2. Personalizar **Confirm signup**
3. Usar variables: `{{ .ConfirmationURL }}`, `{{ .SiteURL }}`

## 📋 Configuración SendGrid (Ejemplo)

### 1. Crear cuenta SendGrid:

- Ve a [sendgrid.com](https://sendgrid.com)
- Regístrate con tu email
- Verifica tu email

### 2. Crear API Key:

- **Settings** → **API Keys**
- **Create API Key**
- **Full Access** (para desarrollo)
- Copia la API Key

### 3. Configurar en Supabase:

```
SMTP Host: smtp.sendgrid.net
SMTP Port: 587
SMTP User: apikey
SMTP Pass: [tu-api-key-de-sendgrid]
SMTP Admin Email: tu-email@ejemplo.com
SMTP Sender Name: Retas de Pádel
```

## 🧪 Probar Configuración

### 1. Test Email:

- Ve a **Authentication** → **Users**
- Crea un usuario de prueba
- Verifica que llegue el email

### 2. Verificar Logs:

- **Authentication** → **Logs**
- Revisa que no haya errores

## 🚀 Ventajas del SMTP Personalizado

- ✅ **Mejor deliverability**
- ✅ **Control total** sobre emails
- ✅ **Sin restricciones** de Supabase
- ✅ **Métricas detalladas**
- ✅ **Templates personalizados**

## 🆘 Solución Temporal

Si necesitas que funcione **YA**:

1. **Contacta soporte Supabase** explicando el problema
2. **Menciona** que estás en desarrollo
3. **Solicita** restauración temporal de privilegios
4. **Comprométete** a usar solo emails válidos

## 📞 Contacto Supabase

- **Email:** support@supabase.com
- **Discord:** [Supabase Discord](https://discord.supabase.com)
- **GitHub:** [Supabase Issues](https://github.com/supabase/supabase/issues)

## 🔄 Próximos Pasos

1. **Configurar SMTP personalizado** (SendGrid recomendado)
2. **Limpiar usuarios de prueba** con emails inválidos
3. **Probar registro** con email válido
4. **Monitorear** deliverability
