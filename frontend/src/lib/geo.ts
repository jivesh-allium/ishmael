/**
 * Equirectangular projection: lat/lon → pixel coordinates on a map canvas.
 */

// Map canvas dimensions
export const MAP_WIDTH = 2000;
export const MAP_HEIGHT = 1000;

// Lat/lon bounds for equirectangular projection
const LON_MIN = -180;
const LON_MAX = 180;
const LAT_MIN = -85;
const LAT_MAX = 85;

export function lonToX(lon: number): number {
  return ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * MAP_WIDTH;
}

export function latToY(lat: number): number {
  // Invert Y because pixel Y grows downward
  return ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * MAP_HEIGHT;
}

export function xToLon(x: number): number {
  return (x / MAP_WIDTH) * (LON_MAX - LON_MIN) + LON_MIN;
}

export function yToLat(y: number): number {
  return LAT_MAX - (y / MAP_HEIGHT) * (LAT_MAX - LAT_MIN);
}

export function geoToPixel(lat: number, lon: number): { x: number; y: number } {
  return { x: lonToX(lon), y: latToY(lat) };
}
