# 🏆 Lógica del Torneo - Sistema de Pádel

## 📋 **Cómo Funciona la Distribución de Partidos**

### **Problema Solucionado:**

❌ **Antes**: Los partidos se repetían en cada ronda y las mismas parejas jugaban múltiples veces
✅ **Ahora**: Cada pareja juega exactamente una vez contra cada otra pareja, distribuida correctamente por canchas y rondas

## 🔄 **Algoritmo de Distribución**

### **Paso 1: Generar Todos los Partidos Posibles**

```javascript
// Para 4 parejas (A, B, C, D) se generan estos partidos:
// A vs B, A vs C, A vs D, B vs C, B vs D, C vs D
// Total: 6 partidos (formula: n * (n-1) / 2)
```

### **Paso 2: Distribuir por Canchas y Rondas**

```javascript
// Ejemplo con 2 canchas y 6 partidos:
// Ronda 1: Cancha 1 = A vs B, Cancha 2 = C vs D
// Ronda 2: Cancha 1 = A vs C, Cancha 2 = B vs D
// Ronda 3: Cancha 1 = A vs D, Cancha 2 = B vs C
```

### **Paso 3: Evitar Conflictos**

- ✅ **Una pareja no puede jugar en múltiples partidos simultáneamente**
- ✅ **Cada pareja juega exactamente una vez contra cada otra**
- ✅ **Los partidos se distribuyen equitativamente por canchas**

## 📊 **Ejemplos de Distribución**

### **Ejemplo 1: 3 Parejas, 2 Canchas**

```
Parejas: A, B, C
Partidos: A vs B, A vs C, B vs C

Ronda 1:
- Cancha 1: A vs B
- Cancha 2: (vacía - solo 3 partidos)

Ronda 2:
- Cancha 1: A vs C
- Cancha 2: (vacía)

Ronda 3:
- Cancha 1: B vs C
- Cancha 2: (vacía)
```

### **Ejemplo 2: 4 Parejas, 2 Canchas**

```
Parejas: A, B, C, D
Partidos: A vs B, A vs C, A vs D, B vs C, B vs D, C vs D

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

### **Ejemplo 3: 6 Parejas, 3 Canchas**

```
Parejas: A, B, C, D, E, F
Partidos: 15 totales

Ronda 1:
- Cancha 1: A vs B
- Cancha 2: C vs D
- Cancha 3: E vs F

Ronda 2:
- Cancha 1: A vs C
- Cancha 2: B vs D
- Cancha 3: E vs F

... (continúa hasta completar todos los partidos)
```

## 🎯 **Reglas de Distribución**

### **Regla 1: Sin Duplicados**

- ❌ No puede haber dos partidos con las mismas parejas
- ✅ Cada pareja juega exactamente una vez contra cada otra

### **Regla 2: Sin Conflictos de Horario**

- ❌ Una pareja no puede jugar en múltiples partidos simultáneamente
- ✅ En cada ronda, cada pareja juega máximo un partido

### **Regla 3: Distribución Equitativa**

- ✅ Los partidos se distribuyen equitativamente entre las canchas
- ✅ Se aprovecha al máximo el número de canchas disponibles

### **Regla 4: Optimización de Rondas**

- ✅ Se minimiza el número total de rondas necesarias
- ✅ Se evitan rondas con canchas vacías cuando es posible

## 🔍 **Verificación de la Distribución**

### **Cómo Verificar que Está Correcto:**

1. **Contar Partidos Totales:**

   ```
   Partidos = n * (n-1) / 2
   Donde n = número de parejas
   ```

2. **Verificar Sin Duplicados:**

   - Revisar que no hay dos partidos con las mismas parejas
   - Cada combinación de parejas debe aparecer exactamente una vez

3. **Verificar Sin Conflictos:**

   - En cada ronda, verificar que ninguna pareja aparece en múltiples partidos
   - Cada pareja debe jugar máximo un partido por ronda

4. **Verificar Distribución:**
   - Los partidos deben estar distribuidos entre las canchas
   - El número de rondas debe ser el mínimo necesario

## 📈 **Fórmulas Útiles**

### **Cálculo de Partidos:**

```
Partidos Totales = n * (n-1) / 2
Donde n = número de parejas
```

### **Cálculo de Rondas:**

```
Rondas Mínimas = ceil(Partidos Totales / Número de Canchas)
```

### **Ejemplos:**

- 3 parejas, 2 canchas: 3 partidos, 2 rondas
- 4 parejas, 2 canchas: 6 partidos, 3 rondas
- 6 parejas, 3 canchas: 15 partidos, 5 rondas

## 🎮 **Cómo Probar la Distribución**

### **Paso 1: Crear Torneo**

1. Crea un torneo con 2 canchas
2. Agrega 4 jugadores
3. Crea 2 parejas

### **Paso 2: Iniciar Torneo**

1. Haz clic en "Iniciar Torneo"
2. Revisa la consola para ver los logs de distribución

### **Paso 3: Verificar Resultado**

1. Deberías ver 1 partido (2 parejas = 1 partido)
2. El partido debe estar en Ronda 1, Cancha 1

### **Paso 4: Probar con Más Parejas**

1. Agrega 2 jugadores más
2. Crea una tercera pareja
3. Inicia el torneo nuevamente
4. Deberías ver 3 partidos distribuidos en 2 rondas

## ✅ **Resultado Esperado**

Con la nueva lógica, deberías ver:

- ✅ **Sin partidos duplicados**
- ✅ **Cada pareja juega exactamente una vez contra cada otra**
- ✅ **Distribución equitativa por canchas**
- ✅ **Mínimo número de rondas**
- ✅ **Sin conflictos de horario**

¡El sistema ahora distribuye los partidos correctamente! 🏆
