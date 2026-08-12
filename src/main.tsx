import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import ErrorBoundary from './components/ErrorBoundary'
import { isSupabaseConfigured } from './config/supabase'

function ConfigErrorScreen() {
  return (
    <div dir="rtl" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#b91c1c', marginBottom: 12 }}>
          إعدادات الاتصال بقاعدة البيانات غير مكتملة
        </h1>
        <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }}>
          المتغيرات <code>VITE_SUPABASE_URL</code> و <code>VITE_SUPABASE_ANON_KEY</code> غير
          موجودة في بيئة التشغيل الحالية. أضف ملف <code>.env</code> محليًا (راجع
          <code> .env.example</code>) أو أضف المتغيرات في إعدادات Cloudflare Pages، ثم أعد بناء المشروع.
        </p>
      </div>
    </div>
  );
}

// Global error handlers to surface runtime issues that may otherwise show a blank page
function createErrorOverlay() {
  let el = document.getElementById('app-error-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-error-overlay';
    Object.assign(el.style, {
      position: 'fixed',
      inset: '12px',
      zIndex: '99999',
      background: 'rgba(255,255,255,0.95)',
      color: '#b91c1c',
      padding: '12px',
      borderRadius: '8px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
      fontSize: '13px',
      overflow: 'auto',
      maxHeight: '60vh'
    });
    document.body.appendChild(el);
  }
  return el;
}

window.addEventListener('error', (ev) => {
  try {
    const el = createErrorOverlay();
    const msg = ev.error ? `${ev.message}\n${ev.error.stack || ''}` : ev.message;
    el.textContent = `Runtime error: ${msg}`;
    // eslint-disable-next-line no-console
    console.error('Global error captured:', ev.error || ev.message);
  } catch (e) {
    // ignore
  }
});

window.addEventListener('unhandledrejection', (ev) => {
  try {
    const el = createErrorOverlay();
    const reason = ev.reason ? (ev.reason.stack || String(ev.reason)) : 'unknown';
    el.textContent = `Unhandled rejection: ${reason}`;
    // eslint-disable-next-line no-console
    console.error('Unhandled rejection captured:', ev.reason);
  } catch (e) {
    // ignore
  }
});

// PWA: only register in production builds. In dev, an active service worker
// would keep serving stale cached responses across `vite` HMR reloads.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[pwa] service worker registration failed:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <ToastProvider>
        <AuthProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AuthProvider>
      </ToastProvider>
    ) : (
      <ConfigErrorScreen />
    )}
  </StrictMode>,
)