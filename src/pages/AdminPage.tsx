import React, { useEffect, useState } from 'react';
import {
  ShieldCheck, Users, Car, ClipboardList, Star, EyeOff, Eye,
  MessageSquare, Trash2, Pencil, CheckCircle2, Circle, X
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import {
  fetchAdminStats,
  subscribeToAdminActivity,
  fetchRecentReviewsForAdmin,
  moderateReview,
  fetchAllProfilesForAdmin,
  adminSetUserRole,
  fetchAllJourneysForAdmin,
  adminUpdateJourney,
  adminDeleteJourneyPermanently,
  purgeExpiredDeletedJourneys,
  fetchSupportMessagesForAdmin,
  resolveSupportMessage
} from '../services/apiService';
import { formatCurrency, formatDate, formatTime, getErrorMessage } from '../utils/formatters';
import type { AdminStats } from '../services/apiService';
import type { Review, Profile, Journey, UserRole, SupportMessage } from '../types';

const ROLE_LABEL: Record<UserRole, string> = {
  passenger: 'راكب',
  captain: 'قائد',
  parent: 'ولي أمر',
  student: 'طالب',
  admin: 'أدمن',
  super_admin: 'أدمن رئيسي'
};

const ROLE_OPTIONS: UserRole[] = ['passenger', 'captain', 'parent', 'student', 'admin', 'super_admin'];

type Tab = 'overview' | 'users' | 'journeys' | 'support' | 'reviews';

// Stats read from `profiles`, `journeys`, and `bookings`. Realtime via
// subscribeToAdminActivity() (apiService.ts) -- any insert/update/delete on
// those three tables triggers a full refetch, closing the "realtime for the
// admin dashboard itself" gap every prior session's CHANGELOG left open.
export const AdminPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('overview');

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsError, setReviewsError] = useState('');
  const [moderatingId, setModeratingId] = useState('');

  // --- Users tab ------------------------------------------------------
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState('');
  const [roleDraft, setRoleDraft] = useState<Record<string, UserRole>>({});
  const [savingRoleId, setSavingRoleId] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // --- Journeys (fleet) tab --------------------------------------------
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [journeysLoading, setJourneysLoading] = useState(false);
  const [journeysError, setJourneysError] = useState('');
  const [editingJourneyId, setEditingJourneyId] = useState('');
  const [journeyEditDraft, setJourneyEditDraft] = useState<{ price: number; seats: number; status: string }>({ price: 0, seats: 0, status: '' });
  const [journeyActionId, setJourneyActionId] = useState('');
  const [showDeletedOnly, setShowDeletedOnly] = useState(false);

  // --- Support messages tab --------------------------------------------
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [resolvingId, setResolvingId] = useState('');

  const load = () => {
    setIsLoading(true);
    setLoadError('');
    fetchAdminStats()
      .then(setStats)
      .catch((err) => setLoadError(getErrorMessage(err, 'تعذر تحميل بيانات لوحة الإدارة')))
      .finally(() => setIsLoading(false));
  };

  const loadReviews = () => {
    fetchRecentReviewsForAdmin()
      .then(setReviews)
      .catch((err) => setReviewsError(getErrorMessage(err, 'تعذر تحميل التقييمات')));
  };

  const loadProfiles = () => {
    setProfilesLoading(true);
    setProfilesError('');
    fetchAllProfilesForAdmin()
      .then(setProfiles)
      .catch((err) => setProfilesError(getErrorMessage(err, 'تعذر تحميل المستخدمين')))
      .finally(() => setProfilesLoading(false));
  };

  const loadJourneys = () => {
    setJourneysLoading(true);
    setJourneysError('');
    fetchAllJourneysForAdmin()
      .then(setJourneys)
      .catch((err) => setJourneysError(getErrorMessage(err, 'تعذر تحميل الرحلات')))
      .finally(() => setJourneysLoading(false));
  };

  const loadSupportMessages = () => {
    setSupportLoading(true);
    setSupportError('');
    fetchSupportMessagesForAdmin()
      .then(setSupportMessages)
      .catch((err) => setSupportError(getErrorMessage(err, 'تعذر تحميل رسائل الدعم')))
      .finally(() => setSupportLoading(false));
  };

  useEffect(load, []);
  useEffect(loadReviews, []);
  // Best-effort 15-day auto-purge fallback for projects without pg_cron
  // enabled (see 0005_admin_dashboard_fofi.sql) — runs once per dashboard
  // load, silently.
  useEffect(() => { purgeExpiredDeletedJourneys(); }, []);

  useEffect(() => {
    if (tab === 'users' && profiles.length === 0 && !profilesLoading) loadProfiles();
    if (tab === 'journeys' && journeys.length === 0 && !journeysLoading) loadJourneys();
    if (tab === 'support' && supportMessages.length === 0 && !supportLoading) loadSupportMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Realtime refresh: any change on profiles/journeys/bookings re-fetches
  // the stats silently (no loading spinner) so the numbers stay live while
  // the page is open.
  useEffect(() => {
    const unsubscribe = subscribeToAdminActivity(() => {
      fetchAdminStats().then(setStats).catch(() => {});
    });
    return unsubscribe;
  }, []);

  const handleModerate = async (reviewId: string, hidden: boolean) => {
    setModeratingId(reviewId);
    try {
      await moderateReview(reviewId, hidden);
      setReviews((prev) => prev.map((r) => (r.id === reviewId ? { ...r, is_hidden: hidden } : r)));
    } catch (err: unknown) {
      setReviewsError(getErrorMessage(err, 'تعذر تنفيذ العملية'));
    } finally {
      setModeratingId('');
    }
  };

  const handleSaveRole = async (userId: string) => {
    const role = roleDraft[userId];
    if (!role) return;
    setSavingRoleId(userId);
    setProfilesError('');
    try {
      await adminSetUserRole(userId, role);
      setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, role } : p)));
    } catch (err: unknown) {
      setProfilesError(getErrorMessage(err, 'تعذر تغيير الصلاحية'));
    } finally {
      setSavingRoleId('');
    }
  };

  const startEditJourney = (j: Journey) => {
    setEditingJourneyId(j.id);
    setJourneyEditDraft({ price: j.price_per_seat, seats: j.total_seats, status: j.status });
  };

  const handleSaveJourneyEdit = async (journeyId: string) => {
    setJourneyActionId(journeyId);
    setJourneysError('');
    try {
      const updated = await adminUpdateJourney(journeyId, {
        price_per_seat: journeyEditDraft.price,
        total_seats: journeyEditDraft.seats,
        status: journeyEditDraft.status as Journey['status']
      });
      setJourneys((prev) => prev.map((j) => (j.id === journeyId ? { ...j, ...updated } : j)));
      setEditingJourneyId('');
    } catch (err: unknown) {
      setJourneysError(getErrorMessage(err, 'تعذر حفظ التعديل'));
    } finally {
      setJourneyActionId('');
    }
  };

  const handleForceCancelJourney = async (journeyId: string) => {
    setJourneyActionId(journeyId);
    setJourneysError('');
    try {
      const updated = await adminUpdateJourney(journeyId, { status: 'cancelled' });
      setJourneys((prev) => prev.map((j) => (j.id === journeyId ? { ...j, ...updated } : j)));
    } catch (err: unknown) {
      setJourneysError(getErrorMessage(err, 'تعذر إلغاء الرحلة'));
    } finally {
      setJourneyActionId('');
    }
  };

  const handlePermanentDelete = async (journeyId: string) => {
    if (!window.confirm('حذف نهائي — لا يمكن التراجع عن هذا الإجراء. متأكد؟')) return;
    setJourneyActionId(journeyId);
    setJourneysError('');
    try {
      await adminDeleteJourneyPermanently(journeyId);
      setJourneys((prev) => prev.filter((j) => j.id !== journeyId));
    } catch (err: unknown) {
      setJourneysError(getErrorMessage(err, 'تعذر الحذف النهائي'));
    } finally {
      setJourneyActionId('');
    }
  };

  const handleResolveSupport = async (id: string, resolved: boolean) => {
    setResolvingId(id);
    try {
      await resolveSupportMessage(id, resolved);
      setSupportMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: resolved ? 'resolved' : 'open' } : m)));
    } catch (err: unknown) {
      setSupportError(getErrorMessage(err, 'تعذر تحديث حالة الرسالة'));
    } finally {
      setResolvingId('');
    }
  };

  const filteredProfiles = profiles.filter((p) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.trim().toLowerCase();
    return p.full_name?.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q) || p.phone_number?.includes(q);
  });

  const visibleJourneys = journeys.filter((j) => (showDeletedOnly ? !!j.deleted_at : true));
  const openSupportCount = supportMessages.filter((m) => m.status === 'open').length;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'نظرة عامة', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { id: 'users', label: 'المستخدمون', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'journeys', label: 'الرحلات', icon: <Car className="w-3.5 h-3.5" /> },
    { id: 'support', label: 'الدعم', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'reviews', label: 'التقييمات', icon: <Star className="w-3.5 h-3.5" /> }
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-lg font-black text-gray-950 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary-600" /> لوحة الإدارة والنظام
      </h2>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full text-[11px] font-bold border-2 transition-colors ${
              tab === t.id ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'
            }`}
          >
            {t.icon} {t.label}
            {t.id === 'support' && openSupportCount > 0 && (
              <span className="bg-red-500 text-white rounded-full text-[9px] font-black w-4 h-4 flex items-center justify-center">{openSupportCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {isLoading && (
            <div className="grid grid-cols-2 gap-3">
              <Skeleton height="h-20" />
              <Skeleton height="h-20" />
              <Skeleton height="h-20" />
              <Skeleton height="h-20" />
            </div>
          )}

          {!isLoading && loadError && (
            <Card className="border-red-200">
              <ErrorState title="حدث خطأ" description={loadError} action={{ label: 'إعادة المحاولة', onClick: load }} />
            </Card>
          )}

          {!isLoading && !loadError && stats && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4 space-y-1 border-primary-200">
                  <div className="flex items-center gap-1.5 text-primary-600">
                    <Users className="w-4 h-4" />
                    <span className="text-[11px] font-bold">المستخدمون</span>
                  </div>
                  <p className="text-xl font-black text-gray-950">{stats.totalUsers}</p>
                  <p className="text-[10px] text-gray-500 font-semibold">{stats.totalCaptains} قائد — {stats.totalPassengers} راكب</p>
                </Card>
                <Card className="p-4 space-y-1 border-primary-200">
                  <div className="flex items-center gap-1.5 text-primary-600">
                    <Car className="w-4 h-4" />
                    <span className="text-[11px] font-bold">الرحلات</span>
                  </div>
                  <p className="text-xl font-black text-gray-950">{stats.totalJourneys}</p>
                  <p className="text-[10px] text-gray-500 font-semibold">{stats.activeJourneys} نشطة حاليًا</p>
                </Card>
                <Card className="p-4 space-y-1 border-primary-200 col-span-2">
                  <div className="flex items-center gap-1.5 text-primary-600">
                    <ClipboardList className="w-4 h-4" />
                    <span className="text-[11px] font-bold">الحجوزات</span>
                  </div>
                  <p className="text-xl font-black text-gray-950">{stats.totalBookings}</p>
                  <p className="text-[10px] text-gray-500 font-semibold">{stats.pendingBookings} في انتظار قرار القائد</p>
                </Card>
              </div>

              <Card className="p-4 space-y-2 border-primary-200">
                <h3 className="text-xs font-black text-gray-950">أحدث المستخدمين المسجّلين</h3>
                {stats.recentUsers.length === 0 && (
                  <p className="text-[11px] text-gray-500 font-semibold">لا يوجد مستخدمون بعد</p>
                )}
                {stats.recentUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
                    <div>
                      <p className="text-xs font-bold text-gray-900">{u.full_name}</p>
                      <p className="text-[10px] text-gray-500">{u.city} — {ROLE_LABEL[u.role] || u.role}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 font-semibold">{formatDate(u.created_at)}</span>
                  </div>
                ))}
              </Card>
            </>
          )}
        </>
      )}

      {tab === 'users' && (
        <div className="space-y-3">
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="ابحث بالاسم أو المدينة أو رقم الهاتف"
            className="input text-xs"
          />
          {profilesError && (
            <Card className="border-red-200">
              <ErrorState title="حدث خطأ" description={profilesError} action={{ label: 'إعادة المحاولة', onClick: loadProfiles }} />
            </Card>
          )}
          {profilesLoading && (
            <div className="space-y-2">
              <Skeleton height="h-16" /><Skeleton height="h-16" />
            </div>
          )}
          {!profilesLoading && filteredProfiles.map((p) => (
            <Card key={p.id} className="p-3 space-y-2 border-primary-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-900">{p.full_name}</p>
                  <p className="text-[10px] text-gray-500">{p.city} — {p.governorate}</p>
                </div>
                <span className="text-[10px] font-black text-primary-700 bg-primary-50 border border-primary-200 rounded-full px-2 py-0.5">
                  {ROLE_LABEL[p.role] || p.role}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="input flex-1 text-[11px] py-1.5"
                  value={roleDraft[p.id] ?? p.role}
                  onChange={(e) => setRoleDraft((prev) => ({ ...prev, [p.id]: e.target.value as UserRole }))}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  isLoading={savingRoleId === p.id}
                  disabled={(roleDraft[p.id] ?? p.role) === p.role}
                  onClick={() => handleSaveRole(p.id)}
                >
                  حفظ
                </Button>
              </div>
            </Card>
          ))}
          {!profilesLoading && filteredProfiles.length === 0 && (
            <p className="text-center text-[11px] text-gray-400 font-semibold py-6">لا يوجد مستخدمون مطابقون</p>
          )}
        </div>
      )}

      {tab === 'journeys' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowDeletedOnly((v) => !v)}
            className={`w-full p-2.5 rounded-xl border-2 text-[11px] font-bold ${showDeletedOnly ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500'}`}
          >
            {showDeletedOnly ? 'عرض الكل بدل المحذوفة فقط' : 'عرض الرحلات المحذوفة من أصحابها فقط'}
          </button>
          {journeysError && (
            <Card className="border-red-200">
              <ErrorState title="حدث خطأ" description={journeysError} action={{ label: 'إعادة المحاولة', onClick: loadJourneys }} />
            </Card>
          )}
          {journeysLoading && (
            <div className="space-y-2"><Skeleton height="h-20" /><Skeleton height="h-20" /></div>
          )}
          {!journeysLoading && visibleJourneys.map((j) => {
            const isEditing = editingJourneyId === j.id;
            const isBusy = journeyActionId === j.id;
            return (
              <Card key={j.id} className={`p-3 space-y-2 border-primary-100 ${j.deleted_at ? 'bg-red-50/40 border-red-200' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-gray-800">{j.start_address} ➔ {j.end_address}</p>
                  {j.deleted_at && <span className="text-[9px] font-black text-red-600 bg-red-100 rounded-full px-2 py-0.5 flex-shrink-0">محذوفة (بانتظار حذف نهائي أو تنظيف تلقائي بعد 15 يوم)</span>}
                </div>
                <p className="text-[10px] text-gray-500 font-semibold">القائد: {j.captain?.full_name || '—'} — {formatDate(j.departure_time)} {formatTime(j.departure_time)}</p>

                {!isEditing ? (
                  <div className="flex justify-between text-xs font-bold pt-1 border-t border-gray-100">
                    <span>الحالة: {j.status}</span>
                    <span className="text-primary-700">{formatCurrency(j.price_per_seat)} — {j.available_seats}/{j.total_seats} مقعد</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-gray-100">
                    <input type="number" className="input text-[11px] py-1" value={journeyEditDraft.price}
                      onChange={(e) => setJourneyEditDraft((d) => ({ ...d, price: Number(e.target.value) }))} placeholder="السعر" />
                    <input type="number" className="input text-[11px] py-1" value={journeyEditDraft.seats}
                      onChange={(e) => setJourneyEditDraft((d) => ({ ...d, seats: Number(e.target.value) }))} placeholder="المقاعد" />
                    <select className="input text-[11px] py-1" value={journeyEditDraft.status}
                      onChange={(e) => setJourneyEditDraft((d) => ({ ...d, status: e.target.value }))}>
                      {['draft', 'published', 'active', 'receiving_bookings', 'full', 'in_progress', 'completed', 'cancelled'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-1.5 flex-wrap pt-1">
                  {!isEditing ? (
                    <Button size="sm" variant="outline" onClick={() => startEditJourney(j)}>
                      <Pencil className="w-3.5 h-3.5 ml-1" /> تعديل
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" isLoading={isBusy} onClick={() => handleSaveJourneyEdit(j.id)}>حفظ</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingJourneyId('')}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  {j.status !== 'cancelled' && (
                    <Button size="sm" variant="outline" isLoading={isBusy} onClick={() => handleForceCancelJourney(j.id)}>
                      إلغاء الرحلة
                    </Button>
                  )}
                  <Button size="sm" variant="danger" isLoading={isBusy} onClick={() => handlePermanentDelete(j.id)}>
                    <Trash2 className="w-3.5 h-3.5 ml-1" /> حذف نهائي
                  </Button>
                </div>
              </Card>
            );
          })}
          {!journeysLoading && visibleJourneys.length === 0 && (
            <p className="text-center text-[11px] text-gray-400 font-semibold py-6">لا توجد رحلات لعرضها</p>
          )}
        </div>
      )}

      {tab === 'support' && (
        <div className="space-y-3">
          {supportError && (
            <Card className="border-red-200">
              <ErrorState title="حدث خطأ" description={supportError} action={{ label: 'إعادة المحاولة', onClick: loadSupportMessages }} />
            </Card>
          )}
          {supportLoading && <div className="space-y-2"><Skeleton height="h-16" /><Skeleton height="h-16" /></div>}
          {!supportLoading && supportMessages.length === 0 && (
            <p className="text-center text-[11px] text-gray-400 font-semibold py-6">لا توجد رسائل دعم بعد</p>
          )}
          {!supportLoading && supportMessages.map((m) => (
            <Card key={m.id} className={`p-3 space-y-1.5 border-primary-100 ${m.status === 'resolved' ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-gray-800 flex-1">{m.message}</p>
                <button
                  type="button"
                  disabled={resolvingId === m.id}
                  onClick={() => handleResolveSupport(m.id, m.status !== 'resolved')}
                  className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-primary-700"
                >
                  {m.status === 'resolved' ? <CheckCircle2 className="w-4 h-4 text-primary-500" /> : <Circle className="w-4 h-4" />}
                </button>
              </div>
              {m.context && <p className="text-[10px] text-gray-400">سؤال لم يُجب عليه FOFi: {m.context}</p>}
              <p className="text-[10px] text-gray-400">{formatDate(m.created_at)} — {formatTime(m.created_at)}</p>
            </Card>
          ))}
        </div>
      )}

      {tab === 'reviews' && (
        <Card className="p-4 space-y-2 border-primary-200">
          <h3 className="text-xs font-black text-gray-950 flex items-center gap-1.5">
            <Star className="w-4 h-4 text-primary-600" /> أحدث التقييمات — إشراف
          </h3>
          {reviewsError && <p className="text-[11px] text-red-600 font-semibold">{reviewsError}</p>}
          {reviews.length === 0 && !reviewsError && (
            <p className="text-[11px] text-gray-500 font-semibold">لا توجد تقييمات بعد</p>
          )}
          <div className="space-y-2">
            {reviews.map((r) => (
              <div
                key={r.id}
                className={`flex items-start justify-between gap-2 border-t border-gray-100 pt-2 first:border-t-0 first:pt-0 ${r.is_hidden ? 'opacity-50' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-gray-900">{r.reviewer?.full_name || 'مستخدم'}</span>
                    <span className="flex items-center gap-0.5 text-[11px] font-black text-primary-700">
                      <Star className="w-3 h-3 fill-primary-500 text-primary-500" /> {r.rating}
                    </span>
                    {r.is_hidden && <span className="text-[10px] font-bold text-gray-400">(مخفي)</span>}
                  </div>
                  {r.comment && <p className="text-[11px] text-gray-600 mt-0.5 truncate">{r.comment}</p>}
                  <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(r.created_at)}</p>
                </div>
                <button
                  type="button"
                  disabled={moderatingId === r.id}
                  onClick={() => handleModerate(r.id, !r.is_hidden)}
                  className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-primary-700 disabled:opacity-40 py-1 px-2 rounded-lg border border-gray-200"
                >
                  {r.is_hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {r.is_hidden ? 'إظهار' : 'إخفاء'}
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
