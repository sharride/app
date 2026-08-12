import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Check, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { fetchBookingRequestsForCaptain, updateBookingStatus } from '../services/apiService';
import { formatCurrency, formatDate, formatTime, getErrorMessage } from '../utils/formatters';
import type { Booking } from '../types';

export const BookingRequestsPage: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [requests, setRequests] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const load = () => {
    setIsLoading(true);
    setLoadError('');
    fetchBookingRequestsForCaptain()
      .then(setRequests)
      .catch((err) => setLoadError(err.message || 'تعذر تحميل طلبات الحجز'))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  const handleDecision = async (bookingId: string, status: 'accepted' | 'rejected') => {
    if (decidingId) return; // prevent double submission
    setDecidingId(bookingId);
    try {
      const updated = await updateBookingStatus(bookingId, status);
      setRequests((prev) => prev.map((r) => (r.id === bookingId ? updated : r)));
      addToast(status === 'accepted' ? 'تم قبول طلب الحجز' : 'تم رفض طلب الحجز');
    } catch (err: unknown) {
      addToast(getErrorMessage(err, 'تعذر تنفيذ العملية، حاول مرة أخرى'));
    } finally {
      setDecidingId(null);
    }
  };

  if (profile && profile.role !== 'captain') {
    return (
      <Card className="border-primary-200">
        <ErrorState title="هذه الصفحة مخصصة لقادة الرحلات فقط" />
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="text-center py-10 space-y-3 border-primary-200">
        <EmptyState
          icon={<ClipboardList className="w-10 h-10 text-primary-500 mx-auto" />}
          title="سجّل الدخول للاطلاع على طلبات الحجز"
          action={{ label: 'تسجيل الدخول', onClick: () => navigate('/login') }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-lg font-black text-gray-950 flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-primary-600" /> طلبات الحجز الواردة
      </h2>

      {isLoading && (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!isLoading && loadError && (
        <Card className="border-red-200">
          <ErrorState title="حدث خطأ" description={loadError} />
        </Card>
      )}

      {!isLoading && !loadError && requests.length === 0 && (
        <Card className="text-center py-10 space-y-2 bg-primary-50/30 border-dashed border-primary-200">
          <EmptyState
            icon={<ClipboardList className="w-10 h-10 text-primary-500 mx-auto" />}
            title="لسه مفيش طلبات حجز"
            description="أول ما راكب يطلب مكان في رحلتك، هيظهر هنا فورًا"
          />
        </Card>
      )}

      {!isLoading && !loadError && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="p-4 space-y-2 border-primary-100">
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <span className="text-xs font-black text-gray-950">{r.passenger?.full_name || 'راكب'}</span>
                <span className="text-[11px] font-bold text-gray-500">{r.status}</span>
              </div>
              {r.journey && (
                <p className="text-xs font-semibold text-gray-700">{r.journey.start_address} ➔ {r.journey.end_address}</p>
              )}
              <div className="flex justify-between text-[11px] text-gray-500 font-semibold">
                {r.journey && <span>{formatDate(r.journey.departure_time)} — {formatTime(r.journey.departure_time)}</span>}
                <span>{r.seats_booked} مقعد</span>
              </div>
              <p className="text-xs font-black text-primary-700">{formatCurrency(r.final_price)}</p>

              {r.status === 'pending' && (
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    fullWidth
                    isLoading={decidingId === r.id}
                    onClick={() => handleDecision(r.id, 'accepted')}
                  >
                    <Check className="w-4 h-4 ml-1" /> قبول
                  </Button>
                  <Button
                    size="sm"
                    fullWidth
                    variant="danger"
                    isLoading={decidingId === r.id}
                    onClick={() => handleDecision(r.id, 'rejected')}
                  >
                    <X className="w-4 h-4 ml-1" /> رفض
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
