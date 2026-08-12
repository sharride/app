// Public OSRM demo server (router.project-osrm.org) — driving-profile route
// between two points. Used to get real driving distance (not straight-line)
// for both the map preview and the price suggestion.
export interface RouteInfo {
  distanceMeters: number;
  durationSeconds: number;
  // [lat, lng][] — ready to hand straight to react-leaflet's <Polyline>.
  geometry: [number, number][];
}

export const getDrivingRoute = async (
  start: { lat: number; lng: number },
  end: { lat: number; lng: number }
): Promise<RouteInfo | null> => {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  const route = data?.routes?.[0];
  if (!route) return null;

  const coordinates: [number, number][] = (route.geometry?.coordinates || []).map(
    ([lng, lat]: [number, number]) => [lat, lng]
  );

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: coordinates
  };
};
