import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Baby, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { fetchMyChildren, createChild, deleteChild } from '../services/apiService';
import { getErrorMessage } from '../utils/formatters';
import type { ProfileChild } from '../types';

export const ChildrenPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [children, setChildren] = useState<ProfileChild[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [school, setSchool] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = () => {
    setIsLoading(true);
    setLoadError('');
    fetchMyChildren()
      .then(setChildren)
      .catch((err) => setLoadError(getErrorMessage(err, 'تعذر تحميل بيانات الأبناء')))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  const openModal = () => {
    setFullName('');
    setAge('');
    setSchool('');
    setSaveError('');
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      setSaveError('يرجى إدخال اسم الابن/الابنة');
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      const created = await createChild({
        fullName: fullName.trim(),
        age: age ? parseInt(age, 10) : undefined,
        school: school.trim() || undefined
      });
      setChildren((prev) => [created, ...prev]);
      addToast('تمت إضافة الابن/الابنة بنجاح');
      setIsModalOpen(false);
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, 'تعذر الحفظ، حاول مرة أخرى'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (childId: string) => {
    if (deletingId) return;
    setDeletingId(childId);
    try {
      await deleteChild(childId);
      setChildren((prev) => prev.filter((c) => c.id !== childId));
      addToast('تم الحذف');
    } catch (err: unknown) {
      addToast(getErrorMessage(err, 'تعذر الحذف، حاول مرة أخرى'));
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) {
    return (
      <Card className="text-center py-10 space-y-3 border-primary-200">
        <EmptyState
          icon={<Baby className="w-10 h-10 text-primary-500 mx-auto" />}
          title="سجّل الدخول لإدارة حسابات أبنائك"
          action={{ label: 'تسجيل الدخول', onClick: () => navigate('/login') }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-gray-950 flex items-center gap-2">
          <Baby className="w-5 h-5 text-primary-600" /> حسابات الأبناء
        </h2>
        <Button size="sm" onClick={openModal}>
          <Plus className="w-4 h-4 ml-1" /> إضافة ابن/ابنة
        </Button>
      </div>

      <p className="text-xs text-gray-500 font-semibold">
        أضف بيانات أبنائك عشان تقدر تدور على رحلة مدرسية ليهم (زي سوزوكي المدارس) من حسابك.
      </p>

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

      {!isLoading && !loadError && children.length === 0 && (
        <Card className="text-center py-10 space-y-2 bg-primary-50/30 border-dashed border-primary-200">
          <EmptyState
            icon={<Baby className="w-10 h-10 text-primary-500 mx-auto" />}
            title="لسه مضفتش أي ابن/ابنة"
            action={{ label: 'إضافة الآن', onClick: openModal }}
          />
        </Card>
      )}

      {!isLoading && !loadError && children.length > 0 && (
        <div className="space-y-3">
          {children.map((c) => (
            <Card key={c.id} className="p-4 flex items-center justify-between border-primary-100">
              <div>
                <p className="text-xs font-black text-gray-950">{c.full_name}</p>
                <p className="text-[11px] text-gray-500 font-semibold">
                  {c.age ? `${c.age} سنة` : ''}{c.age && c.school ? ' — ' : ''}{c.school || ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                isLoading={deletingId === c.id}
                onClick={() => handleDelete(c.id)}
                aria-label="حذف"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="إضافة ابن/ابنة">
        {saveError && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
            {saveError}
          </div>
        )}
        <Input label="الاسم" value={fullName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFullName(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" min={0} max={25} label="السن (اختياري)" value={age} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAge(e.target.value)} />
          <Input label="المدرسة (اختياري)" value={school} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchool(e.target.value)} />
        </div>
        <Button fullWidth isLoading={isSaving} onClick={handleSave}>
          حفظ
        </Button>
      </Modal>
    </div>
  );
};
