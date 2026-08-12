// Internal RPC error codes (raised as the exception message itself, e.g.
// create_booking_rpc's 'identity_incomplete') get a friendly Arabic message
// here instead of leaking the raw code to the UI. Everything else keeps
// using the Arabic message already raised server-side (e.g. 'الرحلة غير موجودة').
//
// 'identity_incomplete' replaces the old 'phone_required' as of
// supabase/migrations/0010_booking_identity_full_check.sql, which widened
// create_booking_rpc's server-side check from phone-only to the full
// isIdentityComplete() set (name/gender/national ID/phone). In the normal
// flow IdentityGate already stops the user before this RPC is ever called
// with an incomplete profile, so this message is a defense-in-depth
// fallback, not the primary UX for it. 'phone_required' is kept mapped too
// in case any older client build is still in the wild right after deploy.
const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  phone_required: 'محتاجين تكمّل بياناتك (الاسم، النوع، الرقم القومي، رقم الموبايل) الأول عشان تقدر تحجز 👀',
  identity_incomplete: 'محتاجين تكمّل بياناتك (الاسم، النوع، الرقم القومي، رقم الموبايل) الأول عشان تقدر تحجز 👀'
};

export const getErrorMessage = (err: unknown, fallback: string): string => {
  if (err instanceof Error && err.message) return KNOWN_ERROR_MESSAGES[err.message] ?? err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return KNOWN_ERROR_MESSAGES[msg] ?? msg;
  }
  return fallback;
};

export const formatCurrency = (amount: number): string => {
  return `${amount || 0} ج.م`;
};

export const formatTime = (dateString: string): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: 'numeric', hour12: true });
  } catch {
    return dateString;
  }
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-EG', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
};