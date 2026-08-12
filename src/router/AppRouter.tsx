import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MainLayout } from '../layouts/MainLayout';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { CreateJourneyPage } from '../pages/CreateJourneyPage';
import { SearchMatchingPage } from '../pages/SearchMatchingPage';
import { JourneyDetailsPage } from '../pages/JourneyDetailsPage';
import { MyJourneysPage } from '../pages/MyJourneysPage';
import { BookingRequestsPage } from '../pages/BookingRequestsPage';
import { VehiclesPage } from '../pages/VehiclesPage';
import { ProfilePage } from '../pages/ProfilePage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { ChatPage } from '../pages/ChatPage';
import { AdminPage } from '../pages/AdminPage';
import { ChildrenPage } from '../pages/ChildrenPage';
import { IdentityGate } from '../components/IdentityGate';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// Frontend gate only: this hides the admin UI from non-admins in normal use,
// but it is NOT real authorization. Anyone with browser devtools can bypass a
// client-side check like this. Real protection for admin data must come from
// Supabase RLS policies on whatever tables /admin ends up reading/writing —
// see the final report.
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

// Frontend gate, same caveat as AdminRoute above: this hides
// captain-only screens from passengers in the UI (item 9/10 of the
// onboarding spec — a passenger must not see Create Journey / Captain
// Dashboard / Captain Management). It does NOT replace server-side
// protection — journeys/booking-requests/vehicles are only actually
// writable by their owning captain via existing RLS policies
// (p_journeys_*, p_vehicles_*, p_bookings_* in 0002_rpc_and_policies.sql),
// so a passenger manually hitting these URLs sees an empty/blocked UI, and
// any direct API call they tried instead would still be rejected by RLS.
const CaptainRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile || profile.role !== 'captain') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      {/* Global gate: Role Selection -> Terms -> Login for anyone not yet
          authenticated (no guest browsing before this completes, per the
          spec), then applies the chosen role and blocks on Captain setup
          if that role isn't activated yet. See IdentityGate.tsx. */}
      <IdentityGate>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<HomePage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="search" element={<IdentityGate requireCompleteIdentity><SearchMatchingPage /></IdentityGate>} />
            <Route path="journeys/:id" element={<JourneyDetailsPage />} />
            <Route path="create-journey" element={<CaptainRoute><IdentityGate requireCompleteIdentity><CreateJourneyPage /></IdentityGate></CaptainRoute>} />
            <Route path="my-journeys" element={<ProtectedRoute><MyJourneysPage /></ProtectedRoute>} />
            <Route path="booking-requests" element={<CaptainRoute><BookingRequestsPage /></CaptainRoute>} />
            <Route path="vehicles" element={<CaptainRoute><VehiclesPage /></CaptainRoute>} />
            <Route path="children" element={<ProtectedRoute><ChildrenPage /></ProtectedRoute>} />
            <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
            <Route path="chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
            <Route path="admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
          </Route>
        </Routes>
      </IdentityGate>
    </BrowserRouter>
  );
};
