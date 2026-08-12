import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin, Loader2, Star, Plus, X } from 'lucide-react';
import { geocodeAddress, reverseGeocode, type GeocodedAddress } from '../../services/locationService';
import { useAuth } from '../../contexts/AuthContext';
import { fetchFavoritePlaces, addFavoritePlace, deleteFavoritePlace } from '../../services/apiService';
import type { FavoritePlace } from '../../types';

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export interface LocationValue {
  address: string;
  latitude: number;
  longitude: number;
}

interface LocationPickerProps {
  label: string;
  value: LocationValue | null;
  // Fires only with a fully-confirmed point (real lat/lng) — never with a
  // bare typed string. This is the strict-validation contract the caller
  // relies on: no onChange call means no coordinates yet, so a form built
  // on top of this can safely require `value !== null` before submit.
  onChange: (value: LocationValue | null) => void;
  defaultCenter?: [number, number];
  // Search Map UX (Phase 2, item A): when false, the map starts hidden
  // behind a "حدد مكانك على الخريطة" action instead of always showing —
  // defaults to true so CreateJourneyPage (and anything else already using
  // this component) keeps its existing always-visible map unchanged; only
  // SearchMatchingPage opts into the collapsed behavior.
  mapDefaultVisible?: boolean;
}

const ClickHandler: React.FC<{ onPick: (lat: number, lng: number) => void }> = ({ onPick }) => {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
};

// Cairo — reasonable fallback center when nothing else is known yet.
const FALLBACK_CENTER: [number, number] = [30.0444, 31.2357];

