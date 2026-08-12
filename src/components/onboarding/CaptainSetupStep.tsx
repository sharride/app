import React, { useState } from 'react';
import { Car, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { updateProfile, createVehicle, activateCaptain } from '../../services/apiService';
import { isValidNationalId, isValidPhone } from '../../utils/identity';
import { getErrorMessage } from '../../utils/formatters';
import type { Gender, VehicleType } from '../../types';

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'private', label: 'ملاكي' },
  { value: 'bus', label: 'باص' },
  { value: 'suzuki', label: 'سوزوكي (رحلات مدرسية فقط)' }
];

// Required before rpc_activate_captain() will succeed — the RPC re-checks
// all of this server-side, this form just gets the data there. No skip and
// no "later" option, per the spec ("لا يوجد Skip / Later").
export const CaptainSetupStep: React.FC<{ onActivated: () => void; onCancel: () => void }> = ({ onActivated, onCancel }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [gender, setGender] = useState<Gender | ''>((profile?.gender as Gender) || '');
  const [nationalId, setNationalId] = useState(profile?.national_id || '');
  const [phone, setPhone] = useState(profile?.phone_number || '');
  const [vehicleType, setVehicleType] = useState<VehicleType>('private');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { setError('محتاجين اسمك الكامل'); return; }
    if (gender !== 'male' && gender !== 'female') { setError('يرجى تحديد النوع'); return; }
    if (!isValidNationalId(nationalId)) { setError('الرقم القومي يجب أن يكون 14 رقمًا'); return; }
    if (!phone.trim()) { setError('محتاجين رقم موبايلك'); return; }
    if (!isValidPhone(phone)) { setError('رقم الموبايل محتاج مراجعة بسيطة 👀'); return; }
    if (!make.trim() || !model.trim() || !color.trim()) { setError('بيانات العربية (النوع/الموديل/اللون) كلها مطلوبة'); return; }

    setIsSaving(true);
    setError('');
    try {
      await updateProfile(user.id, {
        full_name: fullName.trim(),
        gender,
        national_id: nationalId.trim(),
        phone_number: phone.trim()
      });
      await createVehicle({
        make: make.trim(),
        model: model.trim(),
        color: color.trim(),
        type: vehicleType,
        isAc: vehicleType !== 'suzuki'
      });
      // rpc_activate_captain() re-verifies all of the above server-side
      // before flipping captain_enabled — this call can still fail if,
      // say, the vehicle insert above didn't actually persist.
      await activateCaptain();
      await refreshProfile();
      onActivated();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'كمّل بياناتك الأول عشان تقدر تنزل رحلتك بأمان وتخلي الركاب يثقوا فيك.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <Card className="max-w-md w-full p-6 space-y-4">
        <div className="text-center">
          <ShieldCheck className="w-10 h-10 text-primary-600 mx-auto" />
          <h2 className="mt-3 text-base font-black text-gray-950">كمّل بياناتك عشان تبقى كابتن</h2>
          <p className="mt-1 text-xs text-gray-500 font-semibold">
            كمّل بياناتك الأول عشان تقدر تنزل رحلتك بأمان وتخلي الركاب يثقوا فيك.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input label="الاسم بالكامل" value={fullName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFullName(e.target.value)} />

          <div className="w-full text-right">
            <label className="block text-xs font-bold text-gray-900 mb-1">النوع</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setGender('male')} className={`p-3 rounded-xl border-2 flex items-center justify-center gap-1.5 text-xs font-bold transition-colors ${gender === 'male' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'}`}>
                <UserIcon className="w-4 h-4" /> ذكر
              </button>
              <button type="button" onClick={() => setGender('female')} className={`p-3 rounded-xl border-2 flex items-center justify-center gap-1.5 text-xs font-bold transition-colors ${gender === 'female' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'}`}>
                <UserIcon className="w-4 h-4" /> أنثى
              </button>
            </div>
          </div>

          <Input label="الرقم القومي" inputMode="numeric" maxLength={14} placeholder="14 رقم" value={nationalId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNationalId(e.target.value.replace(/\D/g, ''))} />
          <Input label="رقم الموبايل" inputMode="tel" value={phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)} />

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-black text-gray-800 flex items-center gap-1.5 mb-2"><Car className="w-4 h-4" /> بيانات العربية</p>
            <div className="w-full text-right mb-3">
              <label className="block text-xs font-bold text-gray-900 mb-1">نوع العربية</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                className="input"
              >
                {VEHICLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="الماركة" value={make} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMake(e.target.value)} />
              <Input label="الموديل" value={model} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel(e.target.value)} />
            </div>
            <div className="mt-2">
              <Input label="اللون" value={color} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value)} />
            </div>
          </div>

          <Button type="submit" fullWidth isLoading={isSaving} className="btn-primary btn-md">
            فعّل حساب الكابتن
          </Button>
          <Button type="button" fullWidth variant="ghost" onClick={onCancel} className="btn-md">
            ارجع كراكب دلوقتي
          </Button>
        </form>
      </Card>
    </div>
  );
};
