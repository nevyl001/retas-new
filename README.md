# 🏆 Sistema de Torneos de Pádel

Un sistema completo para gestionar torneos de pádel con persistencia de datos en base de datos Supabase.

## ✨ Características

- **Gestión de Torneos**: Crear, editar y eliminar torneos con nombres personalizados
- **Gestión de Jugadores**: Registrar y gestionar jugadores de manera independiente
- **Creación de Parejas**: Formar parejas seleccionando jugadores
- **Sistema de Partidos**: Distribución automática de partidos por rondas y canchas
- **Marcador en Tiempo Real**: Registrar resultados de juegos normales y tie breaks
- **Clasificación Automática**: Cálculo automático de posiciones basado en partidos ganados, juegos y puntos
- **Persistencia de Datos**: Todos los datos se guardan en Supabase
- **Interfaz Moderna**: Diseño responsive y intuitivo

## 🚀 Configuración

### 1. Configurar Supabase

1. Crea una cuenta en [Supabase](https://supabase.com)
2. Crea un nuevo proyecto
3. Ve a Settings > API y copia:
   - Project URL
   - anon/public key

### 2. Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
REACT_APP_SUPABASE_URL=tu_project_url_aqui
REACT_APP_SUPABASE_ANON_KEY=tu_anon_key_aqui
```

### 3. Configurar la Base de Datos

1. Ve a tu proyecto de Supabase
2. Ve a SQL Editor
3. Ejecuta el script SQL del archivo `database-schema.sql`

### 4. Instalar Dependencias

```bash
npm install
```

### 5. Ejecutar la Aplicación

```bash
npm start
```

## 📊 Estructura de la Base de Datos

### Tablas Principales

- **tournaments**: Información de torneos
- **players**: Jugadores registrados
- **pairs**: Parejas formadas por jugadores
- **matches**: Partidos del torneo
- **games**: Juegos individuales de cada partido

### Relaciones

- Un torneo tiene múltiples parejas
- Una pareja pertenece a un torneo y tiene dos jugadores
- Un torneo tiene múltiples partidos
- Un partido tiene múltiples juegos

## 🎮 Cómo Usar

### 1. Crear un Torneo

1. Haz clic en "➕ Crear Nuevo Torneo"
2. Completa el formulario:
   - Nombre del torneo
   - Descripción (opcional)
   - Número de canchas disponibles
3. Haz clic en "🏆 Crear Torneo"

### 2. Gestionar Jugadores

1. Selecciona el torneo creado
2. Haz clic en "👥 Gestionar Jugadores"
3. Agrega jugadores uno por uno
4. Selecciona dos jugadores para formar una pareja
5. Haz clic en "✅ Crear Pareja"

### 3. Iniciar el Torneo

1. Una vez que tengas al menos 2 parejas
2. Haz clic en "🚀 Iniciar Torneo"
3. El sistema creará automáticamente todos los partidos posibles

### 4. Gestionar Partidos

1. Selecciona un partido de la lista
2. Agrega juegos con "➕ Agregar Juego"
3. Registra los resultados:
   - Juegos normales (0-7)
   - Tie breaks (0-20)
4. Finaliza el partido con "✅ Finalizar Partido"

### 5. Ver Clasificación

La clasificación se actualiza automáticamente y muestra:

- Posición
- Pareja
- Partidos Jugados (PJ)
- Sets Ganados (SG)
- Juegos Ganados (JG)
- Puntos Totales (Pts)

## 🎾 Reglas del Juego

### Juegos Normales

- Puntuación de 0 a 7
- Gana quien tenga más puntos

### Tie Break

- Puntuación de 0 a 20
- Gana quien llegue a 10 puntos con diferencia de 2
- Se activa con el botón "🎾 Cambiar a Tie Break"

### Cálculo de Ganador

- Se cuenta cuántos juegos ganó cada pareja
- La pareja con más juegos ganados gana el partido
- En caso de empate, gana quien tenga más puntos totales

## 🛠️ Tecnologías Utilizadas

- **Frontend**: React + TypeScript
- **Base de Datos**: Supabase (PostgreSQL)
- **Estilos**: CSS3 con diseño responsive
- **Estado**: React Hooks
- **Autenticación**: Supabase Auth (preparado para futuras implementaciones)

## 📱 Características Responsive

- Diseño adaptativo para móviles y tablets
- Interfaz optimizada para diferentes tamaños de pantalla
- Navegación intuitiva en dispositivos táctiles

## 🔧 Funciones Avanzadas

### Gestión de Datos

- **Eliminación Física**: Puedes eliminar torneos, jugadores y parejas
- **Persistencia**: Todos los datos se guardan automáticamente
- **Sincronización**: Cambios en tiempo real

### Distribución de Partidos

- **Algoritmo Round-Robin**: Todos contra todos
- **Distribución por Canchas**: Optimización automática
- **Evita Conflictos**: No hay partidos simultáneos de la misma pareja

### Estadísticas Detalladas

- **Historial Completo**: Todos los resultados quedan registrados
- **Clasificación Dinámica**: Se actualiza automáticamente
- **Múltiples Torneos**: Puedes gestionar varios torneos simultáneamente

## 🚀 Próximas Funcionalidades

- [ ] Autenticación de usuarios
- [ ] Exportación de resultados a PDF
- [ ] Notificaciones en tiempo real
- [ ] Modo offline
- [ ] API REST para integraciones
- [ ] Dashboard de estadísticas avanzadas

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🆘 Soporte

Si tienes problemas o preguntas:

1. Revisa la documentación de Supabase
2. Verifica que las variables de entorno estén correctamente configuradas
3. Asegúrate de que el esquema de la base de datos se haya ejecutado correctamente

## 🎯 Roadmap

### Versión 1.1

- [ ] Modo eliminatoria
- [ ] Grupos y fase de grupos
- [ ] Horarios de partidos

### Versión 1.2

- [ ] Aplicación móvil
- [ ] Notificaciones push
- [ ] Integración con redes sociales

### Versión 2.0

- [ ] Múltiples deportes
- [ ] Sistema de rankings
- [ ] Torneos internacionales
