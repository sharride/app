import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyNotifications, markNotificationRead, subscribeToNotifications } from '../services/apiService';
import { getErrorMessage } from '../utils/formatters';
import type { AppNotification } from '../types';

// SCHEMA ASSUMPTION: this page assumes a `notifications` table exists in
// Supabase with the shape in `types/index.ts -> AppNotification`. That table
// was not found anywhere in the original codebase (no prior query against
// it) -- if it doesn't exist yet, the fetch below will fail with a Postgres
// "relation does not exist" error, shown via the error state below instead
// of silently falling back to the old always-empty screen.
export const NotificationsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = () => {
    setIsLoading(true);
    setLoadError('');
    fetchMyNotifications()
      .then(setNotifications)
      .catch((err) => setLoadError(getErrorMessage(err, 'تعذر تحميل الإشعارات')))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, [user]);

  // Realtime: new notifications appear instantly instead of only on reload.
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToNotifications(user.id, (notification) => {
      setNotifications((prev) => [notification, ...prev]);
    });
    return unsubscribe;
  }, [user]);

  const handleOpen = async (n: AppNotification) => {
    if (!n.is_read) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      markNotificationRead(n.id).catch(() => {
        // Best-effort: revert on failure so unread state stays accurate.
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: false } : x)));
      });
    }
    if (n.link) navigate(n.link);
  };

  if (!user) {
    return (
      <Card className="text-center py-10 space-y-3 border-primary-200">
        <EmptyState
          icon={<Bell className="w-10 h-10 text-primary-500 mx-auto" />}
          title="سجّل الدخول لعرض إشعاراتك"
          action={{ label: 'تسجيل الدخول', onClick: () => navigate('/login') }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-lg font-black text-gray-950">مركز الإشعارات والتنبيهات</h2>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton height="h-16" />
          <Skeleton height="h-16" />
        </div>
      )}

      {!isLoading && loadError && (
        <Card className="border-red-200">
          <ErrorState title="حدث خطأ" description={loadError} action={{ label: 'إعادة المحاولة', onClick: load }} />
        </Card>
      )}

      {!isLoading && !loadError && notifications.length === 0 && (
        <Card className="text-center py-10 space-y-2 bg-primary-50/30 border-dashed border-primary-200">
          <EmptyState
            icon={<Bell className="w-10 h-10 text-primary-500 mx-auto" />}
            title="مفيش إشعارات جديدة"
            description="أي تحديث أو حجز جديد هيوصلك هنا أول بأول"
          />
        </Card>
      )}

      {!isLoading && !loadError && notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              hoverable={!!n.link}
              onClick={() => handleOpen(n)}
              className={`p-3 flex items-start gap-2 border-primary-100 ${n.link ? 'cursor-pointer' : ''} ${!n.is_read ? 'bg-primary-50/50' : ''}`}
            >
              {!n.is_read && <span className="w-2 h-2 mt-1.5 rounded-full bg-primary-500 flex-shrink-0" aria-hidden />}
              <div className="flex-1">
                <p className="text-xs font-black text-gray-950">{n.title}</p>
                {n.body && <p className="text-[11px] text-gray-600 font-semibold mt-0.5">{n.body}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
