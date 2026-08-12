import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, PlusCircle, Car, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SkeletonCard } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { fetchActiveJourneys } from '../services/apiService';
import { formatCurrency, formatTime } from '../utils/formatters';

interface Journey {
  id: string;
  price_per_seat: number;
  start_address: string;
  end_address: string;
  departure_time: string;
  available_seats: number;
  captain?: {
    full_name?: string;
  };
}

export const HomePage: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchActiveJourneys()
      .then((data) => setJourneys(data as Journey[]))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Hero */}
      <section className="rounded-3xl bg-gradient-to-br from-primary-400 via-primary-500 to-brand-500 p-5 shadow-lg text-white">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-white" />
          <span className="text-xs font-black">المنصة الأمثل للمشاركة في التنقل</span>
        </div>

        <h2 className="text-2xl font-black leading-tight">
          {profile ? `أهلاً، ${profile.full_name?.split(' ')[0] || ''} 👋` : 'مرحباً بك في شيررايد 👋'}
        </h2>

        <p className="mt-3 text-sm font-medium leading-6">انضم لمجتمعنا ووفّر في تكلفة التنقل، وسافر براحة وأمان.</p>

        {!user && (
          <Button variant="secondary" size="sm" className="mt-4 bg-white text-primary-600" onClick={() => navigate('/login')}>
            سجّل الدخول / أنشئ حساباً
          </Button>
        )}
      </section>

      {/* Quick Actions */}
      <section className="grid grid-cols-2 gap-3">
        <Card hoverable onClick={() => navigate('/search')} className="bg-primary-50 border-primary-200 p-4">
          <div className="w-10 h-10 rounded-2xl bg-primary-500 text-white flex items-center justify-center mb-3">
            <Search className="w-5 h-5 stroke-[2.5]" />
          </div>

          <h3 className="text-sm font-black text-gray-950">ابحث عن رحلة</h3>
          <p className="mt-1 text-[11px] text-gray-600 font-semibold leading-5">اعثر على كابتن يسلك نفس طريقك</p>
        </Card>

        <Card hoverable onClick={() => navigate('/create-journey')} className="bg-primary-50 border-primary-200 p-4">
          <div className="w-10 h-10 rounded-2xl bg-gray-950 text-primary-400 flex items-center justify-center mb-3">
            <PlusCircle className="w-5 h-5 stroke-[2.5]" />
          </div>

          <h3 className="text-sm font-black text-gray-950">أنشئ رحلة</h3>
          <p className="mt-1 text-[11px] text-gray-600 font-semibold leading-5">اعرض مقاعدك الفارغة وقلل تكلفة الوقود</p>
        </Card>
      </section>

      {/* Available Journeys */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-gray-950 flex items-center gap-2">
            <Car className="w-4 h-4 text-primary-500" />
            رحلات مريحة متاحة الآن
          </h3>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : journeys.length === 0 ? (
          <Card className="text-center py-8 space-y-3 border-primary-200 bg-primary-50/30">
            <EmptyState
              icon={<Car className="w-10 h-10 text-primary-500 mx-auto" />}
              title="لسه مفيش رحلات هنا"
              description="ابحث عن رحلة تناسبك، أو ابدأ رحلتك إنت وشارك معانا 🚗"
              action={{ label: 'أنشئ رحلة جديدة', onClick: () => navigate('/create-journey') }}
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {journeys.map((journey) => (
              <Card key={journey.id} hoverable onClick={() => navigate(`/journeys/${journey.id}`)} className="space-y-2 border-primary-100 p-3">
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <span className="text-xs font-black text-gray-950">{journey.captain?.full_name || 'كابتن'}</span>
                  <span className="text-xs font-bold text-primary-700">{formatCurrency(journey.price_per_seat)} / مقعد</span>
                </div>

                <p className="text-xs font-semibold text-gray-800">{journey.start_address} ➔ {journey.end_address}</p>

                <div className="flex justify-between text-[11px] text-gray-500 pt-1">
                  <span>الوقت: {formatTime(journey.departure_time)}</span>
                  <span>متبقي {journey.available_seats} مقاعد</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};