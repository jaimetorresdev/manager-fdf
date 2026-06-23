# Navegación y centros de área

Fecha: 21 de junio de 2026  
Áreas: Fichajes, Competición, Club y Comunidad

## Objetivo

Las áreas globales dejan de ser desplegables que únicamente contienen enlaces. Cada una pasa a tener:

1. un destino propio al pulsar su nombre;
2. un centro de mando con datos reales del turno;
3. una navegación contextual persistente en todas sus herramientas;
4. una separación clara entre recorridos principales y herramientas secundarias;
5. comportamiento equivalente en escritorio y móvil.

## Rutas de los centros de mando

- `/transfers`: sala de operaciones de fichajes.
- `/competition`: centro de competición.
- `/club-management`: dirección institucional del club.
- `/community`: plaza social FDF.

Las rutas anteriores se conservan. Mercado, Liga, Economía, Mensajes y el resto siguen siendo herramientas profundas, ahora conectadas a su centro.

## Navegación global

### Nivel 1: áreas

La barra superior contiene cinco áreas: Equipo, Competición, Fichajes, Club y Comunidad.

- Pulsar el nombre o icono entra directamente en su centro.
- Pulsar el chevrón abre el mapa completo del área.
- Cada entrada del desplegable muestra título y descripción.
- El área activa queda marcada por su color.
- Las páginas dinámicas de competición (`/competition/:id`) mantienen activo el contexto de Competición.

### Nivel 2: barra contextual

`AreaContextBar` aparece dentro de todas las rutas de las cuatro áreas:

- identidad del área;
- enlace de vuelta al centro;
- cuatro herramientas principales;
- menú «Más» para destinos de menor frecuencia.

La barra evita repetir ocho pestañas a la vez en Competición o siete en Club.

### Nivel 3: navegación móvil

El menú móvil separa:

- enlace directo al centro de cada área;
- botón independiente para desplegar sus herramientas;
- navegación contextual horizontal dentro de cada página.

La cabecera móvil fue ajustada para que sus controles no desborden el viewport.

## Centros de mando

### Fichajes

Fuentes:

- `GET /api/market/window`
- `GET /api/market/salary-cap`
- `GET /api/market/my-offers`
- `GET /api/market/shortlist`
- `GET /api/market/squad-limits`
- `GET /api/market/deadline-day`

Resume ventana, ofertas activas, objetivos, uso salarial, plazas de plantilla y presión de cierre. La prioridad conduce al mercado y el pulso conecta negociaciones, plantilla y subastas.

### Competición

Fuentes:

- `GET /api/matches/mine`
- `GET /api/club/standings`
- `GET /api/world/competitions`

Resume posición, puntos, próximos encuentros y tamaño del universo competitivo. El próximo partido se convierte en la acción dominante.

El Diario de partidos (`/matches`) también fue rehecho:

- tarjetas compactas con ambos equipos siempre visibles;
- próximo encuentro destacado;
- marcador y estado claros;
- solo nueve resultados recientes de inicio;
- historial completo desplegable;
- altura de escritorio reducida de unos 2.054 px a 1.273 px con los datos QA.

Además:

- Liga elimina pestañas simuladas de Copa y Estadísticas que solo mostraban «próximamente».
- Mundo recupera su estructura JSX y mantiene el mapa como fondo interactivo.
- Selecciones recupera su hoja de estilos encapsulada y vuelve a compilar.

### Club

Fuentes:

- `GET /api/club`
- `GET /api/club/health-map`
- `GET /api/economy`
- `GET /api/staff`
- `GET /api/fans/mood`

Resume caja, salud global, personal y ánimo social. Muestra las seis áreas del mapa de salud y enlaza las decisiones de economía, estadio, estructura profesional y afición.

### Comunidad

Fuentes:

- `GET /api/news`
- `GET /api/messages/conversations`
- `GET /api/forum/threads?category=general`

Resume mensajes, bandeja, prensa e hilos. El titular principal abre la actualidad y el pulso conecta conversaciones, foro y hemeroteca.

## Resiliencia

Los centros cargan sus fuentes con `Promise.allSettled`.

- Un endpoint secundario no bloquea el área completa.
- Se indica cuántas fuentes no se actualizaron.
- El usuario puede reintentar desde la propia cabecera.
- Las métricas sin dato fiable muestran `—`.

## Responsive y accesibilidad

- Escritorio validado a 1.272 px sin overflow.
- Centros validados a 390 × 844 px.
- La navegación móvil global queda dentro del ancho exacto del documento.
- KPIs a dos columnas en móvil.
- Herramientas en una sola columna.
- Estados comunicados mediante texto, icono y color.
- Enlaces y botones tienen destinos y nombres accesibles diferenciados.
- El contenido de los menús secundarios permanece realmente oculto cuando `details` está cerrado.

## Internacionalización

Se añadieron las claves `nav.*`, `areaHub.*` y el control de historial de partidos con paridad exacta en:

- español;
- inglés;
- francés;
- alemán;
- italiano.

## Archivos principales

- `football-manager/src/pages/AreaHubPage.tsx`
- `football-manager/src/components/layout/AreaContextBar.tsx`
- `football-manager/src/components/layout/navConfig.ts`
- `football-manager/src/components/layout/TopBar.tsx`
- `football-manager/src/components/layout/MobileNav.tsx`
- `football-manager/src/components/layout/AppLayout.tsx`
- `football-manager/src/pages/ClubMatchesPage.tsx`
- `football-manager/src/pages/LeaguePage.tsx`
- `football-manager/src/pages/WorldPage.tsx`
- `football-manager/src/pages/NationalTeamsPage.tsx`
- `football-manager/src/App.tsx`
- `football-manager/src/index.css`
- `football-manager/src/locales/{es,en,fr,de,it}.json`
- `football-manager/src/locales/gameplay.{es,en,fr,de,it}.json`

## Verificación

- TypeScript focalizado: correcto.
- ESLint focalizado: 0 errores y 0 warnings.
- Paridad i18n: 5/5 idiomas.
- Navegador autenticado: centros y herramientas profundas.
- Consola del navegador: 0 errores y 0 warnings.
- Escritorio y móvil sin overflow horizontal del documento.

El build global llega ahora hasta errores ajenos de variables sin uso en `src/lib/playerPortraitParts.ts`. Esos errores no pertenecen a esta reforma.
