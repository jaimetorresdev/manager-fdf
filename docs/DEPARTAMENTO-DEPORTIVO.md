# Departamento deportivo: Plantilla, Táctica y Entrenamiento

Fecha: 21 de junio de 2026  
Rutas: `/squad`, `/tactics`, `/training`

## Objetivo

Las tres páginas dejan de funcionar como herramientas aisladas y pasan a formar un único espacio de trabajo. La navegación, el contexto de jornada y los indicadores mantienen continuidad entre:

1. **Plantilla:** decidir quién está disponible y quién debe formar el once.
2. **Táctica:** comprobar si ese once encaja en el dibujo y está listo para competir.
3. **Entrenamiento:** corregir carencias mediante grupos y sesiones antes del siguiente turno.

El componente compartido `SportingWorkspaceHeader` muestra identidad del club, temporada, jornada, navegación, estado operativo y cuatro métricas específicas de cada área.

## Plantilla

La vista principal se convierte en una mesa de decisiones:

- once actual y titulares no disponibles;
- contratos cortos;
- forma y moral medias;
- bajas totales y límites de plantilla;
- búsqueda, filtros de línea/estado y orden por posición, media, forma o edad;
- acción directa para añadir o sacar jugadores del once;
- tarjetas compactas con media, forma, moral, valor y contrato;
- tabla analítica y dossier completo conservados.

La página propia usa `GET /api/players`, no la plantilla pública del club. Así recupera los campos privados necesarios: `overall`, `fitness`, `morale`, `isStarter`, contratos, sanciones y posición detallada. La fuente pública queda solo como fallback.

En móvil, la parrilla usa dos columnas compactas y elimina información duplicada de cada tarjeta. Con 26 jugadores, la altura se reduce aproximadamente de 7.364 px a 3.921 px a 390 px de viewport.

## Táctica

La pizarra vuelve a ser la protagonista:

- estado global “listo / requiere corrección”;
- validación de 11 jugadores, portero, bajas y alertas críticas;
- métricas de dibujo, media y forma del once;
- reparación directa mediante el once óptimo;
- titulares y suplentes se muestran en pestañas, evitando dos listas completas apiladas;
- pizarra, formaciones e instrucciones quedan organizadas en tres zonas claras;
- las alertas posicionales se deduplican, se muestran tres de inicio y el resto queda desplegable.

La lógica previa de drag and drop, intercambio, autosave, instrucciones, jugadas ensayadas y sustituciones programadas se conserva.

## Entrenamiento

El centro de rendimiento añade una capa operativa que antes no estaba expuesta:

- sesión manual real mediante `POST /api/training/session`;
- catálogo de sesiones mediante `GET /api/training/types`;
- elección de entrenador, tipo y hasta seis jugadores;
- informe individual de mejora y nueva forma;
- mapa de cobertura GK/DEF/MID/ATT/TAC;
- titulares sin grupo, nivel medio y jugadores asignados;
- gestión de entrenadores y grupos;
- entrenamiento a puerta cerrada, discurso y progreso de jugadas.

La carga usa `Promise.allSettled` para plantilla, entrenadores, control y tipos. Un fallo parcial mantiene el resto de áreas operativo. Si el backend aplica rate limit a los recursos centrales, la página conserva su estructura, explica qué recurso no respondió, desactiva acciones inseguras y ofrece reintento; ya no queda reducida a una pantalla de error.

## Responsive y accesibilidad

- Cabecera y navegación deportiva compartidas en las tres rutas.
- Escritorio: jerarquía de mando, paneles laterales y pizarra sin overflow.
- Móvil: flujo vertical; Plantilla compacta a dos columnas; Táctica y Entrenamiento reorganizados.
- Los estados usan texto, icono y color.
- Controles semánticos, labels y estados disabled donde no hay datos fiables.
- No se detectó overflow propio de estas páginas a 390 px; permanece el pequeño desborde preexistente de la barra global.

## Internacionalización

Se añadieron `gameplay.sportingHub` y los bloques `command` de las tres áreas con paridad exacta en:

- español;
- inglés;
- francés;
- alemán;
- italiano.

## Archivos principales

- `football-manager/src/components/sporting/SportingWorkspaceHeader.tsx`
- `football-manager/src/pages/SquadPage.tsx`
- `football-manager/src/pages/TacticsPage.tsx`
- `football-manager/src/pages/TrainingPage.tsx`
- `football-manager/src/components/tactics2/FormationInsightPanel.tsx`
- `football-manager/src/api/client.ts`
- `football-manager/src/locales/gameplay.{es,en,fr,de,it}.json`

## Verificación

- TypeScript focalizado de los archivos implicados: correcto.
- ESLint focalizado: 0 errores y 0 warnings.
- Paridad i18n: 5/5 idiomas.
- Navegador autenticado: las tres rutas montan con datos reales.
- Escritorio: 1.272 px, sin overflow horizontal.
- Móvil: 390 × 844 px, sin overflow propio de página.
- Consola del navegador: 0 errores y 0 warnings.
- Entrenamiento validado también bajo respuesta 429 del backend.

El build global continúa bloqueado por errores ajenos en `ClubMatchesPage.tsx` (imports sin uso y tipos cruzados en las filas de partidos). Los archivos de este cambio sí superan TypeScript y ESLint focalizados.
