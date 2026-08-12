import React, { useState } from 'react';
import { Car, UserRound } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import type { PendingRole } from '../../utils/onboarding';

export const RoleSelectStep: React.FC<{ onContinue: (role: PendingRole) => void }> = ({ onContinue }) => {
  const [role, setRole] = useState<PendingRole>('passenger');

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--brand)] text-white font-black text-2xl flex items-center justify-center mx-auto shadow-md">
            S
          </div>
          <h1 className="mt-4 text-lg font-black text-gray-950">هتستخدم sharride إزاي؟</h1>
          <p className="mt-1 text-xs text-gray-500 font-semibold">اختار دورك الأول عشان نجهّزلك التجربة المناسبة</p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-right">
          <button
            type="button"
            onClick={() => setRole('passenger')}
            aria-pressed={role === 'passenger'}
            className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-colors ${role === 'passenger' ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}
          >
            <UserRound className="w-6 h-6 text-primary-600" />
            <span className="text-xs font-black text-gray-950">راكب</span>
            <span className="text-[10px] text-gray-500 font-semibold text-center">أبحث عن رحلة وأحجز</span>
          </button>
          <button
            type="button"
            onClick={() => setRole('captain')}
            aria-pressed={role === 'captain'}
            className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-colors ${role === 'captain' ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}
          >
            <Car className="w-6 h-6 text-primary-600" />
            <span className="text-xs font-black text-gray-950">كابتن</span>
            <span className="text-[10px] text-gray-500 font-semibold text-center">أنشئ رحلات وأستقبل ركّاب</span>
          </button>
        </div>

        <Button fullWidth onClick={() => onContinue(role)} className="btn-primary btn-md">
          متابعة
        </Button>

        <p className="text-center text-[10px] text-gray-400 font-semibold">
          تقدر تبدّل دورك في أي وقت لاحقًا من خلال تسجيل الخروج واختيار الدور التاني
        </p>
      </Card>
    </div>
  );
};
