import React, { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Button } from './ui/Button';

// Shown as a slim, dismissible bottom banner — never a blocking modal — so
// it can appear "on first entry" per spec without ever getting in the way
// of the Role Selection / Terms / Login steps underneath it. A short delay
// avoids it flashing in before the app shell has settled.
const SHOW_DELAY_MS = 2500;

export const PWAInstallPrompt: React.FC = () => {
  const install = usePWAInstall();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (install.kind === 'none') {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [install.kind]);

  if (install.kind === 'none' || !visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    install.dismiss();
  };

  return (
    <div
      role="region"
      aria-label="تثبيت تطبيق Sharride"
      className="fixed inset-x-3 bottom-3 z-40 animate-fade-in sm:inset-x-auto sm:end-4 sm:w-96"
    >
      <div className="card p-4 shadow-xl border border-primary-100 flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />

        <div className="flex-1 min-w-0 text-right">
          {install.kind === 'android' ? (
            <>
              <p className="text-xs font-black text-gray-950">ثبّت Sharride على موبايلك 🚀</p>
              <p className="mt-0.5 text-[11px] text-gray-500 font-semibold leading-relaxed">
                وصول أسرع وتجربة زي التطبيقات، من غير ما تفتح المتصفح كل مرة
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <Button
                  size="sm"
                  className="btn-primary btn-sm"
                  onClick={async () => {
                    const outcome = await install.promptNow();
                    if (outcome !== 'unavailable') setVisible(false);
                  }}
                >
                  <Download className="w-3.5 h-3.5 ml-1.5" aria-hidden />
                  تثبيت التطبيق
                </Button>
                <button
                  onClick={handleDismiss}
                  className="text-[11px] font-bold text-gray-400 hover:text-gray-600 px-2"
                >
                  مش دلوقتي
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-black text-gray-950">ثبّت Sharride على شاشتك الرئيسية 🚀</p>
              <p className="mt-0.5 text-[11px] text-gray-500 font-semibold leading-relaxed">
                اضغط على زر المشاركة <Share className="inline w-3 h-3 mx-0.5" aria-hidden /> تحت في المتصفح، بعدين
                اختار <span className="inline-flex items-center gap-0.5 font-black">
                  «إضافة إلى الشاشة الرئيسية» <SquarePlus className="inline w-3 h-3" aria-hidden />
                </span>
              </p>
            </>
          )}
        </div>

        <button
          onClick={handleDismiss}
          aria-label="إغلاق"
          className="shrink-0 p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
    </div>
  );
};
