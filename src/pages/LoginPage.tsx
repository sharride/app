import React from 'react';
import { Navigate } from 'react-router-dom';

// The full Role Selection -> Terms -> Login flow now lives in
// <IdentityGate>, mounted globally in AppRouter.tsx (Phase 1: role
// selection must happen before login, and there's a single source of
// truth for that logic — see IdentityGate.tsx).
//
// This route is kept only because several existing pages still call
// navigate('/login') as an action (e.g. "log in to book"). Since
// IdentityGate already intercepts anyone who isn't authenticated before
// any route renders, and redirects an already-authenticated user straight
// through, /login itself has nothing left to do — it just bounces home,
// where the gate (still) takes over if needed.
export const LoginPage: React.FC = () => <Navigate to="/" replace />;
