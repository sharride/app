import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin, Calendar, Users, Wallet, CheckCircle2, User as UserIcon, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { SkeletonCard } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { fetchJourneyById, createBookingRequest } from '../services/apiService';
import { formatCurrency, formatDate, formatTime, getErrorMessage } from '../utils/formatters';
import type { Journey } from '../types';

const BOOKABLE_STATUSES = ['published', 'active', 'receiving_bookings'];

export const JourneyDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [journey, setJourney] = useState<Journey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [seats, setSeats] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);

  const load = () => {
    if (!id) return;
    setIsLoading(true);
    setLoadError('');
    fetchJourneyById(id)
      .then(setJourney)
      .catch((err) => setLoadError(err.message || 'تعذر تحميل بيانات الرحلة'))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, [id]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (loadError || !journey) {
    return (
      <Card className="border-primary-200">
        <ErrorState
          title="تعذر إيجاد هذه الرحلة"
          description={loadError || 'الرحلة غير موجودة أو تم حذفها'}
          action={{ label: 'العودة للبحث', onClick: () => navigate('/search') }}
        />
      </Card>
    );
  }

  const isOwnJourney = !!user && journey.captain_id === user.id;
  const isBookable = BOOKABLE_STATUSES.includes(journey.status) && journey.available_seats > 0;
  const canShowBookCta = !isOwnJourney;

  const openBookingModal = () => {
    if (!user) {
      navigate('/login');
      return;
    }
    setBookingError('');
    setBookingSuccess(false);
    setSeats(1);
    setIsModalOpen(true);
  };

  const handleConfirmBooking = async () => {
    if (!journey || isSubmitting) return;
    if (seats < 1 || seats > journey.available_seats) {
      setBookingError('عدد المقاعد المطلوب غير متاح');
      return;
    }
    setIsSubmitting(true);
    setBookingError('');
    try {
      await createBookingRequest({
        journeyId: journey.id,
        seatsBooked: seats,
        priceOffered: journey.price_per_seat * seats,
        journeyType: journey.journey_type,
        captainId: journey.captain_id
      });
      setBookingSuccess(true);
      addToast('تم إرسال طلب الحجز، بانتظار موافقة الكابتن');
    } catch (err: unknown) {
      setBookingError(getErrorMessage(err, 'تعذر إرسال طلب الحجز، حاول مرة أخرى'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-4 space-y-3 border-primary-200">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden">
            {journey.captain?.avatar_url ? (
              <img src={journey.captain.avatar_url} alt={journey.captain.full_name} className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-5 h-5 text-primary-600" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-gray-950">{journey.captain?.full_name || 'الكابتن'}</p>
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-gray-500 font-semibold">{journey.captain?.city}</p>
              {!!journey.captain && journey.captain.trust_score > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] font-bold text-primary-700">
                  <Star className="w-3 h-3 fill-primary-500 text-primary-500" /> {journey.captain.trust_score.toFixed(1)}
                </span>
              )}
            </div>
          </div>
          {journey.journey_type !== 'daily' && (
            <span className="text-[10px] font-black text-primary-700 bg-primary-100 rounded-full px-2 py-1 flex-shrink-0">
              {journey.journey_type === 'weekly' ? 'اشتراك أسبوعي' : 'اشتراك شهري'}
            </span>
          )}
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-2">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm font-bold text-gray-800">{journey.start_address} ➔ {journey.end_address}</p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <p className="text-xs font-semibold text-gray-600">{formatDate(journey.departure_time)} — {formatTime(journey.departure_time)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <p className="text-xs font-semibold text-gray-600">{journey.available_seats} من {journey.total_seats} مقاعد متاحة</p>
          </div>
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <p className="text-xs font-black text-primary-700">{formatCurrency(journey.price_per_seat)} / للمقعد</p>
          </div>
        </div>
      </Card>

      {isOwnJourney && (
        <Card className="p-3 text-center text-xs font-bold text-gray-600 border-dashed border-primary-200">
          هذه رحلتك الخاصة، تابعها من صفحة رحلاتي
        </Card>
      )}

      {!isOwnJourney && !isBookable && (
        <Card className="p-3 text-center text-xs font-bold text-gray-500 border-dashed border-gray-200">
          هذه الرحلة غير متاحة للحجز حاليًا
        </Card>
      )}

      {canShowBookCta && (
        <Button fullWidth size="lg" disabled={!isBookable} onClick={openBookingModal}>
          احجز الآن
        </Button>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="تأكيد الحجز">
        {bookingSuccess ? (
          <div className="text-center space-y-3 py-4">
            <CheckCircle2 className="w-10 h-10 text-primary-600 mx-auto" />
            <p className="text-sm font-black text-gray-950">تم إرسال طلب الحجز بنجاح</p>
            <p className="text-xs text-gray-600">حالة الطلب: بانتظار موافقة الكابتن</p>
            <Button fullWidth onClick={() => { setIsModalOpen(false); navigate('/my-journeys'); }}>
              الذهاب إلى رحلاتي
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {bookingError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
                {bookingError}
              </div>
            )}
            <Input
              type="number"
              label="عدد المقاعد"
              min={1}
              max={journey.available_seats}
              value={seats}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSeats(Math.max(1, Math.min(journey.available_seats, parseInt(e.target.value) || 1)))}
            />
            {journey.journey_type !== 'daily' && (
              <p className="text-[11px] font-semibold text-primary-700 bg-primary-50 rounded-lg p-2">
                هذا حجز اشتراك {journey.journey_type === 'weekly' ? 'أسبوعي' : 'شهري'}: يبدأ بفترة تجربة 3 أيام بسعر الرحلة اليومية، وبعدها تختار المتابعة أو الإيقاف من صفحة رحلاتي.
              </p>
            )}
            <p className="text-xs font-bold text-gray-600">
              الإجمالي: {formatCurrency(journey.price_per_seat * seats)}
            </p>
            <Button fullWidth isLoading={isSubmitting} onClick={handleConfirmBooking}>
              تأكيد الحجز
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
};
