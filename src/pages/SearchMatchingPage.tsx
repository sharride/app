import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Baby, Snowflake, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { LocationPicker, type LocationValue } from '../components/maps/LocationPicker';
import { findMatchingJourneysRPC, fetchMyChildren, saveMySearchRequest } from '../services/apiService';
import { formatCurrency, formatTime, getErrorMessage } from '../utils/formatters';
import type { MatchingResult, ProfileChild } from '../types';

const VEHICLE_TYPE_LABEL: Record<string, string> = {
  private: 'ملاكي',
  bus: 'باص',
  suzuki: 'سوزوكي مدرسي'
};

const RECENT_SEARCHES_KEY = 'sharride_recent_searches_v1';
const MAX_RECENT_SEARCHES = 5;

interface RecentSearch {
  start: LocationValue;
  end: LocationValue;
}

const loadRecentSearches = (): RecentSearch[] => {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveRecentSearch = (start: LocationValue, end: LocationValue) => {
  try {
    const existing = loadRecentSearches().filter(
      (s) => !(s.start.address === start.address && s.end.address === end.address)
    );
    const updated = [{ start, end }, ...existing].slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return loadRecentSearches();
  }
};

export const SearchMatchingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [startPoint, setStartPoint] = useState<LocationValue | null>(null);
  const [endPoint, setEndPoint] = useState<LocationValue | null>(null);
  const [results, setResults] = useState<MatchingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');

  // School-route search on behalf of a child — only available for logged-in
  // users with at least one child sub-profile. Suzuki (school microbus)
  // results only ever appear when this is on (enforced server-side too).
  const [children, setChildren] = useState<ProfileChild[]>([]);
  const [schoolMode, setSchoolMode] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState<string>('');

  // Recent searches — stored locally per device, purely a UX shortcut (not
  // synced anywhere), to save re-typing/re-pinning the same commute.
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  // Pickup radius tuning (location-picker engineering report, suggestion
  // #2) — was hard-coded to 5km server-side default; now user-adjustable so
  // sparser areas don't come back empty.
  const [radiusKm, setRadiusKm] = useState(5);

  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchMyChildren().then((list) => {
      setChildren(list);
      if (list.length > 0) setSelectedChildId(list[0].id);
    }).catch(() => { /* non-critical, search still works without it */ });
  }, [user]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    // Strict validation: startPoint/endPoint are only non-null once
    // LocationPicker has a confirmed lat/lng.
    if (!startPoint || !endPoint) {
      setSearchError('يرجى تحديد نقطة الانطلاق والوصول من الخريطة أو قائمة الاقتراحات');
      return;
    }

    setIsSearching(true);
    setSearchError('');
    try {
      const matches = await findMatchingJourneysRPC({
        startLng: startPoint.longitude,
        startLat: startPoint.latitude,
        endLng: endPoint.longitude,
        endLat: endPoint.latitude,
        departureTime: new Date().toISOString(),
        radiusKm,
        schoolMode: schoolMode && !!selectedChildId,
        childId: schoolMode ? selectedChildId : undefined
      });
      setResults(matches as MatchingResult[]);
      setRecentSearches(saveRecentSearch(startPoint, endPoint));
      // Best-effort: powers the 15-day "بحثك قرب يخلص" reminder. Never
      // blocks or fails the search itself if it errors (e.g. guest user).
      saveMySearchRequest({
        startLat: startPoint.latitude,
        startLng: startPoint.longitude,
        endLat: endPoint.latitude,
        endLng: endPoint.longitude,
        startAddress: startPoint.address,
        endAddress: endPoint.address,
        departureTime: new Date().toISOString(),
        radiusKm,
        schoolMode: schoolMode && !!selectedChildId,
        childId: schoolMode ? selectedChildId : null
      }).catch(() => { /* non-critical */ });
    } catch (err: unknown) {
      setSearchError(getErrorMessage(err, 'تعذر البحث حاليًا، يرجى المحاولة لاحقًا'));
      setResults([]);
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-lg font-black text-gray-950">ابحث عن رحلات متوافقة على طريقك</h2>

      {user && children.length > 0 && (
        <Card className="p-3 border-primary-200 space-y-2">
          <button
            type="button"
            onClick={() => setSchoolMode((v) => !v)}
            className={`w-full p-3 rounded-xl border-2 flex items-center gap-2 text-xs font-bold transition-colors ${schoolMode ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600'}`}
          >
            <Baby className="w-4 h-4" />
            بحث عن رحلة مدرسية لأحد أبنائي
          </button>
          {schoolMode && (
            <div className="w-full text-right">
              <label className="block text-xs font-bold text-gray-900 mb-1">اختر الابن/الابنة</label>
              <select className="input" value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </Card>
      )}

      <Card className="p-4 space-y-4 border-primary-200">
        {recentSearches.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-gray-500">عمليات بحث سابقة</p>
            <div className="flex flex-wrap gap-1.5">
              {recentSearches.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { setStartPoint(s.start); setEndPoint(s.end); }}
                  className="px-2.5 py-1 rounded-full border border-primary-200 bg-primary-50 text-primary-700 text-[11px] font-bold hover:bg-primary-100"
                >
                  {s.start.address.split('،')[0]} ➔ {s.end.address.split('،')[0]}
                </button>
              ))}
            </div>
          </div>
        )}
        <form onSubmit={handleSearch} className="space-y-4">
          <LocationPicker label="نقطة الانطلاق (من)" value={startPoint} onChange={setStartPoint} mapDefaultVisible={false} />
          <LocationPicker
            label="وجهة الوصول (إلى)"
            value={endPoint}
            onChange={setEndPoint}
            defaultCenter={startPoint ? [startPoint.latitude, startPoint.longitude] : undefined}
            mapDefaultVisible={false}
          />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="radius-range" className="text-[11px] font-bold text-gray-500">نطاق البحث حول نقطتيك</label>
              <span className="text-[11px] font-black text-primary-700">{radiusKm} كم</span>
            </div>
            <input
              id="radius-range"
              type="range"
              min={1}
              max={20}
              step={1}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-full accent-primary-500"
            />
          </div>
          <Button type="submit" fullWidth isLoading={isSearching} className="btn-primary">
            <Search className="w-4 h-4 ml-1.5" /> ابحث عن رحلة مطابقة
          </Button>
        </form>
      </Card>

      {isSearching && (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!isSearching && searchError && (
        <Card className="border-red-200">
          <ErrorState title="حدث خطأ أثناء البحث" description={searchError} />
        </Card>
      )}

      {!isSearching && !searchError && hasSearched && results.length === 0 && (
        <Card className="text-center py-8 border-dashed border-primary-200 bg-primary-50/30">
          <EmptyState
            icon={<Search className="w-10 h-10 text-primary-500 mx-auto" />}
            title="مش لقينا رحلة مناسبة دلوقتي 👀"
            description="جرّب توسّع نطاق البحث أو غيّر الميعاد شوية"
          />
        </Card>
      )}

      {!isSearching && results.length > 0 && (
        <div className="space-y-3">
          {results.map((item) => (
            <Card
              key={item.journey_id}
              hoverable
              onClick={() => navigate(`/journeys/${item.journey_id}`)}
              className="p-4 space-y-2 border-primary-100"
            >
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <span className="font-black text-xs text-gray-950">{item.captain_name}</span>
                <span className="text-xs font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full border border-primary-200">
                  تطابق {Math.round(item.compatibility_score)}%
                </span>
              </div>
              <p className="text-xs font-semibold text-gray-700">{item.start_address} ➔ {item.end_address}</p>
              <div className="flex items-center gap-2 text-[11px] font-bold text-gray-500">
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {VEHICLE_TYPE_LABEL[item.vehicle_type] || item.vehicle_type}</span>
                <span className="flex items-center gap-1"><Snowflake className="w-3.5 h-3.5" /> {item.vehicle_make} {item.vehicle_model}</span>
              </div>
              <div className="flex justify-between text-xs pt-2 border-t border-gray-100">
                <span className="font-extrabold text-primary-700">{formatCurrency(item.price_per_seat)}</span>
                <span className="text-gray-500 font-semibold">{formatTime(item.departure_time)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
