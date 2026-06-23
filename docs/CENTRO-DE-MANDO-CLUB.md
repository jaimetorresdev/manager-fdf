# Centro de mando del club

Fecha: 21 de junio de 2026  
Ruta: `/`  
Componente principal: `football-manager/src/pages/ClubHubPage.tsx`

## Objetivo

La portada privada deja de ser un selector entre tres páginas distintas (`FDF Today`, dashboard clásico y perfil). La ruta `/` pasa a tener una única misión: responder, de arriba abajo, a estas preguntas:

1. ¿Qué tengo que decidir antes del próximo turno?
2. ¿Cuál es el siguiente partido y cómo llego?
3. ¿Cómo está el club en lo deportivo, económico e institucional?
4. ¿Qué contexto necesito sobre plantilla, liga y directiva?
5. ¿Dónde entro para gestionar cada departamento?

La ficha pública e histórica del club sigue disponible en `/club/:id`, pero ya no se incrusta dentro de la portada.

## Jerarquía de información

### 1. Cabecera de identidad

- Escudo, nombre del club, mánager, temporada, fecha in-game y jornada relativa.
- Estado operativo: número de decisiones urgentes y hora real del siguiente turno.
- Accesos inmediatos a Plantilla, Tácticas y Perfil.
- La jornada usa `gameState.seasonWeek`; nunca `week`, que es acumulada entre temporadas.

### 2. Foco operativo

- Próximo partido como pieza dominante: competición, localía, rival, forma reciente y CTA al Match Center.
- Mesa del mánager con el checklist oficial del servidor, ordenado por urgencia.
- Si no hay partido o tareas, se muestran estados vacíos accionables.

### 3. KPIs de lectura rápida

- Posición y puntos.
- Caja disponible.
- Moral media.
- Prestigio del mánager/club.

Cada KPI funciona también como acceso al área que explica el dato.

### 4. Pulso del club

Consume `GET /api/club/health-map`, que es la fuente oficial para las seis áreas:

- Deportivo
- Economía
- Plantilla
- Cantera
- Afición
- Directiva

El cliente no recalcula reglas de gameplay. Solo representa `score`, `status` y `note`.

### 5. Contexto

- Vestuario: tamaño, titulares, forma media, bajas y jugadores disponibles.
- Liga: tramo de clasificación alrededor del club.
- Briefing institucional: confianza, objetivo de temporada y titular del día.

### 6. Departamentos

Los accesos se agrupan por intención, no como una lista plana:

- Equipo: Plantilla, Tácticas, Entrenamiento.
- Competición: Partidos, Calendario, Liga.
- Institución: Economía, Estadio, Personal.
- Futuro: Cantera, Afición, Equipaciones.

## Datos y tolerancia a fallos

La página carga en paralelo, con `Promise.allSettled`:

- `GET /api/game/dashboard`
- `GET /api/club`
- `GET /api/club/health-map`
- `GET /api/dashboard/turn-checklist`
- `GET /api/dashboard/daily-cover`

Cada bloque tiene fallback independiente. El fallo de un servicio secundario no impide usar el resto del centro de mando.

Los modales `PostTurnPackage` y `WhileAwayModal` se conservan, pero ya no hay peticiones duplicadas provocadas por anidar `DashboardPage`.

## Responsive y accesibilidad

- Escritorio: foco operativo a dos columnas, seis áreas de salud y tres paneles de contexto.
- Tablet: salud a tres columnas y contexto reorganizado.
- Móvil: flujo lineal, KPIs y salud a dos columnas, departamentos apilados.
- Todos los destinos son botones semánticos y navegables por teclado.
- Los estados dependen de texto, icono y color; no solo de color.
- No hay desbordamiento horizontal a 390 px.

## Internacionalización

El namespace `gameplay.clubCommand` existe con paridad exacta en:

- Español
- Inglés
- Francés
- Alemán
- Italiano

Las notas de diagnóstico proceden actualmente del backend y conservan el idioma de ese contrato.

## Archivos implicados

- `football-manager/src/pages/ClubHubPage.tsx`
- `football-manager/src/api/client.ts`
- `football-manager/src/stores/gameStore.ts`
- `football-manager/src/locales/gameplay.{es,en,fr,de,it}.json`

## Verificación

- TypeScript de la app: correcto tras implementar la página.
- ESLint focalizado: 0 errores.
- Paridad i18n: 5/5 idiomas, 0 claves vacías.
- Navegador real: escritorio y móvil, datos reales del club QA.
- Consola del navegador: 0 errores y 0 warnings.
- Jornada validada contra BD: `seasonWeek=40` frente a `week=240`; la UI muestra 40.

En la última repetición global de TypeScript apareció un error sintáctico externo y concurrente en `CalendarPage.tsx` (CSS suelto dentro del JSX, desde la línea 341). No pertenece a este cambio.
