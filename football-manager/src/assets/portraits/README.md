# Librería de retratos (pixel-art)

Las imágenes de esta carpeta se auto-descubren (Vite glob) y se asignan a los jugadores
de forma **determinista** (mismo `id` → misma familia) y **por edad**. Sistema:
`src/lib/portraitLibrary.ts`. Render: `src/components/ui/PlayerPortrait.tsx`.

## Convención de nombre

```
<familia>__<banda>.<ext>
```

- **familia**: identidad de cara (cualquier slug en minúsculas/números). Una familia = un
  jugador-tipo con hasta 3 variantes de edad.
- **banda**: `young` (≤22) · `prime` (23–31) · `vet` (≥32). Si falta una banda, se usa la
  más cercana disponible.
- **ext**: `png` · `webp` · `jpg` · `svg`. Para pixel-art usa **PNG** con transparencia.

### Ejemplos
```
golazo__young.png      golazo__prime.png      golazo__vet.png       (una cara, 3 edades)
cantera1__young.png    cantera1__prime.png    cantera1__vet.png
delantero7__prime.png                                               (solo prime; vale)
```

Cuantas más **familias** metas, menos se repiten las caras entre los miles de jugadores.

## Formato del arte: BUSTO TRANSPARENTE (modo elegido)

El código pinta la **camiseta (kit + rayas + dorsal) y el marco**; la imagen aporta solo la
**cara**. Por eso el arte debe ser:

- **Cabeza + cuello** (hasta justo bajo el cuello), **fondo TRANSPARENTE**, sin camiseta ni
  hombros (para que asome el kit del código), sin texto ni dorsal.
- Lienzo **5:7** (p. ej. 500×700) o cuadrado; el recorte es `object-fit: cover` centrado-arriba
  → deja la cara en el tercio superior-centro y el cuello abajo.
- PNG con alpha. Pixel-art: se mantiene nítido (`image-rendering: pixelated`).
- Una **familia** = misma cara en `young`/`prime`/`vet` (mismo estilo/semilla, distinta edad).

Así una sola familia vale para **cualquier club** (el kit lo pone el código) y con pocas familias
se cubre a TODOS los jugadores (se reparten de forma determinista por `id`).

### Prompt para tu modelo de imagen
```
Pixel-art portrait of a male football player, HEAD AND NECK ONLY, front-facing,
{piel} skin, {pelo} hair, {EDAD: youthful 18 / athletic prime 25 / weathered veteran 33 grey+stubble},
detailed 32-bit pixel art, crisp clean pixels, soft cel shading, confident neutral expression,
TRANSPARENT background, NO shirt, NO shoulders, NO text, centered, 512x512
```

## Cómo añadir las tuyas
1. Copia tus PNG aquí con la convención `<familia>__<young|prime|vet>.png`.
2. Reinicia el dev server (`npm run dev`) para que el glob las recoja.
3. Cuando haya al menos una familia, los jugadores dejan de mostrar la silueta neutra.
