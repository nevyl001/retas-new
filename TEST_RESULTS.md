# 🎾 Prueba de Funcionalidad de Resultados

## Pasos para Probar la Entrada de Resultados

### 1. **Iniciar el Torneo**

1. Selecciona un torneo
2. Crea al menos 2 parejas
3. Haz clic en "🚀 ¡Iniciar Torneo!"
4. Verifica que se generen los partidos

### 2. **Seleccionar un Partido**

1. Busca la sección "🎾 Partidos"
2. Haz clic en cualquier partido
3. Deberías ver en la consola:
   ```
   === SELECCIONANDO PARTIDO ===
   Match ID: [id-del-partido]
   ✅ Match seleccionado
   === CARGANDO JUEGOS ===
   Match ID: [id-del-partido]
   ✅ Juegos cargados: 0
   Juegos: []
   ✅ Estado local actualizado
   ```

### 3. **Agregar Juegos**

1. Haz clic en "➕ Agregar Juego"
2. Deberías ver en la consola:
   ```
   === AGREGANDO JUEGO ===
   Match ID: [id-del-partido]
   Games actuales: 0
   Número de juego: 1
   ✅ Juego creado: {id, match_id, game_number, ...}
   ✅ Estado local actualizado
   ```

### 4. **Entrar Resultados**

1. En el juego creado, verás dos campos de entrada
2. Ingresa resultados (ej: 6-4)
3. Deberías ver en la consola:
   ```
   === ACTUALIZANDO MARCADOR ===
   Game ID: [id-del-juego]
   Pair 1 Games: 6
   Pair 2 Games: 4
   ✅ Marcador actualizado en base de datos
   ✅ Estado local actualizado
   ```

### 5. **Agregar Más Juegos**

1. Haz clic en "➕ Agregar Juego" nuevamente
2. Ingresa resultados para el segundo juego
3. Continúa hasta completar el partido

### 6. **Finalizar Partido**

1. Haz clic en "✅ Finalizar Partido"
2. Deberías ver en la consola:
   ```
   === FINALIZANDO PARTIDO ===
   Match ID: [id-del-partido]
   Match found: {...}
   Games for this match: [número]
   Winner calculation:
   Pair 1 games: [número]
   Pair 2 games: [número]
   Winner ID: [id-del-ganador]
   ```

## 🔍 Diagnóstico de Problemas

### **Problema 1: No se pueden agregar juegos**

- Verifica que el partido esté seleccionado
- Revisa la consola para errores
- Verifica la conexión a Supabase

### **Problema 2: No se pueden ingresar resultados**

- Verifica que el juego esté creado
- Revisa los logs de `updateGameScore`
- Verifica que los campos de entrada estén habilitados

### **Problema 3: No se actualiza la clasificación**

- Verifica que el partido esté finalizado
- Revisa los logs de `finishMatch`
- Verifica que las estadísticas se actualicen

## 📊 Logs Esperados

### **Selección de Partido:**

```
=== SELECCIONANDO PARTIDO ===
Match ID: xxx
✅ Match seleccionado
=== CARGANDO JUEGOS ===
Match ID: xxx
✅ Juegos cargados: 0
Juegos: []
✅ Estado local actualizado
```

### **Agregar Juego:**

```
=== AGREGANDO JUEGO ===
Match ID: xxx
Games actuales: 0
Número de juego: 1
✅ Juego creado: {...}
✅ Estado local actualizado
```

### **Actualizar Resultado:**

```
=== ACTUALIZANDO MARCADOR ===
Game ID: yyy
Pair 1 Games: 6
Pair 2 Games: 4
✅ Marcador actualizado en base de datos
✅ Estado local actualizado
```

### **Finalizar Partido:**

```
=== FINALIZANDO PARTIDO ===
Match ID: xxx
Match found: {...}
Games for this match: 2
Winner calculation:
Pair 1 games: 1
Pair 2 games: 1
Winner ID: zzz
```

## 🎯 Resultado Esperado

- ✅ **Juegos se crean** correctamente
- ✅ **Resultados se guardan** en la base de datos
- ✅ **Clasificación se actualiza** automáticamente
- ✅ **Ganador se determina** correctamente
- ✅ **Estadísticas se muestran** en tiempo real

## 🚨 Problemas Comunes

1. **Juegos no se crean**: Verificar conexión a Supabase
2. **Resultados no se guardan**: Verificar función `updateGame`
3. **Clasificación no se actualiza**: Verificar función `finishMatch`
4. **Interfaz no responde**: Verificar logs de errores en consola
