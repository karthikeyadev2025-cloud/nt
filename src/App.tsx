import { useEffect, useState, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './lib/toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import PWAInstallBanner from './components/PWAInstallBanner';

const PublicSite = lazy(() => import('./components/PublicSite'));
const UnifiedLogin = lazy(() => import('./components/UnifiedLogin'));
import { KiteTailLogo } from './components/KiteTailLogo';

const SuperAdminDashboard = lazy(() => import('./components/portal/SuperAdminDashboard'));
const StaffPortal = lazy(() => import('./components/portal/StaffPortal'));
const ForcePasswordChange = lazy(() => import('./components/ForcePasswordChange'));

function PageLoader() {
  // On slow connections a plain spinning loader with no status update looks
  // exactly like the app has hung. Show a subtle hint after 3s that we're
  // still trying, and a stronger hint after 8s — reassures the user that
  // something IS happening without changing the visual layout jarringly.
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setWaited(1), 3000);
    const t2 = setTimeout(() => setWaited(2), 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center select-none">
      <KiteTailLogo className="w-12 h-12 mb-3 drop-shadow-md" />
      <p className="text-stone-900 font-extrabold text-sm tracking-tight">Nikki Technologies</p>
      <div className="w-28 h-1 bg-stone-200 rounded-full mt-4 overflow-hidden">
        <div className="w-full h-full bg-orange-700 rounded-full animate-pulse" />
      </div>
      {waited >= 1 && (
        <p className="text-stone-600 text-xs mt-4 transition-opacity">
          {waited >= 2 ? 'Still loading — connection looks slow.' : 'Just a moment…'}
        </p>
      )}
    </div>
  );
}

function AppContent() {
  const { user, loading, sessionReady, hasPermission } = useAuth();
  const [isLoginRoute, setIsLoginRoute] = useState(false);

  useEffect(() => {
    const checkRoute = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      setIsLoginRoute(
        path === '/login' || hash === '#login' ||
        path === '/admin' || hash === '#admin' ||
        path === '/portal' || hash === '#portal'
      );
    };
    checkRoute();
    window.addEventListener('popstate', checkRoute);
    window.addEventListener('hashchange', checkRoute);
    return () => {
      window.removeEventListener('popstate', checkRoute);
      window.removeEventListener('hashchange', checkRoute);
    };
  }, []);

  // ── Public site: render IMMEDIATELY, zero auth delay ──────────────
  // The public landing page does not need authentication. Previously it was
  // blocked behind `if (loading) return <PageLoader />` which meant every
  // visitor — including anonymous first-time visitors — saw a splash screen
  // for 1-5 seconds while getSession() completed. That was the "shows one
  // page first then real website loaded" symptom. Now the public site
  // renders instantly; only /login, /admin, /portal routes wait for auth.
  if (!isLoginRoute) {
    return (
      <Suspense fallback={<PageLoader />}>
        <PublicSite />
        <PWAInstallBanner />
      </Suspense>
    );
  }

  // ── Portal / Login routes: wait for auth ──────────────────────────
  if (loading) return <PageLoader />;

  // The cache fast-path can set `user` from localStorage before the REAL
  // Supabase client has confirmed its session token. Hold a neutral loader
  // (never the login screen) until sessionReady flips true so dashboard
  // data queries don't fire with a stale/missing token.
  if (user && !sessionReady) return <PageLoader />;

  if (!user) return <Suspense fallback={<PageLoader />}><UnifiedLogin /></Suspense>;

  // An authenticated visit to /login — correct the URL to /portal.
  if (window.location.pathname === '/login') {
    window.history.replaceState({}, '', '/portal');
  }
  // A temp password (set by an admin) must be replaced before anything else.
  if (user.must_change_password) return <Suspense fallback={<PageLoader />}><ForcePasswordChange /></Suspense>;
  // Only genuinely administrative permissions route to the admin console.
  const hasAdminAccess = user.role === 'super_admin' || [
    'manage_staff', 'manage_content', 'manage_payroll', 'manage_careers',
    'view_reports', 'assign_tickets',
    'bulk_assign_leads', 'approve_transfers', 'approve_advances',
  ].some(p => hasPermission(p));
  if (hasAdminAccess) return <Suspense fallback={<PageLoader />}><SuperAdminDashboard /></Suspense>;
  return <Suspense fallback={<PageLoader />}><StaffPortal /></Suspense>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
