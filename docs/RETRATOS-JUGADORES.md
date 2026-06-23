# Retratos de jugadores — caricaturas estilo cromo

> Sistema de **retratos faciales** de los jugadores/entrenadores de Manager FDF: caricaturas
> deterministas, alineadas, con camiseta del club, dorsal y **envejecimiento por edad**.
> No confundir con las *fichas* del visor 2D de partido (discos tácticos sobre el campo, ver
> `docs/VISOR-PARTIDO-2D.md`): aquí hablamos del **rostro tipo cromo Panini** que se muestra en
> ficha, plantilla, modal de jugador, freeze-frame de gol, identidad de NPC, etc.

## Objetivo (encargo de Jaime, 21 jun 2026)
«Que el retrato esté **bien alineado**, parezcan **futbolistas de verdad**, **estilo caricatura**
y que **envejezcan con la edad**.» Dejarlo perfecto.

## Stack
- Librería **`facesjs` v5** (`generate` + componente React `<Face>`): generador vectorial de caras
  caricatura. **Sin dependencias nuevas.**
- Render 100% **SVG**; determinista por `id` de jugador (mismo id → misma cara, bit a bit).

## El bug que se arregló (antes)
El enfoque anterior **luchaba contra la librería**:
1. Borraba el cuerpo y la camiseta nativos de facesjs (`jersey.id='__no_jersey__'`,
   `body.id='__no_body__'`) y superponía un **kit propio** (`playerFootballKit.tsx`) en **otro SVG,
   otra capa y otro sistema de coordenadas** → costura/desalineado imposible de cuadrar.
2. El recorte facial era **`viewBox '82 72 236 318'`** (y: 72→**390**). Pero en el lienzo facesjs
   (400×600) las posiciones de los rasgos son **fijas**: ojos y=310, nariz y=370, **boca y=440**,
   mentón ≈y=500. Es decir: **el recorte cortaba a la altura del labio superior**, eliminando boca
   y mentón. El «pegote» blanco bajo la nariz que se veía era el cuello de la camiseta asomando
   donde debería estar la barbilla.
3. `caricatureBoost` reasignaba `head.id` **después** de `applyAge`, así que las formas de cabeza
   juveniles nunca se aplicaban: el envejecimiento era solo «de pelo».

## La solución (ahora): un único sistema de coordenadas, camiseta de fútbol PROPIA
Clave: **todo en el mismo lienzo 400×600 de facesjs.** Pero las «jerseys» nativas de facesjs son de
**baloncesto** (sin mangas, escote profundo, hombros al aire) → no sirven. Por eso:

1. Se **borran** el cuerpo y la camiseta nativos (`body.id='__no_body__'`, `jersey.id='__no_jersey__'`):
   la cara queda solo **cabeza + rasgos + pelo**.
2. Se dibuja una **camiseta de fútbol propia** (`<FootballShirt>`) en una capa **DETRÁS** de la cara,
   con el **mismo `viewBox`** (`FACE_VIEWBOX`). La región bajo la barbilla de la cara es transparente
   ⇒ la camiseta asoma; la **barbilla y el cuello de piel solapan el cuello de la camiseta** → unión
   natural **sin costura**. Manga corta que cubre los hombros (no baloncesto), cuello con ribete y dorsal.

### Piezas
| Archivo | Rol |
|---|---|
| `src/lib/playerFacesJs.ts` | Deriva el `FaceConfig` determinista (raza, rasgos, **envejecimiento** `applyAge`, **caricatura** `caricatureBoost`); borra cuerpo+camiseta nativos; `collarForPlayer(id)` elige cuello; `teamColors` del club. |
| `src/lib/playerFootballShirt.tsx` | **`<FootballShirt>`**: camiseta de fútbol SVG (cuello de piel + hombros + **mangas cortas** + cuello `crew`/`vneck`/`polo` + dorsal) en coords 400×600. Se pinta detrás de la cara. |
| `src/lib/portraitNormalize.ts` | Reencuadre cabeza-y-hombros: `FACE_VIEWBOX = '52 84 296 532'` (pelo → mentón → cuello → camiseta). Solo fija el `viewBox` (no borra paths). |
| `src/lib/playerStickerFrame.tsx` | Marco dorado estilo cromo (solo `card`/`broadcast`). |
| `src/components/ui/PlayerPortrait.tsx` | Compone capas: fondo → **camiseta (z-2)** → **cara (z-3)** → marco/viñeta/brillo. |
| `src/index.css` (`.pp-*`) | `.pp-shirt-layer` (z-2) detrás, `.pp-face-layer` (z-3) delante; ambas llenan la tarjeta con el mismo `viewBox`. |

### Camiseta de fútbol (`<FootballShirt>`)
SVG propio en el espacio 400×600 (mismo `viewBox` que la cara):
- **Cuello de piel** (`face.body.color`) tras la barbilla → conecta mentón ↔ camiseta.
- **Cuerpo + hombros + mangas cortas** con degradado (`primary`→oscurecido) y paneles de manga sombreados.
- **Cuello** según estilo: `crew` (redondo con ribete), `vneck` (pico con ribete), `polo` (cuello con
  puntas). Determinista por `collarForPlayer(id)`.
