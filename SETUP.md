# 🚀 Guía de Configuración - Sistema de Torneos de Pádel

## 📋 Pasos para Configurar la Aplicación

### 1. Configurar Supabase

#### 1.1 Crear cuenta en Supabase

1. Ve a [supabase.com](https://supabase.com)
2. Crea una cuenta gratuita
3. Inicia sesión

#### 1.2 Crear un nuevo proyecto

1. Haz clic en "New Project"
2. Elige tu organización
3. Dale un nombre al proyecto (ej: "padel-tournaments")
4. Establece una contraseña para la base de datos
5. Selecciona una región cercana
6. Haz clic en "Create new project"

#### 1.3 Obtener las credenciales

1. Ve a Settings → API
2. Copia los siguientes valores:
   - **Project URL** (ej: `https://abcdefghijklmnop.supabase.co`)
   - **anon public** key (ej: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

### 2. Configurar Variables de Entorno

#### 2.1 Crear archivo .env

En la raíz del proyecto, crea un archivo llamado `.env`:

```bash
# En la terminal, desde la raíz del proyecto:
touch .env
```

#### 2.2 Agregar las variables

Abre el archivo `.env` y agrega:

```env
REACT_APP_SUPABASE_URL=tu_project_url_aqui
REACT_APP_SUPABASE_ANON_KEY=tu_anon_key_aqui
```

**Ejemplo:**

```env
REACT_APP_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNzQ5NjAwMCwiZXhwIjoxOTUzMDcyMDAwfQ.example
```

### 3. Configurar la Base de Datos

#### 3.1 Ejecutar el script SQL

1. Ve a tu proyecto de Supabase
2. Ve a SQL Editor
3. Copia y pega el contenido del archivo `database-schema.sql`
4. Haz clic en "Run" para ejecutar el script

#### 3.2 Verificar las tablas

1. Ve a Table Editor
2. Deberías ver las siguientes tablas:
   - `tournaments`
   - `players`
   - `pairs`
   - `matches`
   - `games`

### 4. Instalar Dependencias

```bash
npm install
```

### 5. Ejecutar la Aplicación

```bash
npm start
```

La aplicación debería abrirse en `http://localhost:3000`

## 🔧 Solución de Problemas

### Error: "Supabase environment variables are not configured"

**Síntomas:**

- Error al crear torneos
- Error al cargar torneos
- Mensaje en consola sobre variables no configuradas

**Solución:**

1. Verifica que el archivo `.env` existe en la raíz del proyecto
2. Verifica que las variables están escritas correctamente
3. Reinicia la aplicación después de crear/modificar el archivo `.env`

### Error: "relation does not exist"

**Síntomas:**

- Error al intentar crear o cargar datos
- Mensaje sobre tablas que no existen

**Solución:**

1. Ve a Supabase → SQL Editor
2. Ejecuta el script `database-schema.sql`
3. Verifica que las tablas se crearon en Table Editor

### Error: "Invalid API key"

**Síntomas:**

- Error de autenticación
- No se pueden realizar operaciones en la base de datos

**Solución:**

1. Verifica que la URL y la clave anónima son correctas
2. Asegúrate de copiar la clave completa desde Supabase
3. Verifica que no hay espacios extra en el archivo `.env`

## 🧪 Probar la Aplicación

Una vez configurada, puedes probar:

1. **Crear un torneo:**

   - Haz clic en "➕ Crear Nuevo Torneo"
   - Completa el formulario
   - Haz clic en "🏆 Crear Torneo"

2. **Agregar jugadores:**

   - Selecciona el torneo creado
   - Haz clic en "👥 Gestionar Jugadores"
   - Agrega algunos jugadores

3. **Crear parejas:**

   - Selecciona dos jugadores
   - Haz clic en "✅ Crear Pareja"

4. **Iniciar torneo:**
   - Una vez que tengas al menos 2 parejas
   - Haz clic en "🚀 Iniciar Torneo"

## 📞 Soporte

Si tienes problemas:

1. Revisa la consola del navegador (F12) para ver errores detallados
2. Verifica que todas las tablas existen en Supabase
3. Asegúrate de que las variables de entorno están configuradas correctamente
4. Reinicia la aplicación después de cualquier cambio en `.env`

## 🎯 Próximos Pasos

Una vez que la aplicación esté funcionando:

1. Crea tu primer torneo
2. Agrega jugadores
3. Forma parejas
4. Inicia el torneo
5. Registra resultados de partidos
6. ¡Disfruta gestionando tu torneo de pádel!
