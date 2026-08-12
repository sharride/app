import type { Profile } from '../types';

// Egyptian national ID: exactly 14 digits.
export const isValidNationalId = (value: string): boolean => /^\d{14}$/.test(value.trim());

// Egyptian mobile number: 01 + one of {0,1,2,5} + 8 digits = 11 digits total.
// Client-side format check only, for a friendlier error message -- the
// server (rpc_activate_captain / create_booking_rpc) only checks that
// phone_number is non-empty, so this never blocks a save the backend would
// otherwise accept; it just flags an obviously-mistyped number earlier.
export const isValidPhone = (value: string): boolean => /^01[0125]\d{8}$/.test(value.trim());

// Single source of truth for whether a profile still needs to go through
// the identity-verification screen before publishing, searching for, or
// booking a journey (name + gender + national ID + phone number for
// everyone; captains additionally need at least one registered vehicle,
// checked separately since that's a different table). Mirrors the
// server-side checks in rpc_activate_captain() and create_booking_rpc()
// (supabase/migrations/0006_captain_activation.sql, 0008_booking_identity_requirements.sql)
// -- keep in sync if either of those change.
export const isIdentityComplete = (profile: Profile | null): boolean => {
  if (!profile) return false;
  return (
    !!profile.full_name?.trim() &&
    (profile.gender === 'male' || profile.gender === 'female') &&
    !!profile.national_id &&
    isValidNationalId(profile.national_id) &&
    !!profile.phone_number?.trim()
  );
};
