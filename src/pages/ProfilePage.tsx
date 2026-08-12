import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, Pencil, Check, X, Car, ClipboardList, ChevronLeft, Camera, Star, Baby } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { updateProfile, uploadAvatar } from '../services/apiService';
import { getErrorMessage } from '../utils/formatters';
import { isValidPhone } from '../utils/identity';

export const ProfilePage: React.FC = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [city, setCity] = useState(profile?.city || '');
  const [phone, setPhone] = useState(profile?.phone_number || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  if (!user || !profile) {
    return (
      <Card className="text-center py-10 space-y-3 border-primary-200">
        <User className="w-10 h-10 text-primary-500 mx-auto" />
        <h3 className="text-xs font-bold text-gray-900">سجّل الدخول لعرض حسابك</h3>
        <Button size="sm" onClick={() => navigate('/login')}>تسجيل الدخول</Button>
      </Card>
    );
  }

  const startEditing = () => {
    setFullName(profile.full_name || '');
    setCity(profile.city || '');
    setPhone(profile.phone_number || '');
    setSaveError('');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      setSaveError('محتاجين اسمك الأول 🙂');
      return;
    }
    if (!phone.trim()) {
      setSaveError('محتاجين رقم موبايلك كمان');
      return;
    }
    if (!isValidPhone(phone)) {
      setSaveError('رقم الموبايل محتاج مراجعة بسيطة 👀');
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      await updateProfile(user.id, { full_name: fullName.trim(), city: city.trim(), phone_number: phone.trim() });
      await refreshProfile();
      addToast('تم تحديث الملف الشخصي');
      setIsEditing(false);
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, 'تعذر حفظ التعديلات، حاول مرة أخرى'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setIsUploadingAvatar(true);
    try {
      const url = await uploadAvatar(user.id, file);
      await updateProfile(user.id, { avatar_url: url });
      await refreshProfile();
      addToast('تم تحديث الصورة الشخصية');
    } catch (err: unknown) {
      addToast(getErrorMessage(err, 'تعذر رفع الصورة، حاول مرة أخرى'));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in ds-root">
      <Card className="p-5 text-center space-y-3 border-primary-200 bg-primary-50/40">
        <div className="relative w-20 h-20 mx-auto">
          <div className="w-20 h-20 rounded-full bg-primary-500 text-white font-black text-2xl flex items-center justify-center border-2 border-white shadow-md overflow-hidden">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
            ) : (
              profile.full_name.charAt(0)
            )}
          </div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={isUploadingAvatar}
            aria-label="تغيير الصورة الشخصية"
            className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-white border border-primary-200 shadow-md flex items-center justify-center"
          >
            <Camera className="w-3.5 h-3.5 text-primary-600" />
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarSelect}
          />
        </div>

        {!isEditing ? (
          <>
            <h2 className="text-base font-black text-gray-950">{profile.full_name}</h2>
            <p className="text-xs font-bold text-primary-700">{profile.city}، {profile.governorate}</p>
            {profile.phone_number && (
              <p className="text-[11px] font-semibold text-gray-500" dir="ltr">{profile.phone_number}</p>
            )}
            <div className="flex items-center justify-center gap-1">
              <Star className={`w-3.5 h-3.5 ${profile.trust_score > 0 ? 'fill-primary-500 text-primary-500' : 'text-gray-300'}`} />
              <span className="text-[11px] font-bold text-gray-600">
                {profile.trust_score > 0 ? `${profile.trust_score.toFixed(1)} تقييم` : 'لا يوجد تقييم بعد'}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="w-4 h-4 ml-1.5" /> تعديل البيانات
            </Button>
          </>
        ) : (
          <div className="text-right space-y-3">
            {saveError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
                {saveError}
              </div>
            )}
            <Input label="الاسم الكامل" value={fullName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFullName(e.target.value)} />
            <Input label="المدينة" value={city} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCity(e.target.value)} />
            <Input
              label="رقم الموبايل"
              inputMode="tel"
              maxLength={11}
              placeholder="01xxxxxxxxx"
              value={phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value.replace(/\D/g, ''))}
            />
            <div className="flex gap-2">
              <Button fullWidth isLoading={isSaving} onClick={handleSave}>
                <Check className="w-4 h-4 ml-1.5" /> حفظ
              </Button>
              <Button fullWidth variant="outline" disabled={isSaving} onClick={() => setIsEditing(false)}>
                <X className="w-4 h-4 ml-1.5" /> إلغاء
              </Button>
            </div>
          </div>
        )}
      </Card>

      {!isEditing && profile.role !== 'captain' && (
        <div className="space-y-2">
          <Card
            hoverable
            onClick={() => navigate('/children')}
            className="p-4 flex items-center justify-between border-primary-100 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Baby className="w-4 h-4 text-primary-600" />
              <span className="text-xs font-black text-gray-950">حسابات الأبناء</span>
            </div>
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </Card>
        </div>
      )}

      {!isEditing && profile.role === 'captain' && (
        <div className="space-y-2">
          <Card
            hoverable
            onClick={() => navigate('/vehicles')}
            className="p-4 flex items-center justify-between border-primary-100 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-primary-600" />
              <span className="text-xs font-black text-gray-950">مركباتي</span>
            </div>
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </Card>
          <Card
            hoverable
            onClick={() => navigate('/booking-requests')}
            className="p-4 flex items-center justify-between border-primary-100 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary-600" />
              <span className="text-xs font-black text-gray-950">طلبات الحجز الواردة</span>
            </div>
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </Card>
        </div>
      )}

      {!isEditing && (
        <Button variant="danger" fullWidth onClick={signOut} className="w-full">
          <LogOut className="w-4 h-4 ml-1.5" /> تسجيل الخروج
        </Button>
      )}
    </div>
  );
};
