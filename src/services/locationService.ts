export interface GeocodedAddress {
  latitude: number;
  longitude: number;
  address: string;
}

// ---------------------------------------------------------------------------
// In-memory caching for Nominatim calls (location-picker engineering
// report, suggestion #4: "Reverse Geocoding مُخزّن مؤقتًا"). Cuts down on
// repeat calls for the same search text or the same map point (common
// intersections/areas people click again while adjusting a pin), without
// adding any backend. Cleared on page reload — this is a UX/rate-limit
// nicety, not a source of truth.
// ---------------------------------------------------------------------------
const GEOCODE_CACHE_LIMIT = 50;
const geocodeCache = new Map<string, GeocodedAddress[]>();
const reverseGeocodeCache = new Map<string, string>();

const rememberInCache = <V,>(cache: Map<string, V>, key: string, value: V) => {
  if (cache.size >= GEOCODE_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
};

// Rounding to ~11m precision (5 decimal places) so a marker dragged by a
// pixel or two still hits the cache for "the same" point.
const reverseGeocodeKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

export const geocodeAddress = async (query: string): Promise<GeocodedAddress[]> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const cacheKey = trimmed.toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=5`
  );

  if (!response.ok) {
    throw new Error('فشل البحث عن الموقع');
  }

  const data = await response.json();

  const results: GeocodedAddress[] = data.map((item: any) => ({
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    address: item.display_name,
  }));

  rememberInCache(geocodeCache, cacheKey, results);
  return results;
};

export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  const cacheKey = reverseGeocodeKey(lat, lng);
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
  );
  if (!response.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const data = await response.json();
  const address = data?.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  rememberInCache(reverseGeocodeCache, cacheKey, address);
  return address;
};
