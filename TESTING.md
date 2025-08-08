# 🧪 Guía de Pruebas - Sistema de Torneos de Pádel

## 📋 **Pasos para Probar el Sistema Completo**

### **Paso 1: Configurar Supabase**

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta
2. Crea un nuevo proyecto
3. Ve a Settings → API y copia:
   - Project URL
   - anon public key
4. Crea un archivo `.env` en la raíz del proyecto con:
   ```env
   REACT_APP_SUPABASE_URL=tu_url_aqui
   REACT_APP_SUPABASE_ANON_KEY=tu_clave_aqui
   ```
5. Ve a SQL Editor en Supabase y ejecuta el contenido de `database-schema.sql`

### **Paso 2: Crear un Torneo**

1. Haz clic en "➕ Crear Nuevo Torneo"
2. Completa el formulario:
   - **Nombre**: "Torneo de Prueba"
   - **Descripción**: "Torneo para probar el sistema"
   - **Canchas**: 2
3. Haz clic en "🏆 Crear Torneo"

### **Paso 3: Agregar Jugadores**

1. Selecciona el torneo creado
2. Haz clic en "👥 Gestionar Jugadores"
3. Agrega al menos 4 jugadores:
   - Juan Pérez
   - María García
   - Carlos López
   - Ana Rodríguez
   - Pedro Martínez
   - Laura Fernández

### **Paso 4: Crear Parejas**

1. Selecciona 2 jugadores (ej: Juan y María)
2. Haz clic en "✅ Crear Pareja"
3. Repite para crear al menos 3 parejas:
   - Pareja 1: Juan y María
   - Pareja 2: Carlos y Ana
   - Pareja 3: Pedro y Laura

### **Paso 5: Iniciar el Torneo**

1. Verifica que tienes al menos 2 parejas
2. Haz clic en "🚀 Iniciar Torneo"
3. **IMPORTANTE**: Revisa la consola del navegador (F12) para ver los logs
4. Deberías ver mensajes como:
   ```
   Starting tournament with 3 pairs
   Total matches to create: 3
   Creating round 1
   Creating match: Court 1, Round 1
   ```

### **Paso 6: Verificar Partidos Creados**

1. Después de iniciar el torneo, deberías ver:
   - Sección "🎾 Partidos (3 total)"
   - Partidos organizados por rondas
   - Cada partido muestra: parejas, cancha, ronda

### **Paso 7: Jugar un Partido**

1. Haz clic en un partido para seleccionarlo
2. Haz clic en "➕ Agregar Juego"
3. Registra el resultado del primer juego (ej: 6-4)
4. Agrega más juegos según sea necesario
5. Haz clic en "✅ Finalizar Partido"

### **Paso 8: Verificar Estadísticas**

1. Ve a la sección "📊 Clasificación"
2. Verifica que las estadísticas se actualicen:
   - Partidos jugados (PJ)
   - Sets ganados (SG)
   - Juegos ganados (JG)
   - Puntos (Pts)

### **Paso 9: Completar el Torneo**

1. Juega todos los partidos restantes
2. Registra los resultados de cada partido
3. Verifica que la clasificación se actualice correctamente

### **Paso 10: Ver Ganadores**

1. Cuando todos los partidos estén terminados
2. Aparecerá el botón "🏆 ¡Ver Ganadores del Torneo!"
3. Haz clic para ver la pantalla de celebración

## 🔍 **Qué Verificar en Cada Paso**

### **Al Crear Parejas:**

- ✅ Se muestran los jugadores seleccionados
- ✅ El botón "Crear Pareja" aparece cuando hay 2 jugadores
- ✅ La pareja aparece en la lista después de crearla

### **Al Iniciar Torneo:**

- ✅ Se muestran logs en la consola
- ✅ Aparecen los partidos organizados por rondas
- ✅ Cada partido muestra las parejas correctas
- ✅ Se indica la cancha y ronda de cada partido

### **Al Jugar Partidos:**

- ✅ Se pueden agregar juegos
- ✅ Se pueden registrar puntuaciones
- ✅ Se puede finalizar el partido
- ✅ Las estadísticas se actualizan

### **En la Clasificación:**

- ✅ Las parejas se ordenan por sets ganados
- ✅ En caso de empate, por juegos ganados
- ✅ Se muestran todas las estadísticas correctamente

## 🐛 **Solución de Problemas**

### **Problema: No se crean partidos**

**Síntomas:**

- Al hacer clic en "Iniciar Torneo" no pasa nada
- No aparecen partidos en la lista

**Solución:**

1. Verifica que tienes al menos 2 parejas
2. Revisa la consola del navegador (F12) para errores
3. Verifica que las variables de entorno están configuradas
4. Asegúrate de que las tablas existen en Supabase

### **Problema: No se pueden registrar resultados**

**Síntomas:**

- Los campos de puntuación no responden
- No se pueden agregar juegos

**Solución:**

1. Verifica que el partido está seleccionado
2. Revisa la consola para errores de base de datos
3. Asegúrate de que las tablas tienen los permisos correctos

### **Problema: Estadísticas no se actualizan**

**Síntomas:**

- Los resultados no se reflejan en la clasificación
- Las estadísticas no cambian

**Solución:**

1. Verifica que el partido se marcó como finalizado
2. Revisa que los cálculos son correctos
3. Recarga la página para verificar

## 📊 **Criterios de Ganador**

El sistema determina al ganador así:

1. **Primer criterio**: Más sets ganados
2. **Segundo criterio**: Más juegos ganados (en caso de empate en sets)
3. **Tercer criterio**: Más puntos totales

## 🎯 **Resultado Esperado**

Al completar todas las pruebas deberías tener:

- ✅ Torneo creado con nombre y descripción
- ✅ Al menos 4 jugadores registrados
- ✅ Al menos 3 parejas formadas
- ✅ Todos los partidos generados automáticamente
- ✅ Resultados registrados para todos los partidos
- ✅ Clasificación final calculada correctamente
- ✅ Pantalla de ganadores funcionando

¡El sistema debería funcionar perfectamente para gestionar torneos de pádel! 🏆
