import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { fetchMyVehicles, createVehicle, deleteVehicle } from '../services/apiService';
import { getErrorMessage } from '../utils/formatters';
import type { Vehicle, VehicleType } from '../types';

// Seats are fixed per type server-side (trg_vehicles_fleet_rules in
// 0004_role_identity_and_fleet.sql) — shown here read-only, never sent.
const VEHICLE_TYPES: { value: VehicleType; label: string; seats: number }[] = [
  { value: 'private', label: 'ملاكي', seats: 4 },
  { value: 'bus', label: 'باص', seats: 14 },
  { value: 'suzuki', label: 'سوزوكي (رحلات مدرسية فقط)', seats: 10 }
];

export const VehiclesPage: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [type, setType] = useState<VehicleType>('private');
  const [isAc, setIsAc] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = () => {
    setIsLoading(true);
    setLoadError('');
    fetchMyVehicles()
      .then(setVehicles)
      .catch((err) => setLoadError(getErrorMessage(err, 'تعذر تحميل بيانات المركبات')))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  const resetForm = () => {
    setMake('');
    setModel('');
    setColor('');
    setPlateNumber('');
    setType('private');
    setIsAc(true);
    setSaveError('');
  };

  const openModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!make.trim() || !model.trim()) {
      setSaveError('يرجى إدخال الشركة الصانعة والموديل');
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      const created = await createVehicle({
        make: make.trim(),
        model: model.trim(),
        color: color.trim() || undefined,
        plateNumber: plateNumber.trim() || undefined,
        type,
        isAc: type === 'suzuki' ? false : isAc
      });
      setVehicles((prev) => [created, ...prev]);
      addToast('تمت إضافة المركبة بنجاح');
      setIsModalOpen(false);
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, 'تعذر حفظ بيانات المركبة، حاول مرة أخرى'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (vehicleId: string) => {
    if (deletingId) return;
    setDeletingId(vehicleId);
    try {
      await deleteVehicle(vehicleId);
      setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
      addToast('تم حذف المركبة');
    } catch (err: unknown) {
      addToast(getErrorMessage(err, 'تعذر حذف المركبة، حاول مرة أخرى'));
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) {
    return (
      <Card className="text-center py-10 space-y-3 border-primary-200">
        <EmptyState
          icon={<Car className="w-10 h-10 text-primary-500 mx-auto" />}
          title="سجّل الدخول لإدارة مركباتك"
          action={{ label: 'تسجيل الدخول', onClick: () => navigate('/login') }}
        />
      </Card>
    );
  }

  if (profile && profile.role !== 'captain') {
    return (
      <Card className="border-primary-200">
        <ErrorState title="هذه الصفحة مخصصة لقادة الرحلات فقط" />
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-gray-950 flex items-center gap-2">
          <Car className="w-5 h-5 text-primary-600" /> مركباتي
        </h2>
        <Button size="sm" onClick={openModal}>
          <Plus className="w-4 h-4 ml-1" /> إضافة مركبة
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!isLoading && loadError && (
        <Card className="border-red-200">
          <ErrorState title="حدث خطأ" description={loadError} action={{ label: 'إعادة المحاولة', onClick: load }} />
        </Card>
      )}

      {!isLoading && !loadError && vehicles.length === 0 && (
        <Card className="text-center py-10 space-y-2 bg-primary-50/30 border-dashed border-primary-200">
          <EmptyState
            icon={<Car className="w-10 h-10 text-primary-500 mx-auto" />}
            title="لسه مسجلتش عربية"
            description="ضيف عربيتك الأول عشان تقدر تنشر رحلتك"
            action={{ label: 'إضافة مركبة', onClick: openModal }}
          />
        </Card>
      )}

      {!isLoading && !loadError && vehicles.length > 0 && (
        <div className="space-y-3">
          {vehicles.map((v) => (
            <Card key={v.id} className="p-4 flex items-center justify-between border-primary-100">
              <div>
                <p className="text-xs font-black text-gray-950">{v.make} {v.model}</p>
                <p className="text-[11px] text-gray-500 font-semibold">
                  {VEHICLE_TYPES.find((t) => t.value === v.type)?.label || v.type} — {v.seats} مقاعد — {v.is_ac ? 'مكيفة' : 'غير مكيفة'}
                  {v.plate_number ? ` — ${v.plate_number}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                isLoading={deletingId === v.id}
                onClick={() => handleDelete(v.id)}
                aria-label="حذف المركبة"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="إضافة مركبة جديدة">
        {saveError && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
            {saveError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Input label="الشركة الصانعة" value={make} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMake(e.target.value)} />
          <Input label="الموديل" value={model} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="اللون (اختياري)" value={color} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value)} />
          <Input label="رقم اللوحة (اختياري)" value={plateNumber} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPlateNumber(e.target.value)} />
        </div>
        <div className="w-full text-right">
          <label className="block text-xs font-bold text-gray-900 mb-1">نوع المركبة</label>
          <select
            className="input"
            value={type}
            onChange={(e) => {
              const newType = e.target.value as VehicleType;
              setType(newType);
              if (newType === 'suzuki') setIsAc(false);
            }}
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label} — {t.seats} مقاعد</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-500 font-semibold">
            عدد المقاعد يتحدد تلقائيًا حسب نوع المركبة.
          </p>
        </div>

        <div className="w-full text-right">
          <label className="block text-xs font-bold text-gray-900 mb-1">التكييف</label>
          {type === 'suzuki' ? (
            <p className="text-[11px] text-gray-500 font-semibold bg-gray-50 rounded-lg p-2">سوزوكي دايمًا غير مكيفة</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsAc(true)}
                className={`p-2.5 rounded-xl border-2 text-xs font-bold transition-colors ${isAc ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'}`}
              >
                مكيفة
              </button>
              <button
                type="button"
                onClick={() => setIsAc(false)}
                className={`p-2.5 rounded-xl border-2 text-xs font-bold transition-colors ${!isAc ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'}`}
              >
                غير مكيفة
              </button>
            </div>
          )}
        </div>

        <Button fullWidth isLoading={isSaving} onClick={handleSave}>
          حفظ المركبة
        </Button>
      </Modal>
    </div>
  );
};
