// Pre-auth onboarding state has to survive a full-page OAuth redirect
// (Google/Facebook take the browser away and back), so it can't live in
// React state — localStorage is the only option here.
//
// Two different lifetimes are used deliberately:
//  - PENDING_ROLE_KEY / CAPTAIN_SETUP_PENDING_KEY are ephemeral: cleared as
//    soon as they've been applied, and also cleared on logout, so a fresh
//    Role Selection always starts clean.
//  - TERMS_DEVICE_KEY is permanent (survives logout): once this browser has
//    ever completed Terms acceptance for the current version, we don't make
//    the user tap through the Terms screen again on every role switch —
//    matches "don't force re-acceptance if already accepted" from the spec.
const PENDING_ROLE_KEY = 'sharride_pending_role';
const CAPTAIN_SETUP_PENDING_KEY = 'sharride_captain_setup_pending';
const TERMS_DEVICE_KEY = 'sharride_terms_accepted_device_v1';

export type PendingRole = 'passenger' | 'captain';

export const getPendingRole = (): PendingRole | null => {
  const v = localStorage.getItem(PENDING_ROLE_KEY);
  return v === 'passenger' || v === 'captain' ? v : null;
};

export const setPendingRole = (role: PendingRole): void => {
  localStorage.setItem(PENDING_ROLE_KEY, role);
};

export const clearPendingRole = (): void => {
  localStorage.removeItem(PENDING_ROLE_KEY);
};

export const getCaptainSetupPending = (): boolean => localStorage.getItem(CAPTAIN_SETUP_PENDING_KEY) === '1';

export const setCaptainSetupPending = (pending: boolean): void => {
  if (pending) localStorage.setItem(CAPTAIN_SETUP_PENDING_KEY, '1');
  else localStorage.removeItem(CAPTAIN_SETUP_PENDING_KEY);
};

export const hasAcceptedTermsOnDevice = (): boolean => localStorage.getItem(TERMS_DEVICE_KEY) === '1';

export const markTermsAcceptedOnDevice = (): void => {
  localStorage.setItem(TERMS_DEVICE_KEY, '1');
};

// Called on logout: role switching always restarts at Role Selection, but
// the device-level terms flag deliberately survives so a returning user
// picking a different role doesn't have to re-accept Terms.
export const resetEphemeralOnboardingState = (): void => {
  clearPendingRole();
  setCaptainSetupPending(false);
};