export const LocationPicker: React.FC<LocationPickerProps> = ({ label, value, onChange, defaultCenter, mapDefaultVisible = true }) => {
  const { user } = useAuth();
  const [query, setQuery] = useState(value?.address || '');
  const [suggestions, setSuggestions] = useState<GeocodedAddress[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState('');
  const [isMapVisible, setIsMapVisible] = useState(mapDefaultVisible);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a stale, older search response overwriting a newer one.
  const requestIdRef = useRef(0);

  // Favorite places (location-picker report, suggestion #1: "الأماكن
  // المفضلة") — saved shortcuts like "البيت"/"الشغل" tied to the account,
  // shown as quick chips above the suggestions list.
  const [favorites, setFavorites] = useState<FavoritePlace[]>([]);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [favoriteLabelDraft, setFavoriteLabelDraft] = useState('');

  useEffect(() => {
    if (!user) { setFavorites([]); return; }
    fetchFavoritePlaces().then(setFavorites).catch(() => { /* non-critical */ });
  }, [user]);

  useEffect(() => {
    setQuery(value?.address || '');
  }, [value?.address]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    setError('');
    // Typing invalidates any previously-confirmed point — the caller must
    // not treat this as a valid location until a suggestion/map pick/geo
    // location re-confirms it.
    if (value) onChange(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const thisRequestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await geocodeAddress(text);
        if (requestIdRef.current === thisRequestId) {
          setSuggestions(results);
          setShowSuggestions(true);
        }
      } catch {
        if (requestIdRef.current === thisRequestId) setError('تعذر البحث عن العنوان');
      } finally {
        if (requestIdRef.current === thisRequestId) setIsSearching(false);
      }
    }, 300);
  };

  const confirmPoint = (point: LocationValue) => {
    setQuery(point.address);
    setSuggestions([]);
    setShowSuggestions(false);
    setError('');
    onChange(point);
  };

  const handleSelectSuggestion = (s: GeocodedAddress) => {
    confirmPoint({ address: s.address, latitude: s.latitude, longitude: s.longitude });
  };

  const handleSelectFavorite = (f: FavoritePlace) => {
    confirmPoint({ address: f.address, latitude: f.latitude, longitude: f.longitude });
  };

  const handleSaveFavorite = async () => {
    if (!value || !favoriteLabelDraft.trim()) return;
    setIsSavingFavorite(true);
    try {
      const saved = await addFavoritePlace({
        label: favoriteLabelDraft.trim(),
        address: value.address,
        latitude: value.latitude,
        longitude: value.longitude
      });
      setFavorites((prev) => [saved, ...prev]);
      setFavoriteLabelDraft('');
    } catch {
      setError('تعذر حفظ المكان المفضّل، حاول مرة أخرى');
    } finally {
      setIsSavingFavorite(false);
    }
  };

  const handleDeleteFavorite = async (id: string) => {
    setFavorites((prev) => prev.filter((f) => f.id !== id));
    try {
      await deleteFavoritePlace(id);
    } catch {
      fetchFavoritePlaces().then(setFavorites).catch(() => {});
    }
  };

  const handleMapPick = async (lat: number, lng: number) => {
    setIsSearching(true);
    try {
      const address = await reverseGeocode(lat, lng);
      confirmPoint({ address, latitude: lat, longitude: lng });
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    setIsLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const address = await reverseGeocode(latitude, longitude);
          confirmPoint({ address, latitude, longitude });
        } finally {
          setIsLocating(false);
        }
      },
      () => {
        setError('تعذر الحصول على إذن الموقع');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const mapCenter: [number, number] = value
    ? [value.latitude, value.longitude]
    : defaultCenter || FALLBACK_CENTER;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-gray-900">{label}</label>

      {user && favorites.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {favorites.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 pr-1 pl-2.5 py-1">
              <button
                type="button"
                onClick={() => handleSelectFavorite(f)}
                className="flex items-center gap-1 text-[11px] font-bold text-primary-700"
              >
                <Star className="w-3 h-3 fill-primary-500 text-primary-500" /> {f.label}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteFavorite(f.id)}
                aria-label={`حذف ${f.label} من المفضلة`}
                className="text-primary-400 hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              className="input pl-9"
              placeholder="اكتب اسم المنطقة أو المكان"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            />
            {isSearching && (
              <Loader2 className="w-4 h-4 text-gray-400 animate-spin absolute left-3 top-1/2 -translate-y-1/2" />
            )}
          </div>
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="shrink-0 px-3 rounded-xl border-2 border-gray-200 text-primary-600 flex items-center justify-center hover:bg-primary-50"
            aria-label="استخدام موقعي الحالي"
            title="استخدام موقعي الحالي"
          >
            {isLocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
          </button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-[1000] mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden max-h-56 overflow-y-auto">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSuggestion(s)}
                className="w-full text-right px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-primary-50 flex items-start gap-2 border-b border-gray-50 last:border-0"
              >
                <MapPin className="w-3.5 h-3.5 text-primary-500 mt-0.5 shrink-0" />
                <span>{s.address}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {user && value && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={favoriteLabelDraft}
            onChange={(e) => setFavoriteLabelDraft(e.target.value)}
            placeholder="احفظ كمفضّلة (مثال: البيت)"
            className="input flex-1 text-[11px] py-1.5"
          />
          <button
            type="button"
            onClick={handleSaveFavorite}
            disabled={isSavingFavorite || !favoriteLabelDraft.trim()}
            className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-primary-600 border-2 border-gray-200 rounded-xl px-2.5 py-1.5 hover:bg-primary-50 disabled:opacity-40"
          >
            {isSavingFavorite ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            حفظ
          </button>
        </div>
      )}

      {error && <p className="text-[11px] text-red-600 font-bold">{error}</p>}
      {!value && !error && (
        <p className="text-[11px] text-gray-400 font-semibold">
          اختر اقتراحًا من القائمة، أو دبّس مكانك على الخريطة، أو استخدم موقعك الحالي.
        </p>
      )}

      {!isMapVisible && (
        <button
          type="button"
          onClick={() => setIsMapVisible(true)}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-primary-600 border-2 border-dashed border-primary-200 rounded-2xl py-2.5 hover:bg-primary-50"
        >
          <MapPin className="w-4 h-4" /> حدد مكانك على الخريطة
        </button>
      )}

      {isMapVisible && (
        <div className="space-y-1.5">
          <div style={{ height: '200px' }} className="w-full rounded-2xl overflow-hidden border border-primary-200 relative z-0">
            <MapContainer center={mapCenter} zoom={value ? 14 : 11} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ClickHandler onPick={handleMapPick} />
              {value && (
                <Marker
                  position={[value.latitude, value.longitude]}
                  icon={markerIcon}
                  draggable
                  eventHandlers={{
                    dragend: async (e) => {
                      const marker = e.target as L.Marker;
                      const { lat, lng } = marker.getLatLng();
                      await handleMapPick(lat, lng);
                    }
                  }}
                />
              )}
            </MapContainer>
          </div>
          {!mapDefaultVisible && (
            <button
              type="button"
              onClick={() => setIsMapVisible(false)}
              className="w-full text-center text-[11px] font-bold text-gray-400 hover:text-gray-600"
            >
              إخفاء الخريطة
            </button>
          )}
        </div>
      )}
    </div>
  );
};
