/** Recorte cabeza-y-hombros en el lienzo facesjs (400×600): pelo → mentón → cuello
 *  → hombros de la camiseta. Incluye boca (y≈440) y mentón (y≈500), que el recorte
 *  anterior (`82 72 236 318`, terminaba en y≈390) cortaba a la altura del labio.
 *  La camiseta propia (`<FootballShirt>`) usa este MISMO viewBox → alineación exacta. */
export const FACE_VIEWBOX = '52 84 296 532';

/** Post-procesado del SVG facesjs tras renderizar la cara: SOLO reencuadramos
 *  (la cara es cabeza+rasgos; la camiseta de fútbol se dibuja en su propia capa). */
export function normalizePortraitSvg(svg: SVGSVGElement) {
  svg.setAttribute('viewBox', FACE_VIEWBOX);
  svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
}
