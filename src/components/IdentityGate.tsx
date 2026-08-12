import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { updateProfile, updateTermsAcceptance, selectActiveRole } from '../services/apiService';
import { isIdentityComplete, isValidNationalId, isValidPhone } from '../utils/identity';
import { getErrorMessage } from '../utils/formatters';
import {
  getPendingRole,
  setPendingRole,
  clearPendingRole,
  getCaptainSetupPending,
  setCaptainSetupPending,
  hasAcceptedTermsOnDevice,
  markTermsAcceptedOnDevice,
  type PendingRole
} from '../utils/onboarding';
import { RoleSelectStep } from './onboarding/RoleSelectStep';
import { TermsStep } from './onboarding/TermsStep';
import { LoginStep } from './onboarding/LoginStep';
import { CaptainSetupStep } from './onboarding/CaptainSetupStep';
import type { Gender } from '../types';

// -----------------------------------------------------------------------------
// The single gate for the whole onboarding + identity + captain-activation
// lifecycle (Phase 1, item 7). Mounted twice, on purpose, in two different
// roles -- both share this exact same implementation, nothing is duplicated:
//
//  1. Globally, wrapping the entire app in AppRouter: handles "no user yet"
//     (Role Selection -> Terms -> Login, in that order, per the spec) and,
//     once authenticated, applies whichever role was picked and blocks on
//     Captain setup if that role isn't activated yet.
//
//  2. Per-route, on /search and /create-journey, with
//     `requireCompleteIdentity`: adds the existing name/gender/national-ID
//     check on top -- this is intentionally NOT part of the global instance,
//     since Home stays reachable for passengers who haven't finished that
//     step yet (existing behavior, unchanged).
// -----------------------------------------------------------------------------
export const IdentityGate: React.FC<{ children: React.ReactNode; requireCompleteIdentity?: boolean }> = ({
  children,
  requireCompleteIdentity = false
}) => {
  const { user, profile, refreshProfile } = useAuth();

  // ---------------------------------------------------------------------------
  // 1. Not authenticated yet: Role Selection -> Terms -> Login. This is the
  //    literal "first thing you see" flow from the spec -- it blocks
  //    everything else, there is no guest browsing before this completes.
  // ---------------------------------------------------------------------------
  const [preAuthStep, setPreAuthStep] = useState<'role' | 'terms' | 'login'>(() => {
    if (!getPendingRole()) return 'role';
    return hasAcceptedTermsOnDevice() ? 'login' : 'terms';
  });

  // Hooks below this line must always run (React rules of hooks), so the
  // early pre-auth returns happen AFTER they're declared, not before.
  const finalizedForUserId = useRef<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);

  useEffect(() => {
    if (!user || !profile) return;
    if (finalizedForUserId.current === user.id) return;
    const pending = getPendingRole();
    if (!pending && profile.terms_accepted) {
      finalizedForUserId.current = user.id;
      return;
    }

    finalizedForUserId.current = user.id;
    setIsFinalizing(true);
    (async () => {
      try {
        if (!profile.terms_accepted) {
          await updateTermsAcceptance(user.id);
          markTermsAcceptedOnDevice();
        }
        if (pending) {
          try {
            await selectActiveRole(pending);
            setCaptainSetupPending(false);
          } catch (err) {
            // Most likely 'captain_not_activated' -- expected for a captain
            // pick that hasn't completed identity/vehicle setup yet.
            if (pending === 'captain') {
              setCaptainSetupPending(true);
            } else {
              console.error(err);
            }
          }
          clearPendingRole();
        }
      } finally {
        await refreshProfile();
        setIsFinalizing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.terms_accepted]);

  if (!user) {
    if (preAuthStep === 'role') {
      return (
        <RoleSelectStep
          onContinue={(role: PendingRole) => {
            setPendingRole(role);
            setPreAuthStep(hasAcceptedTermsOnDevice() ? 'login' : 'terms');
          }}
        />
      );
    }
    if (preAuthStep === 'terms') {
      return (
        <TermsStep
          onAgree={() => {
            markTermsAcceptedOnDevice();
            setPreAuthStep('login');
          }}
          onBack={() => setPreAuthStep('role')}
        />
      );
    }
    return <LoginStep onBack={() => setPreAuthStep('role')} />;
  }

  // ---------------------------------------------------------------------------
  // 2. Authenticated, but the profile hasn't caught up yet (still fetching).
  // ---------------------------------------------------------------------------
  if (!profile) {
    return null;
  }

  if (isFinalizing) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // 3. Captain was selected but isn't activated yet: block on setup, no skip.
  // ---------------------------------------------------------------------------
  if (getCaptainSetupPending() && profile.role !== 'captain') {
    return (
      <CaptainSetupStep
        onActivated={() => setCaptainSetupPending(false)}
        onCancel={async () => {
          setCaptainSetupPending(false);
          try {
            await selectActiveRole('passenger');
          } finally {
            await refreshProfile();
          }
        }}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Existing identity check (name + gender + national ID + phone number)
  //    -- unchanged behavior, only enforced where it already was (search,
  //    create-journey). Phone was added here per Remaining Work #1/#2 so it
  //    can no longer be skipped before booking, matching create_booking_rpc.
  // ---------------------------------------------------------------------------
  if (requireCompleteIdentity && !isIdentityComplete(profile)) {
    return <IdentityForm />;
  }

  return <>{children}</>;
};

const IdentityForm: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [gender, setGender] = useState<Gender | ''>((profile?.gender as Gender) || '');
  const [nationalId, setNationalId] = useState(profile?.national_id || '');
  const [phone, setPhone] = useState(profile?.phone_number || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { setError('يرجى إدخال الاسم'); return; }
    if (gender !== 'male' && gender !== 'female') { setError('يرجى تحديد النوع'); return; }
    if (!isValidNationalId(nationalId)) { setError('الرقم القومي يجب أن يكون 14 رقمًا'); return; }
    if (!phone.trim()) { setError('رقم الموبايل مطلوب'); return; }
    if (!isValidPhone(phone)) { setError('رقم الموبايل محتاج مراجعة بسيطة 👀'); return; }

    setIsSaving(true);
    setError('');
    try {
      await updateProfile(user.id, {
        full_name: fullName.trim(),
        gender,
        national_id: nationalId.trim(),
        phone_number: phone.trim()
      });
      await refreshProfile();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'تعذر حفظ البيانات، حاول مرة أخرى'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="pt-4 flex justify-center animate-fade-in">
      <Card className="max-w-md w-full p-6 space-y-4">
        <div className="text-center">
          <ShieldCheck className="w-10 h-10 text-primary-600 mx-auto" />
          <h2 className="mt-3 text-base font-black text-gray-950">خطوة أخيرة قبل ما تكمل</h2>
          <p className="mt-1 text-xs text-gray-500 font-semibold">
            محتاجين نتأكد من بياناتك مرة واحدة بس
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="الاسم بالكامل"
            value={fullName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFullName(e.target.value)}
          />

          <div className="w-full text-right">
            <label className="block text-xs font-bold text-gray-900 mb-1">النوع</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`p-3 rounded-xl border-2 flex items-center justify-center gap-1.5 text-xs font-bold transition-colors ${gender === 'male' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'}`}
              >
                <UserIcon className="w-4 h-4" /> ذكر
              </button>
              <button
                type="button"
                onClick={() => setGender('female')}
                className={`p-3 rounded-xl border-2 flex items-center justify-center gap-1.5 text-xs font-bold transition-colors ${gender === 'female' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'}`}
              >
                <UserIcon className="w-4 h-4" /> أنثى
              </button>
            </div>
          </div>

          <Input
            label="الرقم القومي"
            inputMode="numeric"
            maxLength={14}
            placeholder="14 رقم"
            value={nationalId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNationalId(e.target.value.replace(/\D/g, ''))}
          />

          <Input
            label="رقم الموبايل"
            inputMode="tel"
            maxLength={11}
            placeholder="01xxxxxxxxx"
            value={phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value.replace(/\D/g, ''))}
          />

          <Button type="submit" fullWidth isLoading={isSaving} className="btn-primary btn-md">
            تأكيد ومتابعة
          </Button>
        </form>
      </Card>
    </div>
  );
};
