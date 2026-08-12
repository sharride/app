import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

export const TermsStep: React.FC<{ onAgree: () => void; onBack: () => void }> = ({ onAgree, onBack }) => {
  const [checked, setChecked] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 space-y-5">
        <div className="text-center">
          <FileText className="w-10 h-10 text-primary-600 mx-auto" />
          <h2 className="mt-3 text-base font-black text-gray-950">الشروط والأحكام</h2>
          <p className="mt-1 text-xs text-gray-500 font-semibold">خطوة سريعة قبل ما نكمل مع بعض</p>
        </div>

        <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 p-3 text-[11px] leading-relaxed text-gray-600 text-right">
          باستخدامك sharride، إنت موافق إن بياناتك (الاسم، رقم الهاتف، الرقم القومي، وبيانات
          العربية لو هتكون كابتن) هتتستخدم عشان نأمّن ونربط الرحلات بين الركاب والكباتن.
          إنت مسؤول عن دقة البيانات اللي بتدخلها، وممكن نوقف حسابك لو حصل استخدام غير آمن
          للمنصة.
        </div>

        <label className="flex items-start gap-2 text-right cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-primary-600"
          />
          <span className="text-xs font-bold text-gray-800">قرأت الشروط والأحكام ووافقت عليها</span>
        </label>

        <div className="space-y-2">
          <Button fullWidth disabled={!checked} onClick={onAgree} className="btn-primary btn-md">
            أوافق وأتابع
          </Button>
          <Button fullWidth variant="ghost" onClick={onBack} className="btn-md">
            رجوع
          </Button>
        </div>
      </Card>
    </div>
  );
};
