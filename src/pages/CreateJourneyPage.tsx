import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapPin, Calendar, CheckCircle2, AlertTriangle, Car, Route as RouteIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { createJourneyRPC, fetchMyVehicles, calculatePriceRPC } from '../services/apiService';
import { getDrivingRoute } from '../services/osrmService';
import { LeafletMap } from '../components/maps/LeafletMap';
import { LocationPicker, type LocationValue } from '../components/maps/LocationPicker';
import { ErrorState } from '../components/ui/ErrorState';
import { getErrorMessage } from '../utils/formatters';
import type { Vehicle, JourneyType } from '../types';

export const CreateJourneyPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [startPoint, setStartPoint] = useState<LocationValue | null>(null);
  const [endPoint, setEndPoint] = useState<LocationValue | null>(null);
  const [departureDate, setDepartureDate] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [totalSeats, setTotalSeats] = useState(3);
  const [pricePerSeat, setPricePerSeat] = useState(25);
  const [priceWasSuggested, setPriceWasSuggested] = useState(false);
  const [journeyType, setJourneyType] = useState<JourneyType>('daily');

  // Real driving route (OSRM) between the two confirmed points — drives
  // both the map preview polyline and the price suggestion below.
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMin, setRouteDurationMin] = useState<number | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([]);
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState('');

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string>('');
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);
  const [vehiclesLoadError, setVehiclesLoadError] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Route preview confirmation (location-picker engineering report,
  // suggestion #3): a final "هل أنت متأكد؟" step showing route/time/price
  // together before the journey actually publishes, instead of publishing
  // straight off the form.
  const [isConfirmingPublish, setIsConfirmingPublish] = useState(false);

  useEffect(() => {
    if (!user) { setIsLoadingVehicles(false); return; }
    setIsLoadingVehicles(true);
    fetchMyVehicles()
      .then((list) => {
        setVehicles(list);
        if (list.length > 0) setVehicleId(list[0].id);
      })
      .catch((err) => setVehiclesLoadError(getErrorMessage(err, 'تعذر تحميل مركباتك')))
      .finally(() => setIsLoadingVehicles(false));
  }, [user]);

  // Whenever both points are confirmed (real coordinates, not just typed
  // text — LocationPicker only calls onChange with a confirmed pick), fetch
  // the real driving route from OSRM and get a price suggestion from the
  // server-side pricing engine (calculate_journey_price_rpc).
  useEffect(() => {
    if (!startPoint || !endPoint) {
      setRouteDistanceKm(null);
      setRouteDurationMin(null);
      setRouteGeometry([]);
      return;
    }

    let cancelled = false;
    setIsRouting(true);
    setRouteError('');

    (async () => {
      try {
        const route = await getDrivingRoute(
          { lat: startPoint.latitude, lng: startPoint.longitude },
          { lat: endPoint.latitude, lng: endPoint.longitude }
        );
        if (cancelled) return;
        if (!route) {
          setRouteError('تعذر حساب المسار، يمكنك المتابعة وتحديد السعر يدويًا');
          return;
        }
        setRouteDistanceKm(route.distanceMeters / 1000);
        setRouteDurationMin(route.durationSeconds / 60);
        setRouteGeometry(route.geometry);

        try {
          const suggested = await calculatePriceRPC(route.distanceMeters, journeyType);
          if (!cancelled) {
            setPricePerSeat(suggested);
            setPriceWasSuggested(true);
          }
        } catch {
          // Price suggestion is a convenience, not a requirement — the
          // captain can still set a price manually if this fails.
        }
      } catch {
        if (!cancelled) setRouteError('تعذر حساب المسار، يمكنك المتابعة وتحديد السعر يدويًا');
      } finally {
        if (!cancelled) setIsRouting(false);
      }
    })();

    return () => { cancelled = true; };
    // journeyType intentionally omitted: changing the trip type shouldn't
    // re-fetch the route, only re-price it (handled by the effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPoint, endPoint]);

  // Re-suggest the price when the journey type changes (weekly/monthly get
  // a discount in calculate_journey_price_rpc) without re-fetching the route.
  useEffect(() => {
    if (routeDistanceKm === null || !priceWasSuggested) return;
    calculatePriceRPC(routeDistanceKm * 1000, journeyType)
      .then(setPricePerSeat)
      .catch(() => { /* keep last known suggestion on failure */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyType]);

  const handleReviewStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { navigate('/login'); return; }
    if (!vehicleId) {
      setErrorMsg('محتاجين تختار عربية الأول، أو تضيف عربية جديدة 🚗');
      return;
    }
    // Strict validation: startPoint/endPoint are only ever non-null when
    // LocationPicker has a confirmed lat/lng — a manually-typed, unconfirmed
    // address can never reach this point.
    if (!startPoint || !endPoint) {
      setErrorMsg('حدد مكان الانطلاق والوصول الأول من الاقتراحات أو الخريطة 👀');
      return;
    }
    setErrorMsg('');
    setIsConfirmingPublish(true);
  };

  const handlePublish = async () => {
    if (!startPoint || !endPoint) return;
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const departureDateTime = new Date(`${departureDate}T${departureTime}`).toISOString();
      await createJourneyRPC({
        vehicleId,
        startLng: startPoint.longitude,
        startLat: startPoint.latitude,
        endLng: endPoint.longitude,
        endLat: endPoint.latitude,
        startAddress: startPoint.address,
        endAddress: endPoint.address,
        departureTime: departureDateTime,
        journeyType,
        totalSeats,
        pricePerSeat
      });
      addToast('تم نشر الرحلة بنجاح');
      navigate('/my-journeys');
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, 'حصلت مشكلة ونحن بننشر رحلتك، جرّب تاني كمان شوية'));
      setIsConfirmingPublish(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-lg font-black text-gray-950">أنشئ رحلة جديدة</h2>

      {!isLoadingVehicles && !vehiclesLoadError && vehicles.length === 0 && (
        <Card className="bg-amber-50 border-amber-200 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs font-bold text-amber-800 space-y-2">
            <p>لا يمكن نشر رحلة بدون مركبة مسجّلة باسمك.</p>
            <Link to="/vehicles" className="underline text-amber-900">أضف مركبتك الأولى</Link>
          </div>
        </Card>
      )}

      {vehiclesLoadError && (
        <Card className="bg-red-50 border-red-200 p-3">
          <ErrorState title="تعذر تحميل مركباتك" description={vehiclesLoadError} />
        </Card>
      )}

      {errorMsg && (
        <Card className="bg-red-50 text-red-700 text-xs p-3 font-bold">
          <ErrorState title="حدث خطأ أثناء إنشاء الرحلة" description={errorMsg} />
        </Card>
      )}

      <form onSubmit={handleReviewStep} className="space-y-4">
        <Card className="space-y-4 p-4 border-primary-200">
          <h3 className="text-xs font-black text-gray-950 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary-600" /> 1. المسار</h3>
          <LocationPicker
            label="منين طالع؟"
            value={startPoint}
            onChange={(v) => { setStartPoint(v); setIsConfirmingPublish(false); }}
          />
          <LocationPicker
            label="رايح فين؟"
            value={endPoint}
            onChange={(v) => { setEndPoint(v); setIsConfirmingPublish(false); }}
            defaultCenter={startPoint ? [startPoint.latitude, startPoint.longitude] : undefined}
          />

          {isRouting && (
            <p className="text-[11px] font-bold text-primary-600 flex items-center gap-1.5">
              <RouteIcon className="w-3.5 h-3.5 animate-pulse" /> جاري حساب المسار...
            </p>
          )}
          {routeError && <p className="text-[11px] font-bold text-amber-700">{routeError}</p>}
          {routeDistanceKm !== null && routeDurationMin !== null && (
            <div className="rounded-xl bg-primary-50 border border-primary-200 p-3 flex items-center justify-between text-xs font-bold text-primary-800">
              <span>مسافة القيادة: {routeDistanceKm.toFixed(1)} كم</span>
              <span>الوقت المتوقع: {Math.round(routeDurationMin)} دقيقة</span>
            </div>
          )}
        </Card>

        {vehicles.length > 0 && (
          <Card className="space-y-3 p-4 border-primary-200">
            <h3 className="text-xs font-black text-gray-950 flex items-center gap-1.5"><Car className="w-4 h-4 text-primary-600" /> المركبة</h3>
            <div className="w-full text-right">
              <label className="block text-xs font-bold text-gray-900 mb-1">اختر المركبة</label>
              <select className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.make} {v.model}{v.plate_number ? ` — ${v.plate_number}` : ''}</option>
                ))}
              </select>
            </div>
          </Card>
        )}

        <Card className="space-y-3 p-4 border-primary-200">
          <h3 className="text-xs font-black text-gray-950 flex items-center gap-1.5"><Calendar className="w-4 h-4 text-primary-600" /> 2. الموعد والتكلفة</h3>
          <div className="w-full text-right">
            <label className="block text-xs font-bold text-gray-900 mb-1">نوع الرحلة</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'daily', label: 'يومية' },
                { value: 'weekly', label: 'اشتراك أسبوعي' },
                { value: 'monthly', label: 'اشتراك شهري' }
              ] as { value: JourneyType; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setJourneyType(opt.value)}
                  className={`rounded-xl border-2 py-2 text-[11px] font-bold transition-colors ${
                    journeyType === opt.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {journeyType !== 'daily' && (
              <p className="mt-2 text-[11px] font-semibold text-primary-700 bg-primary-50/60 rounded-lg p-2">
                رحلات الاشتراك تبدأ بفترة تجربة 3 أيام بسعر الرحلة اليومية، ثم يختار الراكب المتابعة أو الإيقاف.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" label="التاريخ" value={departureDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDepartureDate(e.target.value)} />
            <Input type="time" label="الوقت" value={departureTime} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDepartureTime(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" label="المقاعد" value={totalSeats} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTotalSeats(parseInt(e.target.value))} />
            <Input
              type="number"
              label={priceWasSuggested ? 'سعر المقعد (ج) — مقترح تلقائيًا' : 'سعر المقعد (ج)'}
              value={pricePerSeat}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setPriceWasSuggested(false);
                setPricePerSeat(parseFloat(e.target.value));
              }}
            />
          </div>
        </Card>

        {(startPoint || endPoint) && (
          <Card className="space-y-3 p-4 border-primary-200">
            <h3 className="text-xs font-black text-gray-950">معاينة الخريطة</h3>
            <LeafletMap
              center={
                startPoint
                  ? [startPoint.latitude, startPoint.longitude]
                  : endPoint
                  ? [endPoint.latitude, endPoint.longitude]
                  : [30.0444, 31.2357]
              }
              zoom={11}
              startPoint={startPoint ? { lat: startPoint.latitude, lng: startPoint.longitude, label: 'نقطة الانطلاق' } : undefined}
              endPoint={endPoint ? { lat: endPoint.latitude, lng: endPoint.longitude, label: 'وجهة الوصول' } : undefined}
              polylinePositions={
                routeGeometry.length > 0
                  ? routeGeometry
                  : startPoint && endPoint
                  ? [[startPoint.latitude, startPoint.longitude], [endPoint.latitude, endPoint.longitude]]
                  : []
              }
              height="260px"
            />
          </Card>
        )}

        {!isConfirmingPublish && (
          <Button type="submit" fullWidth size="lg" disabled={isLoadingVehicles || vehicles.length === 0}>
            <CheckCircle2 className="w-5 h-5 ml-1.5" /> متابعة ومراجعة الرحلة
          </Button>
        )}
      </form>

      {isConfirmingPublish && startPoint && endPoint && (
        <Card className="space-y-3 p-4 border-primary-300 bg-primary-50/40">
          <h3 className="text-xs font-black text-gray-950 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-primary-600" /> راجع رحلتك قبل النشر
          </h3>
          <div className="space-y-1.5 text-xs font-semibold text-gray-700">
            <p>{startPoint.address} ➔ {endPoint.address}</p>
            {routeDistanceKm !== null && routeDurationMin !== null && (
              <p className="text-gray-500">مسافة القيادة: {routeDistanceKm.toFixed(1)} كم — الوقت المتوقع: {Math.round(routeDurationMin)} دقيقة</p>
            )}
            <p>{departureDate && departureTime ? `${departureDate} — ${departureTime}` : 'لم يتم تحديد الموعد بعد'}</p>
            <p className="font-black text-primary-700">سعر المقعد: {pricePerSeat} ج — عدد المقاعد: {totalSeats}</p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" fullWidth onClick={() => setIsConfirmingPublish(false)} disabled={isSubmitting}>
              تعديل
            </Button>
            <Button fullWidth isLoading={isSubmitting} onClick={handlePublish}>
              تأكيد النشر
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