- **Ribete** y **puños** en color `secondary` del club.
- Si no se pasa `jerseyColor`, cae en `var(--club-primary, var(--green-primary))` (Chromium resuelve la
  `var()` en `fill`/`stop-color` → kit verde por defecto, no negro).

### Dorsal
Va **dentro** de `<FootballShirt>` (capa trasera), `<text>` centrado en `(200, ~592)` del espacio
400×600 → **sobre el pecho, bajo el cuello** (ya no pegado al cuello). Solo en `card`/`broadcast` con
`dorsal > 0`; en avatares redondos pequeños sobra. Como la cara está delante pero transparente ahí, el
dorsal se ve nítido sobre la camiseta.

## Color del kit (consistencia entre vistas)
El color sale **siempre** de `kitFromPlayer(...)` → `kitOf(badge, id, name)` (`components/match/kitColors.ts`):
primero los **emojis del badge** del club (🔵⚪ → azul/blanco), y si no hay, un hash determinista por
`id·name`. **Regla:** todos los sitios que pintan un retrato deben recibir un objeto de club con el
**mismo `badge`**, o el color cambiará entre vistas.

> Bug arreglado (21 jun 2026): la ficha pública (`GET /players/public/:id`) seleccionaba el club como
> `{ id, name, shortName }` **sin `badge`**, así que `kitFromPlayer` caía al hash (p. ej. verde) mientras
> la plantilla —que sí tiene el badge— lo pintaba con el color real (p. ej. azul). Al pasar del modal/
> plantilla a la ficha, la camiseta cambiaba de color. Fix: añadir `badge: true` al `select` del club en
> `server/.../players/players.service.ts` (getPublicPlayer), como ya hacen el resto de endpoints.

## Envejecimiento (`applyAge`, edad acotada 16–40)
`applyAge` es **el único dueño de `head.id`** (y de pelo, vello facial, líneas y `fatness`).
`caricatureBoost` ya **no** lo sobrescribe (solo exagera nariz/ojos/cejas/`fatness`).

| Edad | Cabeza | Pelo | Vello / líneas | Canas |
|---|---|---|---|---|
| ≤20 | `head12–16` (juvenil, redonda) | tupido juvenil | sin vello, sin arrugas | — |
| 21–26 | simétricas | deportivo variado | bigotillo ocasional | — |
| 27–32 | caricatura | corto/fade | barba de días, alguna línea | — |
| 33–36 | caricatura | corto/parted | más vello/arrugas | ~15% |
| 37–40 | caricatura | corto/calvo/parted | barba completa posible | ≥30%, sube con la edad |

Determinismo: una RNG `mulberry32` sembrada con el `id` (`seedOf`); `Math.random` se intercepta solo
durante `generate()` y **se restaura en `finally`** (no contamina nada).

## Variantes del componente
- `default` → **avatar redondo** (lista/topbar): cara+camiseta recortadas en círculo, sin dorsal ni marco.
- `card` → cromo pequeño/medio con marco dorado y dorsal.
- `broadcast` → cromo grande (hero de ficha, freeze-frame de gol) con marco y dorsal.

Props (sin cambios respecto a antes): `id, size, variant, age, dorsal, jerseyColor, jerseySecondary,
className`. Los 6 sitios de uso (`SquadPage`, `PlayerDossier`, `EntityLink`, `GoalFreezeFrame`,
`NpcCoachIdentity`) no necesitaron cambios.

## Verificación (estilo del proyecto: render + capturas)
Se verificó con un **arnés headless** (Playwright + `faceToSvgString` y, después, el componente React
real montado en una página Vite temporal) capturando matrices de retratos por edad/kit/id, y luego se
**retiró el arnés**. Gates: `tsc` 0 · `eslint` 0 (archivos tocados) · `vitest -c vitest.lib.config.ts`
45/45 (incluye el `matchAnimation` bloqueado) · `npm run build` OK · 0 errores de consola.

## Cómo retocar
- **Encuadre** (más/menos hombro, más aire arriba): `FACE_VIEWBOX` en `portraitNormalize.ts`.
- **Forma/cuellos/mangas/dorsal de la camiseta**: paths y `<text>` en `playerFootballShirt.tsx`
  (coords del espacio 400×600; el cuello de piel, los hombros, los ribetes y el número están ahí).
- **Mezcla de cuellos** (crew/vneck/polo): `COLLAR_STYLES` + `collarForPlayer` en `playerFacesJs.ts`.
- **Reglas de edad / variedad de rasgos**: las listas y `applyAge`/`caricatureBoost` en `playerFacesJs.ts`.
- **Marco/fondo/brillo**: clases `.pp-*` en `index.css` y `playerStickerFrame.tsx`.
