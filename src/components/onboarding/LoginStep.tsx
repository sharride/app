import React, { useState } from 'react';
import { GoogleIcon } from '../icons/GoogleIcon';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { signInWithProvider } from '../../services/apiService';
import { getErrorMessage } from '../../utils/formatters';

export const LoginStep: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleOAuth = async (provider: 'google' | 'facebook') => {
    setAuthError(null);
    setIsLoading(true);
    try {
      // Redirects the whole page away — the pending role we already saved
      // to localStorage is what survives this trip and gets applied once
      // the user lands back here authenticated (see IdentityGate).
      await signInWithProvider(provider);
    } catch (err: unknown) {
      console.error(err);
      setAuthError(getErrorMessage(err, 'حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.'));
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <Card className="p-8 rounded-2xl">
          <header className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--brand)] flex items-center justify-center text-white font-black">S</div>
              <div className="text-sm font-semibold text-[var(--text-default)]">sharride</div>
            </div>
          </header>

          <div className="text-center">
            <h2 className="text-2xl font-extrabold text-[var(--text-default)]">خطوة أخيرة</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">سجّل الدخول عشان نكمل معاك</p>
          </div>

          {authError && (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4" role="alert" aria-live="assertive">
              {authError}
            </div>
          )}

          <div className="mt-4">
            <Button fullWidth variant="outline" onClick={() => handleOAuth('google')} isLoading={isLoading} className="btn btn-md w-full bg-white border border-gray-200 text-[var(--text-default)] flex items-center justify-center">
              <GoogleIcon className="w-5 h-5 icon-inline" />
              <span>تسجيل الدخول باستخدام Google</span>
            </Button>
          </div>

          <div className="my-6 flex items-center">
            <hr className="flex-1 border-t border-gray-200" />
            <span className="px-3 text-sm text-[var(--muted)]">أو</span>
            <hr className="flex-1 border-t border-gray-200" />
          </div>

          <div>
            <Button fullWidth onClick={() => handleOAuth('facebook')} isLoading={isLoading} className="btn btn-md w-full btn-primary">
              تسجيل الدخول باستخدام Facebook
            </Button>
          </div>

          <div className="mt-6 text-center">
            <button type="button" onClick={onBack} className="text-xs text-[var(--muted)] font-semibold">
              رجوع
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};
