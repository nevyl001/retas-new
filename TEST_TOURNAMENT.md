# 🧪 Guía de Prueba - Iniciar Torneo

## 🎯 **Objetivo**

Probar que el botón "Iniciar Torneo" funcione correctamente y genere la distribución adecuada de partidos.

## 📋 **Pasos para Probar**

### **Paso 1: Preparar el Torneo**

1. **Crear un torneo:**

   - Haz clic en "➕ Crear Nuevo Torneo"
   - Nombre: "Torneo de Prueba"
   - Descripción: "Prueba de distribución"
   - Canchas: 2
   - Haz clic en "🏆 Crear Torneo"

2. **Agregar jugadores:**

   - Selecciona el torneo creado
   - Haz clic en "👥 Gestionar Jugadores"
   - Agrega al menos 4 jugadores:
     - Juan Pérez
     - María García
     - Carlos López
     - Ana Rodríguez

3. **Crear parejas:**
   - Selecciona Juan y María → "✅ Crear Pareja"
   - Selecciona Carlos y Ana → "✅ Crear Pareja"

### **Paso 2: Verificar el Botón de Iniciar**

1. **Deberías ver:**
   - Sección "🚀 Iniciar Torneo" con fondo azul
   - Texto: "Tienes 2 parejas registradas"
   - Texto: "Se crearán 1 partidos"
   - Botón dorado: "🚀 ¡Iniciar Torneo!"

### **Paso 3: Iniciar el Torneo**

1. **Abrir la consola del navegador:**

   - Presiona F12
   - Ve a la pestaña "Console"

2. **Hacer clic en "🚀 ¡Iniciar Torneo!"**

3. **Verificar los logs en la consola:**

   ```
   === INFORMACIÓN DE PAREJAS ===
   Pareja 1: Juan y María
   Pareja 2: Carlos y Ana

   === PARTIDOS A CREAR ===
   Partido 1: Juan y María vs Carlos y Ana

   === CREANDO PARTIDOS EN LA BASE DE DATOS ===

   🔄 RONDA 1:
   🏟️ Cancha 1: Juan y María vs Carlos y Ana

   ✅ TORNEO INICIADO EXITOSAMENTE!
   📊 Total de partidos creados: 1
   🔄 Total de rondas: 1
   🏟️ Canchas utilizadas: 2
   ```

### **Paso 4: Verificar los Partidos Creados**

1. **Después de iniciar el torneo, deberías ver:**
   - Sección "🎾 Partidos (1 total)"
   - Ronda 1 con 1 partido
   - El partido muestra:
     - "Juan y María vs Carlos y Ana"
     - "🏟️ Cancha 1"
     - "🔄 Ronda 1"
     - "⏳ Pendiente"

### **Paso 5: Probar con Más Parejas**

1. **Agregar 2 jugadores más:**

   - Pedro Martínez
   - Laura Fernández

2. **Crear una tercera pareja:**

   - Selecciona Pedro y Laura → "✅ Crear Pareja"

3. **Iniciar el torneo nuevamente:**
   - Deberías ver: "Se crearán 3 partidos"
   - Los logs mostrarán 3 partidos distribuidos en 2 rondas

## 🔍 **Qué Verificar**

### **✅ Funcionamiento Correcto:**

- [ ] El botón "Iniciar Torneo" aparece cuando hay al menos 2 parejas
- [ ] Los logs en la consola muestran información clara
- [ ] Se crean los partidos correctos sin duplicados
- [ ] Cada pareja juega exactamente una vez contra cada otra
- [ ] Los partidos se distribuyen correctamente por canchas
- [ ] No hay conflictos de horario (una pareja no juega en múltiples partidos simultáneamente)

### **❌ Problemas a Detectar:**

- [ ] Partidos duplicados
- [ ] Parejas jugando múltiples veces
- [ ] Conflictos de horario
- [ ] Canchas vacías cuando deberían estar ocupadas

## 📊 **Ejemplos de Distribución Correcta**

### **Con 2 Parejas (A, B):**

```
Ronda 1:
- Cancha 1: A vs B
- Cancha 2: (vacía)
```

### **Con 3 Parejas (A, B, C):**

```
Ronda 1:
- Cancha 1: A vs B
- Cancha 2: (vacía)

Ronda 2:
- Cancha 1: A vs C
- Cancha 2: (vacía)

Ronda 3:
- Cancha 1: B vs C
- Cancha 2: (vacía)
```

### **Con 4 Parejas (A, B, C, D):**

```
Ronda 1:
- Cancha 1: A vs B
- Cancha 2: C vs D

Ronda 2:
- Cancha 1: A vs C
- Cancha 2: B vs D

Ronda 3:
- Cancha 1: A vs D
- Cancha 2: B vs C
```

## 🐛 **Solución de Problemas**

### **Problema: No aparece el botón de iniciar**

**Solución:**

- Verifica que tienes al menos 2 parejas
- Asegúrate de que el torneo no esté ya iniciado

### **Problema: No se crean partidos**

**Solución:**

- Revisa la consola para errores
- Verifica que las variables de entorno están configuradas
- Asegúrate de que las tablas existen en Supabase

### **Problema: Partidos duplicados**

**Solución:**

- La nueva lógica debería evitar duplicados
- Si persiste, revisa los logs en la consola

## 🎯 **Resultado Esperado**

Al completar la prueba deberías tener:

- ✅ Botón de iniciar torneo visible y funcional
- ✅ Logs detallados en la consola
- ✅ Partidos creados sin duplicados
- ✅ Distribución correcta por canchas y rondas
- ✅ Interfaz actualizada mostrando los partidos

¡El sistema debería funcionar perfectamente! 🏆
