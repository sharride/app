import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Search, PlusCircle, Bell, User, Car } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { FOFiAssistant } from '../components/FOFiAssistant';

export const MainLayout: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isCaptain = profile?.role === 'captain';

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 max-w-md mx-auto relative border-x border-gray-100 shadow-xl pb-20">
      {/* Skip link for keyboard users */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-1/2 focus:-translate-x-1/2 bg-white px-3 py-2 rounded-md shadow-md z-50">
        تخطى إلى المحتوى
      </a>
      {/* Top Header */}
      <header role="banner" className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-primary-100 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-9 h-9 rounded-xl bg-primary-500 text-white font-black text-xl flex items-center justify-center shadow-md shadow-primary-500/30 border border-primary-200">
            S
          </div>
          <div>
            <h1 className="text-base font-black text-gray-950 tracking-tight leading-none">sharride</h1>
            <p className="text-[10px] text-primary-600 font-bold">شيررايد — المشاركة في التنقل</p>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/notifications')} className="p-2 text-gray-700 rounded-full hover:bg-primary-50 relative">
              <Bell className="w-5 h-5" />
            </button>
            <div onClick={() => navigate('/profile')} className="w-8 h-8 rounded-full bg-primary-50 border border-primary-200 flex items-center justify-center text-gray-900 font-bold text-xs cursor-pointer overflow-hidden shadow-sm">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" /> : profile?.full_name?.charAt(0) || <User className="w-4 h-4" />}
            </div>
          </div>
        )}
      </header>

      {/* Main Page Content */}
      <main id="main-content" role="main" className="flex-1 p-4">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav
        role="navigation"
        aria-label="قائمة التنقل السفلية"
        className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-primary-200 px-3 py-2 z-40 flex justify-around items-center shadow-lg"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
      >
        <NavLink to="/" aria-label="الرئيسية" className={({ isActive }) => `flex flex-col items-center gap-1 text-[11px] font-bold ${isActive ? 'text-primary-600' : 'text-gray-400'}`}>
          <Home className="w-5 h-5" />
          <span>الرئيسية</span>
        </NavLink>
        <NavLink to="/search" aria-label="بحث" className={({ isActive }) => `flex flex-col items-center gap-1 text-[11px] font-bold ${isActive ? 'text-primary-600' : 'text-gray-400'}`}>
          <Search className="w-5 h-5" />
          <span>بحث</span>
        </NavLink>

        {isCaptain && (
          <NavLink to="/create-journey" aria-label="إنشاء رحلة" className="flex flex-col items-center gap-1">
            <div className="w-11 h-11 -mt-6 bg-primary-500 border-2 border-white rounded-full text-white flex items-center justify-center shadow-lg shadow-primary-500/40">
              <PlusCircle className="w-6 h-6 stroke-[2.5]" />
            </div>
            <span className="text-[10px] text-primary-800 font-extrabold mt-0.5">رحلة جديدة</span>
          </NavLink>
        )}

        <NavLink to="/my-journeys" aria-label={isCaptain ? 'رحلاتي' : 'حجوزاتي'} className={({ isActive }) => `flex flex-col items-center gap-1 text-[11px] font-bold ${isActive ? 'text-primary-600' : 'text-gray-400'}`}>
          <Car className="w-5 h-5" />
          <span>{isCaptain ? 'رحلاتي' : 'حجوزاتي'}</span>
        </NavLink>
        <NavLink to="/profile" aria-label="حسابي" className={({ isActive }) => `flex flex-col items-center gap-1 text-[11px] font-bold ${isActive ? 'text-primary-600' : 'text-gray-400'}`}>
          <User className="w-5 h-5" />
          <span>حسابي</span>
        </NavLink>
      </nav>

      <FOFiAssistant />
    </div>
  );
};