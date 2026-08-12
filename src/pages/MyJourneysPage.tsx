import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, MapPin, Star, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { ReviewModal } from '../components/ReviewModal';
import {
  fetchMyBookings,
  fetchMyCaptainJourneys,
  fetchReviewableTrips,
  fetchMySubscriptions,
  continueSubscription,
  stopSubscription,
  completeJourney,
  cancelOwnJourney,
  extendJourneyDiscoverability,
  type ReviewableTrip
} from '../services/apiService';
import { formatCurrency, formatDate, formatTime, getErrorMessage } from '../utils/formatters';
import type { Booking, Journey, Subscription } from '../types';

export const MyJourneysPage: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isCaptain = profile?.role === 'captain';

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Trips (completed bookings) awaiting a review from the current user —
  // see FS-12. Loaded separately since it needs bookings even on the
  // captain side, which the journeys list above doesn't carry.
  const [pendingReviews, setPendingReviews] = useState<ReviewableTrip[]>([]);
  const [reviewTarget, setReviewTarget] = useState<ReviewableTrip | null>(null);

  // Weekly/monthly subscriptions (passenger side only — see "07. Pricing &
  // Subscription Engine"). State tracking only, no pricing math — see the
  // comment in apiService.ts above these functions.
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subscriptionActionError, setSubscriptionActionError] = useState('');
  const [subscriptionActionMessage, setSubscriptionActionMessage] = useState('');
  const [subscriptionActionBusyId, setSubscriptionActionBusyId] = useState('');

  // Captain "إنهاء الرحلة" action -- calls complete_journey_rpc, which marks
  // the journey + its accepted bookings completed and drops the
  // "قيّم رحلتك" reminder notification for every passenger and the captain
  // (see apiService.ts / 0002_rpc_and_policies.sql).
  const [completingId, setCompletingId] = useState('');
  const [completeError, setCompleteError] = useState('');

  // "حذف الرحلة" — soft delete: it disappears here and from search, stays
  // visible to admins, who can permanently delete it (or it auto-purges
  // after 15 days). See 0005_admin_dashboard_fofi.sql.
  const [deletingId, setDeletingId] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // "استمرار" — from the "رحلتك قربت تخرج من البحث" notification action
  // (or manually here): resets the 15-day search-discoverability window.
  // See 0007_retention.sql.
  const [extendingId, setExtendingId] = useState('');
  const [extendError, setExtendError] = useState('');

  const loadPendingReviews = () => {
    fetchReviewableTrips(isCaptain)
      .then((trips) => setPendingReviews(trips.filter((t) => !t.alreadyReviewed)))
      .catch(() => setPendingReviews([]));
  };

  const loadSubscriptions = () => {
    if (isCaptain) return;
    fetchMySubscriptions()
      .then(setSubscriptions)
      .catch(() => setSubscriptions([]));
  };

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    setLoadError('');
    const request = isCaptain ? fetchMyCaptainJourneys() : fetchMyBookings();
    request
      .then((data) => (isCaptain ? setJourneys(data as Journey[]) : setBookings(data as Booking[])))
      .catch((err) => setLoadError(err.message || 'تعذر تحميل البيانات'))
      .finally(() => setIsLoading(false));
    loadPendingReviews();
    loadSubscriptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isCaptain]);

  const handleContinueSubscription = async (subscriptionId: string) => {
    setSubscriptionActionBusyId(subscriptionId);
    setSubscriptionActionError('');
    try {
      await continueSubscription(subscriptionId);
      loadSubscriptions();
    } catch (err: unknown) {
      setSubscriptionActionError(getErrorMessage(err, 'تعذر تحديث الاشتراك، حاول مرة أخرى'));
    } finally {
      setSubscriptionActionBusyId('');
    }
  };

  const handleStopSubscription = async (subscriptionId: string) => {
    setSubscriptionActionBusyId(subscriptionId);
    setSubscriptionActionError('');
    setSubscriptionActionMessage('');
    try {
      const refund = await stopSubscription(subscriptionId);
      if (refund > 0) setSubscriptionActionMessage(`تم الإيقاف — مبلغ مستحق الاسترداد: ${formatCurrency(refund)}`);
      loadSubscriptions();
    } catch (err: unknown) {
      setSubscriptionActionError(getErrorMessage(err, 'تعذر تحديث الاشتراك، حاول مرة أخرى'));
    } finally {
      setSubscriptionActionBusyId('');
    }
  };

  const handleCompleteJourney = async (journeyId: string) => {
    setCompletingId(journeyId);
    setCompleteError('');
    try {
      await completeJourney(journeyId);
      setJourneys((prev) => prev.map((j) => (j.id === journeyId ? { ...j, status: 'completed' } : j)));
      loadPendingReviews();
    } catch (err: unknown) {
      setCompleteError(getErrorMessage(err, 'تعذر إنهاء الرحلة، حاول مرة أخرى'));
    } finally {
      setCompletingId('');
    }
  };

  const handleDeleteJourney = async (journeyId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الرحلة؟ ستختفي من رحلاتك ومن نتائج البحث.')) return;
    setDeletingId(journeyId);
    setDeleteError('');
    try {
      await cancelOwnJourney(journeyId);
      setJourneys((prev) => prev.filter((j) => j.id !== journeyId));
    } catch (err: unknown) {
      setDeleteError(getErrorMessage(err, 'تعذر حذف الرحلة، حاول مرة أخرى'));
    } finally {
      setDeletingId('');
    }
  };

  const handleExtendJourney = async (journeyId: string) => {
    setExtendingId(journeyId);
    setExtendError('');
    try {
      const updated = await extendJourneyDiscoverability(journeyId);
      setJourneys((prev) => prev.map((j) => (j.id === journeyId ? { ...j, discoverable_until: updated.discoverable_until, expiry_notified_at: null } : j)));
    } catch (err: unknown) {
      setExtendError(getErrorMessage(err, 'تعذر تمديد ظهور الرحلة، حاول مرة أخرى'));
    } finally {
      setExtendingId('');
    }
  };

  if (!user) {
    return (
      <Card className="text-center py-10 space-y-3 border-primary-200">
        <EmptyState
          icon={<Car className="w-10 h-10 text-primary-500 mx-auto" />}
          title="سجّل الدخول للاطلاع على رحلاتك"
          action={{ label: 'تسجيل الدخول', onClick: () => navigate('/login') }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-lg font-black text-gray-950">{isCaptain ? 'رحلاتي كقائد رحلة' : 'سجل رحلاتي وحجوزاتي'}</h2>

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

      {!isLoading && !loadError && isCaptain && journeys.length === 0 && (
        <Card className="text-center py-10 space-y-2 bg-primary-50/30 border-dashed border-primary-200">
          <EmptyState
            icon={<Car className="w-10 h-10 text-primary-500 mx-auto" />}
            title="لسه معملتش رحلة"
            description="أنشئ أول رحلة ليك، وابدأ تستقبل الركّاب 🚀"
            action={{ label: 'أنشئ رحلة جديدة', onClick: () => navigate('/create-journey') }}
          />
        </Card>
      )}

      {!isLoading && !loadError && isCaptain && journeys.length > 0 && (
        <div className="space-y-3">
          {journeys.map((j) => (
            <Card key={j.id} hoverable onClick={() => navigate(`/journeys/${j.id}`)} className="p-4 space-y-2 border-primary-100">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs font-bold text-gray-800">{j.start_address} ➔ {j.end_address}</p>
                </div>
                {j.journey_type !== 'daily' && (
                  <span className="text-[10px] font-black text-primary-700 bg-primary-100 rounded-full px-2 py-0.5 flex-shrink-0">
                    {j.journey_type === 'weekly' ? 'أسبوعي' : 'شهري'}
                  </span>
                )}
              </div>
              <div className="flex justify-between text-[11px] text-gray-500 font-semibold">
                <span>{formatDate(j.departure_time)} — {formatTime(j.departure_time)}</span>
                <span>{j.available_seats}/{j.total_seats} متاح</span>
              </div>
              <div className="flex justify-between text-xs font-bold pt-1 border-t border-gray-100">
                <span>الحالة: {j.status}</span>
                <span className="text-primary-700">{formatCurrency(j.price_per_seat)}</span>
              </div>
              <div className="flex gap-2">
                {(j.status === 'in_progress' || j.status === 'full' || j.status === 'active') && (
                  <Button
                    size="sm"
                    fullWidth
                    variant="outline"
                    isLoading={completingId === j.id}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleCompleteJourney(j.id);
                    }}
                  >
                    إنهاء الرحلة
                  </Button>
                )}
                {j.status !== 'completed' && j.status !== 'cancelled' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-primary-700 hover:bg-primary-50 shrink-0"
                    isLoading={extendingId === j.id}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleExtendJourney(j.id);
                    }}
                    aria-label="تمديد ظهور الرحلة في البحث"
                    title="استمرار ظهورها في البحث 15 يوم إضافية"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50 shrink-0"
                  isLoading={deletingId === j.id}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    handleDeleteJourney(j.id);
                  }}
                  aria-label="حذف الرحلة"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
          {completeError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
              {completeError}
            </div>
          )}
          {deleteError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
              {deleteError}
            </div>
          )}
          {extendError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
              {extendError}
            </div>
          )}
        </div>
      )}

      {!isLoading && !loadError && !isCaptain && bookings.length === 0 && (
        <Card className="text-center py-10 space-y-2 bg-primary-50/30 border-dashed border-primary-200">
          <EmptyState
            icon={<Car className="w-10 h-10 text-primary-500 mx-auto" />}
            title="لسه معندكش رحلات مسجلة"
            description="ابحث عن رحلة تناسبك وهتلاقيها هنا بعد الحجز"
            action={{ label: 'ابحث عن رحلة الآن', onClick: () => navigate('/search') }}
          />
        </Card>
      )}

      {!isLoading && !loadError && !isCaptain && bookings.length > 0 && (
        <div className="space-y-3">
          {bookings.map((b) => (
            <Card
              key={b.id}
              hoverable={!!b.journey_id}
              onClick={() => b.journey_id && navigate(`/journeys/${b.journey_id}`)}
              className="p-4 space-y-2 border-primary-100"
            >
              {b.journey && (
                <p className="text-xs font-semibold text-gray-700">{b.journey.start_address} ➔ {b.journey.end_address}</p>
              )}
              <div className="flex justify-between text-xs font-bold">
                <span>حالة الطلب: {b.status}</span>
                <span className="text-primary-700">{formatCurrency(b.final_price)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && isCaptain && (
        <Button variant="outline" fullWidth onClick={() => navigate('/booking-requests')}>
          طلبات الحجز الواردة
        </Button>
      )}

      {!isCaptain && subscriptions.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-black text-gray-950 flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4 text-primary-600" /> اشتراكاتي
          </h3>
          {subscriptionActionError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
              {subscriptionActionError}
            </div>
          )}
          {subscriptionActionMessage && (
            <div className="rounded-xl bg-primary-50 border border-primary-200 p-3 text-xs text-primary-700" role="status">
              {subscriptionActionMessage}
            </div>
          )}
          <div className="space-y-2">
            {subscriptions.map((sub) => {
              const trialEnded = new Date(sub.trial_ends_at).getTime() <= Date.now();
              const isBusy = subscriptionActionBusyId === sub.id;
              return (
                <Card key={sub.id} className="p-3 space-y-2 border-primary-100">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-800">
                      {sub.booking?.journey ? `${sub.booking.journey.start_address} ➔ ${sub.booking.journey.end_address}` : (sub.plan === 'weekly' ? 'اشتراك أسبوعي' : 'اشتراك شهري')}
                    </p>
                    <span className="text-[10px] font-black text-primary-700 bg-primary-100 rounded-full px-2 py-1 flex-shrink-0">
                      {sub.status === 'trial' ? 'فترة تجربة' : sub.status === 'active' ? 'نشط' : sub.status === 'completed' ? 'مكتمل' : 'ملغي'}
                    </span>
                  </div>
                  {sub.status === 'trial' && !trialEnded && (
                    <p className="text-[11px] text-gray-500 font-semibold">
                      تنتهي فترة التجربة {formatDate(sub.trial_ends_at)} — {formatTime(sub.trial_ends_at)}
                    </p>
                  )}
                  {sub.status === 'trial' && trialEnded && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-primary-700 font-bold">انتهت فترة التجربة — هل تريد المتابعة؟</p>
                      <div className="flex gap-2">
                        <Button size="sm" fullWidth isLoading={isBusy} onClick={() => handleContinueSubscription(sub.id)}>
                          متابعة الاشتراك
                        </Button>
                        <Button size="sm" fullWidth variant="outline" disabled={isBusy} onClick={() => handleStopSubscription(sub.id)}>
                          إيقاف الاشتراك
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {pendingReviews.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-black text-gray-950 flex items-center gap-1.5">
            <Star className="w-4 h-4 text-primary-600" /> رحلات بانتظار تقييمك
          </h3>
          <div className="space-y-2">
            {pendingReviews.map((trip) => (
              <Card key={trip.booking.id} className="p-3 flex items-center justify-between border-primary-100">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {trip.otherParty.avatar_url ? (
                      <img src={trip.otherParty.avatar_url} alt={trip.otherParty.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-black text-primary-700">{trip.otherParty.full_name.charAt(0)}</span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-gray-800 truncate">{trip.otherParty.full_name}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setReviewTarget(trip)}>
                  قيّم الرحلة
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {reviewTarget && (
        <ReviewModal
          isOpen={!!reviewTarget}
          onClose={() => setReviewTarget(null)}
          bookingId={reviewTarget.booking.id}
          otherParty={reviewTarget.otherParty}
          onSubmitted={() => {
            setPendingReviews((prev) => prev.filter((t) => t.booking.id !== reviewTarget.booking.id));
          }}
        />
      )}
    </div>
  );
};
