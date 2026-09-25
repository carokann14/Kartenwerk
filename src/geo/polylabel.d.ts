declare module 'polylabel' {
  /** Punkt im Inneren eines Polygons mit größtem Abstand zum Rand (Mapbox polylabel 1.x) */
  export default function polylabel(polygon: number[][][], precision?: number, debug?: boolean): number[] & { distance: number };
}
